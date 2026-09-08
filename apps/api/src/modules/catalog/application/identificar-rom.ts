import type { RomDoCatalogo } from '../domain/game-repository.js';
import { criarBuscaDeCapa } from '../infrastructure/criar-busca-de-capa.js';
import { prismaGameRepository } from '../infrastructure/prisma-game-repository.js';
import { garantirCapaDoJogo } from './garantir-capa-do-jogo.js';

/**
 * O match de hash já ligado ao repositório — é isto que a fachada exporta.
 *
 * Existe pelo mesmo motivo do `habilidadesDoUsuario` no `identity`: quem
 * precisa da resposta é outro módulo (o `library`, quando verifica uma ROM
 * enviada), e nenhum módulo pode importar `catalog/infrastructure` para
 * injetar o repositório (ADR 0003). Então quem faz a ligação é o próprio
 * `catalog`.
 *
 * O `library` recebe isto como uma função — a porta `IdentificarRomNoCatalogo`
 * que ele mesmo declara —, e não como um repositório: o BYOR não precisa saber
 * que existe um catálogo com jogos, só que alguém sabe dizer de que hash é um
 * jogo.
 */
export async function identificarRomPorHash(
  hashes: readonly string[],
): Promise<RomDoCatalogo | null> {
  // O `Set` não é por causa do chamador de hoje, que manda dois hashes
  // distintos: é porque a assinatura aceita qualquer lista, e repetido dentro
  // de um `IN` é trabalho que o banco faz à toa.
  const identificada = await prismaGameRepository.identificarRomPorHash([...new Set(hashes)]);

  if (identificada !== null) procurarCapaEmSegundoPlano(identificada.gameId);

  return identificada;
}

/** O provedor de capa, montado uma vez: ele guarda cache entre as buscas. */
const buscaDeCapa = criarBuscaDeCapa();

/**
 * Dispara a busca de capa e **não** espera por ela.
 *
 * ## Por que aqui, e não na leitura
 *
 * Porque é aqui que a informação nasce. O reconhecimento por hash é o único
 * instante em que se sabe que um jogo do catálogo acabou de ganhar dono — e é
 * o momento que a ADR 0006 descreve como o bom momento de produto: "a pessoa
 * arrasta um arquivo e a capa aparece". Deixar para a primeira leitura faria a
 * primeira abertura da biblioteca ser a que não tem capa, que é exatamente a
 * que importa, e ainda colocaria uma decisão de rede no caminho de toda
 * requisição de listagem.
 *
 * Roda uma vez por jogo reconhecido pela primeira vez: da segunda em diante,
 * `jogoSemCapa` responde `null` porque a coluna já está preenchida.
 *
 * ## Por que não é esperada
 *
 * Porque o upload não pode ficar mais lento por causa de uma capa. Quem chama
 * isto está no meio do `POST /api/roms/uploads/:id/completo`, respondendo "sua
 * ROM foi verificada"; capa é enfeite bem-vindo, não parte da resposta. Se a
 * busca demorar, falhar ou o serviço estiver fora do ar, a pessoa não fica
 * sabendo — a ROM entrou na biblioteca do mesmo jeito, sem capa, que é o
 * comportamento de hoje. Mesma escolha do e-mail de recuperação em
 * `identity/application/solicitar-recuperacao-de-senha.ts`, por um motivo
 * diferente: lá é anti-enumeração, aqui é latência.
 *
 * O preço é que a falha vira log e não resposta. `console.warn` e não o logger
 * do Fastify porque não há requisição por perto: esta função é chamada de
 * dentro de um caso de uso de outro módulo, que recebeu uma função de hashes e
 * nada mais.
 */
function procurarCapaEmSegundoPlano(gameId: string): void {
  void garantirCapaDoJogo({ jogos: prismaGameRepository, busca: buscaDeCapa }, gameId).catch(
    (erro: unknown) => {
      console.warn(`[catalog] falha ao procurar a capa do jogo ${gameId}`, erro);
    },
  );
}
