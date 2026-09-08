import { z } from 'zod';
import { sha256Schema, uuidSchema } from '../shared/primitives.js';

/**
 * Teto de tamanho de uma ROM enviada: 64 MiB.
 *
 * O número sai do maior cartucho que os cinco sistemas suportados produzem, e
 * não de um palpite. O teto real é o GBA, com 32 MiB (256 Mbit) — Mother 3 e
 * boa parte dos jogos tardios ocupam o cartucho inteiro. Depois dele vem o
 * SNES com 6 MiB (48 Mbit, Tales of Phantasia e Star Ocean), o Mega Drive com
 * 4 MiB de catálogo comercial (e 8 MiB em homebrew como Pier Solar), o Game
 * Boy com até 8 MiB e o NES com pouco mais de 1 MiB nos mappers maiores.
 *
 * Dobrar o teto real é a folga: dumps de SNES chegam com 512 bytes de
 * cabeçalho de copiador, e tradução e romhack costumam crescer o arquivo
 * original ao expandir banco. Um limite de 8 ou 16 MiB — a intuição de quem
 * pensa só em SNES — recusaria metade da biblioteca de GBA, e a recusa
 * apareceria no primeiro upload de verdade, não aqui.
 *
 * O teto é por arquivo e entra na assinatura da URL (`Content-Length`), então
 * ninguém despeja mais que isto numa URL pedida para menos. Quanto uma conta
 * pode acumular no total é outra conversa, e é a cota da #76.
 *
 * Mora no contrato, e não só no servidor, porque o front precisa do mesmo
 * número para recusar o arquivo antes de pedir a URL — pela mesma razão que
 * `TAMANHO_MINIMO_SENHA` mora aqui.
 */
export const TAMANHO_MAXIMO_DE_ROM_EM_BYTES = 64 * 1024 * 1024;

/**
 * O tipo de conteúdo com que toda ROM é gravada.
 *
 * É constante, e não escolha do cliente: ele entra na assinatura da URL, e
 * quem enviar outro tipo é recusado pelo storage. ROM é binário opaco — deixar
 * o navegador declarar `text/html` num objeto que um dia pode ser servido por
 * URL assinada seria criar problema por generosidade.
 */
export const TIPO_DE_CONTEUDO_DA_ROM = 'application/octet-stream';

/**
 * Corpo de `POST /api/library/uploads`.
 *
 * `sizeBytes` é obrigatório porque é ele que entra na assinatura: sem tamanho
 * negociado, a URL aceitaria qualquer coisa que coubesse na paciência do
 * storage.
 *
 * `sha256` é opcional e é **dica**, nunca autoridade. Serve para uma resposta
 * cedo — "você já tem esse, nem envie" — e jamais para decidir onde o objeto
 * vai parar; o caminho definitivo depende do hash que o servidor calcula
 * depois de ler os bytes da quarentena. Ver docs/adr/0014.
 *
 * O que não está aqui também é decisão: nome do objeto, prefixo, `uploadId`.
 * O caminho é do servidor de ponta a ponta.
 */
export const romUploadRequestSchema = z.object({
  sizeBytes: z.number().int().positive().max(TAMANHO_MAXIMO_DE_ROM_EM_BYTES),
  sha256: sha256Schema.optional(),
});
export type RomUploadRequest = z.infer<typeof romUploadRequestSchema>;

/**
 * A autorização de envio: para onde mandar, com que cabeçalho e por quanto
 * tempo.
 *
 * `url` já carrega o caminho da quarentena — o cliente não monta nem escolhe
 * nada. O envio é um `PUT` com o corpo exato do arquivo e o `Content-Type`
 * daqui; qualquer outro tipo, ou qualquer outro tamanho, é recusado pelo
 * storage, porque os dois foram assinados junto com a URL.
 */
export const romUploadTicketSchema = z.object({
  status: z.literal('envio-autorizado'),
  /** Id do envio, gerado pelo servidor. É ele que volta no `complete`. */
  uploadId: uuidSchema,
  url: z.url(),
  contentType: z.literal(TIPO_DE_CONTEUDO_DA_ROM),
  /** O tamanho negociado, em bytes. O corpo do PUT tem que ter exatamente isto. */
  sizeBytes: z.number().int().positive(),
  /** Quanto tempo a URL vale. Vencida, basta pedir outra. */
  expiresInSeconds: z.number().int().positive(),
});
export type RomUploadTicket = z.infer<typeof romUploadTicketSchema>;

/**
 * O atalho do hash: a pessoa já tem esse conteúdo na biblioteca dela, então
 * não há upload a fazer.
 *
 * A consulta é sempre restrita à biblioteca de quem pediu. Responder a partir
 * do acervo inteiro transformaria a rota num oráculo de "esta ROM existe no
 * PixelVault", que é justamente o que a ADR 0013 proíbe ao dizer que conhecer
 * o hash não dá direito a nada.
 */
