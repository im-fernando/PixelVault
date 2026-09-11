import { createHash } from 'node:crypto';
import { TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO, type SystemId } from '@pixelvault/contracts';
import { RomRecusada } from './erros.js';

/**
 * A verificação da ADR 0014, em funções puras sobre os bytes.
 *
 * Aqui não há storage, banco nem HTTP: entra `Uint8Array` e o nome do arquivo,
 * sai a identidade do conteúdo — ou uma recusa. É o que permite testar a regra
 * sem subir nada, e é a única parte do `library` que merecia sair do anêmico
 * (ADR 0005): não é CRUD, é decisão sobre conteúdo que ninguém mais toma.
 *
 * ## O que ela promete, e o que não promete
 *
 * Promete que o `sha256` do objeto promovido foi calculado **aqui**, sobre os
 * bytes que o servidor leu, e nunca sobre o que o cliente afirmou ter enviado.
 * É essa promessa que sustenta o `roms/<sha256>` compartilhado da ADR 0013:
 * sem ela, mentir o hash no pedido de upload envenenaria a ROM de todo mundo.
 *
 * O `md5` sai da mesma promessa, calculado sobre os mesmos bytes — mas não
 * endereça nada. Ele existe só para casar contra o banco público No-Intro
 * (issue #134), que cataloga CRC32/MD5/SHA1 e nunca SHA-256.
 *
 * Não promete reconhecer todo formato do mundo, nem emular o console para
 * saber se o jogo roda. O objetivo é recusar cedo o que obviamente não é ROM
 * daquele sistema — um `.zip` renomeado, um PDF, um dump de outro console — e
 * seguir em frente. Um verificador mais esperto recusaria romhack legítimo, e
 * o custo de errar para o lado apertado é o usuário não conseguir subir a
 * própria ROM, que é o produto inteiro (ADR 0006).
 *
 * ## Por que o sistema vem da extensão
 *
 * Porque quatro dos cinco consoles têm assinatura no arquivo e o quinto (SNES)
 * não tem nenhuma forte. Deduzir o sistema só do conteúdo transformaria "SNES"
 * em "não reconheci nada", que é o mesmo que não validar. A extensão diz de
 * que sistema o arquivo **afirma** ser, e a verificação cobra a afirmação:
 * tamanho na faixa daquele console e cabeçalho no lugar. Mentir na extensão só
 * faz o próprio envio ser recusado — o nome não encosta no caminho do objeto.
 */

const KIB = 1024;
const MIB = 1024 * KIB;

/**
 * Dump de SNES costuma vir com 512 bytes de cabeçalho de copiador na frente,
 * que não fazem parte do jogo. O arquivo é guardado como a pessoa enviou (ADR
 * 0013), mas o hash sem esses bytes é calculado à parte, porque as bases de
 * metadado (No-Intro) catalogam sem ele — e é por elas que o `game_roms` foi
 * povoado.
 */
export const TAMANHO_DO_CABECALHO_DE_COPIADOR = 512;

interface Assinatura {
  readonly offset: number;
  readonly bytes: readonly number[];
  /** Como chamar isso na mensagem de recusa. */
  readonly rotulo: string;
}

/**
 * O cabeçalho que cada formato sempre tem, e onde ele fica.
 *
 * NES é a assinatura `NES\x1A` do formato iNES. Game Boy e GBA são o começo do
 * logo da Nintendo, que o boot ROM do próprio console confere — ROM sem ele
 * não dá partida em hardware nenhum. Mega Drive é o `SEGA` do cabeçalho do
 * cartucho.
 *
 * SNES não está aqui, e a ausência é a razão de toda a lógica abaixo: o
 * cartucho não tem número mágico, só um bloco de 32 bytes em uma de três
 * posições possíveis, reconhecível por aritmética. Ver
 * {@link cabecalhoDeSnesReconhecido}.
 */
const ASSINATURA_DO_SISTEMA: Partial<Record<SystemId, Assinatura>> = {
  nes: { offset: 0x00, bytes: [0x4e, 0x45, 0x53, 0x1a], rotulo: 'NES (iNES)' },
  gb: { offset: 0x104, bytes: [0xce, 0xed, 0x66, 0x66], rotulo: 'Game Boy / Game Boy Color' },
  gba: { offset: 0x04, bytes: [0x24, 0xff, 0xae, 0x51], rotulo: 'Game Boy Advance' },
  genesis: { offset: 0x100, bytes: [0x53, 0x45, 0x47, 0x41], rotulo: 'Mega Drive' },
};

