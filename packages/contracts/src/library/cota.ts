import { z } from 'zod';

/**
 * Quanto uma conta pode acumular de ROM, em bytes: 4 GiB.
 *
 * O teto por arquivo (`TAMANHO_MAXIMO_DE_ROM_EM_BYTES`, 64 MiB) responde
 * "cabe um cartucho?". Este responde outra pergunta, que é a da
 * [ADR 0006](../../../../docs/adr/0006-byor-mais-catalogo-de-metadados.md):
 * "upload é vetor de abuso", e sem um total por conta o primeiro que quiser
 * transformar o produto em HD compartilhado consegue.
 *
 * O número sai do perfil real de biblioteca pessoal dos cinco sistemas
 * suportados, não de um palpite redondo. Uma coleção pessoal generosa —
 * digamos cem de NES, cem de Game Boy, cem de Mega Drive, cento e cinquenta
 * de SNES e cem de GBA — soma perto de 1,8 GiB, porque só o GBA tem arquivo
 * grande (8 a 16 MiB); NES fica na casa das centenas de kilobytes e SNES em
 * um a dois megabytes. Os 4 GiB são o dobro disso, e umas vinte vezes a
 * estimativa da [ADR 0012](../../../../docs/adr/0012-usar-cloudflare-r2-como-object-storage.md)
 * ("cinquenta ROMs de SNES dá algumas centenas de megabytes").
 *
 * Onde ele **não** cabe é onde ele deve não caber: o set completo dos cinco
 * sistemas passa de dezenas de gigabytes e de dezenas de milhares de
 * arquivos. Isso não é biblioteca pessoal, é espelho de acervo — exatamente o
 * uso que o BYOR não promete e que a cota existe para não subsidiar.
 *
 * Do lado do custo, 4 GiB por conta no teto é da ordem de centavos de dólar
 * por mês no armazenamento do R2, e o dedupe por conteúdo (ADR 0013) faz o
 * custo real ficar abaixo da soma das cotas, porque duas pessoas com a mesma
 * ROM ocupam um objeto só.
 *
 * Mora no contrato, e não só no servidor, porque o front precisa do mesmo
 * número para mostrar "2,1 GB de 4 GB" e para recusar o arquivo antes de
 * pedir a URL — pela mesma razão que o teto por arquivo mora aqui.
 */
export const COTA_DE_ARMAZENAMENTO_EM_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Quantas ROMs uma conta pode acumular: 1500.
 *
 * O segundo eixo existe porque o primeiro não o cobre. A verificação (#72)
 * aceita homebrew de GBA a partir de 192 bytes, então 4 GiB de cota comportam
 * milhões de linhas em `user_roms` sem chegar perto do limite de bytes — o
 * abuso deixaria de ser "encher o bucket" e passaria a ser "encher a tabela",
 * e o custo apareceria no banco e na listagem da biblioteca, não na conta do
 * storage.
 *
 * O valor é folgado de propósito: mil e quinhentos arquivos é umas três vezes
 * a coleção pessoal generosa que calibra a cota de bytes, e trinta vezes a
 * biblioteca de cinquenta ROMs da ADR 0012. Quem esbarrar aqui antes de
 * esbarrar nos 4 GiB está com uma média de 2,8 MiB por arquivo — perfil de
 * acervo, não de quem joga.
 */
export const COTA_DE_ROMS_POR_CONTA = 1500;

/**
 * Qual eixo da cota recusou o envio, em `details.cota` de um `CONFLICT`.
 *
 * Não virou `ErrorCode` novo pelo mesmo motivo do `MotivoDeLimite`: o código
 * é o que decide o fluxo do cliente, e o fluxo é o mesmo nos dois casos —
 * remover alguma coisa da biblioteca e tentar de novo. O que muda é a frase
 * ("não cabe mais nada em 4 GB" x "são 1500 ROMs no máximo"), e frase é
 * mensagem, não ramo de código.
 *
 * Nenhum dos dois vaza nada: falam da biblioteca de quem perguntou.
 */
export const motivoDeCotaSchema = z.enum(['LIMITE_DE_BYTES', 'LIMITE_DE_ARQUIVOS']);
export type MotivoDeCota = z.infer<typeof motivoDeCotaSchema>;
