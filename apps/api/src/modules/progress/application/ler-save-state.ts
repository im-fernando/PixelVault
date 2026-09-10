import type { StateDownloadResponse } from '@pixelvault/contracts';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../../library/index.js';
import type { SlotDeSaveState } from '../domain/user-save.js';
import type { UserSaveRepository } from '../domain/user-save-repository.js';

/** O nome do recurso nos dois 404 — mesmo raciocínio de `gravar-sram.ts`. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDaLeituraDeSaveState {
  roms: UserRomRepository;
  saves: UserSaveRepository;
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Assina a leitura do save state de um slot — issue #106, a mesma
 * autorização por posse que `ler-sram.ts` já usa.
 *
 * ## Por que URL assinada aqui, e bytes direto na SRAM (`ler-sram.ts`)
 *
 * SRAM tem teto de 256 KiB; save state tem 4 MiB
 * (`TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES`) — dezesseis vezes maior, e em
 * base64 dentro de um corpo JSON isso passaria de 5 MiB de payload. É a
 * mesma fronteira que já separa ROM (URL assinada,
 * `autorizar-download-de-rom.ts`) de SRAM (bytes no corpo): o tamanho decide
 * o formato, não o tipo de dado. A miniatura continua embutida na listagem
 * (`listar-save-states.ts`) porque ela sozinha é pequena — só o estado
 * inteiro migra para URL assinada.
 *
 * ## Por que "sem-save" continua sendo sucesso, não 404
 *
 * Mesmo raciocínio de `ler-sram.ts`: a ROM é da conta que perguntou (a
 * autorização já confirmou isso), e não ter save state naquele slot ainda é
 * o estado normal de um slot nunca sincronizado.
 */
export async function lerSaveState(
  deps: DependenciasDaLeituraDeSaveState,
  habilidades: Habilidades,
  userId: string,
  romId: string,
  slot: SlotDeSaveState,
): Promise<StateDownloadResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  autorizarOuNaoEncontrado(
    habilidades,
    'read',
    recurso('Progress', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  const save = await deps.saves.buscarPorRom(userId, rom.sha256, 'state', slot);
  if (save === null) return { status: 'sem-save' };

  const url = await deps.armazenamento.assinarLeitura(save.storageKey);

  return {
    status: 'encontrado',
    revision: save.revision,
    sizeBytes: save.sizeBytes,
    updatedAt: save.updatedAt.toISOString(),
    url,
    expiresInSeconds: VALIDADE_PADRAO_EM_SEGUNDOS,
  };
}
