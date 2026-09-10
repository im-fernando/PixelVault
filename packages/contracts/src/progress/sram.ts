import { z } from 'zod';

/**
 * Teto de tamanho de uma SRAM: 256 KiB.
 *
 * SRAM não é ROM. O maior cartucho comercial dos cinco sistemas guarda
 * algumas dezenas de KB no save — o teto real conhecido é o SNES com
 * bateria de 128 KiB (Front Mission 5, em japonês, e alguns RPGs tardios;
 * a maioria fica em 2 ou 8 KiB), GBA chega perto disso em flash save. Dobrar
 * o maior valor conhecido é a mesma folga que `TAMANHO_MAXIMO_DE_ROM_EM_BYTES`
 * usa para ROM, pelo mesmo motivo: um core que grava alguns bytes de
 * metadado junto da SRAM crua não pode ser recusado por uma conta redonda
 * demais. Não reaproveita o teto de ROM (64 MiB) porque folga pensada para
 * cartucho não é folga pensada para save — seria autorizar um upload
 * quatrocentas vezes maior que o pior caso real.
 */
export const TAMANHO_MAXIMO_DE_SRAM_EM_BYTES = 256 * 1024;

/**
 * Quantos bytes uma string base64 válida decodifica — sem decodificar de
 * verdade. Puro e sem `Buffer`, porque este pacote é consumido pelo front
 * também: cada quatro caracteres codificam três bytes, e o `=` de
 * preenchimento no fim desconta um ou dois.
 */
function tamanhoDecodificadoDeBase64(base64: string): number {
  const preenchimento = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - preenchimento;
}

/**
 * Corpo de `POST /api/progress/sram/:romId`.
 *
 * `revision` é a revisão sobre a qual o cliente baseou esta gravação — a que
 * ele leu por último, nunca um relógio. `0` é o valor reservado para "eu
 * acho que ainda não existe save na nuvem para esta ROM": não há revisão
 * zero de verdade, porque a primeira gravação bem-sucedida já nasce com
 * `revision: 1` (ver docs/adr/0020, regra 4, e
 * `apps/api/src/modules/progress/application/gravar-sram.ts`).
 *
 * Os bytes vêm em base64 dentro do corpo JSON, e não por URL assinada como a
 * ROM: o fluxo de duas fases (assinar → PUT direto no storage → confirmar)
 * existe para a ROM poder chegar a dezenas de megabytes sem passar pelo
 * processo Fastify. SRAM tem, no máximo,
 * `TAMANHO_MAXIMO_DE_SRAM_EM_BYTES` — cabe folgado num corpo de requisição,
 * e o ganho de simplicidade (uma rota só, sem upload em duas fases, sem
 * quarentena) supera o overhead de ~33% do base64 num payload deste
 * tamanho.
 */
export const sramUploadRequestSchema = z.object({
  revision: z.number().int().min(0),
  dataBase64: z
    .base64()
    .refine(
      (valor) => tamanhoDecodificadoDeBase64(valor) <= TAMANHO_MAXIMO_DE_SRAM_EM_BYTES,
      `SRAM maior que o teto de ${TAMANHO_MAXIMO_DE_SRAM_EM_BYTES} bytes`,
    ),
});
export type SramUploadRequest = z.infer<typeof sramUploadRequestSchema>;

/**
 * Resposta de sucesso: a gravação venceu a checagem de revisão e o servidor
 * já incrementou o contador.
 */
export const sramUploadResponseSchema = z.object({
  status: z.literal('gravado'),
  revision: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  /** Relógio do servidor no momento da escrita — nunca o do cliente. */
  updatedAt: z.iso.datetime(),
});
export type SramUploadResponse = z.infer<typeof sramUploadResponseSchema>;

/**
 * Resposta de sucesso de `GET /api/progress/sram/:romId` quando existe save
 * na nuvem para aquela ROM.
 *
 * Os bytes vêm em base64 no corpo, do mesmo jeito que o upload manda — e
 * pela mesma razão: `TAMANHO_MAXIMO_DE_SRAM_EM_BYTES` é pequeno o bastante
 * para caber num corpo de resposta sem o ganho de uma URL assinada (menos
 * uma viagem de rede, sem o storage precisar ficar acessível ao navegador
 * para GET). `revision` é o que o cliente vai mandar de volta na próxima
 * gravação, como `revisaoEsperada` — é o número que fecha o ciclo com
 * `sramUploadRequestSchema`.
 */
export const sramDownloadEncontradoSchema = z.object({
  status: z.literal('encontrado'),
  revision: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  dataBase64: z.base64(),
});
export type SramDownloadEncontrado = z.infer<typeof sramDownloadEncontradoSchema>;

/**
 * A ROM é da conta, mas não tem save na nuvem ainda — não é erro, é o estado
 * normal de quem nunca sincronizou aquele jogo. Por isso é `200` com um
 * `status` próprio, e não `404`: `404` neste módulo significa "esse `romId`
 * não é seu" (`autorizarOuNaoEncontrado`), e misturar os dois motivos no
 * mesmo código faria o cliente não conseguir distinguir "posso oferecer a
 * adoção deste save" de "não posso nem perguntar de quem é essa ROM".
 */
export const sramDownloadSemSaveSchema = z.object({
  status: z.literal('sem-save'),
});
export type SramDownloadSemSave = z.infer<typeof sramDownloadSemSaveSchema>;

export const sramDownloadResponseSchema = z.discriminatedUnion('status', [
  sramDownloadEncontradoSchema,
  sramDownloadSemSaveSchema,
]);
export type SramDownloadResponse = z.infer<typeof sramDownloadResponseSchema>;
