import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS } from '../adapter/audio.js';
import { BarramentoDeAudio, type EstadoDoAudio } from './audio-bus.js';

/** O mínimo do WebAudio que o barramento toca — e nada além disso. */
class ParametroFalso {
  value = 1;
  /** Histórico, e não agenda: `cancelScheduledValues` não apaga o que já houve. */
  readonly rampas: Array<{ alvo: number; ate: number }> = [];
  degraus = 0;

  cancelScheduledValues(): void {
    // Sem agenda de verdade, não há o que cancelar.
  }

  setValueAtTime(valor: number): void {
    if (valor !== this.value) {
      this.degraus += 1;
    }
    this.value = valor;
  }

  linearRampToValueAtTime(alvo: number, ate: number): void {
    this.rampas.push({ alvo, ate });
    // O falso encurta o tempo: o que interessa ao teste é o alvo, não a rampa.
    this.value = alvo;
  }
}

class GanhoFalso {
  readonly gain = new ParametroFalso();
  ligadoEm: unknown = null;

  connect(destino: unknown): void {
    this.ligadoEm = destino;
  }
}

class ContextoFalso {
  currentTime = 0;
  state: AudioContextState = 'running';
  readonly saidaReal = { nome: 'destination' };
  readonly ganhos: GanhoFalso[] = [];
  readonly ouvintes: Array<() => void> = [];
  resumes = 0;

  get destination(): unknown {
    return this.saidaReal;
  }

  createGain(): GanhoFalso {
    const ganho = new GanhoFalso();
    this.ganhos.push(ganho);
    return ganho;
  }

  addEventListener(_evento: string, ouvinte: () => void): void {
    this.ouvintes.push(ouvinte);
  }

  removeEventListener(_evento: string, ouvinte: () => void): void {
    const indice = this.ouvintes.indexOf(ouvinte);
    if (indice >= 0) {
      this.ouvintes.splice(indice, 1);
    }
  }

  resume(): Promise<void> {
    this.resumes += 1;
    this.state = 'running';
    for (const ouvinte of this.ouvintes) {
      ouvinte();
    }
    return Promise.resolve();
  }
}

function novoContexto(state: AudioContextState = 'running'): AudioContext {
  const contexto = new ContextoFalso();
  contexto.state = state;
  return contexto as unknown as AudioContext;
}

function ganhoDe(contexto: AudioContext): GanhoFalso {
  const falso = contexto as unknown as ContextoFalso;
  const ganho = falso.ganhos.at(-1);
  if (ganho === undefined) {
    throw new Error('o barramento não criou ganho nenhum');
  }
  return ganho;
}

function novoBarramento(parcial: Partial<{ volume: number; muted: boolean }> = {}): {
  barramento: BarramentoDeAudio;
  estados: EstadoDoAudio[];
} {
  const estados: EstadoDoAudio[] = [];
  const barramento = new BarramentoDeAudio({
    settings: { ...DEFAULT_AUDIO_SETTINGS, ...parcial },
    aoMudar: (estado) => estados.push(estado),
  });
  return { barramento, estados };
}

