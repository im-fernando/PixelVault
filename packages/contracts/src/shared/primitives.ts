import { z } from 'zod';

export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/** SHA-256 em hexadecimal minúsculo — identidade canônica de uma ROM. */
export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'SHA-256 deve ter 64 caracteres hexadecimais minúsculos');
export type Sha256 = z.infer<typeof sha256Schema>;

/**
 * Consoles suportados.
 *
 * Modelado desde o início mesmo lançando só SNES: adicionar console depois
 * é escrever um adapter e uma linha aqui. Retrofitar `system` num schema que
 * assumiu SNES em todo lugar seria caro. Ver docs/adr/0002.
 */
export const systemIdSchema = z.enum(['snes', 'nes', 'gb', 'gba', 'genesis']);
export type SystemId = z.infer<typeof systemIdSchema>;

/**
 * SRAM é o save que o próprio jogo escreve (o "Save" dentro de Zelda).
 * STATE é a fotografia da máquina inteira. São coisas diferentes e nunca
 * devem ser tratadas pelo mesmo caminho.
 */
export const saveKindSchema = z.enum(['sram', 'state']);
export type SaveKind = z.infer<typeof saveKindSchema>;

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug deve ser kebab-case');
export type Slug = z.infer<typeof slugSchema>;
