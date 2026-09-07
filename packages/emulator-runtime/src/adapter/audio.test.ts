import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUDIO_SETTINGS,
  browserAudioSettingsStore,
  clampVolume,
  memoryAudioSettingsStore,
} from './audio.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function comLocalStorage(inicial: Record<string, string> = {}): Map<string, string> {
  const mapa = new Map(Object.entries(inicial));
  vi.stubGlobal('localStorage', {
    getItem: (chave: string) => mapa.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      mapa.set(chave, valor);
    },
  });
  return mapa;
}

describe('clampVolume', () => {
  it('grampeia em vez de estourar — slider de UI erra por arredondamento', () => {
    expect(clampVolume(1.0000001)).toBe(1);
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(0.35)).toBe(0.35);
  });

  it('valor que não é número vira o padrão, e não NaN no ganho', () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_AUDIO_SETTINGS.volume);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_AUDIO_SETTINGS.volume);
  });
});

describe('browserAudioSettingsStore', () => {
  it('guarda e devolve a preferência', () => {
    comLocalStorage();
    const store = browserAudioSettingsStore();

    store.save({ volume: 0.4, muted: true });

    expect(store.load()).toEqual({ volume: 0.4, muted: true });
  });

  it('sem nada guardado devolve null, para o chamador aplicar o padrão dele', () => {
    comLocalStorage();

    expect(browserAudioSettingsStore().load()).toBeNull();
  });

  it('conteúdo corrompido não derruba o jogo', () => {
    comLocalStorage({ 'pixelvault:audio': '{ isto não é json' });

    expect(browserAudioSettingsStore().load()).toBeNull();
  });

  it('volume fora da faixa que alguém escreveu à mão é grampeado na leitura', () => {
    comLocalStorage({ 'pixelvault:audio': JSON.stringify({ volume: 12, muted: 'sim' }) });

    expect(browserAudioSettingsStore().load()).toEqual({ volume: 1, muted: false });
  });

  it('storage que estoura (navegação privada) é silêncio, não exceção', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('acesso negado');
      },
      setItem: () => {
        throw new Error('acesso negado');
      },
    });
    const store = browserAudioSettingsStore();

    expect(store.load()).toBeNull();
    expect(() => {
      store.save({ volume: 0.5, muted: false });
    }).not.toThrow();
  });

  it('ambiente sem localStorage nenhum também não estoura', () => {
    vi.stubGlobal('localStorage', undefined);
    const store = browserAudioSettingsStore();

    expect(store.load()).toBeNull();
    expect(() => {
      store.save(DEFAULT_AUDIO_SETTINGS);
    }).not.toThrow();
  });
});

describe('memoryAudioSettingsStore', () => {
  it('começa com o que recebeu e guarda o que salvarem', () => {
    const store = memoryAudioSettingsStore({ volume: 0.1, muted: true });

    expect(store.load()).toEqual({ volume: 0.1, muted: true });

    store.save({ volume: 0.9, muted: false });
    expect(store.load()).toEqual({ volume: 0.9, muted: false });
  });
});
