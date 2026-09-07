#!/usr/bin/env node
/**
 * Verificação do áudio num navegador de verdade, com o som **ligado**.
 *
 * Não é teste de unidade e não roda no `pnpm test`: precisa de Chrome, de
 * WebGL e dos 4 MB de core que o `pnpm emulator:setup` baixa.
 *
 *   pnpm emulator:setup
 *   pnpm --filter @pixelvault/emulator-runtime build
 *   pnpm --filter @pixelvault/emulator-runtime verify:audio
 *
 * `MINUTOS=10` estica o trecho de regime até o critério de aceite da issue #25.
 * `CHROME=/caminho/do/chrome` aponta para outro binário.
 *
 * **O que este arquivo não prova.** Ninguém ouviu. Ele afirma que as amostras
 * que chegariam ao alto-falante são contínuas — sem degrau entre amostras
 * vizinhas, sem corrida de zeros no meio do som — e que volume, mudo, pausa e
 * aba oculta chegam de fato à saída. Timbre, equilíbrio de canais e "soa como
 * um Super Nintendo" continuam dependendo de um par de ouvidos.
 *
 * **O limiar é um buraco, e não uma taxa de buracos.** Um buraco é um estalo.
 * Com `MINUTOS=1` as corridas passaram; com `MINUTOS=10` — o critério de aceite
 * da issue — este ambiente (SwiftShader por software, máquina compartilhada)
 * ainda deixa um buraco ou outro, sempre num instante em que o laço principal
 * do emulador ficou mais de 100 ms sem rodar. Isso é desempenho do laço, e não
 * tamanho de buffer: nenhum `audio_latency` razoável cobre uma parada dessas.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PACOTE = fileURLToPath(new URL('../', import.meta.url));
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLICO = path.join(RAIZ, 'apps/web/public');
const PORTA = 8131;
/** Homebrew com música do primeiro quadro: sem som, medir continuidade é fácil demais. */
const ROM = '/roms/euc-thrills/euc-thrills.sfc';
const SEGUNDOS_DE_REGIME = Math.round(Number(process.env.MINUTOS ?? 1) * 60);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

const servidor = http.createServer((requisicao, resposta) => {
  const rota = (requisicao.url ?? '/').split('?')[0];
  const arquivo = resolver(rota);
  if (arquivo === null) {
    resposta.writeHead(404);
    resposta.end('404');
    return;
  }
  resposta.writeHead(200, {
    'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
  });
  fs.createReadStream(arquivo).pipe(resposta);
});

function resolver(rota) {
  const candidatos = rota.startsWith('/runtime/')
    ? [path.join(PACOTE, 'dist', rota.slice('/runtime/'.length))]
    : [
        path.join(PACOTE, 'verificacao', rota === '/' ? 'audio.html' : rota),
        path.join(PUBLICO, rota),
      ];
  return (
    candidatos.find((caminho) => fs.existsSync(caminho) && fs.statSync(caminho).isFile()) ?? null
  );
}

function exigirAssets() {
  const obrigatorios = [
    'emulator/nostalgist/0.22.0/nostalgist.js',
    'emulator/snes9x2010/1.22.2/snes9x2010_libretro.js',
    'emulator/snes9x2010/1.22.2/snes9x2010_libretro.wasm',
  ];
  const faltando = obrigatorios.filter((rel) => !fs.existsSync(path.join(PUBLICO, rel)));
  if (faltando.length > 0) {
    throw new Error(`faltam assets (${faltando.join(', ')}) — rode \`pnpm emulator:setup\``);
  }
  if (!fs.existsSync(path.join(PACOTE, 'dist/index.js'))) {
    throw new Error(
      'faltam os arquivos compilados — rode `pnpm --filter @pixelvault/emulator-runtime build`',
    );
  }
}

const secoes = [];
function relatar(titulo, dados) {
  secoes.push({ titulo, dados });
  process.stdout.write(`\n=== ${titulo} ===\n${JSON.stringify(dados, null, 2)}\n`);
}

exigirAssets();
await new Promise((resolve) => servidor.listen(PORTA, resolve));

