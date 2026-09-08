import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAMANHO_MAXIMO_DE_ROM_EM_BYTES } from '@pixelvault/contracts';
import {
  enviarRom,
  recusaAntesDeEnviar,
  type DependenciasDoEnvio,
  type EstadoDoEnvio,
} from './envio-de-rom.js';

const HASH = 'a'.repeat(64);
const UPLOAD_ID = '11111111-1111-4111-8111-111111111111';
const ROM_ID = '22222222-2222-4222-8222-222222222222';

/** Um arquivo qualquer com nome de ROM. O conteúdo não importa: quem julga bytes é o servidor. */
function arquivoDeRom(nome = 'jogo.sfc', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nome);
}

/**
 * Um arquivo que só é enorme no `size`.
 *
 * Alocar 64 MiB de verdade só para provar que a recusa acontece antes da rede
 * seria pagar caro por um número que nada aqui lê — o fluxo decide pelo
 * `size`, exatamente como o contrato faz.
 */
function arquivoQueSeDizEnorme(bytes: number): File {
  const arquivo = new File([new Uint8Array(8)], 'grande.sfc');
  Object.defineProperty(arquivo, 'size', { value: bytes });
  return arquivo;
}

function respostas(...cada: { status: number; body: unknown }[]): typeof fetch {
  const fila = [...cada];
  return vi.fn(() => {
    const proxima = fila.shift();
    if (proxima === undefined) throw new Error('requisição a mais do que o teste previu');
    return Promise.resolve(
      new Response(JSON.stringify(proxima.body), {
        status: proxima.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
}

const TICKET = {
  status: 'envio-autorizado',
  uploadId: UPLOAD_ID,
  url: 'http://storage.local/quarentena/abc?assinado',
  contentType: 'application/octet-stream',
  sizeBytes: 1024,
  expiresInSeconds: 300,
};

function deps(sobre: Partial<DependenciasDoEnvio> = {}): DependenciasDoEnvio {
  return {
    calcularHash: () => Promise.resolve(HASH),
    enviarBytes: (_destino, arquivo, aoProgredir) => {
      aoProgredir(arquivo.size);
      return Promise.resolve();
    },
    ...sobre,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recusaAntesDeEnviar', () => {
  it('recusa o arquivo grande demais sem uma ida à rede', () => {
    expect(recusaAntesDeEnviar(TAMANHO_MAXIMO_DE_ROM_EM_BYTES + 1)?.titulo).toContain('passa de');
  });

  it('aceita exatamente o teto do contrato', () => {
    expect(recusaAntesDeEnviar(TAMANHO_MAXIMO_DE_ROM_EM_BYTES)).toBeNull();
  });

  it('recusa arquivo vazio com frase própria', () => {
    expect(recusaAntesDeEnviar(0)?.titulo).toContain('vazio');
  });
});

describe('enviarRom', () => {
  it('anuncia conferindo → enviando → verificando → pronto', async () => {
    vi.stubGlobal(
      'fetch',
      respostas(
        { status: 200, body: TICKET },
        {
          status: 200,
          body: {
            status: 'na-biblioteca',
            romId: ROM_ID,
            sha256: HASH,
            gameId: null,
            sizeBytes: 1024,
            deduplicado: false,
          },
        },
      ),
    );

    const fases: string[] = [];
    const final = await enviarRom(
      arquivoDeRom(),
      (estado: EstadoDoEnvio) => fases.push(estado.fase),
      deps(),
    );

    // A verificação aparece como estado próprio, e não escondida no fim do
    // envio: é a exigência literal da ADR 0014.
    expect(fases).toEqual(['conferindo', 'enviando', 'enviando', 'verificando', 'pronto']);
    expect(final.fase === 'pronto' && final.rom.romId).toBe(ROM_ID);
  });

  it('nem toca no storage quando o hash já é conhecido da biblioteca', async () => {
    vi.stubGlobal(
      'fetch',
      respostas({ status: 200, body: { status: 'ja-na-biblioteca', romId: ROM_ID } }),
    );
    const enviarBytes = vi.fn(() => Promise.resolve());

    const final = await enviarRom(arquivoDeRom(), () => {}, deps({ enviarBytes }));

    expect(enviarBytes).not.toHaveBeenCalled();
    expect(final).toMatchObject({ fase: 'pronto', rom: { jaTinha: true, romId: ROM_ID } });
  });

  it('vira estado de recusa, e não exceção, quando a verificação recusa a ROM', async () => {
    vi.stubGlobal(
      'fetch',
      respostas(
        { status: 200, body: TICKET },
        {
          status: 422,
          body: {
            code: 'VALIDATION_FAILED',
            message: 'não tem cabeçalho',
            details: { rom: ['CONTEUDO_NAO_RECONHECIDO'] },
          },
        },
      ),
    );

    const final = await enviarRom(arquivoDeRom(), () => {}, deps());

    expect(final.fase).toBe('recusado');
    expect(final.fase === 'recusado' && final.recusa.titulo).toContain('cara de ROM');
  });

  it('recusa o arquivo grande demais antes de pedir autorização', async () => {
    const fetchNunca = vi.fn();
    vi.stubGlobal('fetch', fetchNunca);

    const final = await enviarRom(
      arquivoQueSeDizEnorme(TAMANHO_MAXIMO_DE_ROM_EM_BYTES + 1),
      () => {},
      deps(),
    );

    expect(fetchNunca).not.toHaveBeenCalled();
    expect(final.fase).toBe('recusado');
  });
});
