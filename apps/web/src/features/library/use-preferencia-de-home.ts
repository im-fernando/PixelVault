import { useCallback, useState } from 'react';
import {
  lerPreferenciaDeHome,
  salvarPreferenciaDeHome,
  type PreferenciaDeHome,
} from './preferencia-de-home.js';

export interface PreferenciaDeHomeControlada {
  readonly preferencia: PreferenciaDeHome;
  readonly definirCatalogoPublico: (ativo: boolean) => void;
}

/**
 * A preferência de home, com o `localStorage` escondido atrás de um hook —
 * a home lê, a tela de conta escreve, e nenhuma das duas toca a chave direto.
 */
export function usePreferenciaDeHome(): PreferenciaDeHomeControlada {
  const [preferencia, setPreferencia] = useState(lerPreferenciaDeHome);

  const definirCatalogoPublico = useCallback((catalogoPublico: boolean) => {
    setPreferencia((atual) => {
      const proxima = { ...atual, catalogoPublico };
      salvarPreferenciaDeHome(proxima);
      return proxima;
    });
  }, []);

  return { preferencia, definirCatalogoPublico };
}
