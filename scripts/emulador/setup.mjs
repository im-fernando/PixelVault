#!/usr/bin/env node
/**
 * Baixa e verifica os assets de emulação em `apps/web/public/emulator/`.
 *
 * Por que existe (issue #17): depender de CDN de terceiro em tempo de execução
 * é ponto único de falha, impede o modo offline e coloca um binário de 4 MB que
 * roda no navegador de quem joga sob o controle de outra pessoa. Os assets são
 * nossos, versionados por caminho, e conferidos por SHA-256 — asset de emulação
 * vindo de CDN é exatamente onde não se confia cegamente.
 *
 * Por que não são versionados no git: são 4 MB por core, reproduzíveis a partir
 * deste manifesto. `apps/web/public/emulator/` está no `.gitignore`.
 *
 * Uso:
 *   node scripts/emulador/setup.mjs              baixa o que faltar
 *   node scripts/emulador/setup.mjs --verificar  só confere, não baixa
 *   node scripts/emulador/setup.mjs --forcar     rebaixa mesmo com hash ok
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CORES, NOSTALGIST, VERSAO_RETROARCH } from './manifesto.mjs';
import { lerZip } from './zip.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const DESTINO = path.join(RAIZ, 'apps/web/public/emulator');
const LICENCAS = fileURLToPath(new URL('./LICENCAS.md', import.meta.url));

const argumentos = new Set(process.argv.slice(2));
const somenteVerificar = argumentos.has('--verificar');
const forcar = argumentos.has('--forcar');

await principal();

async function principal() {
  const problemas = [];
  let baixados = 0;
  let reaproveitados = 0;

  await conferirVersaoDoNostalgist(problemas);

  for (const core of CORES) {
    const pasta = path.join(DESTINO, core.nome, core.versao);
    const faltando = await arquivosForaDePadrao(pasta, core.arquivos);

    if (faltando.length === 0 && !forcar) {
      reaproveitados += core.arquivos.length;
      registrar('ok', `${core.nome}@${core.versao} — ${core.arquivos.length} arquivos conferidos`);
      continue;
    }
    if (somenteVerificar) {
      problemas.push(`${core.nome}@${core.versao}: ${faltando.join('; ')}`);
      continue;
    }

    registrar('baixando', `${core.nome}@${core.versao} de ${core.url}`);
    try {
      await instalarCore(core, pasta);
      baixados += core.arquivos.length;
    } catch (erro) {
      problemas.push(`${core.nome}@${core.versao}: ${erro.message}`);
    }
  }

  try {
    const resultado = await instalarNostalgist();
    if (resultado === 'copiado') {
      baixados += 1;
    } else {
      reaproveitados += 1;
    }
  } catch (erro) {
    problemas.push(`nostalgist@${NOSTALGIST.versao}: ${erro.message}`);
  }

  if (!somenteVerificar) {
    await copiarLicencas();
  }

  if (problemas.length > 0) {
    registrar('falhou', 'os assets de emulação NÃO estão íntegros:');
    for (const problema of problemas) {
      registrar('  ->', problema);
    }
    registrar(
      'falhou',
      somenteVerificar
        ? 'rode `pnpm emulator:setup` para baixar o que falta.'
        : 'hash divergente é adulteração até prova em contrário. Não use estes arquivos.',
    );
    process.exitCode = 1;
    return;
  }

  registrar(
    'pronto',
    `${baixados} arquivos instalados, ${reaproveitados} já estavam íntegros, em ${path.relative(RAIZ, DESTINO)}/`,
  );
}

/**
 * O `coreVersion` do adapter é derivado da versão que este manifesto fixa. Se o
 * `package.json` andar sem o manifesto, o save state passa a ser gravado com um
 * carimbo que não corresponde ao binário que rodou.
 */
