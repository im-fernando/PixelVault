import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { SaveQuotaExceededError, isSaveStorageError } from './errors.js';
import { IndexedDbSaveStorage } from './indexeddb-save-storage.js';
import { MemorySaveStorage } from './memory-save-storage.js';
import { OpfsSaveStorage } from './opfs-save-storage.js';
import { sramKey, stateKey } from './save-key.js';
import type { SaveStorage } from './save-storage.js';

const ROM = 'a'.repeat(64);
const OUTRA_ROM = 'b'.repeat(64);
const SRAM = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const STATE = new Uint8Array([0x50, 0x56, 0x46, 0x4b, 9, 9, 9]);

/**
 * Duplo em memória da FileSystem Access API.
 *
 * Vitest roda em Node, onde não existe OPFS. Sem isto, o `OpfsSaveStorage`
 * seria o único implementador da porta que nenhum teste jamais executa — e ele
 * é justamente o que carrega o protocolo de commit por arquivo de metadados.
 *
 * O que este duplo prova: montagem de caminho, ordem de escrita, tolerância a
 * `NotFoundError` e tradução de cota. O que ele **não** prova: o comportamento
 * do OPFS de verdade (concorrência entre abas, limites do navegador, `close()`
 * assíncrono). Isso só o navegador diz.
 */
class DiretorioFalso {
  readonly kind = 'directory';
  readonly diretorios = new Map<string, DiretorioFalso>();
  readonly arquivos = new Map<string, ArquivoFalso>();

  constructor(
    readonly name: string,
    readonly disco: DiscoFalso,
  ) {}

  async getDirectoryHandle(nome: string, opcoes?: { create?: boolean }): Promise<DiretorioFalso> {
    const existente = this.diretorios.get(nome);
    if (existente !== undefined) {
      return existente;
    }
    if (opcoes?.create !== true) {
      throw new DOMException(`sem diretório ${nome}`, 'NotFoundError');
    }
    const novo = new DiretorioFalso(nome, this.disco);
    this.diretorios.set(nome, novo);
    return novo;
  }

  async getFileHandle(nome: string, opcoes?: { create?: boolean }): Promise<ArquivoFalso> {
    const existente = this.arquivos.get(nome);
    if (existente !== undefined) {
      return existente;
    }
    if (opcoes?.create !== true) {
      throw new DOMException(`sem arquivo ${nome}`, 'NotFoundError');
    }
    const novo = new ArquivoFalso(nome, this.disco);
    this.arquivos.set(nome, novo);
    return novo;
  }

  async removeEntry(nome: string): Promise<void> {
    const arquivo = this.arquivos.get(nome);
    if (arquivo !== undefined) {
      this.disco.usados -= arquivo.conteudo.byteLength;
      this.arquivos.delete(nome);
      return;
    }
    if (!this.diretorios.delete(nome)) {
      throw new DOMException(`sem entrada ${nome}`, 'NotFoundError');
    }
  }

  async *entries(): AsyncGenerator<[string, DiretorioFalso | ArquivoFalso]> {
    yield* this.arquivos.entries();
    yield* this.diretorios.entries();
  }
}

class ArquivoFalso {
  readonly kind = 'file';
  conteudo = new Uint8Array(0);

  constructor(
    readonly name: string,
    readonly disco: DiscoFalso,
  ) {}

  async getFile(): Promise<File> {
    return new File([this.conteudo], this.name);
  }

  async createWritable(): Promise<FluxoFalso> {
    return new FluxoFalso(this);
  }
}

class FluxoFalso {
  readonly #pedacos: Uint8Array[] = [];
  #abortado = false;

  constructor(readonly arquivo: ArquivoFalso) {}

  async write(pedaco: ArrayBuffer | Blob): Promise<void> {
    const bytes =
      pedaco instanceof Blob ? new Uint8Array(await pedaco.arrayBuffer()) : new Uint8Array(pedaco);
    this.#pedacos.push(bytes);
  }

  async abort(): Promise<void> {
    this.#abortado = true;
  }

  async close(): Promise<void> {
    if (this.#abortado) {
      return;
    }
    const total = this.#pedacos.reduce((soma, pedaco) => soma + pedaco.byteLength, 0);
    const disco = this.arquivo.disco;
    const novosUsados = disco.usados - this.arquivo.conteudo.byteLength + total;
    if (novosUsados > disco.limiteDeBytes) {
      throw new DOMException('cota estourada', 'QuotaExceededError');
    }

    const conteudo = new Uint8Array(total);
    let offset = 0;
    for (const pedaco of this.#pedacos) {
      conteudo.set(pedaco, offset);
      offset += pedaco.byteLength;
    }
    this.arquivo.conteudo = conteudo;
    disco.usados = novosUsados;
  }
}

