/**
 * Volume, mudo e política de autoplay — na fronteira, e não dentro do adapter
 * de SNES.
 *
 * Está aqui porque não é assunto de core: qualquer emulação no navegador
 * precisa de um volume, de um mudo e de uma resposta para "o navegador ainda
 * não deixou o som começar". A UI que desenha o botão de volume não pode
 * precisar saber qual core está por baixo.
 */

/** Preferência do usuário. É o que se persiste, e é só isso. */
export interface AudioSettings {
  /** Amplitude de 0 (silêncio) a 1 (o quanto o core mandar). */
  readonly volume: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = Object.freeze({ volume: 1, muted: false });

/**
 * Controle que o adapter expõe.
 *
 * Vale antes de `mount()` e continua valendo depois de `destroy()`: volume é
 * preferência do usuário, não estado da máquina. Trocar de jogo não pode
 * ressuscitar o som de quem deixou tudo no mudo.
 */
export interface EmulatorAudioControl {
  readonly volume: number;
  readonly muted: boolean;
  /**
   * `true` enquanto o navegador não deixa o áudio tocar.
   *
   * Não é erro: é a política de autoplay do Chrome funcionando. Some sozinho
   * no primeiro gesto do usuário na página, e a UI pode antecipá-lo chamando
   * `unlock()` de dentro do próprio manipulador do clique.
   */
  readonly blocked: boolean;
  /** Fora de 0..1 é grampeado, não é erro: slider de UI erra por arredondamento. */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /**
   * Tenta destravar o áudio. **Precisa ser chamado de dentro de um gesto do
   * usuário** — fora dele o navegador recusa, e é por isso que o retorno diz
   * se destravou em vez de resolver calado.
   */
  unlock(): Promise<boolean>;
}

/** Onde a preferência sobrevive ao recarregar a página. */
export interface AudioSettingsStore {
  load(): AudioSettings | null;
  save(settings: AudioSettings): void;
}

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return DEFAULT_AUDIO_SETTINGS.volume;
  }
  return Math.min(1, Math.max(0, volume));
}

const CHAVE_PADRAO = 'pixelvault:audio';

/**
 * Persistência em `localStorage`.
 *
 * Tudo é engolido de propósito: navegação privada, storage cheio e política de
 * cookies fazem `localStorage` estourar, e perder a preferência de volume não
 * é motivo para o jogo não abrir. Quem quiser guardar no servidor injeta outro
 * `AudioSettingsStore`.
 */
export function browserAudioSettingsStore(key: string = CHAVE_PADRAO): AudioSettingsStore {
  return {
    load(): AudioSettings | null {
      try {
        const cru = globalThis.localStorage?.getItem(key);
        return cru === null || cru === undefined ? null : interpretar(cru);
      } catch {
        return null;
      }
    },
    save(settings: AudioSettings): void {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(settings));
      } catch {
        // Ver o comentário do bloco: preferência é conforto, não requisito.
      }
    },
  };
}

/** Store de memória, para teste e para quem não quer tocar em `localStorage`. */
export function memoryAudioSettingsStore(inicial: AudioSettings | null = null): AudioSettingsStore {
  let guardado = inicial;
  return {
    load: () => guardado,
    save: (settings) => {
      guardado = settings;
    },
  };
}

function interpretar(cru: string): AudioSettings | null {
  try {
    const valor: unknown = JSON.parse(cru);
    if (typeof valor !== 'object' || valor === null) {
      return null;
    }
    const registro = valor as Record<string, unknown>;
    const volume = registro['volume'];
    const muted = registro['muted'];
    return {
      volume: typeof volume === 'number' ? clampVolume(volume) : DEFAULT_AUDIO_SETTINGS.volume,
      muted: muted === true,
    };
  } catch {
    return null;
  }
}
