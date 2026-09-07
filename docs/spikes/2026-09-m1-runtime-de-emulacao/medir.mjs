// Spike descartável das issues #13 e #14. Ver README.md deste diretório.
// Prova o canal de leitura de memória do RetroArch em WASM e mede o custo dele.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const RAIZ = new URL('./www/', import.meta.url).pathname;
const TIPOS = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
};

const servidor = http.createServer((req, res) => {
  const rota = req.url.split('?')[0];
  const arquivo = path.join(RAIZ, rota === '/' ? 'index.html' : rota);
  if (!arquivo.startsWith(RAIZ) || !fs.existsSync(arquivo)) {
    res.writeHead(404);
    return res.end('404');
  }
  res.writeHead(200, {
    'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
  });
  fs.createReadStream(arquivo).pipe(res);
});
await new Promise((r) => servidor.listen(8099, r));

const navegador = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
  ],
});
const pagina = await navegador.newPage();
pagina.on('pageerror', (e) => console.log('[erro na página]', e.message));

const core = process.env.CORE ?? 'snes9x2010';
await pagina.goto(`http://localhost:8099/?core=${core}`);
await pagina.evaluate(() => window.__boot());
await pagina.waitForTimeout(5000);

// ---------------------------------------------------------------------------
// 1. O canal existe e é bidirecional?
// ---------------------------------------------------------------------------
const canal = await pagina.evaluate(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const mod = window.__n.getEmscriptenModule();
  const enviar = (cmd) => mod.EmscriptenSendCommand(cmd);
  const receber = async (tentativas = 60) => {
    for (let i = 0; i < tentativas; i++) {
      const r = mod.EmscriptenReceiveCommandReply();
      if (r) return r.trim();
      await espera(16);
    }
    return null;
  };

  const saida = {
    crossOriginIsolated: window.crossOriginIsolated,
    // 1 elemento significa que o runtime não impôs UI nenhuma
    elementosNoBody: document.body.querySelectorAll('*').length,
    api: ['EmscriptenSendCommand', 'EmscriptenReceiveCommandReply'].map(
      (k) => `${k}=${typeof mod[k]}`,
    ),
  };

  enviar('VERSION');
  saida.versaoRetroArch = await receber();

  enviar('READ_CORE_MEMORY 7e0000 32');
  saida.leituraWram = await receber();

  // escrever e reler é o que prova que o endereço é da RAM do console,
  // e não de um pedaço qualquer do heap do Emscripten
  enviar('WRITE_CORE_MEMORY 7e1234 de ad be ef');
  saida.escrita = await receber();
  enviar('READ_CORE_MEMORY 7e1234 4');
  saida.releitura = await receber();

  // duas amostras do mesmo endereço, com o jogo rodando entre elas
  enviar('READ_CORE_MEMORY 7e0100 16');
  saida.amostraA = await receber();
  await espera(1000);
  enviar('READ_CORE_MEMORY 7e0100 16');
  saida.amostraB = await receber();

  const { state, thumbnail } = await window.__n.saveState();
  saida.saveState = `${state.size} bytes (thumbnail ${thumbnail?.size ?? 0})`;
  await window.__n.loadState(state);

  return saida;
});
console.log('=== canal de comando ===');
console.log(JSON.stringify(canal, null, 2));

// ---------------------------------------------------------------------------
// 2. Quanto custa amostrar?
// ---------------------------------------------------------------------------
const cenario = (hz, bytes, segundos) =>
  pagina.evaluate(
    async ([hz, bytes, segundos]) => {
      const mod = window.__n.getEmscriptenModule();
      let respostas = 0;
      let volume = 0;
      const timer =
        hz > 0
          ? setInterval(() => {
              mod.EmscriptenSendCommand(`READ_CORE_MEMORY 7e0000 ${bytes}`);
              let r;
              while ((r = mod.EmscriptenReceiveCommandReply())) {
                respostas++;
                volume += r.length;
              }
            }, 1000 / hz)
          : null;

      const frames0 = window.__frames;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, segundos * 1000));
      const dt = performance.now() - t0;
      if (timer) clearInterval(timer);
      while (mod.EmscriptenReceiveCommandReply());

      return {
        hz,
        bytes,
        fps: Number((((window.__frames - frames0) * 1000) / dt).toFixed(2)),
        respostas,
        kb: Number((volume / 1024).toFixed(1)),
      };
    },
    [hz, bytes, segundos],
  );

console.log('\n=== FPS por frequência de amostragem (8 s cada) ===');
console.log('hz\tbytes\tfps\trespostas\tkB');
for (const [hz, bytes] of [
  [0, 0],
  [1, 64],
  [10, 64],
  [30, 64],
  [60, 64],
  [60, 1024],
  [60, 4096],
  [60, 32768],
  [240, 64],
  [0, 0],
]) {
  const r = await cenario(hz, bytes, 8);
  console.log(`${r.hz}\t${r.bytes}\t${r.fps}\t${r.respostas}\t\t${r.kb}`);
}

// ---------------------------------------------------------------------------
// 3. SRAM entra e sai como bytes pelo sistema de arquivos do Emscripten?
// ---------------------------------------------------------------------------
console.log(
  '\n=== FS ===\n' +
    JSON.stringify(
      await pagina.evaluate(() => {
        const emFs = window.__n.getEmscriptenFS();
        const caminho = '/home/web_user/retroarch/userdata/saves/teste.srm';
        emFs.writeFile(caminho, new Uint8Array([1, 2, 3, 4]));
        return {
          saves: emFs.readdir('/home/web_user/retroarch/userdata/saves'),
          idaEVolta: Array.from(emFs.readFile(caminho)).join(','),
        };
      }),
      null,
      2,
    ),
);

await navegador.close();
servidor.close();
