import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  VALIDADE_MAXIMA_EM_SEGUNDOS,
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
  type OpcoesDeEnvioAssinado,
  type OpcoesDeEscrita,
  type OpcoesDeUrlAssinada,
} from './armazenamento-de-objetos.js';

/** O que as variáveis `S3_*` do ambiente viram aqui dentro. */
export interface OpcoesDoArmazenamentoS3 {
  /** `http://localhost:9000` no MinIO, `https://<conta>.r2.cloudflarestorage.com` no R2. */
  endpoint: string;
  /** `auto` no R2; no MinIO qualquer uma serve, desde que a mesma dos dois lados. */
  regiao: string;
  bucket: string;
  chaveDeAcesso: string;
  segredo: string;
  /**
   * `bucket` no caminho (`https://host/bucket/chave`) em vez de no subdomínio.
   * O MinIO exige; R2 e S3 preferem o virtual-hosted. É a única diferença
   * entre os dois ambientes, e ela vem do ambiente — não de um `if` no código
   * (ADR 0012).
   */
  caminhoNoEstiloDePasta: boolean;
}

/**
 * O adaptador S3 da porta de storage. Serve MinIO e R2 com o mesmo código: o
 * que muda entre eles é configuração (`S3_ENDPOINT`, `S3_REGION`,
 * `S3_FORCE_PATH_STYLE`), nunca caminho de execução.
 *
 * Duas escolhas do client merecem explicação:
 *
 * 1. **`requestChecksumCalculation: 'WHEN_REQUIRED'`.** Por padrão, o SDK
 *    calcula um CRC32 do corpo em toda escrita — e, ao assinar uma URL, o
 *    corpo é vazio, porque presigned não tem corpo. O que sai é uma URL com
 *    `x-amz-checksum-crc32` do nada pendurado nela, enquanto quem envia de
 *    verdade é o navegador, minutos depois, com os bytes da ROM. O MinIO
 *    ignora o parâmetro e aceita; storage que o honra confere o checksum
 *    contra os bytes recebidos e recusa o upload. É a pior espécie de
 *    diferença entre desenvolvimento e produção: aparece no primeiro upload
 *    de verdade. `WHEN_REQUIRED` mantém o checksum onde a API o exige e o tira
 *    do presigned, que é o fluxo inteiro do BYOR.
 * 2. **Nenhum `if` por ambiente.** Não há bandeira de "modo MinIO" aqui, e
 *    isso é o ponto da ADR 0012: se um dia precisar de uma, é sinal de que a
 *    compatibilidade quebrou e a decisão precisa ser reaberta, e não de que
 *    falta um `if`.
 */
export function criarArmazenamentoS3(opcoes: OpcoesDoArmazenamentoS3): ArmazenamentoDeObjetos {
  const cliente = new S3Client({
    endpoint: opcoes.endpoint,
    region: opcoes.regiao,
    forcePathStyle: opcoes.caminhoNoEstiloDePasta,
    credentials: { accessKeyId: opcoes.chaveDeAcesso, secretAccessKey: opcoes.segredo },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const bucket = opcoes.bucket;

  return {
    async assinarEnvio(chave: string, ajustes?: OpcoesDeEnvioAssinado): Promise<string> {
      const comando = new PutObjectCommand({
        Bucket: bucket,
        Key: chave,
        ...(ajustes?.tipoDeConteudo !== undefined ? { ContentType: ajustes.tipoDeConteudo } : {}),
        ...(ajustes?.tamanhoEmBytes !== undefined ? { ContentLength: ajustes.tamanhoEmBytes } : {}),
      });

      return getSignedUrl(cliente, comando, {
        expiresIn: validadeEmSegundos(ajustes),
        // `content-length` o presigner assina sozinho; `content-type` não —
        // ele sai da assinatura e o parâmetro viraria enfeite, aceitando
        // qualquer tipo no envio. Pedir a assinatura explicitamente é o que
        // faz o storage recusar quem manda outro. (Verificado contra o MinIO
        // em `test/storage.integration.test.ts`.)
        ...(ajustes?.tipoDeConteudo !== undefined
          ? { signableHeaders: new Set(['content-type']) }
          : {}),
      });
    },

    async escrever(chave: string, bytes: Uint8Array, ajustes?: OpcoesDeEscrita): Promise<void> {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: chave,
          Body: bytes,
          ...(ajustes?.tipoDeConteudo !== undefined ? { ContentType: ajustes.tipoDeConteudo } : {}),
        }),
      );
    },

    async assinarLeitura(chave: string, ajustes?: OpcoesDeUrlAssinada): Promise<string> {
      const comando = new GetObjectCommand({ Bucket: bucket, Key: chave });
      return getSignedUrl(cliente, comando, { expiresIn: validadeEmSegundos(ajustes) });
    },

    async ler(chave: string): Promise<Uint8Array> {
      const resposta = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: chave }));
      if (resposta.Body === undefined) {
        // O SDK tipa `Body` como opcional, mas um GET bem-sucedido sempre tem
        // corpo — nem que seja vazio. Tratar como erro é melhor que devolver
        // um array vazio que a verificação leria como "ROM de zero byte".
        throw new Error(`Objeto ${chave} veio sem corpo`);
      }

      // `transformToByteArray` consome o stream até o fim e libera a conexão
      // do pool. Ler por `Body.transformToString()` corromperia binário, e
      // deixar o stream aberto vazaria socket a cada verificação.
      return resposta.Body.transformToByteArray();
    },

    async copiar(origem: string, destino: string): Promise<void> {
      await cliente.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: destino,
          CopySource: origemDaCopia(bucket, origem),
        }),
      );
    },

    async apagar(chave: string): Promise<void> {
      await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
    },

    async existe(chave: string): Promise<boolean> {
      try {
        await cliente.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }));
        return true;
      } catch (erro) {
        // Só 404 vira "não existe". Um 403 significa credencial sem permissão,
        // e respondê-lo como ausência faria o dedupe da ADR 0013 concluir que
        // a ROM não está lá e mandar promover por cima de um objeto que
        // existe. Erro de infraestrutura sobe.
        if (erro instanceof S3ServiceException && erro.$metadata.httpStatusCode === 404) {
          return false;
        }
        throw erro;
      }
    },
  };
}

function validadeEmSegundos(ajustes: OpcoesDeUrlAssinada | undefined): number {
  const pedida = ajustes?.validadeEmSegundos ?? VALIDADE_PADRAO_EM_SEGUNDOS;

  if (!Number.isInteger(pedida) || pedida < 1 || pedida > VALIDADE_MAXIMA_EM_SEGUNDOS) {
    throw new RangeError(
      `Validade de URL assinada inválida: ${pedida}s. O aceito é de 1 a ` +
        `${VALIDADE_MAXIMA_EM_SEGUNDOS}s — ver armazenamento-de-objetos.ts.`,
    );
  }

  return pedida;
}

/**
 * O `CopySource` é `bucket/chave` **percent-encoded**, e não a chave crua: sem
 * isso, um objeto com espaço ou `+` no nome copiaria o arquivo errado, ou
 * nenhum. A barra fica de fora do encode porque separa os segmentos do
 * caminho.
 */
function origemDaCopia(bucket: string, chave: string): string {
  return `${bucket}/${chave}`
    .split('/')
    .map((segmento) => encodeURIComponent(segmento))
    .join('/');
}
