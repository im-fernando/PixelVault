import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { configDeTeste, RAIZ_DO_MONOREPO } from './ambiente.js';
import { portaAceitaConexao } from './porta-tcp.js';

/**
 * O storage da suíte de integração: garantido de pé, com bucket criado e —
 * quando fomos nós que o subimos — derrubado no fim.
 *
 * É o irmão do `postgres-de-teste.ts`, com a mesma ordem e pelo mesmo motivo
 * (docs/adr/0022): a promessa da #52 é que `pnpm test` passe numa máquina
 * recém-clonada, sem passo manual antes. O MinIO é agora o segundo fornecedor
 * externo de que a suíte depende; deixá-lo de fora significaria que clonar o
 * repositório e rodar os testes voltaria a falhar com erro de conexão, que é
 * exatamente o que aquela issue tirou do caminho. O custo de manter a promessa
 * é este arquivo — pequeno, porque o desenho já estava pronto.
 *
 * A diferença para o banco é o bucket: subir o serviço não basta, e o
 * `minio-init` do compose (que o cria com o `mc`) é um contêiner de vida curta
 * que já pode ter rodado e sumido. Então o bucket é garantido daqui mesmo, com
 * o próprio SDK — o que de quebra cobre o caso de o MinIO estar de pé mas o
 * bucket ter sido apagado à mão.
 */

const executar = promisify(execFile);

/** Endereços em que faz sentido tentar subir o compose deste repositório. */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const ESPERA_MAXIMA_MS = 90_000;
const INTERVALO_DE_TENTATIVA_MS = 500;
const TIMEOUT_DA_PORTA_MS = 1_000;

/** Só subimos o que não estava de pé — e só derrubamos o que subimos. */
let subimosOMinio = false;

function anunciar(mensagem: string): void {
  // eslint-disable-next-line no-console -- é a saída que explica a espera a quem está rodando a suíte
  console.log(`[minio-de-teste] ${mensagem}`);
}

function enderecoDoStorage(): { host: string; porta: number } | null {
  try {
    const url = new URL(configDeTeste.S3_ENDPOINT);
    return {
      host: url.hostname,
      porta: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    };
  } catch {
    return null;
  }
}

function clienteDeTeste(): S3Client {
  return new S3Client({
    endpoint: configDeTeste.S3_ENDPOINT,
    region: configDeTeste.S3_REGION,
    forcePathStyle: configDeTeste.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: configDeTeste.S3_ACCESS_KEY_ID,
      secretAccessKey: configDeTeste.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

async function portaResponde(): Promise<boolean> {
  const endereco = enderecoDoStorage();
  if (endereco === null) return false;
  return portaAceitaConexao(endereco.host, endereco.porta, TIMEOUT_DA_PORTA_MS);
}

/**
 * Porta aberta não é storage pronto: só uma operação de verdade prova isso.
 * Bucket ausente é caso normal (MinIO virgem), e por isso vira criação, não
 * erro.
 */
async function bucketPronto(cliente: S3Client): Promise<boolean> {
  const Bucket = configDeTeste.S3_BUCKET;
  try {
    await cliente.send(new HeadBucketCommand({ Bucket }));
    return true;
  } catch (erro) {
    if (!(erro instanceof S3ServiceException) || erro.$metadata.httpStatusCode !== 404) {
      return false;
    }
  }

  anunciar(`criando o bucket \`${Bucket}\`…`);
  try {
    await cliente.send(new CreateBucketCommand({ Bucket }));
    return true;
  } catch (erro) {
    // Duas execuções em paralelo podem tentar criar o mesmo bucket; quem
    // perder a corrida encontra o bucket pronto, que é o que ela queria.
    return erro instanceof S3ServiceException && erro.$metadata.httpStatusCode === 409;
  }
}

async function esperarOStorage(cliente: S3Client): Promise<boolean> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    if ((await portaResponde()) && (await bucketPronto(cliente))) return true;
    await new Promise((pronto) => setTimeout(pronto, INTERVALO_DE_TENTATIVA_MS));
  }
  return false;
}

async function subirOCompose(): Promise<void> {
  const endereco = enderecoDoStorage();
  if (endereco === null || !HOSTS_LOCAIS.has(endereco.host)) {
    throw new Error(
      `O storage de ${configDeTeste.S3_ENDPOINT} não respondeu, e o endereço não é ` +
        'local — não há compose para subir. Aponte a S3_ENDPOINT para um storage acessível.',
    );
  }

  anunciar('storage não respondeu; subindo o serviço `minio` do docker-compose.yml…');
  try {
    // `--wait` espera o healthcheck do serviço, e não só o container existir.
    await executar('docker', ['compose', 'up', '-d', '--wait', 'minio'], {
      cwd: RAIZ_DO_MONOREPO,
    });
  } catch (erro) {
    throw new Error(
      `Não consegui subir o MinIO de teste: ${(erro as Error).message}\n` +
        'A suíte de integração de storage precisa de um S3 de verdade. Instale o ' +
        'Docker ou suba um storage S3-compatible você mesmo e aponte as S3_* para ele.',
      { cause: erro },
    );
  }
  subimosOMinio = true;
}

export async function setup(): Promise<void> {
  if (!(await portaResponde())) await subirOCompose();

  const cliente = clienteDeTeste();
  try {
    if (!(await esperarOStorage(cliente))) {
      throw new Error(
        `O storage de ${configDeTeste.S3_ENDPOINT} não ficou pronto em ` +
          `${ESPERA_MAXIMA_MS / 1000}s. Confira se as S3_* apontam para o serviço ` +
          '`minio` do docker-compose.yml (porta 9000) e veja `docker compose logs minio`.',
      );
    }
  } finally {
    cliente.destroy();
  }
}

export async function teardown(): Promise<void> {
  if (!subimosOMinio) return;

  // `stop` e não `down`: o container volta na próxima execução sem recriar
  // nada, e o volume de quem desenvolve continua intacto — inclusive as ROMs
  // que já estavam lá.
  anunciar('derrubando o MinIO que esta execução subiu…');
  await executar('docker', ['compose', 'stop', 'minio'], { cwd: RAIZ_DO_MONOREPO });
}
