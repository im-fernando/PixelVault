import { ForbiddenError, NotFoundError } from '../../../infrastructure/errors.js';
import type { Acao, Assunto, Habilidades, RecursoDeHabilidade } from '../domain/habilidades.js';

/**
 * A tradução de "não pode" para resposta HTTP.
 *
 * Mora em `application/` pelo mesmo motivo de `traduzir-erro.ts`: o domínio
 * responde sim ou não e não conhece status HTTP; a rota não deveria decidir
 * regra de mapeamento. A camada do meio é a única que fala as duas línguas.
 *
 * Fica no `identity`, e não em `infrastructure/`, porque depende do tipo
 * `Habilidades` — se descesse para a infraestrutura compartilhada, ela
 * passaria a importar o `identity` e fecharia um ciclo com a fachada que o
 * dependency-cruiser recusa (e com razão). Os módulos futuros chegam nele
 * pelo `index.ts`, como em tudo o mais.
 */

/**
 * Nega um recurso específico respondendo como se ele não existisse.
 *
 * É o padrão que `library` e `progress` vão seguir em toda rota de "recurso
 * de alguém": busque o recurso, cheque a habilidade CONTRA ELE (não contra o
 * nome do tipo) e, se a checagem falhar, responda 404.
 *
 * Um 403 aqui diria "existe, mas não é seu" — e isso é informação. Quem varre
 * ids alheios não deve conseguir separar "não achei" de "achei e é de outro";
 * as duas respostas precisam ser byte a byte iguais, e são: as duas saem do
 * mesmo `NotFoundError` que uma busca vazia produziria. É o mesmo raciocínio
 * que `DELETE /api/auth/sessions/:id` já aplica no `sessions`.
 *
 * O `nome` é o do recurso na mensagem, e tem que ser exatamente o que a rota
 * usaria no 404 legítimo — se divergir, a diferença de texto vira o oráculo
 * que este helper existe para fechar.
 *
 * Recebe `RecursoDeHabilidade`, e não o nome do assunto, de propósito: no
 * CASL, perguntar pelo tipo ("pode ler biblioteca?") é perguntar se existe
 * ALGUMA que a pessoa possa ler — e a resposta é sim, a dela. Quem responde
 * sobre propriedade é a pergunta feita com o recurso na mão, e a assinatura
 * é o que impede a outra.
 */
export function autorizarOuNaoEncontrado(
  habilidades: Habilidades,
  acao: Acao,
  recurso: RecursoDeHabilidade,
  nome: string,
): void {
  if (habilidades.can(acao, recurso)) return;
  throw new NotFoundError(nome);
}

/**
 * Nega uma ação que não é sobre um recurso específico — administrar o
 * catálogo, por exemplo. Aqui 403 é a resposta certa: não há existência de
 * nada para esconder, só permissão que falta, e um 404 mentiria dizendo que
 * a rota não existe.
 *
 * Serve também de rede: uma rota nova que chame isto com um assunto para o
 * qual ninguém escreveu regra recusa por omissão, porque é assim que o CASL
 * responde ao que não foi permitido.
 *
 * Não use isto com o nome de um assunto que tem dono (`Library`, `Progress`,
 * `Profile`): a pergunta pelo tipo responde "pode em alguma", e sairia um
 * "sim" para quem só pode na própria. Para recurso de alguém é sempre
 * `autorizarOuNaoEncontrado`, com o recurso na mão.
 */
export function autorizarOuProibido(
  habilidades: Habilidades,
  acao: Acao,
  assunto: Assunto | RecursoDeHabilidade,
): void {
  if (habilidades.can(acao, assunto)) return;
  throw new ForbiddenError();
}
