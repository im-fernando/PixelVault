import { z } from 'zod';
import { slugSchema, systemIdSchema, uuidSchema } from '../shared/primitives.js';

/**
 * Referência de capa: ou URL absoluta, ou caminho a partir da raiz.
 *
 * O caminho relativo não é conveniência — é o que impede a origem de ser
 * gravada dentro da linha do banco. Capa de homebrew é servida pelo próprio
 * front, então `/roms/<slug>/capa.png` resolve contra qualquer domínio que
 * esteja servindo a aplicação. Guardar `http://localhost:5173/...` faria as
 * capas quebrarem ao trocar de domínio, e um seed idempotente não teria como
 * corrigir. URL absoluta continua valendo para capa vinda de CDN externo.
 */
export const coverRefSchema = z.union([
  z.url(),
  z.string().regex(/^\/(?!\/)\S*$/, 'caminho de capa deve começar com / e não conter espaço'),
]);
export type CoverRef = z.infer<typeof coverRefSchema>;

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
  coverUrl: coverRefSchema.nullable(),
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
