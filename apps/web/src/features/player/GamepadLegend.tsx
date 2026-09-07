import { useMemo } from 'react';
import { rotulosDoControle, type PerfilDoControle } from './input/gamepad-map.js';
import { LEGENDA_DO_TECLADO, type BotaoDoSnes, type EstadoDoGamepad } from './input/snes-keymap.js';

interface Props {
  readonly estado: EstadoDoGamepad;
  readonly ativo: boolean;
  /** O controle em uso. `null` é o teclado sozinho — que é o padrão, e é silencioso. */
  readonly controle: PerfilDoControle | null;
}

const GRUPOS: readonly { readonly titulo: string; readonly botoes: readonly BotaoDoSnes[] }[] = [
  { titulo: 'Direcional', botoes: ['up', 'down', 'left', 'right'] },
  { titulo: 'Ação', botoes: ['b', 'a', 'y', 'x'] },
  { titulo: 'Gatilhos', botoes: ['l', 'r'] },
  { titulo: 'Sistema', botoes: ['select', 'start'] },
];

const POR_BOTAO = new Map(LEGENDA_DO_TECLADO.map((item) => [item.botao, item]));

/**
 * O mapa de teclas, acendendo conforme a pessoa joga.
 *
 * É legenda e é instrumento ao mesmo tempo: duas teclas acesas juntas é a
 * prova visível de que correr e pular funciona, e é onde se descobre que o
 * teclado da máquina não registra aquela combinação — coisa que o teclado faz,
 * não o software, e que sem isto viraria "o emulador travou".
 *
 * Com um controle plugado ele vira a mesma prova para o controle, e sem trocar
 * a legenda do teclado por outra: as duas fontes valem juntas, e mostrar só uma
 * faria a pessoa acreditar que a outra parou de funcionar.
 */
export function GamepadLegend({ estado, ativo, controle }: Props) {
  const rotulosNoControle = useMemo(
    () => (controle === null ? null : rotulosDoControle(controle.familia)),
    [controle],
  );

  return (
    <section
      aria-label="Mapeamento do teclado"
      className={`rounded-xl border border-ink-850 bg-ink-900/60 p-4 transition-opacity ${
        ativo || controle !== null ? 'opacity-100' : 'opacity-60'
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-label-100">Controle</h2>
        {controle !== null ? (
          <p className="text-xs text-alert">{controle.nome} ligado ao console</p>
        ) : (
          <p className="text-xs text-ink-700">
            {ativo ? 'teclado ligado ao console' : 'clique na tela para jogar'}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="mb-2 text-[0.65rem] tracking-widest text-ink-700 uppercase">
              {grupo.titulo}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {grupo.botoes.map((botao) => {
                const item = POR_BOTAO.get(botao);
                if (item === undefined) return null;
                const aceso = estado[botao];
                return (
                  <li key={botao}>
                    <span
                      data-pressionado={aceso}
                      className={`flex min-w-14 flex-col items-center rounded-md border px-2 py-1 transition-colors ${
                        aceso
                          ? 'border-alert bg-alert/20 text-label-100'
                          : 'border-ink-850 bg-ink-950 text-ink-500'
                      }`}
                    >
                      <span className="text-xs font-semibold">{item.rotulo}</span>
                      <span className="font-mono text-[0.65rem] text-ink-700">{item.tecla}</span>
                      {rotulosNoControle !== null && (
                        <span className="font-mono text-[0.65rem] text-alert/80">
                          {rotulosNoControle[botao]}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
