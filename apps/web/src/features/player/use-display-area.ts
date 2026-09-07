import { useEffect, useState, type RefObject } from 'react';
import { calcularAreaDeExibicao, type Dimensoes, type ProporcaoDeTela } from './aspect-ratio.js';

/**
 * Mede o espaço disponível e devolve o retângulo do console dentro dele.
 *
 * Em pixels calculados no JavaScript, e não em `aspect-ratio` do CSS, porque a
 * escala inteira precisa de aritmética: arredondar a altura para um múltiplo
 * exato de 224 é o que faz cada pixel do console virar N pixels da tela, sem a
 * linha grossa no meio da imagem.
 */
export function useAreaDeExibicao(
  container: RefObject<HTMLElement | null>,
  proporcao: ProporcaoDeTela,
  escalaInteira: boolean,
): Dimensoes {
  const [area, setArea] = useState<Dimensoes>({ largura: 0, altura: 0 });

  useEffect(() => {
    const elemento = container.current;
    if (elemento === null) return;

    const medir = (): void => {
      const { width, height } = elemento.getBoundingClientRect();
      setArea(
        calcularAreaDeExibicao({ largura: width, altura: height }, proporcao, {
          escalaInteira,
        }),
      );
    };

    medir();

    // jsdom e navegadores antigos não têm ResizeObserver; a medida inicial mais
    // o `resize` da janela cobrem o caso sem quebrar a montagem.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }

    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    document.addEventListener('fullscreenchange', medir);
    return () => {
      observador.disconnect();
      document.removeEventListener('fullscreenchange', medir);
    };
  }, [container, proporcao, escalaInteira]);

  return area;
}
