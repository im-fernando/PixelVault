import { z } from 'zod';

/**
 * Teto de tamanho de um save state: 4 MiB.
 *
 * Diferente da SRAM (a bateria do cartucho), o save state é o estado inteiro
 * da máquina — WRAM, VRAM, RAM do SPC-700, registradores do PPU e da APU,
 * embrulhados no `EnvelopeDeEstado` (`packages/emulator-runtime/src/snes/state-envelope.ts`).
 * Um `.state` de SNES real gira em torno de 300 KiB a 1 MiB, dependendo do
 * core; 4 MiB é a mesma folga generosa que `TAMANHO_MAXIMO_DE_SRAM_EM_BYTES`
 * aplica à SRAM (o dobro do pior caso plausível, e mais), sem chegar perto
 * do teto de ROM (64 MiB) — um save state grande demais para isto não é
 * save state, é bug no core.
 */
export const TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES = 4 * 1024 * 1024;

/**
 * Teto de tamanho de uma miniatura de save state: 64 KiB.
 *
 * A miniatura sai de `captureThumbnail` (`apps/web/.../storage/thumbnail.ts`)
 * como WebP a 256 px de largura, qualidade 0.8 — na prática, poucos KB. 64
 * KiB é folga generosa para um quadro comprimido nesse tamanho; se algum dia
 * ela crescer disso, o problema é a captura, não o teto.
 */
export const TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES = 64 * 1024;

/**
 * Quantos bytes uma string base64 válida decodifica — sem decodificar de
 * verdade. Mesma função de `sram.ts`, repetida aqui porque é pura e pequena;
 * ver o comentário lá para o porquê de não decodificar de fato.
 */
function tamanhoDecodificadoDeBase64(base64: string): number {
  const preenchimento = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - preenchimento;
}

/** Os quatro slots de save state — o mesmo vocabulário do save local (`SaveSlot`). */
export const SLOTS_DE_SAVE_STATE = [0, 1, 2, 3] as const;
export const slotDeSaveStateSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type SlotDeSaveState = z.infer<typeof slotDeSaveStateSchema>;

/**
 * O mesmo intervalo de `slotDeSaveStateSchema`, mas para o segmento de URL —
 * que chega como string (`"0"`, nunca `0`) antes de qualquer schema Zod ver.
 * `coerce` faz a conversão; `int().min(0).max(3)` recusa `"4"` ou `"a"` com o
 * mesmo 400 que o corpo já recusaria.
 *
 * Deliberadamente um `ZodNumber` simples, não
 * `z.coerce.number().pipe(slotDeSaveStateSchema)`: quem chama já sabe que o
 * valor está em `0..3` pela validação da própria rota, e converte para
 * `SlotDeSaveState` com um cast no ponto de uso (ver `progress/http/routes.ts`)
 * em vez de compor mais um tipo Zod só para isto.
 */
export const slotDeSaveStateParamSchema = z.coerce.number().int().min(0).max(3);

/**
 * Corpo de `POST /api/progress/state/:romId/:slot`.
 *
 * Duas imagens de bytes, e não uma: o estado e a miniatura são objetos
 * separados no storage (ADR 0020 — a miniatura se lê sem arrastar o estado
 * inteiro), então a gravação precisa dos dois lados desde a entrada. A
 * miniatura é obrigatória, nunca opcional — uma gravação sem miniatura
 * apagaria a miniatura anterior no banco (ver o comentário de
 * `gravar-save-state.ts` sobre por que `thumbnailKey` não pode ficar de
 * fora de uma regravação).
 *
 * `revision` segue a mesma regra da SRAM: a que o cliente leu por último,
 * `0` para "não sei de nenhum save state neste slot ainda".
 */
export const stateUploadRequestSchema = z.object({
  revision: z.number().int().min(0),
  dataBase64: z
    .base64()
    .refine(
      (valor) => tamanhoDecodificadoDeBase64(valor) <= TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES,
      `save state maior que o teto de ${TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES} bytes`,
    ),
  thumbnailBase64: z
    .base64()
    .refine(
      (valor) => tamanhoDecodificadoDeBase64(valor) <= TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES,
      `miniatura maior que o teto de ${TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES} bytes`,
    ),
});
export type StateUploadRequest = z.infer<typeof stateUploadRequestSchema>;

export const stateUploadResponseSchema = z.object({
  status: z.literal('gravado'),
  revision: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  /** Relógio do servidor no momento da escrita — nunca o do cliente. */
  updatedAt: z.iso.datetime(),
});
export type StateUploadResponse = z.infer<typeof stateUploadResponseSchema>;
