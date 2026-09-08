import { VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS } from '@pixelvault/contracts';
import type { MensagemDeEmail } from './envio-de-email.js';

/** Onde a tela de redefinição mora no front. */
const CAMINHO_DA_REDEFINICAO = '/redefinir-senha';

const MINUTOS_DE_VALIDADE = Math.round(VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS / 60_000);

/**
 * O link que vai no e-mail.
 *
 * O token viaja na _query string_ e não no caminho por um motivo prático: é
 * o formato que o roteador do front já sabe validar (`validateSearch`), e o
 * que sobrevive a um encaminhamento sem o cliente de e-mail tentar
 * "consertar" a URL.
 *
 * A origem vem de fora (é `WEB_ORIGIN`, configuração), nunca de um cabeçalho
 * da requisição. Montar o link a partir de `Host` ou `X-Forwarded-Host`
 * deixaria qualquer pessoa escolher para onde o link do e-mail de outra
 * aponta — um envenenamento de link de redefinição, que é dos ataques mais
 * baratos que existem contra este fluxo.
 */
export function linkDeRedefinicao(origemDoFront: string, token: string): string {
  const url = new URL(CAMINHO_DA_REDEFINICAO, origemDoFront);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * A mensagem de "esqueci minha senha", montada aqui e não no adaptador.
 *
 * É domínio porque é conteúdo do produto, não detalhe de entrega: o que a
 * mensagem afirma (que alguém pediu, que o link vence, que ignorar é seguro)
 * é decisão de segurança tanto quanto de texto. Trocar o Resend por outro
 * provedor não pode reescrever isto por acidente.
 *
 * O que a mensagem **não** faz:
 *
 * - Não trata a pessoa pelo nome nem cita o handle. Quem lê pode não ser o
 *   dono da conta (endereço digitado errado por um terceiro, caixa
 *   compartilhada), e um e-mail que devolve o nome de exibição de quem tem
 *   conta aqui é um oráculo de enumeração entregue pelo correio.
 * - Não pede confirmação de nada nem oferece "não fui eu" clicável. Um
 *   segundo link seria um segundo alvo, e quem não pediu nada só precisa
 *   fechar o e-mail: sem clicar, nada acontece e o token vence sozinho.
 */
export function emailDeRecuperacao(para: string, link: string): MensagemDeEmail {
  const texto = [
    'Alguém pediu para redefinir a senha desta conta no PixelVault.',
    '',
    'Se foi você, abra o endereço abaixo e escolha uma senha nova:',
    '',
    link,
    '',
    `O link vale por ${MINUTOS_DE_VALIDADE} minutos e funciona uma vez só.`,
    'Redefinir a senha encerra todas as sessões abertas da conta.',
    '',
    'Se não foi você, não é preciso fazer nada: sem esse link, ninguém',
    'redefine coisa nenhuma, e ele vence sozinho.',
    '',
    '— PixelVault',
  ].join('\n');

  const html = [
    '<p>Alguém pediu para redefinir a senha desta conta no PixelVault.</p>',
    '<p>Se foi você, escolha uma senha nova:</p>',
    `<p><a href="${escaparHtml(link)}">Redefinir minha senha</a></p>`,
    `<p>O link vale por ${MINUTOS_DE_VALIDADE} minutos e funciona uma vez só. ` +
      'Redefinir a senha encerra todas as sessões abertas da conta.</p>',
    '<p>Se não foi você, não é preciso fazer nada: sem esse link, ninguém redefine ' +
      'coisa nenhuma, e ele vence sozinho.</p>',
    '<p>— PixelVault</p>',
  ].join('\n');

  return { para, assunto: 'Redefinir sua senha no PixelVault', texto, html };
}

/**
 * O link é o único valor variável que entra no HTML, e ele é montado por
 * `linkDeRedefinicao` a partir de configuração nossa — então não há entrada
 * de usuário aqui. O escape existe mesmo assim porque a distância entre "não
 * há entrada de usuário hoje" e "alguém acrescentou um parâmetro amanhã" é
 * uma linha de código, e HTML de e-mail é lido por dezenas de renderizadores
 * diferentes.
 */
function escaparHtml(valor: string): string {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
