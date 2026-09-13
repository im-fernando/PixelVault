import {
  COTA_DE_ARMAZENAMENTO_EM_BYTES,
  COTA_DE_ROMS_POR_CONTA,
  motivoDeCotaSchema,
  motivoDeRecusaDeRomSchema,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
  type MotivoDeCota,
  type MotivoDeRecusaDeRom,
} from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { EXTENSOES_ACEITAS } from './arquivo-de-rom.js';

/**
 * A recusa do envio dita para gente.
 *
 * ## Por que um arquivo próprio, e não `features/auth/erros.ts`
 *
 * Aquele arquivo resolve um problema que este não tem: repartir `details` do
 * servidor **entre os campos de um formulário**, decidindo o que vai embaixo
 * de cada input e o que sobe para o topo. Aqui não há formulário — há um
 * arquivo e um fluxo —, e o que o servidor nomeia em `details` (`rom`,
 * `cota`) não é campo nenhum: é o eixo da regra que recusou.
 *
 * O vocabulário também é outro. `MotivoDeRecusaDeRom` e `MotivoDeCota` são do
 * `library`, e traduzi-los dentro do `auth` faria a feature de conta conhecer
 * o assunto biblioteca só porque ela tem um tradutor de erro — que é
 * exatamente o tipo de atalho que dissolve fronteira.
 *
 * O que se herda de lá é a **disciplina**, e ela vale inteira: a tradução é
 * por CÓDIGO, nunca pela mensagem que veio junto. O código o contrato promete
 * manter estável; a mensagem é para humano e muda sem aviso. A mensagem do
 * servidor só aparece na tela quando ela é tudo que existe — recusa sem
 * `details` que a gente reconheça.
 */
export interface RecusaDeEnvio {
  /** O que houve, em uma frase. Não pede desculpa e não é vago. */
  readonly titulo: string;
  /** O que fazer a respeito. */
  readonly detalhe: string;
}

/**
 * O envio direto para o storage falhou.
 *
 * Erro à parte porque ele não vem da API e não tem código de contrato nenhum:
 * quem recusou foi o storage, do outro lado da URL assinada, e as duas causas
 * plausíveis (a URL venceu, a rede caiu no meio) levam à mesma instrução.
 */
export class ErroDeEnvioAoStorage extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroDeEnvioAoStorage';
  }
}

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

/**
 * Cada motivo de recusa da verificação, com a instrução que resolve.
 *
 * Quatro frases e não uma genérica porque as quatro pedem coisas diferentes:
 * trocar o arquivo, descompactar, conferir a extensão, procurar outro dump.
 * "Formato não reconhecido" para os quatro casos devolveria a pessoa ao ponto
 * de partida sem dizer o que tentar.
 */
const RECUSA_POR_MOTIVO: Readonly<Record<MotivoDeRecusaDeRom, RecusaDeEnvio>> = {
  EXTENSAO_NAO_RECONHECIDA: {
    titulo: 'Não dá para saber de que console é este arquivo',
    detalhe:
      `A extensão precisa ser a do cartucho — ${EXTENSOES_ACEITAS.join(', ')}. ` +
      'Se o arquivo veio dentro de um .zip ou .rar, descompacte e envie a ROM de dentro.',
  },
  TAMANHO_IMPLAUSIVEL: {
    titulo: 'O tamanho não é de um cartucho desse console',
    detalhe:
      'Ou o arquivo está truncado, ou não é a ROM. Vale conferir se o download terminou: ' +
      'dump de SNES, por exemplo, sempre tem tamanho múltiplo de 512 bytes.',
  },
  CONTEUDO_NAO_RECONHECIDO: {
    titulo: 'O conteúdo não tem cara de ROM',
    detalhe:
      'Falta o cabeçalho que todo dump desse formato tem. Se o arquivo saiu de um pacote, ' +
      'confira se enviou a ROM e não um patch, um save ou o leia-me.',
  },
  SISTEMA_DIVERGENTE: {
    titulo: 'O conteúdo é de outro console',
    detalhe:
      'A extensão promete um sistema e os bytes dizem outro. Arquivo compactado também cai ' +
      'aqui: envie a ROM já descompactada, não o .zip.',
  },
};

/**
 * Cada eixo da cota, com o número que a pessoa precisa para se situar.
 *
 * Dois textos e não um porque a conta que estourou é diferente: "não cabe mais
 * nada em 4 GB" e "são 1500 ROMs no máximo" pedem a mesma ação, mas quem leu a
 * primeira sabendo que tem trinta arquivos ficaria sem entender nada.
 */
