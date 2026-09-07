import { LEGENDA_DO_TECLADO, type BotaoDoSnes, type EstadoDoGamepad } from './input/snes-keymap.js';

interface Props {
  readonly estado: EstadoDoGamepad;
  readonly ativo: boolean;
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
 */
export function GamepadLegend({ estado, ativo }: Props) {
  return (
    <section
      aria-label="Mapeamento do teclado"
      className={`rounded-xl border border-vault-800 bg-vault-900/60 p-4 transition-opacity ${
        ativo ? 'opacity-100' : 'opacity-60'
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-vault-100">Controle</h2>
        <p className="text-xs text-vault-700">
          {ativo ? 'teclado ligado ao console' : 'clique na tela para jogar'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="mb-2 text-[0.65rem] tracking-widest text-vault-700 uppercase">
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
                          ? 'border-accent bg-accent/20 text-vault-100'
                          : 'border-vault-800 bg-vault-950 text-vault-300'
                      }`}
                    >
                      <span className="text-xs font-semibold">{item.rotulo}</span>
                      <span className="font-mono text-[0.65rem] text-vault-700">{item.tecla}</span>
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