/**
 * O que não é ROM de console nenhum, mas chega com frequência.
 *
 * ROM compactada é o caso comum de quem baixou de arquivo antigo, e recusá-la
 * com uma frase clara vale mais que deixá-la virar um objeto que nunca vai
 * rodar. Descompactar no servidor não está em discussão: seria aceitar entrada
 * hostil (zip bomb, caminho com `..`) na fronteira mais sensível do produto.
 */
const ASSINATURAS_QUE_NAO_SAO_ROM: readonly Assinatura[] = [
  { offset: 0x00, bytes: [0x50, 0x4b, 0x03, 0x04], rotulo: 'arquivo ZIP' },
  { offset: 0x00, bytes: [0x37, 0x7a, 0xbc, 0xaf], rotulo: 'arquivo 7z' },
  { offset: 0x00, bytes: [0x52, 0x61, 0x72, 0x21], rotulo: 'arquivo RAR' },
  { offset: 0x00, bytes: [0x1f, 0x8b], rotulo: 'arquivo gzip' },
  { offset: 0x00, bytes: [0x25, 0x50, 0x44, 0x46], rotulo: 'PDF' },
];

interface RegraDeSistema {
  /** Extensões que declaram este sistema, sem o ponto e em minúsculas. */
  readonly extensoes: readonly string[];
  readonly tamanhoMinimo: number;
  readonly tamanhoMaximo: number;
}

/**
 * Faixa plausível de cartucho por console.
 *
 * O teto de 64 MiB do contrato é outra coisa: ele impede que uma URL assinada
 * vire despejo de gigabytes, e vale antes de qualquer byte chegar. Este aqui é
 * plausibilidade: um arquivo de 40 MiB pode ser muita coisa, mas não é um
 * cartucho de Super Nintendo.
 *
 * Os máximos são o maior cartucho conhecido de cada sistema com folga para
 * romhack, que costuma expandir banco: SNES tem 6 MiB de teto comercial (Tales
 * of Phantasia), GBA 32 MiB (o cartucho inteiro), Mega Drive 4 MiB comerciais
 * e 8 MiB em homebrew (Pier Solar), Game Boy 8 MiB e NES pouco mais de 1 MiB
 * nos mappers maiores. Os mínimos são o menor cartucho que cada console
 * produziu — abaixo disso não há jogo, há arquivo truncado. O GBA é a exceção:
 * o mínimo é o cabeçalho de 192 bytes, porque homebrew de GBA cabe em poucos
 * kilobytes e recusá-lo seria inventar uma regra que o hardware não tem.
 */
const REGRA_POR_SISTEMA: Record<SystemId, RegraDeSistema> = {
  snes: {
    extensoes: ['sfc', 'smc', 'fig', 'swc'],
    tamanhoMinimo: 32 * KIB,
    tamanhoMaximo: 8 * MIB,
  },
  nes: { extensoes: ['nes'], tamanhoMinimo: 16 * KIB, tamanhoMaximo: 4 * MIB },
  gb: { extensoes: ['gb', 'gbc'], tamanhoMinimo: 32 * KIB, tamanhoMaximo: 8 * MIB },
  gba: { extensoes: ['gba'], tamanhoMinimo: 192, tamanhoMaximo: 32 * MIB },
  genesis: {
    extensoes: ['md', 'gen', 'bin', 'smd'],
    tamanhoMinimo: 16 * KIB,
    tamanhoMaximo: 8 * MIB,
  },
};

/** A identidade do conteúdo, depois de conferida. */
export interface RomVerificada {
  /** De qual console, segundo a extensão — já cobrada contra o conteúdo. */
  readonly systemId: SystemId;
  /** SHA-256 do arquivo como ele foi enviado. É ele que endereça o objeto. */
  readonly sha256: string;
  /**
   * SHA-256 sem o cabeçalho de copiador, quando existe um. É o hash que as
   * bases de metadado catalogam, e por isso o match contra `game_roms` tenta
   * os dois. Nulo quando o arquivo não tem cabeçalho a descontar.
   */
  readonly sha256SemHeader: string | null;
  /**
   * MD5 do arquivo como ele foi enviado — a issue #134 (No-Intro por hash).
   * O SHA-256 continua sendo o endereço do objeto (ADR 0013); o MD5 existe só
   * para casar contra o banco público No-Intro, que nunca cataloga SHA-256.
   */
  readonly md5: string;
  /** MD5 sem o cabeçalho de copiador, pelo mesmo motivo de `sha256SemHeader`. */
  readonly md5SemHeader: string | null;
  readonly sizeBytes: number;
  /** O nome já higienizado — sem diretório, sem caractere de controle. */
  readonly fileName: string;
}

