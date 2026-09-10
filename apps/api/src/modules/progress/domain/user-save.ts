/**
 * Tipo de save suportado pela nuvem até a M5.
 *
 * `@pixelvault/contracts` já define `SaveKind` como `'sram' | 'state'` — é o
 * vocabulário do save local (M1), que sempre conheceu os dois. O banco só
 * tem `'sram'` (ver `enum SaveKind` em schema.prisma), porque save state na
 * nuvem é a M5. `Extract` amarra este tipo ao contrato: se `SaveKind` um dia
 * deixar de incluir `'sram'`, isto para de compilar em vez de aceitar um
 * valor que o banco recusa.
 */
import type { SaveKind } from '@pixelvault/contracts';

export type TipoDeSaveNaNuvem = Extract<SaveKind, 'sram'>;

/**
 * O save da conta na nuvem, do jeito que sai do banco.
 *
 * Espelha `user_saves`: a FK composta `[userId, sha256]` para `user_roms` —
 * não há linha aqui sem a ROM correspondente na biblioteca da conta (ver o
 * comentário do model em schema.prisma). `updatedAt` é sempre o relógio do
 * servidor (`@updatedAt` do Prisma); o cliente nunca escreve este campo.
 */
export interface SaveNaNuvem {
  readonly id: string;
  readonly userId: string;
  readonly sha256: string;
  readonly kind: TipoDeSaveNaNuvem;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly revision: number;
  readonly updatedAt: Date;
}
