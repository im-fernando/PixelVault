import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  VALIDADE_MAXIMA_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { configDeTeste } from './suporte/ambiente.js';

/**
 * A porta de storage contra o MinIO de verdade — o mesmo protocolo que o R2
 * fala em produção (ADR 0012).
 *
 * Não há dublê aqui, e não poderia haver: o que este arquivo verifica é
 * justamente o que um dublê inventaria. Que a URL assinada seja aceita por
 * quem recebe, que o `Content-Length` assinado prenda o envio, que a expiração
 * exista de fato do lado do servidor, que copiar não mova e que apagar o
 * inexistente não estoure. Um mock devolveria o que o autor do mock achasse.
 *
 * O bucket é o de desenvolvimento, compartilhado com quem está trabalhando na
 * máquina — então vale a mesma disciplina do banco (docs/adr/0022): tudo que
 * este arquivo cria nasce sob um prefixo único da execução e é apagado no fim.
 * Nada de listar o bucket para limpar.
 */

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

/** Prefixo desta execução. É por ele — e só por ele — que a limpeza acha. */
const PREFIXO = `zz-teste-storage/${randomUUID()}`;

/** O que precisa sumir no fim, na ordem em que foi criado. */
const criados: string[] = [];

function chaveNova(nome: string): string {
  const chave = `${PREFIXO}/${nome}`;
  criados.push(chave);
  return chave;
}

/** Conteúdo diferente a cada chamada: nenhum teste passa por coincidência. */
function conteudoNovo(): Uint8Array {
  return new Uint8Array(randomBytes(64));
}

async function enviar(url: string, conteudo: Uint8Array, tipo?: string): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    body: conteudo,
    ...(tipo === undefined ? {} : { headers: { 'content-type': tipo } }),
  });
}

async function baixar(url: string): Promise<Uint8Array> {
  const resposta = await fetch(url);
  expect(resposta.status).toBe(200);
  return new Uint8Array(await resposta.arrayBuffer());
}

async function esperar(ms: number): Promise<void> {
  await new Promise((pronto) => setTimeout(pronto, ms));
}

afterAll(async () => {
  await Promise.all(criados.map((chave) => armazenamento.apagar(chave)));
});

describe('URL assinada', () => {
  it('aceita o envio por PUT e devolve o mesmo conteúdo pelo GET', async () => {
    const chave = chaveNova('ida-e-volta.bin');
    const conteudo = conteudoNovo();

    const envio = await enviar(await armazenamento.assinarEnvio(chave), conteudo);
    expect(envio.status).toBe(200);

    expect(await baixar(await armazenamento.assinarLeitura(chave))).toEqual(conteudo);
  });

  it('exige o tipo de conteúdo que foi assinado', async () => {
    const chave = chaveNova('tipo-assinado.bin');
    const conteudo = conteudoNovo();
    // Os dois cabeçalhos juntos, porque eles são assinados por caminhos
    // diferentes no SDK e o envio aceito abaixo é o que prova que um não
    // derrubou o outro.
    const url = await armazenamento.assinarEnvio(chave, {
      tipoDeConteudo: 'application/octet-stream',
      tamanhoEmBytes: conteudo.length,
    });

    const recusado = await enviar(url, conteudo, 'text/plain');
    expect(recusado.status).toBe(403);

    const aceito = await enviar(url, conteudo, 'application/octet-stream');
    expect(aceito.status).toBe(200);
  });

  it('prende o envio ao tamanho que foi assinado', async () => {
    // É o que impede uma URL pedida para um arquivo pequeno de ser usada para
    // despejar gigabytes na quarentena — a cota da #76 depende disto.
    const chave = chaveNova('tamanho-assinado.bin');
    const conteudo = conteudoNovo();
    const url = await armazenamento.assinarEnvio(chave, { tamanhoEmBytes: conteudo.length });

    const maior = await enviar(url, new Uint8Array(conteudo.length + 1));
    expect(maior.status).toBe(403);
    expect(await armazenamento.existe(chave)).toBe(false);

    expect((await enviar(url, conteudo)).status).toBe(200);
  });

  it('recusa validade fora do teto, em vez de assinar link permanente', async () => {
    const chave = `${PREFIXO}/nunca-assinada.bin`;
    await expect(
      armazenamento.assinarLeitura(chave, {
        validadeEmSegundos: VALIDADE_MAXIMA_EM_SEGUNDOS + 1,
      }),
    ).rejects.toThrow(RangeError);
    await expect(armazenamento.assinarEnvio(chave, { validadeEmSegundos: 0 })).rejects.toThrow(
      RangeError,
    );
  });
});