const navegador = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
  // Sem `--mute-audio`, ao contrário de `verificar.mjs`: aqui o áudio é o
  // objeto da medição, e um Chrome mudo mediria zero e passaria.
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const pagina = await navegador.newPage();
const avisosDeAutoplay = [];
const outrosAvisos = [];
pagina.on('console', (mensagem) => {
  const texto = mensagem.text();
  if (/AudioContext.*(not allowed|was not allowed to start)/i.test(texto)) {
    avisosDeAutoplay.push(texto.slice(0, 200));
  } else if (/audio|worklet/i.test(texto)) {
    outrosAvisos.push(`${mensagem.type()}: ${texto.slice(0, 200)}`);
  }
});
pagina.on('pageerror', (erro) => outrosAvisos.push(`pageerror: ${erro.message}`));

await pagina.goto(`http://localhost:${PORTA}/`);
await pagina.waitForFunction(() => window.__pronto === true);

await pagina.evaluate(
  async ([romUrl]) => {
    window.__adapter = await window.criarAdapter(romUrl);
    await window.__adapter.start();
  },
  [ROM],
);
// Os primeiros segundos são o boot do RetroArch, não o regime.
await pagina.waitForTimeout(5000);

relatar('1. contexto de áudio', {
  ...(await pagina.evaluate(() => window.infoDoContexto())),
  // O SNES gera 32.040 Hz; o AudioContext quase nunca roda nessa taxa. Se
  // estes dois números divergem e mesmo assim o fluxo é contínuo, a
  // reamostragem do RetroArch está fazendo o trabalho dela.
  taxaDoSnesHz: 32040,
});

await pagina.evaluate(() => window.zerarMedicao());
await pagina.waitForTimeout(SEGUNDOS_DE_REGIME * 1000);

const agendamento = await pagina.evaluate(() => window.analisarAgendamento());
const amostras = await pagina.evaluate(() => window.medir());
const fps = await pagina.evaluate(() => window.resumoDeFps());
relatar(`2. ${SEGUNDOS_DE_REGIME} s de jogo em regime`, { agendamento, amostras, fps });

relatar('3. taxa de amostragem: o que sai bate com o que o AudioContext pede', {
  taxaDoContexto: amostras.sampleRate,
  taxaDosBuffersDoRetroArch: agendamento.taxaDosBuffers,
  framesAgendadosPorSegundo: agendamento.framesPorSegundo,
  desvioEmPpm: Number(
    (((agendamento.framesPorSegundo - amostras.sampleRate) / amostras.sampleRate) * 1e6).toFixed(1),
  ),
});

// --- volume ---------------------------------------------------------------
const rmsComVolume = async (volume) => {
  await pagina.evaluate((v) => window.__adapter.audio.setVolume(v), volume);
  await pagina.waitForTimeout(400);
  await pagina.evaluate(() => window.zerarMedicao());
  await pagina.waitForTimeout(3000);
  const medida = await pagina.evaluate(() => window.medir());
  return { volume, rms: Number(medida.rms.toFixed(5)), pico: Number(medida.pico.toFixed(5)) };
};

const cheio = await rmsComVolume(1);
const meio = await rmsComVolume(0.5);
await pagina.evaluate(() => window.__adapter.audio.setVolume(1));

await pagina.evaluate(() => window.__adapter.audio.setMuted(true));
await pagina.waitForTimeout(400);
await pagina.evaluate(() => window.zerarMedicao());
await pagina.waitForTimeout(2000);
const mudo = await pagina.evaluate(() => window.medir());
await pagina.evaluate(() => window.__adapter.audio.setMuted(false));

relatar('4. volume e mudo chegam à saída', {
  cheio,
  meio,
  // Ganho quadrático: metade do curso do controle é um quarto da amplitude.
  razaoRms: Number((meio.rms / Math.max(1e-9, cheio.rms)).toFixed(3)),
  mudo: {
    amostrasNaoNulas: mudo.amostrasNaoNulas,
    pico: mudo.pico,
    blocosMudos: `${mudo.blocosMudos}/${mudo.blocos}`,
  },
  eventosDeAudioChange: await pagina.evaluate(
    () => window.eventos.filter((e) => e.evento === 'audioChange').length,
  ),
});

