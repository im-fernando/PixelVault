import {
  romUploadCompletedResponseSchema,
  romUploadRequestSchema,
  romUploadResponseSchema,
  TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO,
  type RomUploadTicket,
  type SystemId,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { sha256DoArquivo, sistemaPelaExtensao, tituloDoArquivo } from './arquivo-de-rom.js';
import {
  ErroDeEnvioAoStorage,
  recusaDeEnvio,
  RECUSA_POR_ARQUIVO_VAZIO,
  RECUSA_POR_TAMANHO,
  type RecusaDeEnvio,
} from './erros-de-envio.js';

/**
 * O envio de uma ROM, do arquivo escolhido até a linha em `user_roms`.
 *
 * ## Por que são quatro passos e não um
 *
 * Porque o upload não passa pela API: o navegador escreve direto no storage
 * com uma URL assinada, e por isso quem confere os bytes é o servidor **depois**
 * que eles chegam à quarentena. É a ADR 0014 inteira, e ela termina com uma
 * frase que este arquivo existe para obedecer: "o upload deixa de ser
 * instantâneo do ponto de vista do usuário: existe um passo de verificação
 * entre 'enviei' e 'está na minha biblioteca'. A interface precisa mostrar
 * isso como estado, não fingir que acabou."
 *
 * Daí o `aoMudar`: cada passo é anunciado assim que começa, e não no fim.
 *
 * 1. **conferindo** — o tamanho é medido contra o contrato e o SHA-256 é
 *    calculado aqui, sem rede. É o passo que pode responder "você já tem esse"
 *    sem transferir nada.
 * 2. **enviando** — o PUT direto no storage, com progresso real em bytes.
 * 3. **verificando** — o servidor lê a quarentena, calcula o hash dele e
 *    promove (ou deduplica). Pode demorar, e é honesto que apareça.
 * 4. **pronto** ou **recusado**.
 *
 * O fluxo é uma função e não um hook para poder ser testado sem React e sem
 * navegador: quem chama injeta como os bytes sobem e como o hash é calculado.
 */

/** O arquivo escolhido, do jeito que a interface precisa falar dele. */
export interface ArquivoEmEnvio {
  /** O nome como veio do disco. É ele que vai para `user_roms.file_name`. */
  readonly nome: string;
  /** O nome virado etiqueta, para o cartucho. */
  readonly titulo: string;
  readonly sizeBytes: number;
  /** O que a extensão promete. Nulo quando ela não promete nada. */
  readonly systemId: SystemId | null;
}

/** O que ficou na biblioteca no fim do fluxo. */
export interface RomEnviada {
  readonly romId: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  /** O jogo do catálogo, quando o hash casou. Nulo é o caso comum do BYOR. */
  readonly gameId: string | null;
  /** O título do catálogo, quando `gameId` não é nulo. */
  readonly titulo: string | null;
  /** A capa do catálogo, quando `gameId` não é nulo. */
  readonly capaUrl: string | null;
  /** O conteúdo já existia no storage e nada foi transferido de lá para cá. */
  readonly deduplicado: boolean;
  /**
   * O atalho do hash: a pessoa já tinha esta ROM, e nenhum byte subiu.
   *
   * Não é erro — é o mesmo destino alcançado mais depressa, e a tela diz isso
   * em vez de fingir um envio que não houve.
   */
  readonly jaTinha: boolean;
}

export type EstadoDoEnvio =
  | { readonly fase: 'ocioso' }
  | { readonly fase: 'conferindo'; readonly arquivo: ArquivoEmEnvio }
  | { readonly fase: 'enviando'; readonly arquivo: ArquivoEmEnvio; readonly bytesEnviados: number }
  | { readonly fase: 'verificando'; readonly arquivo: ArquivoEmEnvio }
  | { readonly fase: 'pronto'; readonly arquivo: ArquivoEmEnvio; readonly rom: RomEnviada }
  | { readonly fase: 'recusado'; readonly arquivo: ArquivoEmEnvio; readonly recusa: RecusaDeEnvio };

/** Como os bytes sobem. Injetável para o teste não precisar de um storage. */
export type EnvioDeBytes = (
  destino: RomUploadTicket,
  arquivo: File,
  aoProgredir: (bytesEnviados: number) => void,
) => Promise<void>;

export interface DependenciasDoEnvio {
  readonly enviarBytes: EnvioDeBytes;
  readonly calcularHash: (arquivo: File) => Promise<string>;
}

const DEPENDENCIAS_PADRAO: DependenciasDoEnvio = {
  enviarBytes: enviarBytesPorXhr,
  calcularHash: sha256DoArquivo,
};

/**
 * O que a gente recusa sem sair do navegador.
 *
 * A checagem usa o MESMO schema que a API aplica na borda — não uma cópia das
 * regras escrita à mão —, pela disciplina que o cadastro já segue: o que passa
 * aqui é exatamente o que passaria lá, e um arquivo de dois gigabytes não
 * gasta uma ida à rede para ser recusado. O servidor continua conferindo, e é
 * ele quem manda; isto é cortesia, não segurança.
 */
export function recusaAntesDeEnviar(sizeBytes: number): RecusaDeEnvio | null {
  if (sizeBytes === 0) return RECUSA_POR_ARQUIVO_VAZIO;
  return romUploadRequestSchema.safeParse({ sizeBytes }).success ? null : RECUSA_POR_TAMANHO;
}

export function descreverArquivo(arquivo: File): ArquivoEmEnvio {
  return {
    nome: arquivo.name,
    titulo: tituloDoArquivo(arquivo.name),
    sizeBytes: arquivo.size,
    systemId: sistemaPelaExtensao(arquivo.name),
  };
}

/**
 * Roda o fluxo inteiro, anunciando cada passo.
 *
 * Devolve o estado final — `pronto` ou `recusado` — e nunca lança: recusa é
 * estado da tela, não exceção a ser tratada em quem chama. O que sobe de
 * exceção é traduzido por `recusaDeEnvio`, que decide a frase pelo código do
 * contrato.
 */
export async function enviarRom(
  arquivo: File,
  aoMudar: (estado: EstadoDoEnvio) => void,
  deps: DependenciasDoEnvio = DEPENDENCIAS_PADRAO,
): Promise<EstadoDoEnvio> {
  const descricao = descreverArquivo(arquivo);

  const anunciar = (estado: EstadoDoEnvio): EstadoDoEnvio => {
    aoMudar(estado);
    return estado;
  };

  const recusaLocal = recusaAntesDeEnviar(arquivo.size);
  if (recusaLocal !== null) {
    return anunciar({ fase: 'recusado', arquivo: descricao, recusa: recusaLocal });
  }

  try {
    anunciar({ fase: 'conferindo', arquivo: descricao });
    const sha256 = await deps.calcularHash(arquivo);

    const autorizacao = await apiFetch('/api/library/uploads', romUploadResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ sizeBytes: arquivo.size, sha256 }),
    });

    if (autorizacao.status === 'ja-na-biblioteca') {
      // O hash que casou é este mesmo, calculado aqui: a consulta do servidor
      // é por igualdade contra `user_roms.sha256`, então guardá-lo não é
      // palpite.
      return anunciar({
        fase: 'pronto',
        arquivo: descricao,
        rom: {
          romId: autorizacao.romId,
          sizeBytes: arquivo.size,
          sha256,
          gameId: null,
          titulo: null,
          capaUrl: null,
          deduplicado: true,
          jaTinha: true,
        },
      });
    }

    anunciar({ fase: 'enviando', arquivo: descricao, bytesEnviados: 0 });
    await deps.enviarBytes(autorizacao, arquivo, (bytesEnviados) => {
      aoMudar({ fase: 'enviando', arquivo: descricao, bytesEnviados });
    });

    anunciar({ fase: 'verificando', arquivo: descricao });
    const naBiblioteca = await apiFetch(
      `/api/library/uploads/${autorizacao.uploadId}/complete`,
      romUploadCompletedResponseSchema,
      { method: 'POST', body: JSON.stringify({ fileName: nomeParaOServidor(arquivo.name) }) },
    );

    return anunciar({
      fase: 'pronto',
      arquivo: descricao,
      rom: {
        romId: naBiblioteca.romId,
        sizeBytes: naBiblioteca.sizeBytes,
        sha256: naBiblioteca.sha256,
        gameId: naBiblioteca.gameId,
        titulo: naBiblioteca.title,
        capaUrl: naBiblioteca.coverUrl,
        deduplicado: naBiblioteca.deduplicado,
        jaTinha: false,
      },
    });
  } catch (erro) {
    return anunciar({ fase: 'recusado', arquivo: descricao, recusa: recusaDeEnvio(erro) });
  }
}

