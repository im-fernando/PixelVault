import { z } from 'zod';

/**
 * Como o e-mail transacional sai daqui. Ver docs/adr/0021.
 *
 * O padrão é derivado do `NODE_ENV` e não da presença da chave: a chave do
 * Resend existe na máquina de desenvolvimento (é de lá que se testa a de
 * produção), e um padrão que reagisse a ela faria o desenvolvimento mandar
 * e-mail de verdade para caixa de entrada de verdade toda vez que alguém
 * rodasse o fluxo. Quem quiser exercitar o adaptador real localmente escreve
 * `EMAIL_TRANSPORTE=resend` e sabe o que está fazendo.
 */
export const transporteDeEmailSchema = z.enum(['console', 'resend']);
export type TransporteDeEmail = z.infer<typeof transporteDeEmailSchema>;

/**
 * Ambiente validado na inicialização. Faltando variável, o processo morre
 * com mensagem legível em vez de quebrar na primeira requisição.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    API_HOST: z.string().default('0.0.0.0'),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de ao menos 32 caracteres'),
    /**
     * Segredo de verdade, e caro: quem o tiver manda e-mail assinado pelo
     * nosso domínio. Opcional aqui e obrigatório abaixo quando o transporte
     * for o Resend — quem desenvolve não precisa de conta no provedor para
     * subir a API.
     */
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_TRANSPORTE: transporteDeEmailSchema.optional(),
    /** Remetente das mensagens, no formato `Nome <endereco@dominio>`. */
    EMAIL_REMETENTE: z.string().min(1).default('PixelVault <nao-responda@pixelvault.dev>'),
    /**
     * O object storage onde ROM e save vivem: MinIO no desenvolvimento, R2 na
     * produção (ADR 0012). Todas obrigatórias e sem padrão, como a
     * `DATABASE_URL`: storage é dependência de funcionamento, não enfeite, e um
     * padrão apontando para `localhost` faria uma produção mal configurada
     * subir calada e só quebrar no primeiro upload.
     */
    S3_ENDPOINT: z.url(),
    /** `auto` no R2. No MinIO qualquer uma serve, desde que a mesma dos dois lados. */
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    /**
     * MinIO exige `bucket` no caminho; R2 e S3 preferem no subdomínio. É a
     * única diferença entre os dois ambientes, e ela mora aqui justamente para
     * não virar um `if` no adaptador.
     *
     * `stringbool` e não `coerce.boolean()`: a coerção do JavaScript trata
     * `"false"` como verdadeiro, que é o jeito mais silencioso de ligar
     * path-style em produção.
     */
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  })
  .transform((env) => ({
    ...env,
    transporteDeEmail:
      env.EMAIL_TRANSPORTE ?? (env.NODE_ENV === 'production' ? 'resend' : 'console'),
  }))
  .superRefine((env, ctx) => {
    if (env.transporteDeEmail === 'resend' && env.RESEND_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message:
          'obrigatória quando o transporte de e-mail é o Resend (pegue a sua em ' +
          'https://resend.com/api-keys)',
      });
    }
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
