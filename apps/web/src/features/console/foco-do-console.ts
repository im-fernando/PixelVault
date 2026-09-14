export function moverFoco(elementos: HTMLElement[], direcao: 'left' | 'right' | 'up' | 'down') {
  elementos = elementos.filter((el) => {
    if (el.matches(':disabled') || el.closest('[inert], [hidden], [aria-hidden="true"]'))
      return false;
    const estilo = getComputedStyle(el);
    return estilo.display !== 'none' && estilo.visibility !== 'hidden';
  });
  if (!elementos.length) return;
  const ativo = document.activeElement as HTMLElement;
  const indice = elementos.indexOf(ativo);
  if (indice < 0) {
    elementos[0]?.focus();
    return;
  }
  const origem = ativo.getBoundingClientRect();
  const horizontal = direcao === 'left' || direcao === 'right';
  const sinal = direcao === 'left' || direcao === 'up' ? -1 : 1;
  if (horizontal && ativo instanceof HTMLInputElement && ativo.type === 'range') {
    // O setter nativo mantém o onChange do React no mesmo caminho do mouse.
    const valor = Math.min(
      Number(ativo.max || 100),
      Math.max(Number(ativo.min || 0), Number(ativo.value) + sinal * Number(ativo.step || 1)),
    );
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      ativo,
      String(valor),
    );
    ativo.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const caixas = elementos.map((el) => ({ el, caixa: el.getBoundingClientRect() }));
  // Ambientes sem layout usam a ordem lógica, sem dar a volta nas bordas.
  if (caixas.every(({ caixa }) => caixa.width === 0 && caixa.height === 0)) {
    elementos[indice + sinal]?.focus();
    return;
  }
  const candidatos = caixas
    .filter(({ el, caixa }) => el !== ativo && caixa.width > 0 && caixa.height > 0)
    .map(({ el, caixa }) => {
      const dx = caixa.x + caixa.width / 2 - (origem.x + origem.width / 2);
      const dy = caixa.y + caixa.height / 2 - (origem.y + origem.height / 2);
      const transversal = Math.abs(horizontal ? dy : dx);
      const principal = (horizontal ? dx : dy) * sinal;
      // Comparar as bordas permite entrar em linhas largas e sliders sem
      // exigir que seus centros coincidam com os dos botões menores.
      const sobreposicao = horizontal
        ? Math.min(origem.y + origem.height, caixa.y + caixa.height) - Math.max(origem.y, caixa.y)
        : Math.min(origem.x + origem.width, caixa.x + caixa.width) - Math.max(origem.x, caixa.x);
      return {
        el,
        principal,
        transversal,
        alinhado: sobreposicao > 0,
        distancia: transversal * 3 + Math.hypot(dx, dy),
      };
    })
    .filter((c) => c.principal > 3 && (c.alinhado || c.principal >= c.transversal))
    .sort(
      (a, b) =>
        Number(b.alinhado) - Number(a.alinhado) ||
        (a.alinhado && b.alinhado ? a.principal - b.principal : 0) ||
        a.distancia - b.distancia,
    );
  // Sem destino naquela direção, manter o foco. A ordem do DOM não descreve
  // a posição visual e fazia o direcional saltar para outra linha ou coluna.
  candidatos[0]?.el.focus();
}