async function conferirVersaoDoNostalgist(problemas) {
  const pacote = path.join(RAIZ, 'packages/emulator-runtime/package.json');
  try {
    const declarada = JSON.parse(await readFile(pacote, 'utf8')).dependencies?.nostalgist;
    if (declarada !== NOSTALGIST.versao) {
      problemas.push(
        `o emulator-runtime depende de nostalgist ${declarada}, o manifesto fixa ${NOSTALGIST.versao}`,
      );
    }
  } catch (erro) {
    problemas.push(`não consegui ler ${path.relative(RAIZ, pacote)}: ${erro.message}`);
  }
}

async function instalarCore(core, pasta) {
  const resposta = await fetch(core.url);
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao baixar ${core.url}`);
  }
  const zip = Buffer.from(await resposta.arrayBuffer());
  exigirHash(zip, core.sha256Zip, `pacote ${path.basename(core.url)}`);

  const conteudo = lerZip(zip);
  await mkdir(pasta, { recursive: true });
  for (const arquivo of core.arquivos) {
    const bytes = conteudo.get(arquivo.nome);
    if (bytes === undefined) {
      throw new Error(`o pacote não contém "${arquivo.nome}"`);
    }
    exigirHash(bytes, arquivo.sha256, arquivo.nome);
    await writeFile(path.join(pasta, arquivo.nome), bytes);
    registrar('ok', `${core.nome}/${core.versao}/${arquivo.nome} (${bytes.length} bytes)`);
  }
}

async function instalarNostalgist() {
  const origem = path.join(RAIZ, NOSTALGIST.origem);
  const destino = path.join(DESTINO, NOSTALGIST.destino);

  if (!forcar && (await hashDoArquivo(destino)) === NOSTALGIST.sha256) {
    registrar('ok', `nostalgist@${NOSTALGIST.versao} — conferido`);
    return 'reaproveitado';
  }
  if (somenteVerificar) {
    throw new Error(`${NOSTALGIST.destino} ausente ou com hash divergente`);
  }

  let bytes;
  try {
    bytes = await readFile(origem);
  } catch {
    throw new Error(`${NOSTALGIST.origem} não existe — rode \`pnpm install\` antes`);
  }
  exigirHash(bytes, NOSTALGIST.sha256, 'nostalgist.js');
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, bytes);
  registrar('ok', `${NOSTALGIST.destino} (${bytes.length} bytes)`);
  return 'copiado';
}

/**
 * As licenças viajam junto do binário, e não só no repositório: o RetroArch em
 * WASM é GPLv3 e o Snes9x é *non-commercial*. Quem baixa a página tem que
 * conseguir chegar no aviso a partir da mesma origem que serviu o `.wasm`.
 */
async function copiarLicencas() {
  const texto = await readFile(LICENCAS, 'utf8');
  await mkdir(DESTINO, { recursive: true });
  await writeFile(
    path.join(DESTINO, 'LICENCAS.md'),
    texto.replace(/\{\{VERSAO_RETROARCH\}\}/g, VERSAO_RETROARCH),
  );
}

async function arquivosForaDePadrao(pasta, arquivos) {
  const problemas = [];
  for (const arquivo of arquivos) {
    const atual = await hashDoArquivo(path.join(pasta, arquivo.nome));
    if (atual === null) {
      problemas.push(`${arquivo.nome} ausente`);
    } else if (atual !== arquivo.sha256) {
      problemas.push(`${arquivo.nome} com hash ${atual}, esperado ${arquivo.sha256}`);
    }
  }
  return problemas;
}

async function hashDoArquivo(caminho) {
  try {
    return sha256(await readFile(caminho));
  } catch {
    return null;
  }
}

function exigirHash(bytes, esperado, rotulo) {
  const obtido = sha256(bytes);
  if (obtido !== esperado) {
    throw new Error(`SHA-256 de ${rotulo} é ${obtido}, esperado ${esperado}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function registrar(etiqueta, mensagem) {
  process.stdout.write(`[emulator] ${etiqueta} ${mensagem}\n`);
}
