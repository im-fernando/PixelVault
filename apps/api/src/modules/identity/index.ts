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
 * É dono também do e-mail transacional, porque o único que existe hoje é o
 * de recuperação de senha: `criarEnvioDeEmail` monta o adaptador que a
 * composition root escolhe por configuração (console ou Resend). Quando o
 * segundo e-mail do produto aparecer noutro módulo, a porta se muda para um
 * lugar compartilhado — hoje isso seria abstração adiantada. Ver
 * docs/adr/0021.
 *
 * É dono também da autorização, porque é dele a conta e o papel dela. Os
 * outros módulos montam a `Ability` de quem está pedindo com
 * `habilidadesDoUsuario(request.userId)`, perguntam com `recurso(...)` e
 * negam com `autorizarOuNaoEncontrado` — nenhum deles escreve regra própria,
 * e nenhum importa o CASL para isso. Ver docs/adr/0018.
 *
 * `perfisPublicosPorIds` sai daqui desde a #122: `leaderboards` pergunta
 * handle e nome de exibição das contas que aparecem no ranking, em lote —
 * mesmo raciocínio de `contarRomsNaBiblioteca` em `library`. Devolve só
 * `PerfilPublico` (nunca `DadosDoUsuario` inteiro): é o par que já vira
 * público em `/u/:handle` na M6 (#123), nunca o e-mail.
 *
 * `perfilPublicoPorHandle` sai daqui desde a #123: acha o mesmo
 * `PerfilPublico`, mas pelo handle, não pelo id — é o que a rota pública de
 * perfil precisa, porque a URL (`/u/:handle`) chega com o handle.
 */
export { identityRoutes } from './http/routes.js';
export type { OpcoesDeIdentity } from './http/routes.js';
export { criarLimitesDeAutenticacao } from './http/limite-de-autenticacao.js';
export { criarEnvioDeEmail } from './infrastructure/criar-envio-de-email.js';
export type { OpcoesDeEnvioDeEmail } from './infrastructure/criar-envio-de-email.js';
export type { EnvioDeEmail, MensagemDeEmail } from './domain/envio-de-email.js';
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
export type { PerfilPublico, UserRepository } from './domain/user-repository.js';
export { perfilPublicoPorHandle, perfisPublicosPorIds } from './application/perfis-publicos.js';
