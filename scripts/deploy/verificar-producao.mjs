import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const origem = 'https://pixelvault.nullpath.com.br';
const identificador = `deploy-${randomBytes(6).toString('hex')}`;
const email = `${identificador}@example.invalid`;
const password = randomBytes(32).toString('hex');
let cookie = '';
let usuario;
let romId;
async function pedir(path, method = 'GET', body, esperado = 200) {
  const resposta = await fetch(`${origem}${path}`, {
    method,
    headers: {
      origin: origem,
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const dados = await resposta.json();
  assert.equal(resposta.status, esperado, `${method} ${path}: ${JSON.stringify(dados)}`);
  if (path === '/api/auth/login') {
    const recebido = resposta.headers.get('set-cookie');
    assert.match(recebido ?? '', /HttpOnly/i);
    assert.match(recebido ?? '', /Secure/i);
    assert.match(recebido ?? '', /SameSite=Lax/i);
    cookie = recebido.split(';')[0];
  }
  console.log(`${method} ${path}: ${resposta.status}`);
  return dados;
}
try {
  const jogos = await pedir('/api/games');
  assert.ok(Array.isArray(jogos) && jogos.length >= 4);
  await pedir(
    '/api/auth/register',
    'POST',
    {
      email,
      handle: identificador,
      password,
      displayName: 'Verificação temporária de deploy',
      termsAccepted: true,
    },
    202,
  );
  usuario = (await pedir('/api/auth/login', 'POST', { email, password })).user;
  assert.equal((await pedir('/api/auth/me')).user.id, usuario.id);
  const bytes = await readFile(
    new URL('../../apps/web/public/roms/super-sudoku/super-sudoku.sfc', import.meta.url),
  );
  const ticket = await pedir('/api/library/uploads', 'POST', { sizeBytes: bytes.length });
  const preflight = await fetch(ticket.url, {
    method: 'OPTIONS',
    headers: {
      origin: origem,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), origem);
  const envio = await fetch(ticket.url, {
    method: 'PUT',
    headers: { 'content-type': ticket.contentType, origin: origem },
    body: bytes,
  });
  assert.equal(envio.status, 200);
  console.log('R2: preflight e upload assinados OK');
  const concluido = await pedir(`/api/library/uploads/${ticket.uploadId}/complete`, 'POST', {
    fileName: 'super-sudoku.sfc',
  });
  romId = concluido.romId;
  const biblioteca = await pedir('/api/library/roms');
  assert.ok(biblioteca.some((r) => r.id === romId));
  await pedir(`/api/library/roms/${romId}/favorite`, 'PUT');
  const download = await pedir(`/api/library/roms/${romId}/download`);
  const resposta = await fetch(download.url, { headers: { origin: origem } });
  assert.equal(resposta.headers.get('access-control-allow-origin'), origem);
  assert.equal(
    createHash('sha256')
      .update(Buffer.from(await resposta.arrayBuffer()))
      .digest('hex'),
    concluido.sha256,
  );
  console.log('R2: download íntegro e CORS OK');
} finally {
  if (romId) await pedir(`/api/library/roms/${romId}`, 'DELETE');
  const codigo = `import { prisma } from './packages/database/dist/src/index.js';
    const resultado = await prisma.user.deleteMany({where:{email:${JSON.stringify(email)}}});
    console.log('Contas temporárias removidas:',resultado.count);
    await prisma.$disconnect();`;
  execFileSync(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      'ubuntu@129.80.173.47',
      'docker exec -i pixelvault-api-1 node --input-type=module',
    ],
    { input: codigo, stdio: ['pipe', 'inherit', 'inherit'] },
  );
}
