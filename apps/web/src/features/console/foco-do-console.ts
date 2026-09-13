export function moverFoco(elementos: HTMLElement[], direcao: 'left' | 'right' | 'up' | 'down') {
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
      Number(ativo.max),
      Math.max(Number(ativo.min), Number(ativo.value) + sinal * Number(ativo.step || 5)),
    );
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      ativo,
      String(valor),
    );
    ativo.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const candidatos = elementos
    .filter((el) => el !== ativo)
    .map((el) => {
      const caixa = el.getBoundingClientRect();
      const dx = caixa.x + caixa.width / 2 - (origem.x + origem.width / 2);
      const dy = caixa.y + caixa.height / 2 - (origem.y + origem.height / 2);
      return {
        el,
        principal: (horizontal ? dx : dy) * sinal,
        distancia: Math.abs(horizontal ? dy : dx) * 3 + Math.hypot(dx, dy),
      };
    })
    .filter((c) => c.principal > 3)
    .sort((a, b) => a.distancia - b.distancia);
  (
    candidatos[0]?.el ??
    elementos[(Math.max(indice, 0) + sinal + elementos.length) % elementos.length]
  )?.focus();
}
