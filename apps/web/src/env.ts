import { z } from 'zod';

/**
 * Ambiente do front validado no boot. Erro de configuração aparece como tela
 * de erro clara, não como fetch para `undefined/api/games`.
 */
const envSchema = z.object({
  VITE_API_URL: z.url().default('http://localhost:3333'),
});

export const env = envSchema.parse(import.meta.env);
