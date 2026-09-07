#!/usr/bin/env node
/**
 * Verificação do `SnesEmulatorAdapter` num navegador de verdade.
 *
 * Não é teste de unidade e não roda no `pnpm test`: precisa de Chrome, de WebGL
 * e dos 4 MB de core que o `pnpm emulator:setup` baixa. É o que prova que o
 * adapter carrega, roda, salva e restaura — coisas que nenhum mock afirma.
 *
 *   pnpm emulator:setup
 *   pnpm --filter @pixelvault/emulator-runtime build
 *   pnpm --filter @pixelvault/emulator-runtime verify:browser
 *
 * `CHROME=/caminho/do/chrome` aponta para outro binário.
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
const PORTA = 8129;
const ROM_COM_BATERIA = '/roms/sure-instinct/sure-instinct.sfc';
const ROM_SEM_BATERIA = '/roms/super-sudoku/super-sudoku.sfc';
const ENDERECO_DE_WRAM = 0x7e0000;

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
        path.join(PACOTE, 'verificacao', rota === '/' ? 'index.html' : rota),
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
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
  ],
});
const pagina = await navegador.newPage();
const avisosDoNavegador = [];
pagina.on('console', (mensagem) => {
  const texto = mensagem.text();
  if (/WebGL|context|Too many|memory/i.test(texto)) {
    avisosDoNavegador.push(`${mensagem.type()}: ${texto.slice(0, 200)}`);
  }
});
pagina.on('pageerror', (erro) => {
  avisosDoNavegador.push(`pageerror: ${erro.message}`);
});
const cdp = await pagina.context().newCDPSession(pagina);

await pagina.goto(`http://localhost:${PORTA}/`);
await pagina.waitForFunction(() => window.__pronto === true);

relatar(
  '1. carrega, roda e emite os eventos do contrato',
  await pagina.evaluate(
    async ([romUrl]) => {
      const adapter = await window.criarAdapter(romUrl);
      const statusDepoisDoLoad = adapter.status;
      await adapter.start();
      await window.espera(4000);

      window.__adapter = adapter;
      return {
        systemId: adapter.systemId,
        coreVersion: adapter.coreVersion,
        capabilities: adapter.capabilities,
        cabecalhoDaRom: adapter.romHeader,
        statusDepoisDoLoad,
        statusDepoisDoStart: adapter.status,
        transicoes: window.eventos
          .filter((e) => e.evento === 'statusChange')
          .map((e) => `${e.payload.previous}->${e.payload.current}`),
        ready: window.eventos.find((e) => e.evento === 'ready')?.payload,
        amostrasDeFps: window.eventos.filter((e) => e.evento === 'fps').map((e) => e.payload.fps),
        erros: window.eventos.filter((e) => e.evento === 'error'),
      };
    },
    [ROM_COM_BATERIA],
  ),
);

relatar(
  '2. readMemory: o canal que fez o snes9x2010 ser escolhido (ADR 0008)',
  await pagina.evaluate(
    async ([endereco]) => {
      const adapter = window.__adapter;
      const a = await adapter.readMemory(endereco, 1024);
      await window.espera(1200);
      const b = await adapter.readMemory(endereco, 1024);
      const fpsDurante = window.eventos
        .filter((e) => e.evento === 'fps')
        .slice(-2)
        .map((e) => e.payload.fps);
      return {
        enderecoLido: `0x${endereco.toString(16)}`,
        bytesPedidos: 1024,
        bytesRecebidos: a.length,
        primeiraLeitura: window.resumo(a),
        segundaLeitura: window.resumo(b),
        mudouComOJogoRodando: window.resumo(a) !== window.resumo(b),
        fpsDuranteAsLeituras: fpsDurante,
      };
    },
    [ENDERECO_DE_WRAM],
  ),
);

relatar(
  '3. exportState -> reset -> importState volta ao mesmo ponto',
  await pagina.evaluate(
    async ([endereco]) => {
      const adapter = window.__adapter;
      // Tudo pausado: com o core parado, dois `exportState` do mesmo ponto têm
      // que dar exatamente os mesmos bytes. É o que transforma "voltou ao ponto"
      // numa afirmação verificável em vez de uma impressão.
      adapter.pause();

      const estadoA = await adapter.exportState();
      const memoriaA = window.resumo(await adapter.readMemory(endereco, 1024));

      adapter.resume();
      await window.espera(2000);
      adapter.reset();
      await window.espera(2500);
      adapter.pause();

      const estadoB = await adapter.exportState();
      const memoriaB = window.resumo(await adapter.readMemory(endereco, 1024));

      await adapter.importState(estadoA);
      const estadoC = await adapter.exportState();
      const memoriaC = window.resumo(await adapter.readMemory(endereco, 1024));

      let recusouEstadoDeOutroCore;
      try {
        const adulterado = estadoA.slice();
        // O envelope carrega `coreVersion` em texto; trocar um caractere dele é
        // exatamente o caso "atualizei o core e o save antigo não serve mais".
        adulterado[adulterado.indexOf(0x32, 20)] = 0x39;
        await adapter.importState(adulterado);
        recusouEstadoDeOutroCore = 'NÃO recusou';
      } catch (erro) {
        recusouEstadoDeOutroCore = `${erro.code}: ${erro.message}`;
      }

      const iguais = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
      adapter.resume();
      return {
        bytesDoSaveState: estadoA.length,
        assinaturaDoEnvelope: String.fromCharCode(...estadoA.slice(0, 4)),
        resetMudouAMaquina: !iguais(estadoA, estadoB),
        importVoltouAoPontoExato: iguais(estadoA, estadoC),
        memoriaNoPontoSalvo: memoriaA,
        memoriaDepoisDoReset: memoriaB,
        memoriaDepoisDoImport: memoriaC,
        recusouEstadoDeOutroCore,
      };
    },
    [ENDERECO_DE_WRAM],
  ),
);

relatar(
  '4. SRAM em bytes, ida e volta',
  await pagina.evaluate(async () => {
    const adapter = window.__adapter;
    const inicioExport = performance.now();
    const original = await adapter.exportSram();
    const msDoExport = Math.round(performance.now() - inicioExport);

    // Marca aplicada em quatro bytes: se ela reaparecer, os bytes entraram no
    // core, e não apenas num arquivo qualquer do sistema de arquivos.
    const modificada = original.slice();
    for (let i = 0; i < 4; i += 1) {
      modificada[modificada.length - 1 - i] = 0xa5;
    }

    const inicioImport = performance.now();
    await adapter.importSram(modificada);
    const msDoImport = Math.round(performance.now() - inicioImport);
    const relidaNaHora = await adapter.exportSram();
    await window.espera(2500);
    const relidaDepoisDeJogar = await adapter.exportSram();

    const iguais = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const cauda = (bytes) => Array.from(bytes.slice(-4));
    return {
      bytesDaSram: original.length,
      bytesDeclaradosPeloCartucho: adapter.romHeader?.bytesDeSram,
      msDoExport,
      msDoImportComRelance: msDoImport,
      statusPreservadoDepoisDoImport: adapter.status,
      idaEVoltaPreservouOsBytes: iguais(modificada, relidaNaHora),
      caudaEnviada: cauda(modificada),
      caudaRelidaNaHora: cauda(relidaNaHora),
      // O cartucho é dono da bateria: se o jogo reescrever o bloco de save
      // depois de ligar, o conteúdo muda — e isso é o console funcionando.
      caudaDepoisDeJogar: cauda(relidaDepoisDeJogar),
      eventosDeSramChange: window.eventos.filter((e) => e.evento === 'sramChange').length,
    };
  }),
);

relatar(
  '5. captureFrame',
  await pagina.evaluate(async () => {
    const blob = await window.__adapter.captureFrame();
    const cabecalho = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    return {
      tipo: blob.type,
      bytes: blob.size,
      assinaturaPng: window.hex(cabecalho.slice(0, 8)),
    };
  }),
);

relatar(
  '6. jogo sem bateria responde rápido, e não trava',
  await pagina.evaluate(
    async ([romUrl]) => {
      const adapter = await window.criarAdapter(romUrl, { comEventos: false });
      await adapter.start();
      await window.espera(2500);
      const inicio = performance.now();
      const sram = await adapter.exportSram();
      const ms = Math.round(performance.now() - inicio);
      const cabecalho = adapter.romHeader;
      await adapter.destroy();
      return {
        jogo: romUrl,
        bytesDeSramDeclarados: cabecalho?.bytesDeSram,
        bytesDevolvidos: sram.length,
        ms,
        // `nostalgist.saveSRAM()` cru leva ~59 s neste caso, e termina em erro.
        abaixoDeUmSegundo: ms < 1000,
      };
    },
    [ROM_SEM_BATERIA],
  ),
);

relatar(
  '7. ROM inválida e ROM de outro console',
  await pagina.evaluate(async () => {
    const adapter = new window.SnesEmulatorAdapter({ assetsBaseUrl: '/emulator' });
    await adapter.mount(window.novoCanvas());

    const tentar = async (bytes, nome) => {
      try {
        await adapter.loadGame({
          kind: 'bytes',
          data: bytes,
          fileName: nome,
          byteLength: bytes.length,
        });
        return 'aceitou (não deveria)';
      } catch (erro) {
        return `${erro.code}: ${erro.message}`;
      }
    };

    const nes = new Uint8Array(0x20000);
    nes.set([0x4e, 0x45, 0x53, 0x1a], 0);

    const saida = {
      arquivoDeNes: await tentar(nes, 'contra.nes'),
      lixo: await tentar(new Uint8Array(0x20000), 'lixo.sfc'),
      vazio: await tentar(new Uint8Array(0), 'vazio.sfc'),
      statusDepoisDasFalhas: adapter.status,
    };
    await adapter.destroy();
    return saida;
  }),
);

await pagina.evaluate(async () => {
  await window.__adapter.destroy();
});

const ciclos = [];
for (let i = 0; i < 10; i += 1) {
  await cdp.send('HeapProfiler.collectGarbage');
  const antes = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const medida = await pagina.evaluate(
    async ([romUrl]) => {
      const adapter = await window.criarAdapter(romUrl, { comEventos: false });
      await adapter.start();
      await window.espera(700);
      const status = adapter.status;
      await adapter.destroy();
      document.getElementById('palco').replaceChildren();
      return { status, statusFinal: adapter.status };
    },
    [ROM_COM_BATERIA],
  );
  await cdp.send('HeapProfiler.collectGarbage');
  const depois = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const audio = await pagina.evaluate(() => ({
    total: window.contextosDeAudio.length,
    abertos: window.contextosDeAudio.filter((c) => c.state !== 'closed').length,
  }));
  ciclos.push({
    ciclo: i + 1,
    ...medida,
    heapMB: Number((depois / 1048576).toFixed(1)),
    deltaMB: Number(((depois - antes) / 1048576).toFixed(1)),
    audioContextsCriados: audio.total,
    audioContextsAindaAbertos: audio.abertos,
  });
}

relatar('8. dez ciclos de criar e destruir', {
  ciclos,
  crescimentoTotalMB: Number((ciclos.at(-1).heapMB - ciclos[0].heapMB).toFixed(1)),
  audioContextsAbertosAoFinal: ciclos.at(-1).audioContextsAindaAbertos,
});

relatar('9. avisos do navegador', avisosDoNavegador.length > 0 ? avisosDoNavegador : ['(nenhum)']);

await navegador.close();
servidor.close();

const falhas = [];
const secao = (n) => secoes.find((s) => s.titulo.startsWith(`${n}.`))?.dados;
if (secao(3)?.importVoltouAoPontoExato !== true)
  falhas.push('importState não voltou ao ponto salvo');
if (secao(3)?.resetMudouAMaquina !== true)
  falhas.push('reset não mudou a máquina — teste inconclusivo');
if (secao(4)?.bytesDaSram !== 8192) falhas.push('a SRAM do Sure Instinct não veio com 8 KB');
if (secao(4)?.idaEVoltaPreservouOsBytes !== true)
  falhas.push('importSram não devolveu os mesmos bytes');
if (secao(6)?.abaixoDeUmSegundo !== true)
  falhas.push('jogo sem bateria demorou demais para responder');
if (secao(8)?.audioContextsAbertosAoFinal !== 0)
  falhas.push('sobrou AudioContext aberto depois do destroy');

if (falhas.length > 0) {
  process.stdout.write(`\n>>> REPROVADO:\n- ${falhas.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\n>>> APROVADO\n');
}
