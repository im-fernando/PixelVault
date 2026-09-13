import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { config } = requireApi('dotenv');
const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } = requireApi('@aws-sdk/client-s3');
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const e = process.env;
for (const chave of ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'RESEND_API_KEY']) {
  if (!e[chave]) throw new Error(`Falta ${chave}`);
}
const origem = 'https://pixelvault.nullpath.com.br';
const senha = randomBytes(32).toString('hex');
const valores = {
  NODE_ENV: 'production',
  API_HOST: '0.0.0.0',
  API_PORT: '3333',
  WEB_ORIGIN: origem,
  POSTGRES_PASSWORD: senha,
  DATABASE_URL: `postgresql://pixelvault:${senha}@postgres:5432/pixelvault?schema=public`,
  SESSION_SECRET: randomBytes(48).toString('hex'),
  S3_ENDPOINT: e.R2_ENDPOINT,
  S3_REGION: 'auto',
  S3_BUCKET: 'pixelvault',
  S3_ACCESS_KEY_ID: e.R2_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: e.R2_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: 'true',
  EMAIL_TRANSPORTE: 'resend',
  EMAIL_REMETENTE: 'PixelVault <nao-responda@nullpath.com.br>',
  RESEND_API_KEY: e.RESEND_API_KEY,
};
const conteudo =
  Object.entries(valores)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join('\n') + '\n';
execFileSync(
  'ssh',
  [
    '-o',
    'BatchMode=yes',
    'ubuntu@129.80.173.47',
    'test ! -e /opt/pixelvault/.env && install -m 600 /dev/stdin /opt/pixelvault/.env',
  ],
  { input: conteudo, stdio: ['pipe', 'inherit', 'inherit'] },
);
console.log('Ambiente de produção criado com permissão 600, sem expor os segredos.');

const cliente = new S3Client({
  endpoint: e.R2_ENDPOINT,
  region: 'auto',
  credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
});
let regras = [];
try {
  regras = (await cliente.send(new GetBucketCorsCommand({ Bucket: 'pixelvault' }))).CORSRules ?? [];
} catch (erro) {
  if (erro.name !== 'NoSuchCORSConfiguration') throw erro;
}
if (!regras.some((r) => r.AllowedOrigins?.includes(origem))) {
  regras.push({
    AllowedOrigins: [origem],
    AllowedMethods: ['GET', 'HEAD', 'PUT'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  });
  await cliente.send(
    new PutBucketCorsCommand({ Bucket: 'pixelvault', CORSConfiguration: { CORSRules: regras } }),
  );
}
console.log('CORS do bucket pixelvault configurado para o frontend.');
