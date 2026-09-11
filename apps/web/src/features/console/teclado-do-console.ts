export type DirecaoDoTeclado = 'left' | 'right' | 'up' | 'down';
export const LINHAS_DO_TECLADO = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM-_'];

export interface PosicaoDaTecla {
  readonly x: number;
  readonly y: number;
}

/** Primeiro escolhe a linha, depois a tecla mais alinhada ao foco atual. */
export function destinoNoTeclado(
  teclas: readonly PosicaoDaTecla[],
  atual: number,
  direcao: DirecaoDoTeclado,
  colunaPreferida?: number,
): number {
  const origem = teclas[atual];
  if (!origem) return 0;
  const horizontal = direcao === 'left' || direcao === 'right';
  const sinal = direcao === 'left' || direcao === 'up' ? -1 : 1;
  const candidatos = teclas
    .map((tecla, indice) => ({
      indice,
      principal: (horizontal ? tecla.x - origem.x : tecla.y - origem.y) * sinal,
      transversal: Math.abs(
        horizontal ? tecla.y - origem.y : tecla.x - (colunaPreferida ?? origem.x),
      ),
    }))
    .filter((c) => c.principal > 1 && (!horizontal || c.transversal < 2));
  candidatos.sort((a, b) => a.principal - b.principal || a.transversal - b.transversal);
  if (horizontal) return candidatos[0]?.indice ?? atual;
  const linha = candidatos[0]?.principal;
  return (
    candidatos
      .filter((c) => linha !== undefined && Math.abs(c.principal - linha) < 2)
      .sort((a, b) => a.transversal - b.transversal)[0]?.indice ?? atual
  );
}

export function focarPrimeiraTecla(): boolean {
  const tecla = document.querySelector<HTMLButtonElement>('[data-console-key]');
  if (!tecla || document.activeElement === tecla) return false;
  tecla.focus();
  return true;
}

const colunasPreferidas = new WeakMap<
  Element,
  { tecla: HTMLElement; x: number; largura: number }
>();

export function moverFocoDaBusca(direcao: DirecaoDoTeclado): boolean {
  const teclas = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-console-key]:not(:disabled)'),
  );
  const atual = teclas.indexOf(document.activeElement as HTMLButtonElement);
  if (atual < 0) return focarPrimeiraTecla();
  const posicoes = teclas.map((tecla) => {
    const caixa = tecla.getBoundingClientRect();
    // O fallback lógico também permite testar sem um motor de layout. No
    // navegador, a geometria acompanha até a quebra das ações no celular.
    return caixa.width > 0
      ? { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }
      : { x: Number(tecla.dataset.coluna) * 100, y: Number(tecla.dataset.linha) * 100 };
  });
  const raiz = teclas[atual]?.closest('.cx-dialog');
  const anterior = raiz ? colunasPreferidas.get(raiz) : undefined;
  const largura = raiz?.getBoundingClientRect().width ?? 0;
  const vertical = direcao === 'up' || direcao === 'down';
  const x =
    vertical && anterior && anterior.tecla === teclas[atual] && anterior.largura === largura
      ? anterior.x
      : posicoes[atual]!.x;
  const destino = destinoNoTeclado(posicoes, atual, direcao, x);
  if (destino === atual) return false;
  if (raiz && teclas[destino])
    colunasPreferidas.set(raiz, {
      tecla: teclas[destino],
      x: vertical ? x : posicoes[destino]!.x,
      largura,
    });
  teclas[destino]?.focus();
  return true;
}

/** Borda imediata, pausa inicial e repetição; confirmar nunca usa repetição. */
export function criarRepeticaoDoDirecional() {
  let anterior: DirecaoDoTeclado | null = null;
  let proximo = 0;
  return (direcao: DirecaoDoTeclado | null, agora: number): DirecaoDoTeclado | null => {
    if (direcao === null) {
      anterior = null;
      return null;
    }
    if (direcao !== anterior) {
      anterior = direcao;
      proximo = agora + 360;
      return direcao;
    }
    if (agora < proximo) return null;
    proximo = agora + 115;
    return direcao;
  };
}