/**
 * A prova de que o TTL é do servidor, e não uma promessa nossa.
 *
 * As duas URLs são assinadas com um segundo de validade e usadas depois disso.
 * Quem recusa é o MinIO — o mesmo mecanismo (SigV4) que o R2 aplica —, e é por
 * isso que o teste espera de verdade em vez de adiantar relógio: relógio
 * adiantado no processo do teste não chega ao outro lado da conexão.
 */
describe('URL vencida', () => {
  const chave = chaveNova('vencida.bin');
  const conteudo = conteudoNovo();
  let envioVencido = '';
  let leituraVencida = '';

  beforeAll(async () => {
    await enviar(await armazenamento.assinarEnvio(chave), conteudo);

    envioVencido = await armazenamento.assinarEnvio(`${PREFIXO}/nao-deve-existir.bin`, {
      validadeEmSegundos: 1,
    });
    leituraVencida = await armazenamento.assinarLeitura(chave, { validadeEmSegundos: 1 });

    await esperar(2_000);
  });

  it('recusa o envio, e nada é gravado', async () => {
    const resposta = await enviar(envioVencido, conteudoNovo());

    expect(resposta.status).toBe(403);
    expect(await resposta.text()).toContain('Request has expired');
    expect(await armazenamento.existe(`${PREFIXO}/nao-deve-existir.bin`)).toBe(false);
  });

  it('recusa a leitura de um objeto que existe — o que venceu é a URL', async () => {
    const resposta = await fetch(leituraVencida);
    expect(resposta.status).toBe(403);
    expect(await resposta.text()).toContain('Request has expired');

    // Assinada de novo, a mesma chave entrega o mesmo conteúdo: o 403 acima
    // foi expiração, não objeto ausente.
    expect(await baixar(await armazenamento.assinarLeitura(chave))).toEqual(conteudo);
  });
});

describe('operações de servidor', () => {
  it('diz que o objeto não existe antes de ele existir, e que existe depois', async () => {
    const chave = chaveNova('existencia.bin');

    expect(await armazenamento.existe(chave)).toBe(false);
    await enviar(await armazenamento.assinarEnvio(chave), conteudoNovo());
    expect(await armazenamento.existe(chave)).toBe(true);
  });

  it('lê o objeto inteiro no servidor, byte a byte', async () => {
    // É a leitura de que a verificação da ADR 0014 depende: sem ela, o
    // SHA-256 que endereça o objeto compartilhado viria do cliente. O
    // conteúdo é binário e tem byte alto de propósito — uma leitura que
    // passasse por string devolveria outra coisa e o teste acusaria.
    const chave = chaveNova('leitura-no-servidor.bin');
    const conteudo = new Uint8Array([0x00, 0xff, 0x1a, 0x80, ...randomBytes(4096)]);
    await enviar(await armazenamento.assinarEnvio(chave), conteudo);

    const lido = await armazenamento.ler(chave);

    expect(lido).toEqual(conteudo);
    expect(lido.byteLength).toBe(conteudo.byteLength);
  });

  it('estoura ao ler objeto que não existe, em vez de devolver vazio', async () => {
    // Vazio seria pior que erro: a verificação leria "ROM de zero byte" e
    // recusaria o envio de alguém por um problema que é nosso.
    await expect(armazenamento.ler(`${PREFIXO}/nunca-existiu-para-ler.bin`)).rejects.toThrow();
  });

  it('copia da quarentena para o caminho definitivo sem mexer na origem', async () => {
    // O caminho da ADR 0014: o cliente escreve na quarentena, o servidor
    // promove. `copiar` não é `mover` de propósito — quem promove decide
    // quando (e se) apaga a origem.
    const origem = chaveNova(`quarentena/${randomUUID()}`);
    const destino = chaveNova('roms/promovida.bin');
    const conteudo = conteudoNovo();
    await enviar(await armazenamento.assinarEnvio(origem), conteudo);

    await armazenamento.copiar(origem, destino);

    expect(await baixar(await armazenamento.assinarLeitura(destino))).toEqual(conteudo);
    expect(await armazenamento.existe(origem)).toBe(true);

    await armazenamento.apagar(origem);
    expect(await armazenamento.existe(origem)).toBe(false);
    expect(await armazenamento.existe(destino)).toBe(true);
  });

  it('apaga sem reclamar de objeto que não existe', async () => {
    // Limpeza de quarentena abandonada roda sem saber se o arquivo chegou.
    await expect(armazenamento.apagar(`${PREFIXO}/nunca-existiu.bin`)).resolves.toBeUndefined();
  });
});