/**
 * Tira do nome tudo que não é nome.
 *
 * O valor vem do cliente e vai para o banco, não para o caminho do objeto — o
 * caminho é `roms/<sha256>` e não passa por aqui. Ainda assim, diretório e
 * caractere de controle saem: nome é para aparecer numa tela, e `../../etc` na
 * biblioteca de alguém é problema esperando um consumidor descuidado.
 */
export function nomeDeArquivoSeguro(bruto: string): string {
  const semDiretorio = bruto.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- é justamente o que se tira daqui.
  const limpo = semDiretorio.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return limpo.slice(0, TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO);
}

/** De que sistema a extensão diz que o arquivo é, ou `null`. */
export function sistemaPelaExtensao(fileName: string): SystemId | null {
  const ponto = fileName.lastIndexOf('.');
  if (ponto <= 0 || ponto === fileName.length - 1) return null;

  const extensao = fileName.slice(ponto + 1).toLowerCase();
  for (const [sistema, regra] of Object.entries(REGRA_POR_SISTEMA)) {
    if (regra.extensoes.includes(extensao)) return sistema as SystemId;
  }
  return null;
}

/**
 * Confere o que chegou à quarentena e devolve a identidade do conteúdo.
 *
 * Lança {@link RomRecusada} em qualquer recusa — e quem chama sabe o que fazer
 * com isso: apagar a quarentena e não promover nada (ADR 0014).
 */
export function verificarRom(bytes: Uint8Array, nomeInformado: string): RomVerificada {
  const fileName = nomeDeArquivoSeguro(nomeInformado);
  const systemId = sistemaPelaExtensao(fileName);
  if (systemId === null) {
    throw new RomRecusada(
      'EXTENSAO_NAO_RECONHECIDA',
      `"${fileName}" não tem extensão de nenhum sistema suportado`,
    );
  }

  // "Isto é outra coisa" vem antes de "isto tem o tamanho errado" de
  // propósito: quem renomeou um ZIP para `.sfc` precisa ler que enviou um ZIP,
  // e não que o arquivo não é múltiplo de 512.
  conferirQueNaoEOutraCoisa(bytes, systemId);
  conferirTamanho(bytes, systemId);
  conferirCabecalho(bytes, systemId);

  const temCabecalhoDeCopiador =
    systemId === 'snes' && bytes.byteLength % KIB === TAMANHO_DO_CABECALHO_DE_COPIADOR;

  return {
    systemId,
    sha256: sha256De(bytes),
    sha256SemHeader: temCabecalhoDeCopiador
      ? sha256De(bytes.subarray(TAMANHO_DO_CABECALHO_DE_COPIADOR))
      : null,
    md5: md5De(bytes),
    md5SemHeader: temCabecalhoDeCopiador
      ? md5De(bytes.subarray(TAMANHO_DO_CABECALHO_DE_COPIADOR))
      : null,
    sizeBytes: bytes.byteLength,
    fileName,
  };
}