class DiscoFalso {
  usados = 0;
  limiteDeBytes = Number.MAX_SAFE_INTEGER;
  readonly raiz = new DiretorioFalso('', this);
}

function raizFalsa(disco: DiscoFalso): () => Promise<FileSystemDirectoryHandle> {
  return () => Promise.resolve(disco.raiz as unknown as FileSystemDirectoryHandle);
}

/**
 * O contrato da porta, rodado contra todo implementador.
 *
 * Uma suíte por backend divergiria: a de OPFS testaria arquivo, a de IndexedDB
 * testaria transação, e nenhuma das duas afirmaria que os dois se comportam
 * igual — que é a única coisa que o player pode assumir.
 */
function suiteDaPorta(nome: string, criar: () => Promise<SaveStorage>): void {
  describe(`SaveStorage (${nome})`, () => {
    it('devolve null para chave que nunca foi gravada', async () => {
      const storage = await criar();
      expect(await storage.read(sramKey(ROM))).toBeNull();
      expect(await storage.read(stateKey(ROM, 1))).toBeNull();
      expect(await storage.readThumbnail(stateKey(ROM, 1))).toBeNull();
      expect(await storage.list(ROM)).toEqual([]);
    });

    it('devolve a SRAM byte a byte depois de gravar', async () => {
      const storage = await criar();
      const metadata = await storage.write({
        key: sramKey(ROM),
        data: SRAM,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1_700_000_000_000,
      });

      expect(metadata).toMatchObject({
        kind: 'sram',
        romId: ROM,
        byteLength: SRAM.byteLength,
        hasThumbnail: false,
        updatedAt: 1_700_000_000_000,
      });
      expect(metadata.slot).toBeUndefined();

      const lido = await storage.read(sramKey(ROM));
      expect(lido?.data).toEqual(SRAM);
      expect(lido?.thumbnail).toBeNull();
    });

    it('mantém os quatro slots de state independentes', async () => {
      const storage = await criar();
      for (const slot of [0, 1, 2, 3] as const) {
        await storage.write({
          key: stateKey(ROM, slot),
          data: new Uint8Array([...STATE, slot]),
          systemId: 'snes',
          coreVersion: 'fake-1.0.0',
          updatedAt: 1_700_000_000_000 + slot,
        });
      }

      for (const slot of [0, 1, 2, 3] as const) {
        const lido = await storage.read(stateKey(ROM, slot));
        expect(lido?.data).toEqual(new Uint8Array([...STATE, slot]));
        expect(lido?.metadata.slot).toBe(slot);
      }
    });

    it('não confunde SRAM com save state na mesma ROM', async () => {
      const storage = await criar();
      await storage.write({
        key: sramKey(ROM),
        data: SRAM,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
      });
      await storage.write({
        key: stateKey(ROM, 0),
        data: STATE,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 2,
      });

      expect((await storage.read(sramKey(ROM)))?.data).toEqual(SRAM);
      expect((await storage.read(stateKey(ROM, 0)))?.data).toEqual(STATE);
      const kinds = (await storage.list(ROM)).map((meta) => meta.kind).sort();
      expect(kinds).toEqual(['sram', 'state']);
    });

    it('não mistura saves de ROMs diferentes', async () => {
      const storage = await criar();
      await storage.write({
        key: stateKey(ROM, 0),
        data: STATE,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
      });
      await storage.write({
        key: stateKey(OUTRA_ROM, 0),
        data: new Uint8Array([42]),
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 2,
      });

      expect(await storage.list(ROM)).toHaveLength(1);
      expect((await storage.read(stateKey(OUTRA_ROM, 0)))?.data).toEqual(new Uint8Array([42]));
    });

    it('lê a miniatura sem arrastar os bytes do save', async () => {
      const storage = await criar();
      const miniatura = new Blob(['miniatura'], { type: 'image/webp' });
      await storage.write({
        key: stateKey(ROM, 2),
        data: STATE,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
        thumbnail: miniatura,
      });

      const so = await storage.readThumbnail(stateKey(ROM, 2));
      expect(await so?.text()).toBe('miniatura');
      const lido = await storage.read(stateKey(ROM, 2));
      expect(lido?.metadata.hasThumbnail).toBe(true);
      expect(await lido?.thumbnail?.text()).toBe('miniatura');
    });

    it('substitui o save anterior, inclusive apagando a miniatura', async () => {
      const storage = await criar();
      await storage.write({
        key: stateKey(ROM, 1),
        data: STATE,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
        thumbnail: new Blob(['antiga'], { type: 'image/webp' }),
      });
      await storage.write({
        key: stateKey(ROM, 1),
        data: new Uint8Array([7]),
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 2,
      });

      const lido = await storage.read(stateKey(ROM, 1));
      expect(lido?.data).toEqual(new Uint8Array([7]));
      expect(lido?.metadata.hasThumbnail).toBe(false);
      expect(lido?.thumbnail).toBeNull();
      expect(await storage.readThumbnail(stateKey(ROM, 1))).toBeNull();
    });

    it('apaga, e apagar o que não existe é sucesso', async () => {
      const storage = await criar();
      await storage.write({
        key: stateKey(ROM, 3),
        data: STATE,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
      });
      await storage.remove(stateKey(ROM, 3));
      expect(await storage.read(stateKey(ROM, 3))).toBeNull();
      await expect(storage.remove(stateKey(ROM, 3))).resolves.toBeUndefined();
    });

    it('devolve os bytes numa cópia, e não numa janela sobre o que está guardado', async () => {
      const storage = await criar();
      await storage.write({
        key: sramKey(ROM),
        data: SRAM,
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
      });

      const primeiro = await storage.read(sramKey(ROM));
      primeiro?.data.fill(0xff);
      expect((await storage.read(sramKey(ROM)))?.data).toEqual(SRAM);
    });
  });
}

