import { Gamepad2, Keyboard } from 'lucide-react';
import { useMemo } from 'react';
import { LinhaDeSecao } from '../../ui/Texto.js';
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
 *
 * `data-pressionado` é o que acende a tecla (ver `.pv-legenda-tecla` em
 * `styles.css`): fica como atributo, e não como classe condicional, para o
 * estado ser legível no DOM por quem depura e por quem testa.
 */
export function GamepadLegend({ estado, ativo, controle }: Props) {
  const rotulosNoControle = useMemo(
    () => (controle === null ? null : rotulosDoControle(controle.familia)),
    [controle],
  );

  return (
    <section
      aria-label="Mapeamento do teclado"
      className={`pv-painel pv-painel--vidro p-5 transition-opacity ${
        ativo || controle !== null ? 'opacity-100' : 'opacity-70'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <LinhaDeSecao nome="Controle" />
        {controle !== null ? (
          <span className="pv-chip pv-chip--luz" title={`${controle.nome} ligado ao console`}>
            <Gamepad2 size={13} className="shrink-0" />
            <span className="max-w-56 truncate">{controle.nome}</span>
          </span>
        ) : (
          <span className="pv-dica">
            <Keyboard size={13} className="shrink-0" />
            {ativo ? 'teclado ligado ao console' : 'clique na tela para jogar'}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="sobrelinha mb-2">{grupo.titulo}</p>
            <ul className="flex flex-wrap gap-2">
              {grupo.botoes.map((botao) => {
                const item = POR_BOTAO.get(botao);
                if (item === undefined) return null;
                const aceso = estado[botao];
                return (
                  <li key={botao}>
                    <span className="pv-legenda-tecla" data-pressionado={aceso}>
                      <span className="text-[12px] font-semibold">{item.rotulo}</span>
                      <span className="leitura opacity-80">{item.tecla}</span>
                      {rotulosNoControle !== null && (
                        <span className="leitura text-luz">{rotulosNoControle[botao]}</span>
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
