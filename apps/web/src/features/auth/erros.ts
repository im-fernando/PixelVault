import {
  codigoErroIdentitySchema,
  TAMANHO_MAXIMO_DISPLAY_NAME,
  TAMANHO_MAXIMO_HANDLE,
  TAMANHO_MINIMO_HANDLE,
  TAMANHO_MINIMO_SENHA,
  type CodigoErroIdentity,
} from '@pixelvault/contracts';
import type { ZodError } from 'zod';
import { ApiRequestError } from '../../lib/api.js';

/** Mensagens de erro presas a um campo do formulário, por nome do campo. */
export type ErrosPorCampo = Readonly<Record<string, string>>;

export interface ErroDeFormulario {
  /** O que vai embaixo de cada campo. */
  readonly porCampo: ErrosPorCampo;
  /** O que vai no topo do formulário, quando não pertence a campo nenhum. */
  readonly geral: string | null;
}

export const SEM_ERRO: ErroDeFormulario = { porCampo: {}, geral: null };

const REGRA_DO_HANDLE = `De ${TAMANHO_MINIMO_HANDLE} a ${TAMANHO_MAXIMO_HANDLE} caracteres: minúsculas, números e hífen.`;

/**
 * O que cada campo aceita, dito em português.
 *
 * É a mesma regra que os schemas do contrato aplicam — só que legível. Serve
 * em dois lugares: como texto de ajuda embaixo do campo e como mensagem
 * quando a recusa vier sem um código que a gente conheça (validação de borda
 * do servidor devolve a mensagem do Zod, em inglês, e ela não vai para a
 * tela de ninguém).
 */
export const REGRA_DO_CAMPO: Readonly<Record<string, string>> = {
  email: 'Informe um e-mail válido.',
  handle: REGRA_DO_HANDLE,
  password: `Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres. Comprimento vale mais que símbolo.`,
  displayName: `Como você quer ser chamado. Até ${TAMANHO_MAXIMO_DISPLAY_NAME} caracteres.`,
  termsAccepted: 'É preciso aceitar os termos para criar a conta.',
};

/**
 * Cada código estável do contrato dito para gente.
 *
 * A tradução é por CÓDIGO e não pela mensagem que veio junto, porque é o
 * código que o contrato promete manter estável — a mensagem é para humano e
 * pode mudar de uma versão para outra sem aviso.
 *
 * `CREDENCIAIS_INVALIDAS` está ausente de propósito: ele não pertence a
 * campo nenhum (o servidor o entrega sob a chave `credentials`, que não é um
 * campo do formulário), e a mensagem que a pessoa lê é a que o servidor
 * mandou, sem o front acrescentar nada. Ver `deErroDeApi`.
 */
const MENSAGEM_POR_CODIGO: Readonly<
  Record<Exclude<CodigoErroIdentity, 'CREDENCIAIS_INVALIDAS'>, string>
> = {
  EMAIL_INVALIDO: 'Informe um e-mail válido.',
  HANDLE_INVALIDO: REGRA_DO_HANDLE,
  HANDLE_RESERVADO: 'Este nome é reservado pelo sistema. Escolha outro.',
  HANDLE_EM_USO: 'Este nome de usuário já está em uso.',
  SENHA_MUITO_CURTA: `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`,
  SENHA_MUITO_LONGA: 'A senha é longa demais.',
  SENHA_COMUM: 'Esta senha está entre as mais vazadas que existem. Escolha outra.',
  NOME_INVALIDO: 'Nome de exibição inválido.',
  TERMOS_NAO_ACEITOS: 'É preciso aceitar os termos para criar a conta.',
  SENHA_ATUAL_INCORRETA: 'A senha atual não confere.',
};

/**
 * Traduz a recusa da API para o que o formulário desenha.
 *
 * A regra de repartição é do próprio contrato, não uma adivinhação nossa: o
 * servidor devolve `details` como campo → códigos, e o campo que ele nomeia
 * ou existe no formulário ou não existe. Quando não existe — `credentials`,
 * que é o par e-mail+senha tratado como uma coisa só, ou `(corpo)`, que é o
 * corpo inteiro — a mensagem sobe para o topo do formulário.
 *
 * É assim que o login continua sem revelar se o e-mail existe **sem o front
 * precisar saber disso**: não há nada aqui tentando descobrir qual dos dois
 * campos errou, porque o servidor deliberadamente não disse. O que a pessoa
 * lê é a mensagem que veio de lá, inteira e sem palpite.
 */
export function deErroDeApi(
  erro: unknown,
  camposDoFormulario: readonly string[],
): ErroDeFormulario {
  if (!(erro instanceof ApiRequestError)) {
    return { porCampo: {}, geral: 'Não foi possível falar com a API. Tente de novo.' };
  }

  const porCampo: Record<string, string> = {};
  let sobrou = false;

  for (const [campo, codigos] of Object.entries(erro.payload.details ?? {})) {
    if (!camposDoFormulario.includes(campo)) {
      sobrou = true;
      continue;
    }
    const mensagem = codigos.map((codigo) => traduzir(codigo, campo)).find((texto) => texto !== '');
    if (mensagem !== undefined) porCampo[campo] = mensagem;
  }

  // A mensagem geral aparece quando algo não coube em campo nenhum, e também
  // quando a recusa veio sem `details` — 429 do teto de tentativas, 500,
  // qualquer coisa que não seja validação.
  const geral = sobrou || Object.keys(porCampo).length === 0 ? erro.payload.message : null;

  return { porCampo, geral };
}

function traduzir(codigo: string, campo: string): string {
  const conhecido = codigoErroIdentitySchema.safeParse(codigo);
  if (conhecido.success && conhecido.data !== 'CREDENCIAIS_INVALIDAS') {
    return MENSAGEM_POR_CODIGO[conhecido.data];
  }
  // Não é código do domínio: veio da validação de borda, em inglês. O que a
  // pessoa precisa ler é a regra do campo, não a mensagem do Zod.
  return REGRA_DO_CAMPO[campo] ?? '';
}

/**
 * A mesma recusa, quando quem recusou foi o contrato aqui no navegador.
 *
 * O formulário valida com o MESMO schema que a API usa — não uma cópia das
 * regras escrita à mão — então o que ele barra é exatamente o que o servidor
 * barraria, e o erro aparece na hora, sem uma ida à rede. Só a mensagem é
 * nossa: a do Zod é em inglês e descreve o tipo, não o que fazer.
 */
export function deErroDeContrato(erro: ZodError): ErroDeFormulario {
  const porCampo: Record<string, string> = {};

  for (const problema of erro.issues) {
    const campo = problema.path[0];
    if (typeof campo !== 'string' || campo in porCampo) continue;
    porCampo[campo] = REGRA_DO_CAMPO[campo] ?? 'Confira este campo.';
  }

  return { porCampo, geral: null };
}
