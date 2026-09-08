/**
 * Superfície pública do módulo `identity`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar identity/domain, identity/application ou identity/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono das credenciais: cadastro, login e "quem sou eu". O ciclo
 * de vida da sessão é do módulo `sessions` — aqui só se pede a ele que abra
 * uma, passando um `userId`. Logout e revogação são a issue #47.
 *
 * É dono também da defesa contra força bruta, porque é dele a superfície em
 * que credencial é testada: `criarLimitesDeAutenticacao` monta os ganchos de
 * rate limit que a composition root pendura nas rotas de credencial. Ver
 * docs/adr/0019 e docs/seguranca.md.
 *
 * É dono também da autorização, porque é dele a conta e o papel dela. Os
 * outros módulos montam a `Ability` de quem está pedindo com
 * `habilidadesDoUsuario(request.userId)`, perguntam com `recurso(...)` e
 * negam com `autorizarOuNaoEncontrado` — nenhum deles escreve regra própria,
 * e nenhum importa o CASL para isso. Ver docs/adr/0018.
 */
export { identityRoutes } from './http/routes.js';
export type { OpcoesDeIdentity } from './http/routes.js';
export { criarLimitesDeAutenticacao } from './http/limite-de-autenticacao.js';
export type {
  LimitesDeAutenticacao,
  OpcoesDoLimiteDeAutenticacao,
} from './http/limite-de-autenticacao.js';
export { autorizarOuNaoEncontrado, autorizarOuProibido } from './application/autorizar.js';
export {
  definirHabilidades,
  definirRegrasDeHabilidade,
  PAPEIS,
  recurso,
} from './domain/habilidades.js';
export type {
  Acao,
  Assunto,
  Habilidades,
  Papel,
  RecursoDeHabilidade,
  UsuarioParaHabilidades,
} from './domain/habilidades.js';
export { habilidadesDoUsuario, regrasDeHabilidadeDoUsuario } from './http/habilidades.js';
export { Email } from './domain/email.js';
export { ErroDeIdentidade } from './domain/erros.js';
export { Handle } from './domain/handle.js';
export { validarPoliticaDeSenha } from './domain/politica-senha.js';
export { User } from './domain/user.js';
export type { PropsCriacaoUser } from './domain/user.js';
export type { UserRepository } from './domain/user-repository.js';