export const romAlreadyOwnedSchema = z.object({
  status: z.literal('ja-na-biblioteca'),
  /** A ROM que a pessoa já tem, para o front levar direto até ela. */
  romId: uuidSchema,
});
export type RomAlreadyOwned = z.infer<typeof romAlreadyOwnedSchema>;

export const romUploadResponseSchema = z.discriminatedUnion('status', [
  romUploadTicketSchema,
  romAlreadyOwnedSchema,
]);
export type RomUploadResponse = z.infer<typeof romUploadResponseSchema>;

/**
 * Nome do arquivo, informado ao concluir o envio.
 *
 * É o único dado do cliente que sobrevive à verificação, e ele existe por duas
 * razões: `user_roms.file_name` guarda o nome que a pessoa deu ao arquivo
 * dela, e a **extensão é o que diz de qual sistema a ROM afirma ser** — sem
 * isso não há faixa de tamanho plausível a conferir nem cabeçalho a procurar
 * (docs/adr/0014).
 *
 * Mentir aqui não alcança ninguém: o nome não encosta no caminho do objeto,
 * que é `roms/<sha256 calculado pelo servidor>`, e extensão errada só faz a
 * verificação recusar o envio de quem mentiu.
 */
export const TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO = 255;

export const romUploadCompletionSchema = z.object({
  fileName: z.string().min(1).max(TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO),
});
export type RomUploadCompletion = z.infer<typeof romUploadCompletionSchema>;

/**
 * Por que a verificação recusou a ROM — vai em `details.rom` de um
 * `VALIDATION_FAILED`.
 *
 * Mesmo espírito do `CodigoErroIdentity`: o `ErrorCode` genérico decide o
 * status HTTP, e este diz o que a pessoa precisa entender. "Não é do sistema
 * que a extensão promete" e "é grande demais para este console" viram o mesmo
 * 422, mas não a mesma frase na tela.
 *
 * Nenhum dos quatro vaza nada: todos falam do arquivo que quem perguntou
 * acabou de enviar.
 */
export const motivoDeRecusaDeRomSchema = z.enum([
  /** A extensão não é de nenhum sistema suportado — `.zip`, `.txt`, sem ponto. */
  'EXTENSAO_NAO_RECONHECIDA',
  /** Fora da faixa plausível de cartucho daquele console. */
  'TAMANHO_IMPLAUSIVEL',
  /** Falta o cabeçalho que aquele formato sempre tem. Não é ROM. */
  'CONTEUDO_NAO_RECONHECIDO',
  /** O conteúdo é de outro console, ou é um arquivo compactado. */
  'SISTEMA_DIVERGENTE',
]);
export type MotivoDeRecusaDeRom = z.infer<typeof motivoDeRecusaDeRomSchema>;

/**
 * Resposta de `POST /api/library/uploads/:id/complete`.
 *
 * Aqui a verificação da ADR 0014 já aconteceu: o servidor leu os bytes da
 * quarentena, calculou o SHA-256 de verdade, conferiu tamanho e cabeçalho, e
 * ou promoveu o objeto para `roms/<sha256>` ou descobriu que aquele conteúdo
 * já estava lá. Nos dois casos a ROM passou a ser da pessoa, e por isso o
 * estado é um só. Falha de verificação não é estado desta resposta: é 422 com
 * o motivo em `details.rom`.
 *
 * `gameId` nulo é normal, e não erro: o hash não casou com nada do catálogo e
 * a biblioteca funciona do mesmo jeito (docs/adr/0006).
 *
 * `deduplicado` diz que nada foi transferido porque o conteúdo já existia no
 * storage. Ele conta, sim, que **alguém** já tinha aquele arquivo — mas é um
 * agregado sem dono, e o cliente concluiria o mesmo pelo relógio: dedupe
 * responde na hora, promoção copia o objeto antes de responder. O que a ADR
 * 0013 proíbe é outra coisa — servir bytes a partir de um hash informado —, e
 * disso esta resposta continua longe.
 */
export const romUploadCompletedResponseSchema = z.object({
  status: z.literal('na-biblioteca'),
  /** A linha em `user_roms`. É por ela que o front chega à ROM. */
  romId: uuidSchema,
  /** O hash que o servidor calculou. Nunca o que o cliente informou. */
  sha256: sha256Schema,
  /** O jogo do catálogo, quando o hash casou. Nulo é o caso comum do BYOR. */
  gameId: uuidSchema.nullable(),
  sizeBytes: z.number().int().positive(),
  /** `true` quando o conteúdo já existia no storage e nada foi transferido. */
  deduplicado: z.boolean(),
});
export type RomUploadCompletedResponse = z.infer<typeof romUploadCompletedResponseSchema>;
