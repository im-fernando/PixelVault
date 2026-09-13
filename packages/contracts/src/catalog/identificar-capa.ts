import { z } from 'zod';

/**
 * Corpo de `POST /api/games/:gameId/cover`.
 *
 * O nome digitado substitui o título do catálogo só nesta busca — nunca é
 * gravado como título do jogo. Serve para achar a capa de um dump com sufixo
 * que a lista de candidatos automática não cobre (região e idioma juntos,
 * por exemplo — ver `nomes-no-libretro.ts` no servidor), tentando o nome
 * exato que a pessoa souber.
 */
export const identificarCapaRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type IdentificarCapaRequest = z.infer<typeof identificarCapaRequestSchema>;

/**
 * Resposta de `POST /api/games/:gameId/cover`.
 *
 * Não achar não é erro — é a mesma resposta honesta que a busca automática já
 * dá (ver `busca-de-capa.ts`): cobertura de banco público de capa nunca é
 * 100%, e o nome digitado pode simplesmente não estar lá.
 */
export const identificarCapaResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('encontrada'), coverUrl: z.url() }),
  z.object({ status: z.literal('nao-encontrada') }),
]);
export type IdentificarCapaResponse = z.infer<typeof identificarCapaResponseSchema>;

/**
 * Querystring de `GET /api/games/:gameId/cover/search`.
 *
 * Mínimo de 2 caracteres: um caractere só casaria com centenas de nomes do
 * provedor (a lista completa de um sistema passa de 3 mil), sem ajudar
 * ninguém a escolher — e ainda gastaria a chamada à Trees API do GitHub que
 * povoa o cache por nada.
 */
export const buscarCapasCandidatasQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
});
export type BuscarCapasCandidatasQuery = z.infer<typeof buscarCapasCandidatasQuerySchema>;

/** Um jogo que o provedor tem, achado pelo trecho digitado — pronto pra pessoa escolher. */
export const capaCandidataSchema = z.object({
  /** O nome exato como o provedor cataloga. É o que vai em `title` de `POST .../cover`. */
  title: z.string(),
  coverUrl: z.url(),
});
export type CapaCandidata = z.infer<typeof capaCandidataSchema>;

/**
 * Resposta de `GET /api/games/:gameId/cover/search`.
 *
 * Lista vazia é resposta normal — "nada do provedor tem esse trecho no
 * nome" —, não erro; o mesmo espírito de `identificarCapaResponseSchema`.
 */
export const buscarCapasCandidatasResponseSchema = z.object({
  candidatas: z.array(capaCandidataSchema),
});
export type BuscarCapasCandidatasResponse = z.infer<typeof buscarCapasCandidatasResponseSchema>;
