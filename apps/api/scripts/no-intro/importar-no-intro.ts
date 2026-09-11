/**
 * Importação em lote do banco No-Intro (issue #134).
 *
 * Baixa o `.dat` de cada um dos cinco sistemas suportados do espelho que o
 * `libretro` mantém no GitHub (`libretro/libretro-database`,
 * `metadat/no-intro/`), faz o parse e popula `games`/`game_roms` — sem baixar
 * nem hospedar ROM nenhuma, só o mapeamento hash→nome.
 *
 * ## Por que script, e não rota HTTP
 *
 * É uma operação administrativa, rara, disparada por quem sabe o que está
 * fazendo — o mesmo raciocínio de `prisma/seed.ts` e de
 * `reprocessar-reconhecimento.ts` (esse é rota porque a #114 já tinha decidido
 * que reconhecimento retroativo é operação de produto recorrente; importar
 * um banco de dados externo do zero não é: roda uma vez por atualização do
 * espelho libretro, à mão).
 *
 * ## Por que fora de `src/modules/`
 *
 * Este arquivo não é módulo — é a composition root de uma operação isolada,
 * como `prisma/seed.ts`. Ele só enxerga `catalog` pelo `@pixelvault/database`
 * (Prisma direto, do mesmo jeito que o seed faz) porque não existe caso de uso
 * de aplicação para "importar um banco externo em lote": a regra inteira é
 * mapear formato de arquivo para linha de tabela, sem decisão de negócio no
 * meio. O parser (`parse-dat-no-intro.ts`) é testável e mora em
 * `catalog/infrastructure/` porque ele é lógica de adaptação de formato, no
 * mesmo espírito de `nomes-no-libretro.ts` — mas o Prisma deste arquivo não
 * viola a regra "Prisma só na infraestrutura": o script inteiro age como a
 * composition root faz com o seed, fora da árvore de módulo que o
 * dependency-cruiser varre.
 *
 * ## Upsert, nunca delete em massa
 *
 * O README da issue #134 é explícito: o Postgres local é compartilhado com
 * quem está usando o app agora. `games` é upsert por `slug` (prefixado pelo
 * sistema — `snes-donkey-kong-country`, nunca colide com o `donkey-kong-country`
 * cadastrado à mão) e `game_roms` é upsert por `md5` (`@unique`). Rodar de
 * novo — o mesmo `.dat`, ou uma versão mais nova do mirror — atualiza o que já
 * existe em vez de duplicar. Nenhum `deleteMany` neste arquivo.
 *
 * Rode com `pnpm --filter @pixelvault/api exec tsx scripts/no-intro/importar-no-intro.ts`.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Mesmo bootstrap de `apps/api/src/server.ts`: o `.env` da raiz do monorepo,
// carregado antes de qualquer import que precise de `DATABASE_URL` ou `S3_*`.
loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
  quiet: true,
});

import { prisma } from '@pixelvault/database';
import type { SystemId } from '@pixelvault/contracts';
import {
  agruparPorJogo,
  parseDatNoIntro,
  extrairRevisao,
} from '../../src/modules/catalog/infrastructure/importacao-no-intro/parse-dat-no-intro.js';
import { SISTEMAS_SUPORTADOS, SISTEMA_NO_INTRO } from './sistemas.js';

const BASE_URL =
  'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro';

async function baixarDat(nomeDoSistema: string): Promise<string> {
  const url = `${BASE_URL}/${encodeURIComponent(nomeDoSistema)}.dat`;
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
  }
  return resposta.text();
}

interface ResultadoDoSistema {
  systemId: SystemId;
  /** Blocos `game(...)` no `.dat`, antes de agrupar por título e filtrar. */
  entradasNoDat: number;
  jogosGravados: number;
  romsGravadas: number;
}

async function importarSistema(systemId: SystemId): Promise<ResultadoDoSistema> {
  const nomeDoSistema = SISTEMA_NO_INTRO[systemId];
  console.warn(`[no-intro] baixando ${nomeDoSistema}...`);
  const texto = await baixarDat(nomeDoSistema);

  const entradas = parseDatNoIntro(texto);
  const jogos = agruparPorJogo(systemId, entradas);
  console.warn(
    `[no-intro] ${nomeDoSistema}: ${entradas.length} entradas no .dat, ` +
      `${jogos.length} jogos depois de agrupar e filtrar.`,
  );

  let romsGravadas = 0;

  // Sequencial, e não em paralelo: é o mesmo raciocínio de
  // `reprocessar-reconhecimento.ts` — operação rara, sem fila, e
  // previsibilidade de carga contra o Postgres importa mais que tempo de
  // parede aqui.
  for (const jogo of jogos) {
    const game = await prisma.game.upsert({
      where: { slug: jogo.slug },
      create: {
        slug: jogo.slug,
        systemId: jogo.systemId,
        title: jogo.titulo,
        isHomebrew: false,
      },
      // Só o `title` pode mudar entre execuções (o `.dat` corrigindo um nome).
      // `isHomebrew` nunca muda por importação — se uma linha estiver marcada
      // homebrew, foi decisão humana, e a importação não a desfaz.
      update: { title: jogo.titulo },
      select: { id: true },
    });

    for (const variante of jogo.variantes) {
      await prisma.gameRom.upsert({
        where: { md5: variante.md5 },
        create: {
          gameId: game.id,
          md5: variante.md5,
          region: variante.regiao,
          revision: extrairRevisao(variante.nomeBruto),
          sizeBytes: variante.sizeBytes,
        },
        update: {
          gameId: game.id,
          region: variante.regiao,
          revision: extrairRevisao(variante.nomeBruto),
          sizeBytes: variante.sizeBytes,
        },
      });
      romsGravadas += 1;
    }
  }

  return {
    systemId,
    entradasNoDat: entradas.length,
    jogosGravados: jogos.length,
    romsGravadas,
  };
}

async function main(): Promise<void> {
  const resultados: ResultadoDoSistema[] = [];

  for (const systemId of SISTEMAS_SUPORTADOS) {
    resultados.push(await importarSistema(systemId));
  }

  console.warn('\n[no-intro] resumo:');
  for (const r of resultados) {
    console.warn(
      `  ${r.systemId}: ${r.jogosGravados} jogos, ${r.romsGravadas} variantes ` +
        `(de ${r.entradasNoDat} entradas no .dat)`,
    );
  }
  const totalJogos = resultados.reduce((soma, r) => soma + r.jogosGravados, 0);
  const totalRoms = resultados.reduce((soma, r) => soma + r.romsGravadas, 0);
  console.warn(`[no-intro] total: ${totalJogos} jogos, ${totalRoms} variantes.`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