// --- pausa ----------------------------------------------------------------
await pagina.waitForTimeout(1500);
await pagina.evaluate(() => {
  window.__adapter.pause();
  window.zerarMedicao();
});
await pagina.waitForTimeout(3000);
const pausado = await pagina.evaluate(() => window.medir());
await pagina.evaluate(() => {
  window.__adapter.resume();
  window.zerarMedicao();
});
await pagina.waitForTimeout(3000);
const retomado = await pagina.evaluate(() => window.medir());

relatar('5. pausar cala de verdade, e voltar não estala', {
  pausado: {
    segundos: Number(pausado.segundos.toFixed(2)),
    // A rampa de 20 ms é o único som que sobra: depois dela o que sai é zero
    // digital, e não "quase silêncio". O rabo que o RetroArch já tinha
    // agendado morre debaixo dela.
    duracaoDaRampaS: Number(pausado.ultimaAmostraNaoNulaS.toFixed(3)),
    amostrasNaoNulas: pausado.amostrasNaoNulas,
    blocosMudos: `${pausado.blocosMudos}/${pausado.blocos}`,
  },
  retomado: {
    saltos: retomado.saltos,
    maiorSaltoEntreAmostras: Number(retomado.maiorSaltoEntreAmostras.toFixed(4)),
    lacunasDeSilencio: retomado.lacunasDeSilencio,
    rms: Number(retomado.rms.toFixed(5)),
  },
});

// --- aba oculta -----------------------------------------------------------
await pagina.waitForTimeout(1500);
await pagina.evaluate(() => {
  window.fingirVisibilidade('hidden');
  window.zerarMedicao();
});
await pagina.waitForTimeout(3000);
const oculta = await pagina.evaluate(() => window.medir());
await pagina.evaluate(() => {
  window.fingirVisibilidade('visible');
  window.zerarMedicao();
});
await pagina.waitForTimeout(3000);
const devolta = await pagina.evaluate(() => window.medir());

relatar('6. aba oculta não faz barulho', {
  oculta: {
    segundos: Number(oculta.segundos.toFixed(2)),
    duracaoDaRampaS: Number(oculta.ultimaAmostraNaoNulaS.toFixed(3)),
    amostrasNaoNulas: oculta.amostrasNaoNulas,
    blocosMudos: `${oculta.blocosMudos}/${oculta.blocos}`,
  },
  devolta: {
    rms: Number(devolta.rms.toFixed(5)),
    saltos: devolta.saltos,
    lacunasDeSilencio: devolta.lacunasDeSilencio,
  },
});