function sha256De(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function md5De(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

function conferirTamanho(bytes: Uint8Array, systemId: SystemId): void {
  const regra = REGRA_POR_SISTEMA[systemId];
  const tamanho = bytes.byteLength;

  if (tamanho < regra.tamanhoMinimo || tamanho > regra.tamanhoMaximo) {
    throw new RomRecusada(
      'TAMANHO_IMPLAUSIVEL',
      `${tamanho} bytes está fora da faixa de cartucho de ${systemId} ` +
        `(${regra.tamanhoMinimo} a ${regra.tamanhoMaximo} bytes)`,
    );
  }

  // Todo dump de SNES é múltiplo de 512: os bancos são múltiplos de 32 KiB, e
  // o cabeçalho de copiador, quando existe, tem exatamente meio kilobyte. É a
  // única checagem estrutural barata que o formato oferece, já que ele não tem
  // número mágico.
  if (systemId === 'snes' && tamanho % TAMANHO_DO_CABECALHO_DE_COPIADOR !== 0) {
    throw new RomRecusada(
      'TAMANHO_IMPLAUSIVEL',
      `${tamanho} bytes não é múltiplo de ${TAMANHO_DO_CABECALHO_DE_COPIADOR}, ` +
        'e todo dump de SNES é',
    );
  }
}

/**
 * Recusa o que é claramente de outro console — ou nem ROM é.
 *
 * Vale para os cinco sistemas, mas é o SNES que depende disto: sem assinatura
 * própria, o que impede um `.nes` renomeado para `.sfc` de passar é reconhecer
 * a assinatura alheia.
 */
function conferirQueNaoEOutraCoisa(bytes: Uint8Array, systemId: SystemId): void {
  for (const suspeita of ASSINATURAS_QUE_NAO_SAO_ROM) {
    if (combina(bytes, suspeita)) {
      throw new RomRecusada(
        'SISTEMA_DIVERGENTE',
        `O conteúdo é um ${suspeita.rotulo}, não uma ROM. Envie a ROM já descompactada.`,
      );
    }
  }

  for (const [outro, assinatura] of Object.entries(ASSINATURA_DO_SISTEMA)) {
    if (outro !== systemId && combina(bytes, assinatura)) {
      throw new RomRecusada(
        'SISTEMA_DIVERGENTE',
        `O conteúdo é de ${assinatura.rotulo}, e a extensão diz ${systemId}`,
      );
    }
  }
}

function conferirCabecalho(bytes: Uint8Array, systemId: SystemId): void {
  const assinatura = ASSINATURA_DO_SISTEMA[systemId];

  if (assinatura !== undefined) {
    if (!combina(bytes, assinatura)) {
      throw new RomRecusada(
        'CONTEUDO_NAO_RECONHECIDO',
        `O arquivo não tem o cabeçalho de ${assinatura.rotulo} que todo dump do formato tem`,
      );
    }
    return;
  }

  if (!cabecalhoDeSnesReconhecido(bytes)) {
    throw new RomRecusada(
      'CONTEUDO_NAO_RECONHECIDO',
      'O arquivo não tem cabeçalho de SNES reconhecível (nem LoROM, nem HiROM, nem ExHiROM)',
    );
  }
}

/** Onde o bloco de 32 bytes do cartucho fica em cada mapeamento. */
const CANDIDATOS_DE_SNES = [0x7fc0, 0xffc0, 0x40ffc0] as const;

/**
 * Reconhece o cabeçalho interno do cartucho de SNES.
 *
 * O critério é o do complemento: o cartucho grava `checksum` e `~checksum`, e a
 * soma dos dois é `0xFFFF`. É o único teste barato que não dá falso positivo em
 * dados aleatórios — "o título parece texto" dá — e é o mesmo que o adapter de
 * SNES do front usa para decidir se carrega a ROM. Isso importa: o que este
 * verificador recusa é exatamente o que o emulador não conseguiria abrir, então
 * a recusa não tira do usuário nada que ele fosse jogar aqui.
 *
 * A lógica está duplicada de `packages/emulator-runtime/src/snes/snes-rom.ts` a
 * olho, e não compartilhada, de propósito: são vinte linhas de aritmética
 * estável há trinta anos, e o preço de unificar seria a API depender de um
 * pacote de runtime de emulação — WebAssembly, `RomSource`, streams do
 * navegador — para conferir dois inteiros de 16 bits.
 */
function cabecalhoDeSnesReconhecido(bytes: Uint8Array): boolean {
  const desvio =
    bytes.byteLength % KIB === TAMANHO_DO_CABECALHO_DE_COPIADOR
      ? TAMANHO_DO_CABECALHO_DE_COPIADOR
      : 0;

  return CANDIDATOS_DE_SNES.some((candidato) => {
    const offset = candidato + desvio;
    if (offset + 32 > bytes.byteLength) return false;

    const complemento = leUint16(bytes, offset + 0x1c);
    const checksum = leUint16(bytes, offset + 0x1e);
    return ((complemento + checksum) & 0xffff) === 0xffff;
  });
}

function leUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function combina(bytes: Uint8Array, assinatura: Assinatura): boolean {
  if (assinatura.offset + assinatura.bytes.length > bytes.byteLength) return false;
  return assinatura.bytes.every((valor, i) => bytes[assinatura.offset + i] === valor);
}
