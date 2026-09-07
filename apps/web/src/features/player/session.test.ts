import { describe, expect, it, vi } from 'vitest';
import { EmulatorRegistry, romFromUrl, type EmulatorStatus } from '@pixelvault/emulator-runtime';
import { FakeAdapter } from '@pixelvault/emulator-runtime/testing';
import { SessaoDeEmulacao, type ParametrosDaSessao } from './session.js';

const ROM = romFromUrl('/roms/sure-instinct/sure-instinct.sfc', {
  fileName: 'sure-instinct.sfc',
});

/** O FakeAdapter só guarda a referência do canvas, então um objeto vazio basta. */
const CANVAS = {} as HTMLCanvasElement;

interface Bancada {
  readonly registry: EmulatorRegistry;
  readonly criados: FakeAdapter[];
  parametros(extras?: Partial<ParametrosDaSessao>): ParametrosDaSessao;
}

function bancada(opcoes: { falharAoMontar?: boolean } = {}): Bancada {
  const registry = new EmulatorRegistry();
  const criados: FakeAdapter[] = [];

  registry.register('snes', () => {
    const adapter = new FakeAdapter(
      opcoes.falharAoMontar === true ? { failures: { mount: true } } : {},
    );
    criados.push(adapter);
    return adapter;
  });

  return {
    registry,
    criados,
    parametros: (extras = {}) => ({
      registry,
      systemId: 'snes',
      rom: ROM,
      canvas: CANVAS,
      iniciarAutomaticamente: true,
      ...extras,
    }),
  };
}

describe('SessaoDeEmulacao', () => {
  it('vai de create a running sem o componente saber a ordem dos passos', async () => {
    const { registry, parametros } = bancada();
    expect(registry.supports('snes')).toBe(true);

    const sessao = SessaoDeEmulacao.iniciar(parametros());
    await sessao.pronta;

    expect(sessao.adapter?.status).toBe('running');
    await sessao.descartar();
  });

  it('não inicia sozinha quando a aba está oculta — para a ROM ficar em ready', async () => {
    const { parametros } = bancada();
    const sessao = SessaoDeEmulacao.iniciar(parametros({ iniciarAutomaticamente: false }));
    await sessao.pronta;

    expect(sessao.adapter?.status).toBe('ready');
    await sessao.descartar();
  });

  it('descarte depois do boot destrói o adapter', async () => {
    const { criados, parametros } = bancada();
    const sessao = SessaoDeEmulacao.iniciar(parametros());
    await sessao.pronta;
    await sessao.descartar();

    expect(criados).toHaveLength(1);
    expect(criados[0]?.status).toBe('destroyed');
    expect(sessao.adapter).toBeNull();
  });

  it('descarte no meio do boot não deixa adapter órfão — é o caso do StrictMode', async () => {
    const { criados, parametros } = bancada();
    const sessao = SessaoDeEmulacao.iniciar(parametros());

    // Sem `await sessao.pronta`: o descarte chega enquanto o create ainda está
    // pendente, exatamente como o cleanup do primeiro efeito do StrictMode.
    await sessao.descartar();

    expect(criados).toHaveLength(1);
    expect(criados[0]?.status).toBe('destroyed');
    expect(sessao.adapter).toBeNull();
  });

  it('descartar duas vezes não estoura', async () => {
    const { parametros } = bancada();
    const sessao = SessaoDeEmulacao.iniciar(parametros());
    await sessao.descartar();
    await expect(sessao.descartar()).resolves.toBeUndefined();
  });

  it('vinte idas e voltas deixam zero adapter vivo', async () => {
    const { criados, parametros } = bancada();

    for (let i = 0; i < 20; i += 1) {
      const sessao = SessaoDeEmulacao.iniciar(parametros());
      await sessao.pronta;
      await sessao.descartar();
    }

    expect(criados).toHaveLength(20);
    expect(criados.every((adapter) => adapter.status === 'destroyed')).toBe(true);
  });

  it('falha de core vira EmulatorError no observador, não exceção solta', async () => {
    const aoFalhar = vi.fn();
    const { parametros } = bancada({ falharAoMontar: true });

    const sessao = SessaoDeEmulacao.iniciar(parametros({ observador: { aoFalhar } }));
    await expect(sessao.pronta).resolves.toBeUndefined();

    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar.mock.calls[0]?.[0]).toMatchObject({ code: 'CORE_LOAD_FAILED' });
    await sessao.descartar();
  });

  it('console sem adapter registrado falha com SYSTEM_UNSUPPORTED', async () => {
    const aoFalhar = vi.fn();
    const sessao = SessaoDeEmulacao.iniciar({
      registry: new EmulatorRegistry(),
      systemId: 'snes',
      rom: ROM,
      canvas: CANVAS,
      iniciarAutomaticamente: true,
      observador: { aoFalhar },
    });
    await sessao.pronta;

    expect(aoFalhar.mock.calls[0]?.[0]).toMatchObject({ code: 'SYSTEM_UNSUPPORTED' });
  });

  it('repassa as transições de status ao observador', async () => {
    const status: EmulatorStatus[] = [];
    const { parametros } = bancada();

    const sessao = SessaoDeEmulacao.iniciar(
      parametros({ observador: { aoMudarStatus: (s) => status.push(s) } }),
    );
    await sessao.pronta;

    expect(status).toEqual(['mounted', 'loading', 'ready', 'running']);
    await sessao.descartar();
  });

  it('repassa fps e gravação de SRAM enquanto a máquina anda', async () => {
    const aoMedirFps = vi.fn();
    const aoGravarSram = vi.fn();
    const { criados, parametros } = bancada();

    const sessao = SessaoDeEmulacao.iniciar(
      parametros({ observador: { aoMedirFps, aoGravarSram } }),
    );
    await sessao.pronta;
    aoGravarSram.mockClear();

    // 60 quadros é o intervalo em que o cartucho falso grava na bateria.
    criados[0]?.advanceFrames(60);

    expect(aoMedirFps).toHaveBeenCalledWith(60);
    expect(aoGravarSram).toHaveBeenCalledTimes(1);
    await sessao.descartar();
  });
});
