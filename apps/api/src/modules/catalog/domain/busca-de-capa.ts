import type { SystemId } from '@pixelvault/contracts';

/** O mínimo que se precisa saber de um jogo para procurar a capa dele. */
export interface JogoSemCapa {
  /** Em que console ele saiu — é o que escolhe a pasta do provedor. */
  systemId: SystemId;
  /** O título como o catálogo o guarda, sem região nem revisão. */
  title: string;
}

/**
 * Porta de busca de capa em provedor externo.
 *
 * É porta de verdade pelo critério da
 * [ADR 0004](../../../../../../docs/adr/0004-hexagonal-apenas-nas-integracoes-externas.md):
 * do outro lado tem rede, um serviço de terceiro que sai do ar e uma convenção
 * de nome de arquivo que é dele, não nossa. O adaptador de hoje fala com o
 * `libretro-thumbnails` porque o projeto já roda cores do RetroArch (ADR
 * 0011); trocá-lo por IGDB ou TheGamesDB é escrever outro adaptador, e nada
 * mais — a ADR 0004 já contava com "ainda não sabemos qual provedor de
 * metadados vamos usar".
 *
 * `buscar` devolve **a URL** da imagem, nunca os bytes dela. Não vendorizar é
 * requisito da issue #77 e cai bem com a ADR 0006: o catálogo é de metadados,
 * e uma URL é metadado; um PNG de arte comercial no nosso storage seria outra
 * conversa.
 *
 * `null` é resposta normal, e não erro: cobertura de banco público de capa
 * nunca é 100%, e jogo sem capa continua funcionando exatamente como hoje
 * (ADR 0016 — é a lombada da estante que aparece).
 */
export interface BuscaDeCapa {
  buscar(jogo: JogoSemCapa): Promise<string | null>;
}
