import type { RomDoCatalogo } from '../domain/game-repository.js';
import { prismaGameRepository } from '../infrastructure/prisma-game-repository.js';

/**
 * O match de hash já ligado ao repositório — é isto que a fachada exporta.
 *
 * Existe pelo mesmo motivo do `habilidadesDoUsuario` no `identity`: quem
 * precisa da resposta é outro módulo (o `library`, quando verifica uma ROM
 * enviada), e nenhum módulo pode importar `catalog/infrastructure` para
 * injetar o repositório (ADR 0003). Então quem faz a ligação é o próprio
 * `catalog`.
 *
 * O `library` recebe isto como uma função — a porta `IdentificarRomNoCatalogo`
 * que ele mesmo declara —, e não como um repositório: o BYOR não precisa saber
 * que existe um catálogo com jogos, só que alguém sabe dizer de que jogo é um
 * hash.
 */
export async function identificarRomPorHash(
  hashes: readonly string[],
): Promise<RomDoCatalogo | null> {
  // O `Set` não é por causa do chamador de hoje, que manda dois hashes
  // distintos: é porque a assinatura aceita qualquer lista, e repetido dentro
  // de um `IN` é trabalho que o banco faz à toa.
  return prismaGameRepository.identificarRomPorHash([...new Set(hashes)]);
}
