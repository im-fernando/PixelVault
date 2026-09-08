import { z } from 'zod';
import { sha256Schema } from '../shared/primitives.js';

/**
 * Resposta de `GET /api/library/roms/:romId/download`.
 *
 * É a autorização para ler os bytes de uma ROM da própria biblioteca — e é
 * **só** isso que ela é. A URL vem assinada com validade curta e nasce depois
 * de o servidor confirmar, no banco, que aquela linha de `user_roms` é de quem
 * pediu; conhecer o `romId` (ou o `sha256`) não dá direito a nada, que é a
 * regra da [ADR 0013](../../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md).
 *
 * Os metadados vêm junto porque o player precisa deles antes do primeiro byte:
 * a extensão do `fileName` é o que diz qual núcleo carregar, e o `sha256`
 * identifica o conteúdo para o cache local do navegador — pedir a URL e
 * depois pedir os metadados noutra rota seria uma viagem a mais para
 * responder o que esta já sabia.
 *
 * O que **não** está aqui é a chave do objeto (`roms/<sha256>`). Ela é
 * endereço interno do bucket, não interessa ao cliente, e devolvê-la só
 * ensinaria o formato de um caminho compartilhado por todo mundo que tem
 * aquele conteúdo.
 */
export const romDownloadResponseSchema = z.object({
  /** URL de GET assinada, válida por `expiresInSeconds`. Vencida, peça outra. */
  url: z.url(),
  /** Quanto tempo a URL vale, em segundos. Curto de propósito (ADR 0013). */
  expiresInSeconds: z.number().int().positive(),
  /** O hash que o servidor calculou no envio. Identidade do conteúdo. */
  sha256: sha256Schema,
  sizeBytes: z.number().int().positive(),
  /** O nome que a pessoa deu ao arquivo dela. A extensão escolhe o núcleo. */
  fileName: z.string().min(1),
});
export type RomDownloadResponse = z.infer<typeof romDownloadResponseSchema>;
