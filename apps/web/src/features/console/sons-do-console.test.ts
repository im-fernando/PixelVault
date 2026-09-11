import { afterEach, describe, expect, it, vi } from 'vitest';
import { SonsDoConsole } from './sons-do-console.js';

function bancada() {
  let tempo = 0;
  let estado: AudioContextState = 'running';
  let permitido = true;
  let visivel = true;
  const parametro = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const osciladores: ReturnType<typeof oscilador>[] = [];
  function oscilador() {
    return {
      type: 'sine',
      frequency: parametro(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
  }
  const contexto = {
    get state() {
      return estado;
    },
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => {
      const voz = oscilador();
      osciladores.push(voz);
      return voz;
    }),
    createGain: vi.fn(() => ({ gain: parametro(), connect: vi.fn(), disconnect: vi.fn() })),
    resume: vi.fn(async () => {
      estado = 'running';
    }),
    close: vi.fn(async () => {
      estado = 'closed';
    }),
  };
  const criar = vi.fn(() => contexto as unknown as AudioContext);
  const sons = new SonsDoConsole(
    criar,
    () => permitido,
    () => visivel,
    () => tempo,
  );
  return {
    sons,
    contexto,
    criar,
    osciladores,
    passar: (ms: number) => {
      tempo += ms;
    },
    estado: (valor: AudioContextState) => {
      estado = valor;
    },
    permitir: (valor: boolean) => {
      permitido = valor;
    },
    mostrar: (valor: boolean) => {
      visivel = valor;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('sons da interface do console', () => {
  it('não cria áudio no carregamento nem quando a preferência está desativada', async () => {
    const b = bancada();
    expect(b.criar).not.toHaveBeenCalled();
    b.sons.configurar('aurora', false);
    await b.sons.tocar('confirmar');
    expect(b.criar).not.toHaveBeenCalled();
  });
  it('exige interação e não insiste em resume quando o navegador bloqueia', async () => {
    const b = bancada();
    b.permitir(false);
    expect(await b.sons.tocar('navegar')).toBe('bloqueado');
    expect(await b.sons.tocar('confirmar')).toBe('bloqueado');
    expect(b.criar).not.toHaveBeenCalled();
    expect(b.contexto.resume).not.toHaveBeenCalled();
  });
  it('reutiliza contexto, limita bipes duplicados e dá um timbre a cada tema', async () => {
    const b = bancada();
    for (const tema of ['aurora', 'obsidian', 'solstice', 'crt'] as const) {
      b.sons.configurar(tema, true);
      await b.sons.tocar('navegar');
      await b.sons.tocar('navegar');
      b.passar(100);
    }
    expect(b.criar).toHaveBeenCalledOnce();
    expect(b.osciladores.map((o) => o.type)).toEqual(['sine', 'triangle', 'sine', 'square']);
    expect(
      new Set(b.osciladores.map((o) => o.frequency.setValueAtTime.mock.calls[0]?.[0])).size,
    ).toBe(4);
  });
  it('desconecta as vozes ao terminar e cala imediatamente ao desativar', async () => {
    const b = bancada();
    await b.sons.tocar('confirmar');
    b.sons.configurar('aurora', false);
    for (const voz of b.osciladores) {
      expect(voz.stop).toHaveBeenCalledTimes(2);
      voz.onended?.();
      expect(voz.disconnect).toHaveBeenCalledOnce();
    }
  });
  it('uma retomada atrasada não toca ações acumuladas nem ignora o mute', async () => {
    const b = bancada();
    b.estado('suspended');
    let liberar = () => undefined as void;
    b.contexto.resume.mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          liberar = () => {
            b.estado('running');
            resolver();
          };
        }),
    );
    const primeiro = b.sons.tocar('navegar');
    const segundo = b.sons.tocar('confirmar');
    expect(b.contexto.resume).toHaveBeenCalledOnce();
    b.sons.configurar('aurora', false);
    liberar();
    await Promise.all([primeiro, segundo]);
    expect(b.osciladores).toHaveLength(0);
  });
  it('não toca com a aba oculta e falha de áudio não quebra a navegação', async () => {
    const b = bancada();
    b.mostrar(false);
    expect(await b.sons.tocar('navegar')).toBe('ok');
    expect(b.criar).not.toHaveBeenCalled();
    b.mostrar(true);
    b.criar.mockImplementation(() => {
      throw new Error('Sem dispositivo');
    });
    expect(await b.sons.tocar('navegar')).toBe('indisponivel');
  });
  it('preserva o contexto entre biblioteca e partida e fecha ao sair do console', async () => {
    vi.useFakeTimers();
    const b = bancada();
    const sairDaBiblioteca = b.sons.usar();
    await b.sons.tocar('iniciar');
    sairDaBiblioteca();
    await vi.advanceTimersByTimeAsync(100);
    const sairDaPartida = b.sons.usar();
    await vi.advanceTimersByTimeAsync(600);
    expect(b.contexto.close).not.toHaveBeenCalled();
    sairDaPartida();
    await vi.advanceTimersByTimeAsync(500);
    expect(b.contexto.close).toHaveBeenCalledOnce();
  });
});
