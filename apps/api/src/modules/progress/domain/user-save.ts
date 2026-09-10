/**
 * Tipo de save suportado pela nuvem: `sram` desde a M4, `state` desde a M5
 * (issue #104).
 *
 * `@pixelvault/contracts` já definia `SaveKind` como `'sram' | 'state'` desde
 * a M1 — é o vocabulário do save local, que sempre conheceu os dois. Este
 * alias existia só para amarrar o domínio ao subconjunto que o banco aceitava
 * (`Extract<SaveKind, 'sram'>`, até a #104); agora que `enum SaveKind` do
 * Prisma tem os dois valores, o alias é o próprio `SaveKind` do contrato —
 * mantido para quem já importa daqui, e porque "tipo de save na nuvem" é um
 * nome de domínio que vale a pena continuar existindo mesmo idêntico ao do
 * contrato.
 */
import type { SaveKind } from '@pixelvault/contracts';

export type TipoDeSaveNaNuvem = SaveKind;

/**
 * Os quatro slots de save state — o mesmo vocabulário de
 * `apps/web/.../storage/save-key.ts`, redeclarado aqui porque o domínio da
 * API não importa código de `apps/web` (são apps diferentes, sem fronteira
 * de módulo compartilhada) e a união fechada é o que faz `slot: 97` falhar
 * em compilação, não em runtime.
 */
export type SlotDeSaveState = 0 | 1 | 2 | 3;

/**
 * O save da conta na nuvem, do jeito que sai do banco.
 *
 * Espelha `user_saves`: a FK composta `[userId, sha256]` para `user_roms` —
 * não há linha aqui sem a ROM correspondente na biblioteca da conta (ver o
 * comentário do model em schema.prisma). `updatedAt` é sempre o relógio do
 * servidor (`@updatedAt` do Prisma); o cliente nunca escreve este campo.
 *
 * `slot` é `null` para `kind: 'sram'` e um `SlotDeSaveState` para
 * `kind: 'state'` — a sentinela `-1` que a coluna usa no banco (ver o
 * comentário do model `UserSave` em schema.prisma, sobre por que não é
 * `NULL` ali) não atravessa para o domínio: aqui `null` volta a significar
 * "não se aplica", e é a `PrismaUserSaveRepository` quem faz a tradução dos
 * dois lados. `thumbnailKey`/`thumbnailSizeBytes` seguem a mesma regra — só
 * existem para `state` (issue #109: sem o tamanho da miniatura em algum
 * lugar consultável, a cota não tem como contar um objeto que `sizeBytes`
 * nunca descreveu).
 */
export interface SaveNaNuvem {
  readonly id: string;
  readonly userId: string;
  readonly sha256: string;
  readonly kind: TipoDeSaveNaNuvem;
  readonly slot: SlotDeSaveState | null;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly thumbnailKey: string | null;
  readonly thumbnailSizeBytes: number | null;
  readonly revision: number;
  readonly updatedAt: Date;
}
