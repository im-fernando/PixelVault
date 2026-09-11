import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../infrastructure/errors.js';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import type { IdentificarRomNoCatalogo } from '../domain/catalogo-de-roms.js';
import type { NovaRomDoUsuario, UserRomRepository } from '../domain/user-rom-repository.js';
import { confirmarEnvioDeRom } from './confirmar-envio-de-rom.js';

/**
 * A coreografia da ADR 0014 sem storage nem banco: o que promove, o que
 * deduplica e o que some quando a verificação recusa.
 *
 * As portas são interfaces, então implementá-las à mão é mais barato e mais
 * legível que qualquer framework de mock — e é o que permite afirmar aqui o
 * que nenhum teste de integração afirma com clareza: que `copiar` **não** é
 * chamado no dedupe. Que o MinIO aceitaria a cópia não é o ponto; o ponto é
 * não pedi-la.
 */

const USUARIO = '11111111-1111-4111-8111-111111111111';
const ENVIO = '22222222-2222-4222-8222-222222222222';
const QUARENTENA = `quarentena/${USUARIO}/${ENVIO}`;

/** Igual à do teste do domínio, e pelo mesmo motivo: bytes determinísticos. */
function romDeSnes(comCabecalhoDeCopiador = false): Uint8Array {
  const corpo = new Uint8Array(64 * 1024).fill(0x5a);
  corpo[0x7fc0 + 0x1c] = 0x32;
  corpo[0x7fc0 + 0x1d] = 0x54;
  corpo[0x7fc0 + 0x1e] = 0xcd;
  corpo[0x7fc0 + 0x1f] = 0xab;
  if (!comCabecalhoDeCopiador) return corpo;

  const comHeader = new Uint8Array(512 + corpo.byteLength);
  comHeader.set(corpo, 512);
  return comHeader;
}

