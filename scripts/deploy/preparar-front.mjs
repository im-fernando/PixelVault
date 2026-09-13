import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const destino = await mkdtemp(join(tmpdir(), 'pixelvault-vercel-'));
const output = join(destino, '.vercel/output');
const estaticos = join(output, 'static');
const api = process.env.PIXELVAULT_API_ORIGIN;
if (api && new URL(api).protocol !== 'https:') throw new Error('A API deve usar HTTPS.');

// O `...` no filtro arrasta as dependências do workspace: sem ele o build
// só funciona se `contracts` e `database` já tiverem sido construídos
// antes, e falha em máquina limpa — como a do CI.
execFileSync('pnpm', ['--filter', '@pixelvault/web...', 'build'], {
  cwd: raiz,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', VITE_API_URL: '' },
});
await mkdir(estaticos, { recursive: true });
// Publicação por lista explícita: nunca copia .env, fontes ou ROMs pessoais.
for (const entrada of ['index.html', 'assets', 'emulator', 'roms']) {
  await cp(resolve(raiz, 'apps/web/dist', entrada), join(estaticos, entrada), { recursive: true });
}
await cp(resolve(raiz, '.vercel/project.json'), join(destino, '.vercel/project.json'));
await writeFile(
  join(estaticos, 'api-unavailable.json'),
  JSON.stringify({
    code: 'SERVICE_UNAVAILABLE',
    message: 'A API está aguardando configuração de produção.',
  }),
);
await writeFile(
  join(output, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        api
          ? { src: '/api/(.*)', dest: `${api.replace(/\/$/, '')}/api/$1` }
          : {
              src: '/api/.*',
              dest: '/api-unavailable.json',
              status: 503,
              headers: { 'Cache-Control': 'no-store' },
            },
        { src: '/roms-local(?:/.*)?', status: 404 },
        { handle: 'filesystem' },
        { src: '/(?:assets|emulator|roms)/.*', status: 404 },
        { src: '/.*', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`\nPacote de publicação: ${destino}`);
console.log(`vercel deploy --prebuilt --prod --yes --cwd ${destino}`);
