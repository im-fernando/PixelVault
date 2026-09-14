import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/** Seleção única: o foco fica no gatilho enquanto as setas percorrem as opções. */
export function Seletor<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoAlterar,
}: {
  readonly rotulo: string;
  readonly valor: T;
  readonly opcoes: readonly { readonly valor: T; readonly rotulo: string }[];
  readonly aoAlterar: (valor: T) => void;
}) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const busca = useRef({ texto: '', instante: 0 });
  const selecionado = Math.max(
    0,
    opcoes.findIndex((opcao) => opcao.valor === valor),
  );

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !raiz.current?.contains(evento.target)) setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  useEffect(() => {
    if (aberto)
      document.getElementById(`${id}-opcao-${ativo}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [aberto, ativo, id]);

  const escolher = (indice: number) => {
    const opcao = opcoes[indice];
    if (opcao) aoAlterar(opcao.valor);
    setAberto(false);
    gatilho.current?.focus();
  };
  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const tecla = evento.key;
    if (tecla === 'Tab') {
      setAberto(false);
      return;
    }
    if (tecla === 'Escape') {
      if (aberto) {
        evento.preventDefault();
        evento.stopPropagation();
        setAberto(false);
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(tecla)) {
      evento.preventDefault();
      if (tecla === 'Enter' || tecla === ' ') {
        if (aberto) escolher(ativo);
        else {
          setAtivo(selecionado);
          setAberto(true);
        }
        return;
      }
      setAberto(true);
      setAtivo(
        tecla === 'Home'
          ? 0
          : tecla === 'End'
            ? opcoes.length - 1
            : !aberto
              ? selecionado
              : Math.max(0, Math.min(opcoes.length - 1, ativo + (tecla === 'ArrowDown' ? 1 : -1))),
      );
      return;
    }
    if (tecla.length === 1) {
      evento.preventDefault();
      const agora = Date.now();
      const texto =
        (agora - busca.current.instante < 700 ? busca.current.texto : '') +
        tecla.toLocaleLowerCase();
      busca.current = { texto, instante: agora };
      const indice = opcoes.findIndex((opcao) =>
        opcao.rotulo.toLocaleLowerCase().startsWith(texto),
      );
      if (indice >= 0) {
        setAtivo(indice);
        setAberto(true);
      }
    }
  };

  return (
    <div
      ref={raiz}
      className="pv-seletor"
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setAberto(false);
      }}
    >
      <label id={`${id}-rotulo`} htmlFor={`${id}-gatilho`} className="pv-rotulo">
        {rotulo}
      </label>
      <button
        ref={gatilho}
        id={`${id}-gatilho`}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-rotulo`}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? `${id}-lista` : undefined}
        aria-activedescendant={aberto ? `${id}-opcao-${ativo}` : undefined}
        className="pv-campo pv-seletor-gatilho"
        onKeyDown={aoTeclar}
        onClick={() => {
          setAtivo(selecionado);
          setAberto(!aberto);
        }}
      >
        <span>{opcoes[selecionado]?.rotulo}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {aberto && (
        <div
          id={`${id}-lista`}
          role="listbox"
          aria-labelledby={`${id}-rotulo`}
          className="pv-seletor-lista"
        >
          {opcoes.map((opcao, indice) => (
            <div
              key={opcao.valor}
              id={`${id}-opcao-${indice}`}
              role="option"
              aria-selected={opcao.valor === valor}
              data-ativo={indice === ativo}
              onPointerMove={() => setAtivo(indice)}
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => escolher(indice)}
            >
              <span>{opcao.rotulo}</span>
              {opcao.valor === valor && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
