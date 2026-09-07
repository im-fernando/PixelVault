import { afterEach, describe, expect, it, vi } from 'vitest';
import { coletarAudioContexts, fecharAudioContexts } from './audio-contexts.js';

class AudioContextFalso {
  static resumes = 0;
  state: 'running' | 'closed' | 'suspended' = 'running';

  close(): Promise<void> {
    if (this.state === 'closed') {
      return Promise.reject(new Error('já fechado'));
    }
    this.state = 'closed';
    return Promise.resolve();
  }

  resume(): Promise<void> {
    AudioContextFalso.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

function instalarFalso(): void {
  vi.stubGlobal('AudioContext', AudioContextFalso);
}

afterEach(() => {
  vi.unstubAllGlobals();
  AudioContextFalso.resumes = 0;
});

describe('coletarAudioContexts', () => {
  it('registra o que for criado enquanto está ativo', () => {
    instalarFalso();
    const original = globalThis.AudioContext;
    const coletor = coletarAudioContexts();

    const contexto = new globalThis.AudioContext();

    expect(coletor.contextos).toEqual([contexto]);

    coletor.parar();
    expect(globalThis.AudioContext).toBe(original);
  });

  it('não registra nada depois de parar — é o que impede fechar contexto alheio', () => {
    instalarFalso();
    const coletor = coletarAudioContexts();
    coletor.parar();

    new globalThis.AudioContext();

    expect(coletor.contextos).toEqual([]);
  });

  it('entrega o contexto novo ao coletor mais recente', () => {
    instalarFalso();
    const primeiro = coletarAudioContexts();
    const segundo = coletarAudioContexts();

    const contexto = new globalThis.AudioContext();

    expect(segundo.contextos).toEqual([contexto]);
    expect(primeiro.contextos).toEqual([]);
    segundo.parar();
    primeiro.parar();
  });

  it('só devolve o construtor original quando o último coletor sai', () => {
    instalarFalso();
    const original = globalThis.AudioContext;
    const primeiro = coletarAudioContexts();
    const segundo = coletarAudioContexts();

    segundo.parar();
    expect(globalThis.AudioContext).not.toBe(original);

    primeiro.parar();
    expect(globalThis.AudioContext).toBe(original);
  });

  it('parar duas vezes não desfaz o que não é dele', () => {
    instalarFalso();
    const original = globalThis.AudioContext;
    const coletor = coletarAudioContexts();
    coletor.parar();
    const outro = coletarAudioContexts();
    coletor.parar();

    expect(globalThis.AudioContext).not.toBe(original);
    outro.parar();
  });

  it('avisa quem criou, para o barramento entrar antes do primeiro buffer', () => {
    instalarFalso();
    const vistos: AudioContext[] = [];
    const coletor = coletarAudioContexts({
      aoCriar: (contexto) => {
        vistos.push(contexto);
      },
    });

    const contexto = new globalThis.AudioContext();

    expect(vistos).toEqual([contexto]);
    coletor.parar();
  });

  it('segura o resume que não tem chance — é o que esvazia o console do Chrome', async () => {
    instalarFalso();
    let liberado = false;
    const coletor = coletarAudioContexts({ podeRetomar: () => liberado });
    const contexto = new globalThis.AudioContext();

    await contexto.resume();
    await contexto.resume();
    expect(AudioContextFalso.resumes).toBe(0);

    liberado = true;
    await contexto.resume();
    expect(AudioContextFalso.resumes).toBe(1);

    coletor.parar();
  });

  it('sem `podeRetomar`, o resume passa direto — é o comportamento de antes', async () => {
    instalarFalso();
    const coletor = coletarAudioContexts();

    await new globalThis.AudioContext().resume();

    expect(AudioContextFalso.resumes).toBe(1);
    coletor.parar();
  });

  it('não estoura quando o ambiente não tem AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);

    const coletor = coletarAudioContexts();

    expect(coletor.contextos).toEqual([]);
    expect(() => {
      coletor.parar();
    }).not.toThrow();
  });
});

describe('fecharAudioContexts', () => {
  it('fecha todos e engole quem já estava fechado', async () => {
    const abertos = [new AudioContextFalso(), new AudioContextFalso()];
    abertos[1]!.state = 'closed';

    await expect(
      fecharAudioContexts(abertos as unknown as AudioContext[]),
    ).resolves.toBeUndefined();

    expect(abertos[0]!.state).toBe('closed');
  });
});
