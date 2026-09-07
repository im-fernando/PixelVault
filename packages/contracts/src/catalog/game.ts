import { z } from 'zod';
import { sha256Schema, slugSchema, systemIdSchema, uuidSchema } from '../shared/primitives.js';

/**
 * Referência a um arquivo que nós servimos: ou URL absoluta, ou caminho a
 * partir da raiz.
 *
 * O caminho relativo não é conveniência — é o que impede a origem de ser
 * gravada dentro da linha do banco. Capa e ROM de homebrew são servidas pelo
 * próprio front, então `/roms/<slug>/capa.png` resolve contra qualquer domínio
 * que esteja servindo a aplicação. Guardar `http://localhost:5173/...` faria
 * tudo quebrar ao trocar de domínio, e um seed idempotente não teria como
 * corrigir. URL absoluta continua valendo para arquivo vindo de CDN externo.
 */
export const assetRefSchema = z.union([
  z.url(),
  z.string().regex(/^\/(?!\/)\S*$/, 'caminho deve começar com / e não conter espaço'),
]);
export type AssetRef = z.infer<typeof assetRefSchema>;

/** Capa é um caso de referência de arquivo; o nome antigo continua valendo. */
export const coverRefSchema = assetRefSchema;
export type CoverRef = AssetRef;

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

/**
 * A ROM de um homebrew que nós mesmos servimos.
 *
 * Existe **só** para homebrew, e o schema é separado do `gameSchema` de
 * propósito: `Game` é metadado redistribuível, e ROM é arquivo. Mantê-los no
 * mesmo objeto convidaria a preencher isto para jogo comercial — que é
 * exatamente o que a ADR 0006 proíbe. Aqui, campo nulo é a regra, não a
 * exceção.
 *
 * `sha256` viaja junto porque é a identidade canônica da ROM: é o que permite
 * conferir o arquivo baixado e o que casa com `game_roms` quando a mesma ROM
 * chegar por upload.
 */
export const homebrewRomSchema = z.object({
  /** Caminho a partir da raiz do site. É o que alimenta `romFromUrl()` no cliente. */
  url: assetRefSchema,
  /** Vários cores decidem o que carregar pela extensão; sem isto teriam que adivinhar. */
  fileName: z.string().min(1).max(200),
  sha256: sha256Schema,
  sizeBytes: z.number().int().positive().nullable(),
});
export type HomebrewRom = z.infer<typeof homebrewRomSchema>;

/**
 * Detalhe de um jogo: o metadado mais a referência do arquivo, quando existe.
 *
 * É o que o player precisa para sair do slug e chegar aos bytes sem inventar
 * caminho no front. `homebrewRom` é `null` para todo jogo comercial — nesse
 * caso a ROM é do usuário e vem por `library`.
 */
export const gameDetailSchema = gameSchema.extend({
  homebrewRom: homebrewRomSchema.nullable(),
});
export type GameDetail = z.infer<typeof gameDetailSchema>;