function sha256De(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface ArmazenamentoFalso extends ArmazenamentoDeObjetos {
  readonly chamadas: string[];
  readonly objetos: Map<string, Uint8Array>;
}

function armazenamentoFalso(objetos: Map<string, Uint8Array>): ArmazenamentoFalso {
  const chamadas: string[] = [];

  return {
    chamadas,
    objetos,
    assinarEnvio: async () => {
      throw new Error('a confirmação não assina nada');
    },
    assinarLeitura: async () => {
      throw new Error('a confirmação não assina nada');
    },
    escrever: async () => {
      throw new Error('a confirmação não escreve nada');
    },
    ler: async (chave: string) => {
      chamadas.push(`ler ${chave}`);
      const bytes = objetos.get(chave);
      if (bytes === undefined) throw new Error(`objeto ausente: ${chave}`);
      return bytes;
    },
    existe: async (chave: string) => objetos.has(chave),
    copiar: async (origem: string, destino: string) => {
      chamadas.push(`copiar ${origem} -> ${destino}`);
      const bytes = objetos.get(origem);
      if (bytes === undefined) throw new Error(`objeto ausente: ${origem}`);
      objetos.set(destino, bytes);
    },
    apagar: async (chave: string) => {
      chamadas.push(`apagar ${chave}`);
      objetos.delete(chave);
    },
  };
}

interface RepositorioFalso extends UserRomRepository {
  readonly registradas: NovaRomDoUsuario[];
}

function repositorioFalso(): RepositorioFalso {
  const registradas: NovaRomDoUsuario[] = [];

  return {
    registradas,
    buscarPorHash: async () => null,
    buscarPorId: async () => {
      throw new Error('a confirmação não busca por id');
    },
    registrar: async (rom: NovaRomDoUsuario) => {
      registradas.push(rom);
      return { id: '33333333-3333-4333-8333-333333333333', sha256: rom.sha256 };
    },
    medirUso: async () => {
      // A cota é conferida na autorização do envio (#76), antes de a URL ser
      // assinada. Quando a confirmação chega, os bytes já subiram: medir de
      // novo aqui só recusaria o que já foi pago.
      throw new Error('a confirmação não mede cota');
    },
    contar: async () => {
      throw new Error('a confirmação não conta a biblioteca');
    },
    listar: async () => {
      throw new Error('a confirmação não lista a biblioteca');
    },
    apagarReferencia: async () => {
      throw new Error('a confirmação não apaga referência');
    },
    definirFavorito: async () => {
      throw new Error('a confirmação não mexe em favorito');
    },
    listarSemJogoReconhecido: async () => {
      throw new Error('a confirmação não reprocessa reconhecimento');
    },
    atualizarJogoReconhecido: async () => {
      throw new Error('a confirmação não reprocessa reconhecimento');
    },
  };
}

const semCatalogo: IdentificarRomNoCatalogo = async () => null;

/** Registra quem foi avisado, sem fingir que sabe o que `achievements` faz com isso. */
function avisoDeEnvioFalso(): {
  avisados: string[];
  avisarEnvioDeRom: (userId: string) => Promise<void>;
} {
  const avisados: string[] = [];
  return { avisados, avisarEnvioDeRom: async (userId: string) => void avisados.push(userId) };
}

describe('confirmarEnvioDeRom', () => {
  it('promove o objeto para o caminho do conteúdo, cria a referência e avisa o evento', async () => {
    const rom = romDeSnes();
    const armazenamento = armazenamentoFalso(new Map([[QUARENTENA, rom]]));
    const roms = repositorioFalso();
    const aviso = avisoDeEnvioFalso();

    const resposta = await confirmarEnvioDeRom(
      { armazenamento, roms, catalogo: semCatalogo, avisarEnvioDeRom: aviso.avisarEnvioDeRom },
      USUARIO,
      ENVIO,
      'zelda.sfc',
    );
    expect(aviso.avisados).toEqual([USUARIO]);

    const destino = `roms/${sha256De(rom)}`;
    expect(resposta).toEqual({
      status: 'na-biblioteca',
      romId: '33333333-3333-4333-8333-333333333333',
      sha256: sha256De(rom),
      gameId: null,
      sizeBytes: rom.byteLength,
      deduplicado: false,
    });
    // A ordem é a da ADR 0014, e ela não é enfeite: registrar antes de copiar
    // produziria biblioteca com ROM que não baixa.
    expect(armazenamento.chamadas).toEqual([
      `ler ${QUARENTENA}`,
      `copiar ${QUARENTENA} -> ${destino}`,
      `apagar ${QUARENTENA}`,
    ]);
    expect(armazenamento.objetos.has(QUARENTENA)).toBe(false);
    expect(roms.registradas).toEqual([
      {
        userId: USUARIO,
        sha256: sha256De(rom),
        storageKey: destino,
        sizeBytes: rom.byteLength,
        fileName: 'zelda.sfc',
        gameId: null,
      },
    ]);
  });

  it('não transfere nada quando aquele conteúdo já está no storage', async () => {
    // É a economia inteira da ADR 0013: o mesmo jogo na biblioteca de mil
    // pessoas ocupa um objeto. A segunda pessoa não sobe nada — e, do lado de
    // cá, não se copia nada.
    const rom = romDeSnes();
    const destino = `roms/${sha256De(rom)}`;
    const armazenamento = armazenamentoFalso(
      new Map([
        [QUARENTENA, rom],
        [destino, rom],
      ]),
    );
    const roms = repositorioFalso();
    const aviso = avisoDeEnvioFalso();

    const resposta = await confirmarEnvioDeRom(
      { armazenamento, roms, catalogo: semCatalogo, avisarEnvioDeRom: aviso.avisarEnvioDeRom },
      USUARIO,
      ENVIO,
      'zelda.sfc',
    );

    expect(resposta.deduplicado).toBe(true);
    expect(armazenamento.chamadas).toEqual([`ler ${QUARENTENA}`, `apagar ${QUARENTENA}`]);
    expect(roms.registradas[0]?.storageKey).toBe(destino);
    expect(armazenamento.objetos.get(destino)).toBe(rom);
  });

  it('tenta o hash com e sem cabeçalho de copiador contra o catálogo', async () => {
    // A base de metadado cataloga sem o cabeçalho; o arquivo é guardado com
    // ele. Sem tentar os dois, dump de SNES com header nunca reconheceria o
    // jogo — e a capa nunca apareceria sozinha.
    const comHeader = romDeSnes(true);
    const semHeader = romDeSnes();
    const armazenamento = armazenamentoFalso(new Map([[QUARENTENA, comHeader]]));
    const roms = repositorioFalso();

    const perguntados: string[][] = [];
    const catalogo: IdentificarRomNoCatalogo = async (hashes) => {
      perguntados.push([...hashes]);
      return hashes.includes(sha256De(semHeader)) ? { gameId: 'o-jogo' } : null;
    };

    const resposta = await confirmarEnvioDeRom(
      { armazenamento, roms, catalogo, avisarEnvioDeRom: avisoDeEnvioFalso().avisarEnvioDeRom },
      USUARIO,
      ENVIO,
      'zelda.smc',
    );

    expect(perguntados).toEqual([[sha256De(comHeader), sha256De(semHeader)]]);
    expect(resposta.gameId).toBe('o-jogo');
    // O objeto é o arquivo como a pessoa enviou, cabeçalho e tudo (ADR 0013):
    // o hash sem header serve para reconhecer o jogo, nunca para endereçar.
    expect(resposta.sha256).toBe(sha256De(comHeader));
    expect(roms.registradas[0]?.gameId).toBe('o-jogo');
  });

  it('apaga a quarentena e não promove nada quando o conteúdo não passa', async () => {
    const armazenamento = armazenamentoFalso(
      new Map([[QUARENTENA, new Uint8Array(64 * 1024).fill(0x41)]]),
    );
    const roms = repositorioFalso();
    const aviso = avisoDeEnvioFalso();

    const recusa = confirmarEnvioDeRom(
      { armazenamento, roms, catalogo: semCatalogo, avisarEnvioDeRom: aviso.avisarEnvioDeRom },
      USUARIO,
      ENVIO,
      'lixo.sfc',
    );

    await expect(recusa).rejects.toMatchObject({
      status: 422,
      details: { rom: ['CONTEUDO_NAO_RECONHECIDO'] },
    });
    await expect(recusa).rejects.toBeInstanceOf(DomainError);
    expect(armazenamento.objetos.size).toBe(0);
    expect(roms.registradas).toEqual([]);
    // Nada foi promovido: o evento de gamificação não pode acender para
    // uma ROM que a verificação recusou.
    expect(aviso.avisados).toEqual([]);
  });

  it('responde 404 sem ler byte nenhum quando o envio não chegou', async () => {
    const armazenamento = armazenamentoFalso(new Map());
    const roms = repositorioFalso();
    const aviso = avisoDeEnvioFalso();

    await expect(
      confirmarEnvioDeRom(
        { armazenamento, roms, catalogo: semCatalogo, avisarEnvioDeRom: aviso.avisarEnvioDeRom },
        USUARIO,
        ENVIO,
        'a.sfc',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(armazenamento.chamadas).toEqual([]);
    expect(aviso.avisados).toEqual([]);
  });
});
