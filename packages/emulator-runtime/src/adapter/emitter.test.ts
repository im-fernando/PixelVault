import { describe, expect, it, vi } from 'vitest';
import { EmulatorEventEmitter } from './emitter.js';
import { EmulatorError } from './errors.js';

describe('EmulatorEventEmitter', () => {
  it('entrega o payload só a quem assinou o evento', () => {
    const emissor = new EmulatorEventEmitter();
    const emStatus = vi.fn();
    const emFps = vi.fn();
    emissor.on('statusChange', emStatus);
    emissor.on('fps', emFps);

    emissor.emit('statusChange', { previous: 'idle', current: 'mounted' });

    expect(emStatus).toHaveBeenCalledWith({ previous: 'idle', current: 'mounted' });
    expect(emFps).not.toHaveBeenCalled();
  });

  it('para de entregar depois do unsubscribe', () => {
    const emissor = new EmulatorEventEmitter();
    const ouvinte = vi.fn();
    const cancelar = emissor.on('fps', ouvinte);

    emissor.emit('fps', { fps: 60 });
    cancelar();
    emissor.emit('fps', { fps: 30 });

    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(emissor.listenerCount('fps')).toBe(0);
  });

  it('aguenta ouvinte que cancela a própria inscrição durante o despacho', () => {
    const emissor = new EmulatorEventEmitter();
    const segundo = vi.fn();
    const cancelar = emissor.on('fps', () => {
      cancelar();
    });
    emissor.on('fps', segundo);

    expect(() => {
      emissor.emit('fps', { fps: 60 });
    }).not.toThrow();
    expect(segundo).toHaveBeenCalledTimes(1);
  });

  it('não deixa ouvinte que estoura derrubar os outros', () => {
    const emissor = new EmulatorEventEmitter();
    const espiao = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const sobrevivente = vi.fn();
    emissor.on('error', () => {
      throw new Error('ouvinte ruim');
    });
    emissor.on('error', sobrevivente);

    emissor.emit('error', { error: new EmulatorError('ROM_INVALID', 'qualquer') });

    expect(sobrevivente).toHaveBeenCalledTimes(1);
    expect(espiao).toHaveBeenCalled();
    espiao.mockRestore();
  });

  it('emitir sem ouvinte é no-op', () => {
    const emissor = new EmulatorEventEmitter();

    expect(() => {
      emissor.emit('ready', { systemId: 'snes', coreVersion: 'x' });
    }).not.toThrow();
  });

  it('removeAll limpa todos os eventos', () => {
    const emissor = new EmulatorEventEmitter();
    emissor.on('fps', vi.fn());
    emissor.on('ready', vi.fn());

    emissor.removeAll();

    expect(emissor.listenerCount('fps')).toBe(0);
    expect(emissor.listenerCount('ready')).toBe(0);
  });
});
