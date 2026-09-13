import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { parse } = requireApi('dotenv');
const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } = requireApi('@aws-sdk/client-s3');
const origem = 'https://pixelvault.nullpath.com.br';
const host = 'ubuntu@129.80.173.47';
const anterior = execFileSync('ssh', ['-o', 'BatchMode=yes', host, 'cat /opt/pixelvault/.env'], {
  encoding: 'utf8',
});
const env = parse(anterior);
assert.ok(env.SESSION_SECRET && env.DATABASE_URL && env.S3_SECRET_ACCESS_KEY);
assert.equal((anterior.match(/^WEB_ORIGIN=/gm) ?? []).length, 1);
const atualizado = anterior.replace(/^WEB_ORIGIN=.*$/m, `WEB_ORIGIN=${JSON.stringify(origem)}`);
// Preserva banco, senha e segredo de assinatura, inclusive sessões existentes.
if (atualizado !== anterior) {
  const backup = `/opt/pixelvault/.env.backup-${Date.now()}`;
  execFileSync(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      host,
      `cp -p /opt/pixelvault/.env ${backup} && install -m 600 /dev/stdin /opt/pixelvault/.env`,
    ],
    { input: atualizado, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  console.log('WEB_ORIGIN atualizado; ambiente anterior preservado em backup.');
}
const cliente = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});
const regras =
  (await cliente.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }))).CORSRules ?? [];
if (!regras.some((r) => r.AllowedOrigins?.includes(origem))) {
  regras.push({
    AllowedOrigins: [origem],
    AllowedMethods: ['GET', 'HEAD', 'PUT'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  });
  await cliente.send(
    new PutBucketCorsCommand({ Bucket: env.S3_BUCKET, CORSConfiguration: { CORSRules: regras } }),
  );
}
console.log('Domínio de produção autorizado no R2.');
execFileSync(
  'ssh',
  [
    '-o',
    'BatchMode=yes',
    host,
    'cd /opt/pixelvault/current && PIXELVAULT_RELEASE=20260911-initial docker compose --env-file /opt/pixelvault/.env -f deploy/compose.yml up -d --wait api',
  ],
  { stdio: 'inherit' },
);
