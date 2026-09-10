import { Buffer } from 'node:buffer';
import type { StateListResponse } from '@pixelvault/contracts';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../../library/index.js';
import type { UserSaveRepository } from '../domain/user-save-repository.js';

/** O nome do recurso nos dois 404 — mesmo raciocínio de `gravar-sram.ts`. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDaListagemDeSaveStates {
  roms: UserRomRepository;
  saves: UserSaveRepository;
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Lista os até 4 slots de save state da nuvem para uma ROM, com miniatura —
 * issue #106.
 *
 * ## Por que a miniatura vem embutida, e o estado não
 *
 * A galeria (`GaleriaDeSlots`) desenha 4 quadros de uma vez; baixar os 4
 * estados inteiros (até `TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES`, 4 MiB,
 * cada) só para pintar algumas dezenas de KB de imagem seria o mesmo
 * desperdício que o ADR 0020 já evitou do lado local (`readThumbnail` sem
 * arrastar os bytes do estado). A miniatura (teto de 64 KiB) cabe embutida
 * em base64 sem esse custo — o estado em si se pede à parte, por
 * `ler-save-state.ts`, só quando a pessoa carrega aquele slot de verdade.
 *
 * ## Por que "vazio" é um array vazio, não um status
 *
 * Diferente da SRAM (uma linha só — daí o `status: 'sem-save'` de
 * `sramDownloadResponseSchema`), esta resposta já é uma coleção. Slot sem
 * save simplesmente não aparece; os quatro vazios viram um array vazio, sem
 * precisar de um marcador para dizer o que o próprio array já diz.
 */
export async function listarSaveStates(
  deps: DependenciasDaListagemDeSaveStates,
  habilidades: Habilidades,
  userId: string,
  romId: string,
): Promise<StateListResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  autorizarOuNaoEncontrado(
    habilidades,
    'read',
    recurso('Progress', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  const saves = await deps.saves.listarPorRom(userId, rom.sha256, 'state');

  const slots = await Promise.all(
    saves
      // `slot`/`thumbnailKey` nulos não deveriam existir para `kind: 'state'`
      // — a #105 torna a miniatura obrigatória em toda gravação. O filtro é
      // só a defesa contra uma linha que fugiu dessa garantia; não é o
      // caminho esperado.
      .filter((save) => save.slot !== null && save.thumbnailKey !== null)
      .map(async (save) => {
        const bytesDaMiniatura = await deps.armazenamento.ler(save.thumbnailKey as string);
        return {
          slot: save.slot as 0 | 1 | 2 | 3,
          revision: save.revision,
          sizeBytes: save.sizeBytes,
          updatedAt: save.updatedAt.toISOString(),
          thumbnailBase64: Buffer.from(bytesDaMiniatura).toString('base64'),
        };
      }),
  );

  return { slots };
}
