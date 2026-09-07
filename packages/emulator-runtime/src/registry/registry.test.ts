import { describe, expect, it } from 'vitest';
import { FakeAdapter } from '../testing/fake-adapter.js';
import { EmulatorRegistry } from './registry.js';

describe('EmulatorRegistry', () => {
  it('cria o adapter registrado para o console', async () => {
    const registro = new EmulatorRegistry();
    registro.register('snes', () => new FakeAdapter({ systemId: 'snes' }));

    const adapter = await registro.create('snes');

    expect(adapter.systemId).toBe('snes');
    expect(adapter.status).toBe('idle');
  });

  it('aceita fábrica assíncrona — core de verdade sobe por import dinâmico', async () => {
    const registro = new EmulatorRegistry();
    registro.register('gb', () => Promise.resolve(new FakeAdapter({ systemId: 'gb' })));

    await expect(registro.create('gb')).resolves.toMatchObject({ systemId: 'gb' });
  });

  it('estoura SYSTEM_UNSUPPORTED no console sem adapter', async () => {
    const registro = new EmulatorRegistry();

    await expect(registro.create('genesis')).rejects.toMatchObject({
      code: 'SYSTEM_UNSUPPORTED',
      systemId: 'genesis',
    });
  });

  it('recusa dois adapters disputando o mesmo console', () => {
    const registro = new EmulatorRegistry();
    registro.register('snes', () => new FakeAdapter());

    expect(() => {
      registro.register('snes', () => new FakeAdapter());
    }).toThrowError(/já existe um adapter registrado/);
  });

  it('permite substituir explicitamente — é como o teste troca o core pelo falso', async () => {
    const registro = new EmulatorRegistry();
    registro.register('snes', () => new FakeAdapter({ coreVersion: 'real-9.9.9' }));
    registro.register('snes', () => new FakeAdapter({ coreVersion: 'fake-1.0.0' }), {
      replace: true,
    });

    await expect(registro.create('snes')).resolves.toMatchObject({ coreVersion: 'fake-1.0.0' });
  });

  it('recusa fábrica que devolve adapter de outro console', async () => {
    const registro = new EmulatorRegistry();
    registro.register('nes', () => new FakeAdapter({ systemId: 'snes' }));

    await expect(registro.create('nes')).rejects.toMatchObject({ code: 'SYSTEM_UNSUPPORTED' });
  });

  it('lista os consoles jogáveis em ordem estável', () => {
    const registro = new EmulatorRegistry();
    registro.register('snes', () => new FakeAdapter({ systemId: 'snes' }));
    registro.register('gb', () => new FakeAdapter({ systemId: 'gb' }));

    expect(registro.supportedSystems()).toEqual(['gb', 'snes']);
    expect(registro.supports('snes')).toBe(true);
    expect(registro.supports('gba')).toBe(false);
  });

  it('desregistra', () => {
    const registro = new EmulatorRegistry();
    registro.register('snes', () => new FakeAdapter());

    expect(registro.unregister('snes')).toBe(true);
    expect(registro.unregister('snes')).toBe(false);
    expect(registro.supportedSystems()).toEqual([]);
  });

  it('não compartilha estado entre instâncias', () => {
    const primeiro = new EmulatorRegistry();
    const segundo = new EmulatorRegistry();
    primeiro.register('snes', () => new FakeAdapter());

    expect(segundo.supports('snes')).toBe(false);
  });
});
