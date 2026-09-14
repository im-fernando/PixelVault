import { defineCapabilities } from '../adapter/capabilities.js';
import {
  RetroarchEmulatorAdapter,
  type RetroarchAdapterOptions,
} from '../retroarch/retroarch-emulator-adapter.js';
import { assetsDoCoreDeSnes } from './core-assets.js';
import { lerRomDeSnes, type RomDeSnes } from './snes-rom.js';

export { interpretarLeitura } from '../retroarch/retroarch-emulator-adapter.js';
export type SnesEmulatorAdapterOptions = RetroarchAdapterOptions;

/** Core SNES com validação de cartucho e memory maps (ADR 0008). */
export class SnesEmulatorAdapter extends RetroarchEmulatorAdapter<RomDeSnes> {
  constructor(options: SnesEmulatorAdapterOptions = {}) {
    super(
      {
        systemId: 'snes',
        assets: assetsDoCoreDeSnes,
        capabilities: defineCapabilities({ saveState: true, sram: true, memoryRead: true }),
        lerRom: lerRomDeSnes,
      },
      options,
    );
  }

  get romHeader(): RomDeSnes['cabecalho'] | null {
    return this.conteudo?.cabecalho ?? null;
  }
}
