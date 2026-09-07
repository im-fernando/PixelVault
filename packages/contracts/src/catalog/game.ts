import { z } from 'zod';
import { slugSchema, systemIdSchema, uuidSchema } from '../shared/primitives.js';

/**
 * Catálogo canônico de metadados. É o eixo de conquistas, ranking e perfil.
 *
 * Repare no que NÃO está aqui: nenhuma referência a arquivo de ROM. Metadado
 * é redistribuível; ROM comercial não é. A ROM pertence ao usuário e vive em
 * `library`. Ver docs/adr/0006.
 */
export const gameSchema = z.object({
  id: uuidSchema,
  systemId: systemIdSchema,
  title: z.string().min(1).max(200),
  slug: slugSchema,
  releaseYear: z.number().int().min(1970).max(2100).nullable(),
  publisher: z.string().max(200).nullable(),
  coverUrl: z.url().nullable(),
  /** Homebrew é jogável por qualquer pessoa, sem login e sem upload. */
  isHomebrew: z.boolean(),
});
export type Game = z.infer<typeof gameSchema>;

export const gameListQuerySchema = z.object({
  systemId: systemIdSchema.optional(),
  search: z.string().max(200).optional(),
  homebrewOnly: z.coerce.boolean().optional(),
});
export type GameListQuery = z.infer<typeof gameListQuerySchema>;