const RECUSA_POR_COTA: Readonly<Record<MotivoDeCota, RecusaDeEnvio>> = {
  LIMITE_DE_BYTES: {
    titulo: `Sua biblioteca chegou aos ${COTA_DE_ARMAZENAMENTO_EM_BYTES / GIB} GB`,
    detalhe: 'Remova alguma ROM para abrir espaço e envie esta de novo.',
  },
  LIMITE_DE_ARQUIVOS: {
    titulo: `Sua biblioteca chegou às ${COTA_DE_ROMS_POR_CONTA} ROMs`,
    detalhe: 'Esse é o limite de arquivos por conta. Remova alguma para caber mais uma.',
  },
};

/** O arquivo passa do teto por arquivo, e isso se sabe sem sair daqui. */
export const RECUSA_POR_TAMANHO: RecusaDeEnvio = {
  titulo: `O arquivo passa de ${TAMANHO_MAXIMO_DE_ROM_EM_BYTES / MIB} MB`,
  detalhe:
    'Esse é o teto por arquivo, e ele é maior que o maior cartucho que existe nos consoles ' +
    'suportados. Um arquivo desse tamanho provavelmente não é uma ROM — pode ser um pacote ' +
    'inteiro, ou uma imagem de CD.',
};

/** Arquivo de zero byte. Não chega a ser um caso, mas chega na tela. */
export const RECUSA_POR_ARQUIVO_VAZIO: RecusaDeEnvio = {
  titulo: 'O arquivo está vazio',
  detalhe: 'Ele tem zero byte. Confira se o download terminou antes de enviar de novo.',
};

/**
 * Traduz a recusa que chegou do outro lado.
 *
 * A ordem em que os eixos são consultados é a ordem em que o servidor os
 * produz: a verificação da ROM (422 com `details.rom`), a cota (409 com
 * `details.cota`) e o teto por arquivo (422 com `details.sizeBytes`, que só
 * aparece se alguém contornar a checagem daqui).
 */
export function recusaDeEnvio(erro: unknown): RecusaDeEnvio {
  if (erro instanceof ErroDeEnvioAoStorage) {
    return {
      titulo: 'O arquivo não chegou ao acervo',
      detalhe:
        'A transferência foi interrompida, ou a autorização de envio venceu no caminho. ' +
        'Envie de novo — nada foi guardado pela metade.',
    };
  }

  if (!(erro instanceof ApiRequestError)) {
    return {
      titulo: 'O acervo não respondeu',
      detalhe: 'Não foi possível falar com a API. Confira a conexão e tente de novo.',
    };
  }

  const detalhes = erro.payload.details ?? {};

  const motivoDaRom = primeiroCodigo(detalhes['rom'], motivoDeRecusaDeRomSchema.options);
  if (motivoDaRom !== null) return RECUSA_POR_MOTIVO[motivoDaRom];

  const motivoDaCota = primeiroCodigo(detalhes['cota'], motivoDeCotaSchema.options);
  if (motivoDaCota !== null) return RECUSA_POR_COTA[motivoDaCota];

  if (detalhes['sizeBytes'] !== undefined) return RECUSA_POR_TAMANHO;

  if (erro.status === 401) {
    return {
      titulo: 'Sua sessão terminou',
      detalhe: 'Entre de novo e o envio recomeça de onde parou — nenhum byte se perdeu.',
    };
  }

  if (erro.status === 404) {
    return {
      titulo: 'O envio expirou antes de terminar',
      detalhe: 'A quarentena não guarda arquivo abandonado. Escolha a ROM de novo.',
    };
  }

  // Recusa que não conhecemos: a mensagem do servidor é tudo que existe, e é
  // melhor mostrá-la do que inventar uma frase que não descreve o que houve.
  return { titulo: 'O envio foi recusado', detalhe: erro.payload.message };
}

/**
 * O primeiro código que a gente reconhece dentro de um eixo do `details`.
 *
 * O contrato entrega uma lista, e ela pode conter mais de um motivo ou um
 * motivo que este front ainda não conhece — código novo do servidor não pode
 * virar tela em branco aqui.
 */
function primeiroCodigo<T extends string>(
  codigos: readonly string[] | undefined,
  conhecidos: readonly T[],
): T | null {
  return (
    codigos?.find((codigo): codigo is T => (conhecidos as readonly string[]).includes(codigo)) ??
    null
  );
}
