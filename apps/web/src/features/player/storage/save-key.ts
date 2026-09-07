import type { SaveKind } from '@pixelvault/contracts';

/**
 * Slots de save state disponíveis por jogo.
 *
 * É uma união fechada, e não `number`, porque slot é escolha de UI: quatro
 * botões na galeria. `number` deixaria `saveState(97)` compilar e só falhar em
 * runtime, quando já não há mais nada a fazer além de mostrar erro.
 */
export type SaveSlot = 0 | 1 | 2 | 3;

export const SAVE_SLOTS: readonly SaveSlot[] = Object.freeze([0, 1, 2, 3]);

export function isSaveSlot(valor: unknown): valor is SaveSlot {
  return typeof valor === 'number' && (SAVE_SLOTS as readonly number[]).includes(valor);
}

/**
 * Endereço de um save dentro do storage.
 *
 * SRAM e save state nunca compartilham chave: a SRAM é única por ROM (é a
 * bateria do cartucho, e cartucho só tem uma), o save state é por slot. Por
 * isso `slot` só existe em `kind: 'state'` — o tipo impede "SRAM do slot 2",
 * que não significa nada.
 */
export type SaveKey =
  | { readonly kind: Extract<SaveKind, 'sram'>; readonly romId: string }
  | { readonly kind: Extract<SaveKind, 'state'>; readonly romId: string; readonly slot: SaveSlot };

export function sramKey(romId: string): SaveKey {
  return { kind: 'sram', romId };
}

export function stateKey(romId: string, slot: SaveSlot): SaveKey {
  return { kind: 'state', romId, slot };
}

/**
 * Nome estável do registro dentro do escopo de uma ROM.
 *
 * Estável importa mais do que bonito: é o nome de arquivo no OPFS e parte da
 * chave no IndexedDB, então mudá-lo depois torna invisível todo save já
 * gravado por quem já jogou.
 */
export function saveEntryName(key: SaveKey): string {
  return key.kind === 'sram' ? 'sram' : `state-${key.slot}`;
}

/** Chave plana, para storages que só sabem indexar por string. */
export function serializeSaveKey(key: SaveKey): string {
  return `${key.romId}/${saveEntryName(key)}`;
}