describe('BarramentoDeAudio', () => {
  it('põe o ganho no lugar do destination, que é a única alça sobre o RWebAudio', () => {
    const contexto = novoContexto();
    const saidaReal = contexto.destination;
    const { barramento } = novoBarramento();

    barramento.instalar(contexto);

    const ganho = ganhoDe(contexto);
    expect(contexto.destination).toBe(ganho as unknown as AudioDestinationNode);
    expect(ganho.ligadoEm).toBe(saidaReal);
  });

  it('aplica a preferência guardada no instante em que o contexto nasce', () => {
    const contexto = novoContexto();
    const { barramento } = novoBarramento({ volume: 0.5 });

    barramento.instalar(contexto);

    // Quadrática: 0,5 de volume é 0,25 de amplitude.
    expect(ganhoDe(contexto).gain.value).toBeCloseTo(0.25);
  });

  it('mudo zera o ganho e desmutar devolve o volume que estava guardado', () => {
    const contexto = novoContexto();
    const { barramento } = novoBarramento({ volume: 0.5 });
    barramento.instalar(contexto);

    barramento.setMuted(true);
    expect(ganhoDe(contexto).gain.value).toBe(0);

    barramento.setMuted(false);
    expect(ganhoDe(contexto).gain.value).toBeCloseTo(0.25);
  });

  it('nunca dá um degrau: toda mudança de ganho é rampa', () => {
    const contexto = novoContexto();
    const { barramento } = novoBarramento();
    barramento.instalar(contexto);

    barramento.setVolume(0.2);
    barramento.silenciar('pausa');

    const parametro = ganhoDe(contexto).gain;
    expect(parametro.rampas).toHaveLength(2);
    expect(parametro.rampas.every((rampa) => rampa.ate > 0)).toBe(true);
    expect(parametro.degraus).toBe(0);
  });

  it('dois motivos de silêncio: sair de um não devolve o som enquanto o outro vale', () => {
    const contexto = novoContexto();
    const { barramento } = novoBarramento();
    barramento.instalar(contexto);

    barramento.silenciar('pausa');
    barramento.silenciar('aba-oculta');
    barramento.permitir('pausa');

    expect(barramento.ganhoAlvo).toBe(0);

    barramento.permitir('aba-oculta');
    expect(barramento.ganhoAlvo).toBe(1);
  });

  it('mudo do usuário vence o fim da pausa', () => {
    const contexto = novoContexto();
    const { barramento } = novoBarramento();
    barramento.instalar(contexto);

    barramento.setMuted(true);
    barramento.silenciar('pausa');
    barramento.permitir('pausa');

    expect(ganhoDe(contexto).gain.value).toBe(0);
  });

  it('sem contexto ainda, volume e mudo já valem — e entram quando o core sobe', () => {
    const { barramento } = novoBarramento();
    barramento.setVolume(0.25);

    const contexto = novoContexto();
    barramento.instalar(contexto);

    expect(barramento.volume).toBe(0.25);
    expect(ganhoDe(contexto).gain.value).toBeCloseTo(0.0625);
  });

  it('contexto suspenso é `blocked`, e destravar o desbloqueia', async () => {
    const contexto = novoContexto('suspended');
    const { barramento, estados } = novoBarramento();
    barramento.instalar(contexto);

    expect(barramento.blocked).toBe(true);

    await expect(barramento.unlock()).resolves.toBe(true);

    expect(barramento.blocked).toBe(false);
    expect(estados.at(-1)).toEqual({ volume: 1, muted: false, blocked: false });
  });

  it('destravar sem contexto responde false em vez de estourar', async () => {
    const { barramento } = novoBarramento();

    await expect(barramento.unlock()).resolves.toBe(false);
  });

  it('instalar de novo troca de contexto sem deixar ouvinte no antigo', () => {
    const primeiro = novoContexto();
    const segundo = novoContexto();
    const { barramento } = novoBarramento();

    barramento.instalar(primeiro);
    barramento.instalar(segundo);

    expect((primeiro as unknown as ContextoFalso).ouvintes).toHaveLength(0);
    expect((segundo as unknown as ContextoFalso).ouvintes).toHaveLength(1);
  });

  it('desinstalar solta o contexto: o barramento para de responder por ele', () => {
    const contexto = novoContexto('suspended');
    const { barramento } = novoBarramento();
    barramento.instalar(contexto);

    barramento.desinstalar();

    expect(barramento.blocked).toBe(false);
    expect((contexto as unknown as ContextoFalso).ouvintes).toHaveLength(0);
  });

  it('ambiente sem WebAudio de verdade não impede o emulador de rodar', () => {
    const quebrado = {
      get destination(): never {
        throw new Error('sem WebAudio');
      },
    } as unknown as AudioContext;
    const { barramento } = novoBarramento();

    expect(() => {
      barramento.instalar(quebrado);
    }).not.toThrow();
    expect(barramento.blocked).toBe(false);
  });
});
