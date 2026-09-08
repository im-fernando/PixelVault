import { randomUUID } from 'node:crypto';
import {
  COTA_DE_ARMAZENAMENTO_EM_BYTES,
  COTA_DE_ROMS_POR_CONTA,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
  TIPO_DE_CONTEUDO_DA_ROM,
  type MotivoDeCota,
  type RomUploadRequest,
  type RomUploadResponse,
} from '@pixelvault/contracts';
import { ConflictError, DomainError } from '../../../infrastructure/errors.js';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { recusaPorCota } from '../domain/cota.js';
import { caminhoNaQuarentena } from '../domain/quarentena.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';

/**
 * A frase de cada eixo da cota.
 *
 * Aqui, e não no domínio, porque texto para humano é apresentação: o que o
 * cliente usa para decidir é o `code` mais o `details.cota`, que são
 * estáveis. A mensagem cita o número justamente porque ela é o único lugar
 * onde ele aparece hoje — enquanto não existe tela de biblioteca (#74), é ela
 * que diz de quanto é o espaço.
 */
const MENSAGEM_DE_COTA: Record<MotivoDeCota, string> = {
  LIMITE_DE_BYTES:
    `Sua biblioteca chegou ao limite de ${COTA_DE_ARMAZENAMENTO_EM_BYTES / 1024 ** 3} GiB. ` +
    'Remova alguma ROM para abrir espaço.',
  LIMITE_DE_ARQUIVOS:
    `Sua biblioteca chegou ao limite de ${COTA_DE_ROMS_POR_CONTA} ROMs. ` +
    'Remova alguma para enviar outra.',
};

export interface DependenciasDoEnvioDeRom {
  roms: UserRomRepository;
  /** A porta de storage. Quem assina é ela; o caso de uso só sabe o caminho. */
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Autoriza o envio de uma ROM para a quarentena.
 *
 * Três decisões moram aqui, e as três são da ADR 0014:
 *
 * 1. **O caminho é do servidor.** O `uploadId` é sorteado aqui, e o prefixo
 *    sai da sessão. Não existe campo de entrada que influencie onde o objeto
 *    vai parar — nem o hash, que é o que tornaria a rota um vetor de
 *    envenenamento do `roms/<sha256>` compartilhado.
 * 2. **O hash é dica.** Se a pessoa já tem aquele conteúdo, respondemos "já
 *    está na sua biblioteca" e não assinamos nada. Se ela mentir o hash, o
 *    pior que acontece é ela receber a ROM que ela mesma tem — a mentira não
 *    alcança ninguém, porque a consulta é restrita à biblioteca dela.
 * 3. **Tipo e tamanho entram na assinatura.** A URL vale para exatamente
 *    aqueles bytes, com aquele `Content-Type`. Sem isso, uma URL pedida para
 *    dois megabytes serviria para despejar dois gigabytes na quarentena, e a
 *    cota da #76 nasceria já contornável.
 *
 * A quarta é da #76 e chegou depois: **a cota é conferida antes da
 * assinatura**. Recusar aqui é o ponto barato do fluxo — nenhuma URL saiu,
 * nenhum byte trafegou, nada foi para a quarentena. Conferir depois seria
 * deixar o cliente descobrir que não cabia só ao terminar de subir sessenta
 * megabytes, e o custo de banda já teria sido pago pelos dois lados.
 *
 * O que fica de fora é a corrida: a checagem lê a biblioteca de agora, e
 * várias autorizações simultâneas podem passar juntas antes de qualquer uma
 * virar linha em `user_roms`. O excesso é limitado pelo que estiver em voo, e
 * a autorização seguinte já vê a soma nova e recusa. Fechar a janela exige
 * reservar a cota no momento da assinatura, e a reserva só faz sentido junto
 * do registro de envio pendente que a limpeza de upload abandonado da ADR
 * 0014 vai precisar de qualquer jeito. Está registrado em docs/seguranca.md.
 *
 * O que este caso de uso **não** faz é conferir a ROM: nada foi enviado ainda,
 * e mesmo depois de enviado quem lê os bytes e calcula o hash de verdade é a
 * verificação da #72.
 */
export async function solicitarEnvioDeRom(
  deps: DependenciasDoEnvioDeRom,
  userId: string,
  entrada: RomUploadRequest,
): Promise<RomUploadResponse> {
  // O contrato já barra o tamanho fora da faixa na borda, e é ali que a
  // recusa acontece na prática. Isto é a rede embaixo: o dia em que este caso
  // de uso for chamado de outro lugar (uma fila, um script de importação), o
  // teto continua valendo. Nunca se assina antes de ele passar.
  if (
    !Number.isInteger(entrada.sizeBytes) ||
    entrada.sizeBytes <= 0 ||
    entrada.sizeBytes > TAMANHO_MAXIMO_DE_ROM_EM_BYTES
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `A ROM precisa ter entre 1 byte e ${TAMANHO_MAXIMO_DE_ROM_EM_BYTES} bytes`,
      422,
      { sizeBytes: ['TAMANHO_DE_ROM_INVALIDO'] },
    );
  }

  if (entrada.sha256 !== undefined) {
    const jaTem = await deps.roms.buscarPorHash(userId, entrada.sha256);
    if (jaTem !== null) return { status: 'ja-na-biblioteca', romId: jaTem.id };
  }

  // Depois do atalho do hash, e não antes: quem já tem aquele conteúdo não
  // está pedindo espaço nenhum, e recusar por cota cheia uma requisição que
  // não faria a biblioteca crescer seria negar o que já é da pessoa.
  const motivo = recusaPorCota(await deps.roms.medirUso(userId), entrada.sizeBytes);
  if (motivo !== null) {
    throw new ConflictError(MENSAGEM_DE_COTA[motivo], { cota: [motivo] });
  }

  const uploadId = randomUUID();
  const url = await deps.armazenamento.assinarEnvio(caminhoNaQuarentena(userId, uploadId), {
    tipoDeConteudo: TIPO_DE_CONTEUDO_DA_ROM,
    tamanhoEmBytes: entrada.sizeBytes,
  });

  return {
    status: 'envio-autorizado',
    uploadId,
    url,
    contentType: TIPO_DE_CONTEUDO_DA_ROM,
    sizeBytes: entrada.sizeBytes,
    expiresInSeconds: VALIDADE_PADRAO_EM_SEGUNDOS,
  };
}
