import type { AbilityRule } from '@pixelvault/contracts';
import {
  definirHabilidades,
  definirRegrasDeHabilidade,
  type Habilidades,
  type UsuarioParaHabilidades,
} from '../domain/habilidades.js';
import type { UserRepository } from '../domain/user-repository.js';

/**
 * Traz do banco o pouco que a autorização precisa saber de quem está pedindo.
 *
 * `userId` nulo é o visitante — e nem toca no banco. Sessão apontando para
 * conta inexistente também vira visitante, e não erro: a conta sumiu, então
 * quem chegou tem exatamente os poderes de quem não tem conta. Recusar com
 * 500 seria transformar uma corrida rara (a conta apagada com a sessão ainda
 * no ar) numa falha da aplicação.
 */
async function resolverUsuario(
  usuarios: UserRepository,
  userId: string | null,
): Promise<UsuarioParaHabilidades | null> {
  if (userId === null) return null;

  const papel = await usuarios.buscarPapelPorId(userId);
  if (papel === null) return null;

  return { id: userId, papel };
}

/**
 * A `Ability` de quem está pedindo. É o que qualquer módulo chama antes de
 * decidir se entrega um recurso — o `identity` a expõe pela fachada
 * exatamente como o `sessions` expõe "quem é você".
 */
export async function carregarHabilidades(
  usuarios: UserRepository,
  userId: string | null,
): Promise<Habilidades> {
  return definirHabilidades(await resolverUsuario(usuarios, userId));
}

/**
 * As mesmas regras, cruas, para irem ao front. Duas funções e uma definição
 * só: o servidor monta a `Ability` a partir das regras que ele mesmo envia,
 * então não existe "a regra do back" e "a regra do front" para divergirem.
 */
export async function carregarRegrasDeHabilidade(
  usuarios: UserRepository,
  userId: string | null,
): Promise<AbilityRule[]> {
  return definirRegrasDeHabilidade(await resolverUsuario(usuarios, userId));
}
