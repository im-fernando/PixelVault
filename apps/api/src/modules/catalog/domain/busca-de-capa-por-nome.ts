import type { SystemId } from '@pixelvault/contracts';

/** Um jogo que o provedor tem, achado pela busca por nome — pronto para a pessoa escolher. */
export interface CandidatoDeCapa {
  /** O nome exato como o provedor cataloga — é o que vai em `title` de `POST .../cover`. */
  title: string;
  coverUrl: string;
}

/**
 * Porta de busca de capa **por trecho de nome**, para a pessoa escolher de
 * uma lista em vez de adivinhar o nome exato (`BuscaDeCapa`, a busca de um
 * nome só).
 *
 * `HEAD` num caminho exato (o que `BuscaDeCapa` faz) não dá lista — dá
 * "existe" ou "não existe" para UM palpite. Listar por trecho pede o
 * inventário completo dos nomes que o provedor tem para aquele console,
 * filtrado do lado de cá: é outra pergunta, e por isso é outra porta, não um
 * segundo método na mesma.
 */
export type BuscaDeCapaPorNome = (
  systemId: SystemId,
  termo: string,
) => Promise<readonly CandidatoDeCapa[]>;
