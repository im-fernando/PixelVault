/**
 * Reconciliação dos 6 jogos comerciais cadastrados à mão antes da issue #134
 * (Donkey Kong Country, Country 2, Super Mario World, World 2, Mario Kart,
 * Bomberman 5) contra as entradas oficiais que `importar-no-intro.ts` acabou
 * de trazer.
 *
 * Passo a passo, na ordem que o README da issue pede para não perder dado
 * real de conta ativa:
 *
 * 1. Para cada um dos 6 jogos manuais, lê os bytes da ROM que já está no
 *    storage (`user_roms.storage_key` — o objeto de conteúdo da ADR 0013,
 *    não um arquivo novo) e calcula o MD5, com e sem cabeçalho de copiador —
 *    o mesmo cálculo que `verificacao-de-rom.ts` faz no upload, reaplicado
 *    aqui porque estas linhas foram gravadas antes de #134 existir e por
 *    isso não têm `md5` nenhum.
 * 2. Confere esse MD5 contra as variantes que a importação gravou para o jogo
 *    oficial equivalente (mesmo `systemId`, mesmo título). Só conta como
 *    "bate" quando o MD5 calculado é EXATAMENTE um dos que a importação
 *    trouxe — não um chute por nome de arquivo.
 * 3. Quando bate: religa `user_roms.game_id` para o jogo oficial e grava
 *    `user_roms.md5` com o valor calculado (a variante com cabeçalho, que é
 *    o arquivo como a pessoa enviou — mesma convenção de
 *    `NovaRomDoUsuario.md5`).
 * 4. Só DEPOIS de religar todo mundo, verifica se o jogo manual antigo ficou
 *    órfão (nenhum `user_rom` aponta mais para ele) e, se ficou, apaga só
 *    aquela linha por id — nunca um `deleteMany` por critério amplo.
 *
 * Este script é o oposto de automático em massa: a lista de jogos é
 * hardcoded, porque são exatamente os 6 que a issue #134 nomeou. Uma
 * heurística genérica ("todo jogo sem `md5` que tem nome igual a um
 * importado") arriscaria religar linha que não devia — 6 é pouco o bastante
 * para não precisar de heurística nenhuma.
 *
 * Rode com `pnpm --filter @pixelvault/api exec tsx scripts/no-intro/religar-jogos-manuais.ts`.
 * Idempotente: rodar de novo depois que já religou e limpou não faz nada (os
 * slugs antigos já não existem mais).
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
  quiet: true,
});

import { createHash } from 'node:crypto';
import { prisma } from '@pixelvault/database';
import { loadConfig } from '../../src/config.js';
import { criarArmazenamentoS3 } from '../../src/infrastructure/storage/armazenamento-s3.js';

/** O cabeçalho de copiador de SNES — mesma constante de `verificacao-de-rom.ts`. */
const TAMANHO_DO_CABECALHO_DE_COPIADOR = 512;

interface JogoManual {
  /** O slug com que o jogo foi cadastrado à mão, antes da #134. */
  slugAntigo: string;
  /** O slug que `importar-no-intro.ts` gera para o mesmo jogo. */
  slugNovo: string;
}

const JOGOS_MANUAIS: JogoManual[] = [
  { slugAntigo: 'donkey-kong-country', slugNovo: 'snes-donkey-kong-country' },
  {
    slugAntigo: 'donkey-kong-country-2-diddys-kong-quest',
    slugNovo: 'snes-donkey-kong-country-2-diddy-s-kong-quest',
  },
  { slugAntigo: 'super-mario-world', slugNovo: 'snes-super-mario-world' },
  {
    slugAntigo: 'super-mario-world-2-yoshis-island',
    slugNovo: 'snes-super-mario-world-2-yoshi-s-island',
  },
  { slugAntigo: 'super-mario-kart', slugNovo: 'snes-super-mario-kart' },
  { slugAntigo: 'super-bomberman-5', slugNovo: 'snes-super-bomberman-5' },
];

