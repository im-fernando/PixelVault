import type { HeartbeatResponse } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../../library/index.js';
import type { UserGameRepository } from '../domain/user-game-repository.js';

/** O nome do recurso no 404 — mesmo raciocínio de `gravar-sram.ts`. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDoHeartbeat {
  roms: UserRomRepository;
  userGames: UserGameRepository;
}

/**
 * Credita um heartbeat de playtime — issue #119, modelo de confiança no
 * [ADR 0009](../../../../../../docs/adr/0009-modelo-de-confianca-do-playtime.md).
 *
 * Recebe só o `romId` (a linha da biblioteca de quem está pedindo, o mesmo
 * `romId` que a SRAM e o save state já autorizam) e NUNCA um `gameId`
 * declarado pelo corpo da requisição: o `gameId` que importa é o que o
 * SERVIDOR já resolveu no momento em que a ROM entrou na biblioteca (o match
 * de hash do BYOR, ADR 0006), nunca uma alegação do cliente sobre em que jogo
 * ele está. É a mesma disciplina do relógio — não confiar no cliente —
 * aplicada a "qual jogo", não só a "quanto tempo".
 *
 * `rom.gameId === null` (ROM não reconhecida pelo catálogo) responde sucesso
 * sem creditar nada: não existe `UserGame` possível sem `gameId`, e recusar
 * com erro trataria como falha algo que é só uma ROM comum do BYOR (a maioria
 * delas, pela ADR 0006). Ver docs/adr/0009, decisão 3.
 */
export async function creditarHeartbeatDePlaytime(
  deps: DependenciasDoHeartbeat,
  habilidades: Habilidades,
  userId: string,
  romId: string,
  tetoSegundos: number,
): Promise<HeartbeatResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  // Mesma habilidade que a SRAM e o save state já usam para "esta ROM é
  // sua": o assunto é `Progress`, a condição é o dono da linha de biblioteca.
  autorizarOuNaoEncontrado(
    habilidades,
    'update',
    recurso('Progress', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  if (rom.gameId === null) {
    return { status: 'sem-jogo-reconhecido' };
  }

  const credito = await deps.userGames.creditarHeartbeat(userId, rom.gameId, tetoSegundos);

  return {
    status: 'creditado',
    segundosCreditados: credito.segundosCreditados,
    totalPlaytimeSeconds: credito.totalPlaytimeSeconds,
  };
}
