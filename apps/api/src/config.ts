import { z } from 'zod';

/**
 * Ambiente validado na inicialização. Faltando variável, o processo morre
 * com mensagem legível em vez de quebrar na primeira requisição.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de ao menos 32 caracteres'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const problemas = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuração de ambiente inválida:\n${problemas}\n\n` +
        'Copie .env.example para .env e preencha o que falta.',
    );
  }

  return parsed.data;
}
