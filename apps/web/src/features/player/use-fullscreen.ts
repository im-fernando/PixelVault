import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface TelaCheia {
  readonly ativa: boolean;
  readonly disponivel: boolean;
  readonly alternar: () => void;
}

/**
 * Tela cheia pelo elemento, não pela janela.
 *
 * O estado vem de `fullscreenchange`, e não do nosso clique: a pessoa sai da
 * tela cheia com Esc, e um botão que guarda o próprio estado passa a mentir na
 * primeira vez que isso acontece.
 */
export function useFullscreen(alvo: RefObject<HTMLElement | null>): TelaCheia {
  const [ativa, setAtiva] = useState(false);
  const [disponivel, setDisponivel] = useState(false);

  useEffect(() => {
    setDisponivel(typeof document !== 'undefined' && document.fullscreenEnabled === true);

    const aoMudar = (): void => setAtiva(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', aoMudar);
    aoMudar();
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  const alternar = useCallback(() => {
    const elemento = alvo.current;
    if (elemento === null) return;

    if (document.fullscreenElement === null) {
      void elemento.requestFullscreen().catch(() => undefined);
    } else {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [alvo]);

  return { ativa, disponivel, alternar };
}
