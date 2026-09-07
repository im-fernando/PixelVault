import { z } from 'zod';
import { saveKindSchema, systemIdSchema, type SystemId } from '@pixelvault/contracts';
import { isSaveSlot, type SaveKey, type SaveSlot } from './save-key.js';

/**
 * Versão do formato dos metadados gravados no disco do usuário.
 *
 * Existe pelo mesmo motivo que a assinatura do save state do core: o que está
 * gravado sobrevive ao código que o gravou. Quando o formato mudar, um save
 * antigo precisa ser reconhecido como antigo — e recusado com mensagem — em
 * vez de ser lido com o layout errado.
 */
export const SAVE_RECORD_FORMAT = 1;

/**
 * O que sabemos sobre um save sem precisar ler os bytes dele.
 *
 * `coreVersion` e `systemId` são o coração da issue: save state é fotografia
 * da memória de uma versão específica de um core, e carregar a fotografia
 * errada corrompe a partida de um jeito que ninguém consegue diagnosticar
 * depois. Guardar os dois junto com os bytes é o que permite recusar antes.
 */
export const saveMetadataSchema = z.object({
  format: z.literal(SAVE_RECORD_FORMAT),
  kind: saveKindSchema,
  romId: z.string().min(1),
  /** Ausente em `kind: 'sram'`. A bateria do cartucho não tem slot. */
  slot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  systemId: systemIdSchema,
  coreVersion: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  /** Epoch em milissegundos, pelo relógio de quem gravou. */
  updatedAt: z.number().int().nonnegative(),
  hasThumbnail: z.boolean(),
});

export type SaveMetadata = z.infer<typeof saveMetadataSchema>;

/** Metadados mais os bytes. É o que `read` devolve. */
export interface StoredSave {
  readonly metadata: SaveMetadata;
  readonly data: Uint8Array;
  /** Miniatura do quadro. `null` em SRAM, em states antigos e em core sem `captureFrame`. */
  readonly thumbnail: Blob | null;
}

/**
 * O que o chamador entrega para gravar.
 *
 * `updatedAt` vem de fora, e não de um `Date.now()` escondido no adaptador,
 * para o teste conseguir afirmar o timestamp e para a M4 poder carimbar o
 * relógio do servidor sem mexer na porta.
 */
export interface SaveWriteInput {
  readonly key: SaveKey;
  readonly data: Uint8Array;
  readonly systemId: SystemId;
  readonly coreVersion: string;
  readonly updatedAt: number;
  readonly thumbnail?: Blob | null;
}

/** Deriva os metadados do que foi pedido. Única fonte da forma do registro. */
export function metadataFromInput(input: SaveWriteInput): SaveMetadata {
  const base = {
    format: SAVE_RECORD_FORMAT,
    kind: input.key.kind,
    romId: input.key.romId,
    systemId: input.systemId,
    coreVersion: input.coreVersion,
    byteLength: input.data.byteLength,
    updatedAt: input.updatedAt,
    hasThumbnail: (input.thumbnail ?? null) !== null,
  } as const;

  // `exactOptionalPropertyTypes` está ligado: `slot: undefined` não é o mesmo
  // que slot ausente, e só o ausente serializa para um JSON sem a chave.
  return input.key.kind === 'state' ? { ...base, slot: input.key.slot } : base;
}

/** Reconstrói a chave a partir dos metadados lidos do disco. */
export function keyFromMetadata(metadata: SaveMetadata): SaveKey {
  if (metadata.kind === 'sram') {
    return { kind: 'sram', romId: metadata.romId };
  }
  const slot: SaveSlot = isSaveSlot(metadata.slot) ? metadata.slot : 0;
  return { kind: 'state', romId: metadata.romId, slot };
}