/**
 * O nome cortado no teto do contrato, pelo começo.
 *
 * Corta-se o começo e não o fim de propósito: a **extensão** é o que diz de
 * qual sistema a ROM afirma ser, e sem ela a verificação recusa o envio por
 * `EXTENSAO_NAO_RECONHECIDA` — um nome de 300 caracteres perderia o jogo
 * inteiro por causa de um prefixo que ninguém lê.
 */
function nomeParaOServidor(nome: string): string {
  return nome.length <= TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO
    ? nome
    : nome.slice(nome.length - TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO);
}

/**
 * O PUT direto no storage, por XHR e não por `fetch`.
 *
 * `fetch` não dá progresso de upload em navegador nenhum — o `ReadableStream`
 * de request só funciona em HTTP/2 e com meia dúzia de ressalvas. E progresso
 * aqui não é enfeite: é o passo mais longo do fluxo e o único cujo tempo
 * depende do arquivo da pessoa. Sem barra, "enviando" durante quarenta
 * segundos é indistinguível de travado.
 *
 * O `content-type` vai exatamente como veio na autorização porque ele entra na
 * assinatura: qualquer outro valor é recusado pelo storage. O `content-length`
 * o navegador põe sozinho, a partir do arquivo, e ele também foi assinado —
 * uma URL pedida para estes bytes não serve para outros.
 */
function enviarBytesPorXhr(
  destino: RomUploadTicket,
  arquivo: File,
  aoProgredir: (bytesEnviados: number) => void,
): Promise<void> {
  return new Promise((resolver, recusar) => {
    const requisicao = new XMLHttpRequest();
    requisicao.open('PUT', destino.url);
    requisicao.setRequestHeader('content-type', destino.contentType);

    requisicao.upload.addEventListener('progress', (evento) => {
      aoProgredir(evento.loaded);
    });

    requisicao.addEventListener('load', () => {
      if (requisicao.status >= 200 && requisicao.status < 300) {
        resolver();
        return;
      }
      recusar(new ErroDeEnvioAoStorage(`O storage recusou o envio (HTTP ${requisicao.status})`));
    });

    requisicao.addEventListener('error', () => {
      recusar(new ErroDeEnvioAoStorage('A transferência para o storage falhou'));
    });
    requisicao.addEventListener('abort', () => {
      recusar(new ErroDeEnvioAoStorage('A transferência para o storage foi interrompida'));
    });

    requisicao.send(arquivo);
  });
}