suiteDaPorta('memória', () => Promise.resolve(new MemorySaveStorage()));
suiteDaPorta('IndexedDB', () => IndexedDbSaveStorage.open(new IDBFactory()));
suiteDaPorta('OPFS (duplo em memória)', () => OpfsSaveStorage.open(raizFalsa(new DiscoFalso())));

describe('SaveStorage — cota estourada', () => {
  it('traduz a cota do OPFS para SaveQuotaExceededError', async () => {
    const disco = new DiscoFalso();
    disco.limiteDeBytes = 16;
    const storage = await OpfsSaveStorage.open(raizFalsa(disco));

    const erro = await storage
      .write({
        key: sramKey(ROM),
        data: new Uint8Array(64),
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
      })
      .catch((causa: unknown) => causa);

    expect(erro).toBeInstanceOf(SaveQuotaExceededError);
    expect(isSaveStorageError(erro) && erro.code).toBe('QUOTA_EXCEEDED');
    expect(isSaveStorageError(erro) && erro.message).toContain('Apague save states antigos');
  });

  it('o fallback em memória também respeita um teto', async () => {
    const storage = new MemorySaveStorage({ maxBytes: 4 });
    await expect(
      storage.write({
        key: sramKey(ROM),
        data: new Uint8Array(64),
        systemId: 'snes',
        coreVersion: 'fake-1.0.0',
        updatedAt: 1,
      }),
    ).rejects.toBeInstanceOf(SaveQuotaExceededError);
  });
});

describe('OpfsSaveStorage — protocolo de commit', () => {
  it('trata bytes sem metadados como save ausente', async () => {
    const disco = new DiscoFalso();
    const storage = await OpfsSaveStorage.open(raizFalsa(disco));
    await storage.write({
      key: sramKey(ROM),
      data: SRAM,
      systemId: 'snes',
      coreVersion: 'fake-1.0.0',
      updatedAt: 1,
    });

    // Simula a aba fechada entre escrever os bytes e escrever o commit.
    const pastaDaRom = await (
      await disco.raiz.getDirectoryHandle('pixelvault-saves')
    ).getDirectoryHandle(ROM);
    await pastaDaRom.removeEntry('sram.json');

    expect(await storage.read(sramKey(ROM))).toBeNull();
    expect(await storage.list(ROM)).toEqual([]);
  });

  it('ignora na listagem um arquivo de metadados ilegível', async () => {
    const disco = new DiscoFalso();
    const storage = await OpfsSaveStorage.open(raizFalsa(disco));
    await storage.write({
      key: stateKey(ROM, 0),
      data: STATE,
      systemId: 'snes',
      coreVersion: 'fake-1.0.0',
      updatedAt: 1,
    });

    const pastaDaRom = await (
      await disco.raiz.getDirectoryHandle('pixelvault-saves')
    ).getDirectoryHandle(ROM);
    const handle = await pastaDaRom.getFileHandle('state-0.json');
    handle.conteudo = new TextEncoder().encode('{ isto não é json');

    expect(await storage.list(ROM)).toEqual([]);
  });
});
