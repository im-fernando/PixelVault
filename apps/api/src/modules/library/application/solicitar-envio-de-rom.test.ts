import { describe, expect, it } from 'vitest';
import { COTA_DE_ARMAZENAMENTO_EM_BYTES, COTA_DE_ROMS_POR_CONTA } from '@pixelvault/contracts';
import { DomainError } from '../../../infrastructure/errors.js';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import type { UsoDaBiblioteca } from '../domain/cota.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';
import { solicitarEnvioDeRom } from './solicitar-envio-de-rom.js';

/**
 * A cota da #76 sem banco nem storage.
 *
 * O que este arquivo afirma e nenhum teste de integração afirma com clareza é
 * o **silêncio da porta de storage**: quando a cota estoura, nada é assinado
 * porque nada é pedido. Que o MinIO assinaria de boa vontade não é o ponto; o
 * ponto é não pedir — a recusa acontece antes de a assinatura existir, e não
 * depois, com o cliente descobrindo pelo caminho.
 */

const USUARIO = '11111111-1111-4111-8111-111111111111';
const UM_MEGA = 1024 * 1024;

interface ArmazenamentoFalso extends ArmazenamentoDeObjetos {
  readonly chamadas: string[];
}

/** Toda porta grita. Uma chamada indevida vira falha, não passa despercebida. */
function armazenamentoFalso(): ArmazenamentoFalso {
  const chamadas: string[] = [];

  return {
    chamadas,
    assinarEnvio: async (chave: string) => {
      chamadas.push(`assinarEnvio ${chave}`);
      return `https://storage.exemplo.test/${chave}?assinatura=falsa`;
    },
    assinarLeitura: async (chave: string) => {
      chamadas.push(`assinarLeitura ${chave}`);
      return `https://storage.exemplo.test/${chave}`;
    },
    escrever: async () => {
      throw new Error('a autorização de envio não escreve nada');
    },
    ler: async () => {
      throw new Error('a autorização de envio não lê nada');
    },
    existe: async () => {
      throw new Error('a autorização de envio não consulta o bucket');
    },
    copiar: async () => {
      throw new Error('a autorização de envio não copia nada');
    },
    apagar: async () => {
      throw new Error('a autorização de envio não apaga nada');
    },
  };
}

function repositorioFalso(uso: UsoDaBiblioteca): UserRomRepository {
  return {
    buscarPorHash: async () => null,
    registrar: async () => {
      throw new Error('a autorização de envio não registra nada');
    },
    buscarPorId: async () => {
      throw new Error('a autorização de envio não busca por id');
    },
    medirUso: async () => uso,
    listar: async () => {
      throw new Error('a autorização de envio não lista a biblioteca');
    },
    apagarReferencia: async () => {
      throw new Error('a autorização de envio não apaga referência');
    },
    definirFavorito: async () => {
      throw new Error('a autorização de envio não mexe em favorito');
    },
  };
}

async function pedir(
  uso: UsoDaBiblioteca,
  sizeBytes: number,
  armazenamento: ArmazenamentoFalso,
): Promise<unknown> {
  return solicitarEnvioDeRom({ roms: repositorioFalso(uso), armazenamento }, USUARIO, {
    sizeBytes,
  });
}

describe('solicitarEnvioDeRom, do lado da cota', () => {
  it('assina para quem tem espaço', async () => {
    const armazenamento = armazenamentoFalso();

    const resposta = await pedir({ bytes: 2 * 1024 ** 3, quantidade: 300 }, UM_MEGA, armazenamento);

    expect(resposta).toMatchObject({ status: 'envio-autorizado', sizeBytes: UM_MEGA });
    expect(armazenamento.chamadas).toHaveLength(1);
  });

  it('recusa a biblioteca cheia sem pedir assinatura nenhuma', async () => {
    const armazenamento = armazenamentoFalso();
    const cheia = { bytes: COTA_DE_ARMAZENAMENTO_EM_BYTES, quantidade: 64 };

    const erro = await pedir(cheia, UM_MEGA, armazenamento).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(DomainError);
    const domainError = erro as DomainError;
    expect(domainError.status).toBe(409);
    expect(domainError.code).toBe('CONFLICT');
    expect(domainError.details).toEqual({ cota: ['LIMITE_DE_BYTES'] });
    // A afirmação que importa: a porta de storage não foi tocada.
    expect(armazenamento.chamadas).toEqual([]);
  });

  it('recusa o arquivo que não cabe no que sobrou, e não só a cota estourada', async () => {
    const armazenamento = armazenamentoFalso();
    const quaseCheia = { bytes: COTA_DE_ARMAZENAMENTO_EM_BYTES - UM_MEGA, quantidade: 500 };

    await expect(pedir(quaseCheia, 2 * UM_MEGA, armazenamento)).rejects.toMatchObject({
      status: 409,
      details: { cota: ['LIMITE_DE_BYTES'] },
    });
    // ...e o que cabe continua passando, no mesmo estado de biblioteca.
    await expect(pedir(quaseCheia, UM_MEGA, armazenamento)).resolves.toMatchObject({
      status: 'envio-autorizado',
    });
  });

  it('recusa por quantidade quem tem bytes de sobra', async () => {
    const armazenamento = armazenamentoFalso();
    const muitasEPequenas = { bytes: UM_MEGA, quantidade: COTA_DE_ROMS_POR_CONTA };

    await expect(pedir(muitasEPequenas, 192, armazenamento)).rejects.toMatchObject({
      status: 409,
      details: { cota: ['LIMITE_DE_ARQUIVOS'] },
    });
    expect(armazenamento.chamadas).toEqual([]);
  });

  it('quem já tem o conteúdo recebe o atalho mesmo com a biblioteca cheia', async () => {
    // O atalho do hash responde "você já tem esse" e não faz a biblioteca
    // crescer um byte. Recusá-lo por cota seria negar à pessoa o que já é
    // dela — e ainda por cima mandá-la enviar de novo o que não precisa.
    const armazenamento = armazenamentoFalso();
    const roms: UserRomRepository = {
      buscarPorHash: async () => ({ id: 'rom-1', sha256: 'a'.repeat(64) }),
      registrar: async () => {
        throw new Error('não deveria registrar');
      },
      buscarPorId: async () => {
        throw new Error('a autorização de envio não busca por id');
      },
      medirUso: async () => {
        throw new Error('o atalho do hash responde antes de medir a cota');
      },
      listar: async () => {
        throw new Error('a autorização de envio não lista a biblioteca');
      },
      apagarReferencia: async () => {
        throw new Error('a autorização de envio não apaga referência');
      },
      definirFavorito: async () => {
        throw new Error('a autorização de envio não mexe em favorito');
      },
    };

    const resposta = await solicitarEnvioDeRom({ roms, armazenamento }, USUARIO, {
      sizeBytes: UM_MEGA,
      sha256: 'a'.repeat(64),
    });

    expect(resposta).toEqual({ status: 'ja-na-biblioteca', romId: 'rom-1' });
    expect(armazenamento.chamadas).toEqual([]);
  });
});
