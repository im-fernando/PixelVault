import { configDeTecladoDoRetroArch, MAPA_DE_TECLADO_PS1 } from '../snes/keyboard-bindings.js';
import { defineCapabilities } from '../adapter/capabilities.js';
import { StateIncompatibleError } from '../adapter/errors.js';
import {
  RetroarchEmulatorAdapter,
  type ConteudoRetroarch,
  type RetroarchAdapterOptions,
  type PerfilRetroarch,
} from '../retroarch/retroarch-emulator-adapter.js';
import { lerRomDePs1 } from './ps1-rom.js';

export interface Ps1EmulatorAdapterOptions extends RetroarchAdapterOptions {
  readonly bios?: PerfilRetroarch<ConteudoRetroarch>['bios'];
}

/** PS1 digital, memory card 1 por conteúdo; card 2 compartilhado fica desligado. */
export class Ps1EmulatorAdapter extends RetroarchEmulatorAdapter<ConteudoRetroarch> {
  constructor(options: Ps1EmulatorAdapterOptions = {}) {
    super(
      {
        systemId: 'ps1',
        detectarFalhaDeCarga: true,
        assets: (base) => {
          const raiz = `${base.replace(/\/+$/, '')}/pcsx_rearmed/1.22.2`;
          return {
            nome: 'pcsx_rearmed',
            versao: '1.22.2',
            urlDoJs: `${raiz}/pcsx_rearmed_libretro.js`,
            urlDoWasm: `${raiz}/pcsx_rearmed_libretro.wasm`,
          };
        },
        capabilities: defineCapabilities({ saveState: true, sram: true }),
        lerRom: lerRomDePs1,
        bios: options.bios,
        coreConfig: { pcsx_rearmed_bios: 'auto', pcsx_rearmed_memcard2: 'disabled' },
        validarSram: (data) => {
          if (data.length !== 128 * 1024 || data[0] !== 0x4d || data[1] !== 0x43)
            throw new StateIncompatibleError(
              'Memory card PS1 inválido: esperado cartão bruto de 128 KiB.',
            );
        },
      },
      {
        ...options,
        retroarchConfig: {
          input_libretro_device_p1: 1,
          log_verbosity: true,
          frontend_log_level: 3,
          libretro_log_level: 3,
          ...configDeTecladoDoRetroArch(MAPA_DE_TECLADO_PS1),
          ...options.retroarchConfig,
        },
      },
    );
  }
}
