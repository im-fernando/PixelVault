import type { AbilityRule } from '@pixelvault/contracts';
import {
  carregarHabilidades,
  carregarRegrasDeHabilidade,
} from '../application/carregar-habilidades.js';
import type { Habilidades } from '../domain/habilidades.js';
import { prismaUserRepository } from '../infrastructure/prisma-user-repository.js';

/**
 * O caso de uso já ligado ao repositório — é isto que a fachada exporta.
 *
 * Existe porque a dependência que falta do outro lado da fronteira é
 * infraestrutura do `identity`: nenhum módulo pode importar
 * `identity/infrastructure` para injetar o repositório (ADR 0003), então
 * quem faz essa ligação é o próprio `identity`. Mesma escolha do
 * `criarSessoes` no `sessions`, e pelo mesmo motivo.
 *
 * A entrada é `request.userId` como ele vem do `sessions`: `string` para
 * quem tem sessão viva, `null` para o visitante.
 */
export async function habilidadesDoUsuario(userId: string | null): Promise<Habilidades> {
  return carregarHabilidades(prismaUserRepository, userId);
}

/** As mesmas regras, cruas, para a rota que as entrega ao front. */
export async function regrasDeHabilidadeDoUsuario(userId: string | null): Promise<AbilityRule[]> {
  return carregarRegrasDeHabilidade(prismaUserRepository, userId);
}
