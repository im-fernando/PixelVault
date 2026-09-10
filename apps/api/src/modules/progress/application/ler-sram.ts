import { Buffer } from 'node:buffer';
import type { SramDownloadResponse } from '@pixelvault/contracts';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../../library/index.js';
import type { UserSaveRepository } from '../domain/user-save-repository.js';

/** O nome do recurso nos dois 404 — mesmo raciocínio de `gravar-sram.ts`. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDaLeituraDeSram {
  roms: UserRomRepository;
  saves: UserSaveRepository;
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Lê a SRAM de uma ROM da biblioteca — a mesma autorização por posse que a
 * #73 estabeleceu para download de ROM
 * (`library/application/autorizar-download-de-rom.ts`), aplicada aqui ao
 * `romId` de `user_roms` em vez de ao `id` da ROM.
 *
 * ## Por que `ler` os bytes, e não `assinarLeitura`
 *
 * O upload (#89) escreveu direto no servidor porque a checagem de conflito
 * por revisão precisa da API no meio do caminho — aqui não há checagem
 * nenhuma, então uma URL assinada serviria. A escolha é ainda ler os bytes e
 * devolvê-los no corpo, pelo mesmo motivo do upload: `TAMANHO_MAXIMO_DE_SRAM_EM_BYTES`
 * é pequeno o bastante para não valer o custo extra de expor o storage a GET
 * público — menos infraestrutura a configurar, uma viagem de rede a menos, e
 * o mesmo formato (base64 no corpo JSON) que o upload já usa, simétrico dos
 * dois lados.
 *
 * ## Por que "sem save" não é 404
 *
 * A ROM é da conta que perguntou — a autorização já confirmou isso. Não
 * existir save ainda é o estado normal de um jogo nunca sincronizado, não
 * "você não pode ver isto". Misturar os dois no mesmo 404 impediria o front
 * de saber se pode oferecer a adoção (ROM seu, sem save) ou não deveria nem
 * ter perguntado (`romId` alheio). Ver `sramDownloadSemSaveSchema`.
 */
export async function lerSram(
  deps: DependenciasDaLeituraDeSram,
  habilidades: Habilidades,
  userId: string,
  romId: string,
): Promise<SramDownloadResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  autorizarOuNaoEncontrado(
    habilidades,
    'read',
    recurso('Progress', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  const save = await deps.saves.buscarPorRom(userId, rom.sha256, 'sram');
  if (save === null) return { status: 'sem-save' };

  const bytes = await deps.armazenamento.ler(save.storageKey);

  return {
    status: 'encontrado',
    revision: save.revision,
    sizeBytes: save.sizeBytes,
    updatedAt: save.updatedAt.toISOString(),
    dataBase64: Buffer.from(bytes).toString('base64'),
  };
}
