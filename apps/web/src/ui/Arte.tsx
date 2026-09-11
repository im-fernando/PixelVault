import { Gamepad2 } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

/**
 * A arte de um jogo — a mesma peça que o modo console usa, agora do lado do
 * site inteiro.
 *
 * Duas camadas quando há capa: a imagem em `contain`, para nunca cortar a
 * caixa, e uma cópia desfocada por trás preenchendo a moldura. Assim uma capa
 * em pé cabe numa moldura quadrada sem faixa preta nem recorte.
 *
 * Sem capa, a arte não é buraco: é um objeto visual com matiz estável por
 * título, o nome do jogo e o console. É o que resolve o problema real do
 * conteúdo — homebrew quase nunca tem arte de caixa — sem que a tela quebre
 * no primeiro dado de verdade.
 */
export function Arte({
  titulo,
  sistema,
  capaUrl,
  className = '',
}: {
  readonly titulo: string;
  readonly sistema: string | null;
  readonly capaUrl: string | null | undefined;
  readonly className?: string;
}) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const capa = capaUrl && falhou !== capaUrl ? capaUrl : null;

  return (
    <div
      className={`pv-arte ${className}`}
      style={{ '--matiz': matizDoTitulo(titulo) } as CSSProperties}
      aria-hidden="true"
    >
      <div className="pv-arte-substituta">
        <span>{sistema ?? 'PIXELVAULT'}</span>
        <Gamepad2 strokeWidth={1} />
        <strong>{titulo}</strong>
        <small>PLAYER ONE</small>
      </div>
      {capa !== null && (
        <>
          <img className="pv-arte-fundo" src={capa} alt="" draggable={false} />
          <img src={capa} alt="" draggable={false} onError={() => setFalhou(capa)} />
        </>
      )}
    </div>
  );
}

/** Matiz estável por título — uma prateleira toda da mesma cor não é prateleira. */
export function matizDoTitulo(titulo: string): number {
  let h = 0;
  for (const ch of titulo) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