// --- laço travado, como acontece ao voltar de uma aba em segundo plano -----
const cdp = await pagina.context().newCDPSession(pagina);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
await pagina.waitForTimeout(3000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await pagina.evaluate(() => window.zerarMedicao());
await pagina.waitForTimeout(4000);

relatar('7. depois de o laço travar, o áudio não volta adiantado', {
  ...(await pagina.evaluate(() => window.analisarAgendamento())),
  // Margem negativa é buffer agendado no passado: o navegador o tocaria de
  // uma vez, e é assim que o áudio "adianta" ao voltar de outra aba.
  observacao: 'margemMinMs >= 0 e sobreposicoes == 0 é o que se quer aqui',
});

// --- política de autoplay --------------------------------------------------
// A leitura vai junto do `suspend` no mesmo `evaluate`: o RWebAudio chama
// `resume()` a cada buffer, e um `await` a mais do lado do Node já daria tempo
// de ele retomar o contexto sozinho.
const bloqueadoAoSuspender = await pagina.evaluate(async () => {
  await window.suspenderContexto();
  return window.__adapter.audio.blocked;
});
await pagina.click('#gesto');
await pagina.waitForTimeout(500);

relatar('8. política de autoplay', {
  avisosDeAutoplayNoConsole: avisosDeAutoplay.length,
  exemplos: avisosDeAutoplay.slice(0, 3),
  contextoSuspensoEhBlocked: bloqueadoAoSuspender,
  unlockNumGestoDeVerdade: await pagina.evaluate(() => window.__destravado),
  blockedDepois: await pagina.evaluate(() => window.__adapter.audio.blocked),
  // Chrome headless concede ativação de usuário sozinho e nunca recusa o
  // autoplay: o que este bloco mede é o nosso lado do contrato, não a decisão
  // do navegador. A recusa em si só se observa num Chrome de tela. O freio
  // que esvazia o console — não insistir em `resume()` sem gesto — é coberto
  // por `audio-contexts.test.ts`.
  ressalva: 'headless não exercita a recusa de autoplay; ver o comentário',
});

// --- o vazamento de AudioContext continua fechado --------------------------
await pagina.evaluate(async () => {
  await window.__adapter.destroy();
  document.getElementById('palco').replaceChildren();
});
for (let i = 0; i < 3; i += 1) {
  await pagina.evaluate(
    async ([romUrl]) => {
      const adapter = await window.criarAdapter(romUrl);
      await adapter.start();
      await window.espera(700);
      await adapter.destroy();
      document.getElementById('palco').replaceChildren();
    },
    [ROM],
  );
}
relatar('9. o barramento não ressuscitou o vazamento de AudioContext', {
  contextosCriados: await pagina.evaluate(() => window.contextos.length),
  contextosAindaAbertos: await pagina.evaluate(() => window.contextosAbertos()),
});

relatar('10. avisos do navegador', outrosAvisos.length > 0 ? outrosAvisos : ['(nenhum)']);

await navegador.close();
servidor.close();

const secao = (n) => secoes.find((s) => s.titulo.startsWith(`${n}.`))?.dados;
const falhas = [];
const regime = secao('2');
if (regime.amostras.erro !== undefined) falhas.push(`o medidor não subiu: ${regime.amostras.erro}`);
if (!(regime.amostras.rms > 0.001)) falhas.push('o jogo não produziu som — medição sem valor');
if (regime.amostras.saltos !== 0)
  falhas.push(`${regime.amostras.saltos} degraus entre amostras vizinhas (estalo)`);
if (regime.amostras.lacunasDeSilencio !== 0)
  falhas.push(`${regime.amostras.lacunasDeSilencio} buracos de silêncio no meio do som`);
if (regime.agendamento.sobreposicoes !== 0) falhas.push('o RetroArch agendou buffers sobrepostos');
if (Math.abs(secao('3').desvioEmPpm) > 5000)
  falhas.push(`a taxa de saída desvia ${secao('3').desvioEmPpm} ppm da do AudioContext`);
if (secao('4').mudo.amostrasNaoNulas !== 0) falhas.push('mudo não zerou a saída');
if (!(secao('4').razaoRms < 0.4)) falhas.push('o controle de volume não chegou à saída');
// A rampa dura 20 ms; qualquer amostra não nula depois disso é som que
// vazou da pausa ou da aba escondida.
const RAMPA_MAIS_FOLGA_S = 0.05;
if (secao('5').pausado.duracaoDaRampaS > RAMPA_MAIS_FOLGA_S)
  falhas.push('sobrou som depois da pausa');
if (secao('6').oculta.duracaoDaRampaS > RAMPA_MAIS_FOLGA_S)
  falhas.push('aba oculta continuou fazendo barulho');
if (!(secao('6').devolta.rms > 0.001)) falhas.push('o som não voltou quando a aba voltou');
if (secao('7').margemMinMs < 0) falhas.push('buffer agendado no passado: áudio adiantado');
if (secao('8').avisosDeAutoplayNoConsole !== 0)
  falhas.push('o console reclamou de autoplay de AudioContext');
if (secao('9').contextosAindaAbertos !== 0)
  falhas.push('sobrou AudioContext aberto depois do destroy');

if (falhas.length > 0) {
  process.stdout.write(`\n=== FALHAS ===\n${falhas.map((f) => `- ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('\n=== tudo o que dá para medir sem ouvir passou ===\n');
