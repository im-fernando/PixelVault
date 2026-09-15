import { useState } from 'react';
import type { SystemId } from '@pixelvault/contracts';

export const FILTROS_DE_IMAGEM = {
  nitido: 'Nítido',
  suave: 'Suave',
  crt: 'TV de tubo',
} as const;
export type FiltroDeImagem = keyof typeof FILTROS_DE_IMAGEM;
const CHAVE = 'pixelvault:filtros-de-imagem';

function ehFiltro(valor: unknown): valor is FiltroDeImagem {
  return valor === 'nitido' || valor === 'suave' || valor === 'crt';
}

export function useFiltroDeImagem(sistema: SystemId) {
  const [preferencias, setPreferencias] = useState<Record<string, FiltroDeImagem>>(() => {
    try {
      const dados: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return {};
      return Object.fromEntries(Object.entries(dados).filter(([, valor]) => ehFiltro(valor)));
    } catch {
      return {};
    }
  });
  const trocar = (filtro: FiltroDeImagem) => {
    const proximas = { ...preferencias, [sistema]: filtro };
    setPreferencias(proximas);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(proximas));
    } catch {
      // A preferência continua funcionando quando o navegador bloqueia storage.
    }
  };
  return { filtro: preferencias[sistema] ?? 'nitido', trocar };
}

export interface PropsDoFiltro {
  readonly filtro: FiltroDeImagem;
  readonly aoTrocarFiltro: (filtro: FiltroDeImagem) => void;
}

export function FiltroDeImagem({
  filtro,
  aoTrocarFiltro,
  botoes = false,
}: PropsDoFiltro & { readonly botoes?: boolean }) {
  if (botoes)
    return (
      <div className="cgp-segments" role="group" aria-label="Filtro de imagem">
        {(Object.keys(FILTROS_DE_IMAGEM) as FiltroDeImagem[]).map((valor) => (
          <button
            key={valor}
            type="button"
            aria-pressed={filtro === valor}
            onClick={() => aoTrocarFiltro(valor)}
          >
            {FILTROS_DE_IMAGEM[valor]}
          </button>
        ))}
      </div>
    );
  return (
    <label className="pv-filtro-controle">
      <span>Imagem</span>
      <select
        aria-label="Filtro de imagem"
        value={filtro}
        onChange={(evento) => {
          if (ehFiltro(evento.target.value)) aoTrocarFiltro(evento.target.value);
        }}
      >
        {Object.entries(FILTROS_DE_IMAGEM).map(([valor, nome]) => (
          <option key={valor} value={valor}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  );
}