function md5De(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

/** Os dois MD5 candidatos do arquivo — com e sem cabeçalho de copiador, como no upload. */
function md5sCandidatos(bytes: Uint8Array): { comHeader: string; semHeader: string | null } {
  const temCabecalho = bytes.byteLength % 1024 === TAMANHO_DO_CABECALHO_DE_COPIADOR;
  return {
    comHeader: md5De(bytes),
    semHeader: temCabecalho ? md5De(bytes.subarray(TAMANHO_DO_CABECALHO_DE_COPIADOR)) : null,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const armazenamento = criarArmazenamentoS3({
    endpoint: config.S3_ENDPOINT,
    regiao: config.S3_REGION,
    bucket: config.S3_BUCKET,
    chaveDeAcesso: config.S3_ACCESS_KEY_ID,
    segredo: config.S3_SECRET_ACCESS_KEY,
    caminhoNoEstiloDePasta: config.S3_FORCE_PATH_STYLE,
  });

  const candidatosADelecao: { id: string; slug: string; title: string }[] = [];

  for (const { slugAntigo, slugNovo } of JOGOS_MANUAIS) {
    const antigo = await prisma.game.findUnique({ where: { slug: slugAntigo } });
    if (antigo === null) {
      console.warn(`[religar] "${slugAntigo}" não existe mais — já foi processado antes.`);
      continue;
    }

    const novo = await prisma.game.findUnique({
      where: { slug: slugNovo },
      include: { roms: { select: { id: true, md5: true, region: true, revision: true } } },
    });
    if (novo === null) {
      console.warn(
        `[religar] "${slugNovo}" não foi importado — rode importar-no-intro.ts primeiro.`,
      );
      continue;
    }

    const md5sOficiais = new Set(
      novo.roms.map((r) => r.md5).filter((v): v is string => v !== null),
    );

    const userRoms = await prisma.userRom.findMany({ where: { gameId: antigo.id } });
    console.warn(
      `[religar] "${antigo.title}": ${userRoms.length} ROM(s) de usuário apontando pro jogo manual.`,
    );

    for (const userRom of userRoms) {
      const bytes = await armazenamento.ler(userRom.storageKey);
      const { comHeader, semHeader } = md5sCandidatos(bytes);

      const bateu =
        md5sOficiais.has(comHeader) || (semHeader !== null && md5sOficiais.has(semHeader));
      if (!bateu) {
        console.warn(
          `  [SEM MATCH] user_rom ${userRom.id} (${userRom.fileName}): MD5 ${comHeader} ` +
            `não está entre as ${md5sOficiais.size} variantes oficiais de "${novo.title}". ` +
            'Não religado — o game_id manual permanece.',
        );
        continue;
      }

      await prisma.userRom.update({
        where: { id: userRom.id },
        data: { gameId: novo.id, md5: comHeader },
      });
      console.warn(
        `  [OK] user_rom ${userRom.id} (${userRom.fileName}): religado para "${novo.title}" ` +
          `(${novo.slug}), md5 gravado.`,
      );
    }

    candidatosADelecao.push({ id: antigo.id, slug: antigo.slug, title: antigo.title });
  }

  console.warn('\n[religar] verificando órfãos para apagar (um id por vez, nunca em massa)...');
  for (const candidato of candidatosADelecao) {
    const restantes = await prisma.userRom.count({ where: { gameId: candidato.id } });
    if (restantes > 0) {
      console.warn(
        `  [MANTIDO] "${candidato.title}" (${candidato.slug}): ainda tem ${restantes} ` +
          'user_rom apontando pra ele (não religou) — não é órfão, não apaga.',
      );
      continue;
    }

    // `delete` por id específico — nunca `deleteMany` por critério.
    await prisma.game.delete({ where: { id: candidato.id } });
    console.warn(
      `  [APAGADO] "${candidato.title}" (${candidato.slug}, id ${candidato.id}): órfão, removido.`,
    );
  }
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
