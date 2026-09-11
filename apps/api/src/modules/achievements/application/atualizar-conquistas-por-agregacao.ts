import {
  codigosAlcancados,
  LIMIARES_DE_COLECAO,
  LIMIARES_DE_HORAS_JOGADAS,
  LIMIARES_DE_JOGOS_DISTINTOS,
} from '../domain/agregacao.js';
import type { ConquistaDesbloqueadaRepository } from '../domain/conquista-desbloqueada-repository.js';
import type { CodigoDeConquista } from '../domain/conquista-desbloqueada.js';
import type {
  ContarRomsNaBiblioteca,
  ObterAgregadoDeJogoDoUsuario,
} from '../domain/portas-de-agregacao.js';

export interface DependenciasDaAtualizacaoPorAgregacao {
  conquistas: ConquistaDesbloqueadaRepository;
  contarRomsNaBiblioteca: ContarRomsNaBiblioteca;
  agregadoDeJogoDoUsuario: ObterAgregadoDeJogoDoUsuario;
}

/**
 * Verifica e desbloqueia as conquistas por agregação — decisão da issue
 * #120: o cálculo é SOB DEMANDA, no momento em que a conta lista as próprias
 * conquistas (`listar-conquistas.ts` chama isto antes de ler a tabela).
 *
 * ## Por que sob demanda, e não recalculado a cada escrita
 *
 * As três fontes (biblioteca, jogos distintos, horas jogadas) já respondem
 * rápido — são `COUNT`/`SUM` sobre índice, do jeito que `medirUso` já faz em
 * `library` e `progress`. Recalcular em toda listagem custa três consultas
 * extras por chamada, contra o custo de manter um gatilho em cada ponto de
 * escrita de `library` e `progress` (upload, favoritar, remover, gravar
 * save) só para uma conquista que a maioria das contas nunca vai olhar duas
 * vezes por minuto. Ninguém está jogando um jogo enquanto olha a própria
 * lista de conquistas — o path de listagem não é o quente do produto.
 *
 * Se um dia isto pesar (um perfil público que renderiza conquista de
 * terceiros com frequência, por exemplo — outra issue, "perfil público"),
 * a resposta é cachear ou mover para o gatilho, e a mudança fica confinada
 * aqui: nem o schema, nem o repositório, nem a listagem final precisam
 * saber que a estratégia trocou.
 *
 * ## Por que não filtra antes de chamar `desbloquear`
 *
 * `quaisJaTem` existe só para evitar UMA consulta a mais por tier de uma
 * família inteira quando a conta já tem todos — não é pré-requisito de
 * correção. `desbloquear` já é idempotente por si (constraint única), então
 * mesmo sem o filtro a função responderia certo, só faria mais roundtrips.
 */
export async function atualizarConquistasPorAgregacao(
  deps: DependenciasDaAtualizacaoPorAgregacao,
  userId: string,
): Promise<void> {
  const [quantidadeDeRoms, agregadoDeJogo] = await Promise.all([
    deps.contarRomsNaBiblioteca(userId),
    deps.agregadoDeJogoDoUsuario(userId),
  ]);

  const alcancados: CodigoDeConquista[] = [
    ...codigosAlcancados(quantidadeDeRoms, LIMIARES_DE_COLECAO),
    ...codigosAlcancados(agregadoDeJogo.jogosDistintos, LIMIARES_DE_JOGOS_DISTINTOS),
    ...codigosAlcancados(agregadoDeJogo.segundosJogados, LIMIARES_DE_HORAS_JOGADAS),
  ];
  if (alcancados.length === 0) return;

  const jaTem = await deps.conquistas.quaisJaTem(userId, alcancados);
  const novos = alcancados.filter((code) => !jaTem.has(code));

  await Promise.all(novos.map((code) => deps.conquistas.desbloquear(userId, code)));
}
