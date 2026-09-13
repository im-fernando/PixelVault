import type { BuscaDeCapa } from '../domain/busca-de-capa.js';
import type { GameRepository } from '../domain/game-repository.js';

export interface DependenciasDaIdentificacaoManual {
  jogos: Pick<GameRepository, 'jogoSemCapa' | 'definirCapa'>;
  busca: BuscaDeCapa;
}

/**
 * Os três resultados possíveis, e por que são três e não dois.
 *
 * `semOQueProcurar` e `naoEncontrada` são "não achei" de razões diferentes —
 * a primeira nem chegou a perguntar ao provedor —, e quem serve a rota HTTP
 * precisa distinguir os dois para responder 404 num caso e 200 no outro. Um
 * `string | null` só, do mesmo jeito que `garantirCapaDoJogo` devolve,
 * bastaria para quem não espera por resposta nenhuma (o gatilho de fundo);
 * aqui alguém espera, e a distinção vira HTTP.
 */
export type ResultadoDaIdentificacaoManual =
  | { tipo: 'semOQueProcurar' }
  | { tipo: 'naoEncontrada' }
  | { tipo: 'encontrada'; coverUrl: string };

/**
 * A busca automática da #77 (`garantir-capa-do-jogo.ts`) tenta o título do
 * catálogo contra uma lista curta de sufixos de região — e não acha quando o
 * arquivo real do provedor carrega um sufixo que a lista não cobre (região E
 * idioma juntos, por exemplo: `Super Metroid (Japan, USA) (En,Ja)`). Esta
 * função é o mesmo três-passos de lá, só que o título vem de quem está
 * pedindo, não do catálogo — é o "eu sei o nome exato, procure por ele".
 *
 * `jogoSemCapa` continua sendo quem decide se há o que procurar: jogo
 * inexistente, que já tem capa, ou homebrew (ADR 0016) saem daqui como
 * `semOQueProcurar` — homebrew não tem arte comercial em banco nenhum, e
 * digitar um nome não muda isso.
 *
 * Diferente da busca automática, esta É esperada por quem chamou: é gesto
 * explícito da pessoa ("procure por este nome"), não um gatilho de fundo — a
 * resposta síncrona é a própria confirmação de que achou ou não achou.
 */
export async function identificarCapaManual(
  deps: DependenciasDaIdentificacaoManual,
  gameId: string,
  tituloDigitado: string,
): Promise<ResultadoDaIdentificacaoManual> {
  const jogo = await deps.jogos.jogoSemCapa(gameId);
  if (jogo === null) return { tipo: 'semOQueProcurar' };

  const capa = await deps.busca.buscar({ systemId: jogo.systemId, title: tituloDigitado });
  if (capa === null) return { tipo: 'naoEncontrada' };

  await deps.jogos.definirCapa(gameId, capa);
  return { tipo: 'encontrada', coverUrl: capa };
}
