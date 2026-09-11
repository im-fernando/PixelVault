import { describe, expect, it } from 'vitest';
import type { IdentificarRomNoCatalogo } from '../domain/catalogo-de-roms.js';
import type { RomSemJogoReconhecido, UserRomRepository } from '../domain/user-rom-repository.js';
import { reprocessarReconhecimento } from './reprocessar-reconhecimento.js';

/**
 * A coreografia sem banco: o que reconhece, o que não muda e a contagem que
 * a rota administrativa devolve.
 *
 * `catalogo` é a mesma porta que `confirmar-envio-de-rom.test.ts` já
 * implementa à mão — aqui ela dobra como o próprio `identificarRomPorHash` no
 * caminho de produção, gatilho de busca de capa incluído. Este arquivo não
 * reafirma a busca de capa (isso é `garantir-capa-do-jogo.test.ts`); afirma
 * que o reprocessamento chama a porta certa, com o hash certo, e só grava o
 * que casou.
 */

interface RepositorioFalso extends Pick<
  UserRomRepository,
  'listarSemJogoReconhecido' | 'atualizarJogoReconhecido'
> {
  readonly atualizacoes: { romId: string; gameId: string }[];
}

function repositorioFalso(semJogo: RomSemJogoReconhecido[]): RepositorioFalso {
  const atualizacoes: { romId: string; gameId: string }[] = [];

  return {
    atualizacoes,
    listarSemJogoReconhecido: async () => semJogo,
    atualizarJogoReconhecido: async (romId: string, gameId: string) => {
      atualizacoes.push({ romId, gameId });
    },
  };
}

describe('reprocessarReconhecimento', () => {
  it('liga o game_id de quem casa e deixa o resto como estava', async () => {
    const roms = repositorioFalso([
      { id: 'rom-donkey', sha256: 'hash-donkey', md5: 'md5-donkey' },
      { id: 'rom-desconhecida', sha256: 'hash-sem-dono', md5: null },
    ]);
    const perguntados: { sha256: string[]; md5: string[] }[] = [];
    const catalogo: IdentificarRomNoCatalogo = async (hashes) => {
      perguntados.push({ sha256: [...hashes.sha256], md5: [...hashes.md5] });
      return hashes.sha256.includes('hash-donkey') ? { gameId: 'jogo-donkey-kong-country' } : null;
    };

    const resultado = await reprocessarReconhecimento({ roms, catalogo });

    expect(resultado).toEqual({ analisadas: 2, reconhecidas: 1 });
    expect(roms.atualizacoes).toEqual([
      { romId: 'rom-donkey', gameId: 'jogo-donkey-kong-country' },
    ]);
    expect(perguntados).toEqual([
      { sha256: ['hash-donkey'], md5: ['md5-donkey'] },
      { sha256: ['hash-sem-dono'], md5: [] },
    ]);
  });

  it('não atualiza nada e não estoura quando nenhuma ROM casa', async () => {
    const roms = repositorioFalso([
      { id: 'rom-homebrew-obscuro', sha256: 'hash-nunca-catalogado', md5: null },
    ]);
    const semCatalogo: IdentificarRomNoCatalogo = async () => null;

    const resultado = await reprocessarReconhecimento({ roms, catalogo: semCatalogo });

    expect(resultado).toEqual({ analisadas: 1, reconhecidas: 0 });
    expect(roms.atualizacoes).toEqual([]);
  });

  it('devolve zero a zero sem perguntar nada ao catálogo quando não há o que reprocessar', async () => {
    const roms = repositorioFalso([]);
    let perguntou = false;
    const catalogo: IdentificarRomNoCatalogo = async () => {
      perguntou = true;
      return null;
    };

    const resultado = await reprocessarReconhecimento({ roms, catalogo });

    expect(resultado).toEqual({ analisadas: 0, reconhecidas: 0 });
    expect(perguntou).toBe(false);
  });
});
