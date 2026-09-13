import { perfilDoControle, traduzirControle } from '../player/input/gamepad-map.js';
import { gamepadSolto } from '../player/input/snes-keymap.js';
import { criarRepeticaoDoDirecional } from './teclado-do-console.js';
import { moverFoco } from './foco-do-console.js';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ConsoleGameStatus({
  titulo,
  detalhe,
  capaUrl,
  sair,
  tentar,
}: {
  titulo: string;
  detalhe: string;
  capaUrl?: string | null | undefined;
  sair: () => void;
  tentar?: (() => void) | undefined;
}) {
  const [capaFalhou, setCapaFalhou] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const acoes = useRef({ sair });
  acoes.current = { sair };
  useEffect(() => {
    let anterior = gamepadSolto();
    let armado = false;
    const repetir = criarRepeticaoDoDirecional();
    const intervalo = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p?.connected);
      if (!pad || document.visibilityState === 'hidden') {
        armado = false;
        repetir(null, 0);
        return;
      }
      const estado = traduzirControle(pad, perfilDoControle(pad));
      // Não reaproveita o botão que iniciou o jogo na tela de carregamento.
      if (!Object.values(estado).some(Boolean)) armado = true;
      if (armado) {
        const botoes = Array.from(
          raiz.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
        );
        const direcao = repetir(
          (['up', 'down', 'left', 'right'] as const).find((d) => estado[d]) ?? null,
          performance.now(),
        );
        if (estado.a && !anterior.a) acoes.current.sair();
        else if (direcao) moverFoco(botoes, direcao);
        else if (estado.b && !anterior.b) {
          const foco = document.activeElement;
          if (foco instanceof HTMLButtonElement && botoes.includes(foco)) foco.click();
          else botoes[0]?.focus();
        }
      }
      anterior = estado;
    }, 40);
    return () => window.clearInterval(intervalo);
  }, []);
  return (
    <div ref={raiz} className="cgp-loading" role={tentar ? 'alert' : 'status'}>
      <div className="cx-atmosphere" aria-hidden="true">
        <div />
        <i />
      </div>
      <span className="cgp-system-brand">
        PIXELVAULT <i /> PLAY YOUR WAY
      </span>
      <div className="cgp-boot-art" aria-hidden="true">
        {capaUrl && !capaFalhou ? (
          <img src={capaUrl} alt="" onError={() => setCapaFalhou(true)} />
        ) : (
          <Gamepad2 size={56} strokeWidth={1} />
        )}
      </div>
      <span className="cx-overline">
        {tentar ? 'A SESSÃO PRECISA DE ATENÇÃO' : 'PREPARANDO SEU UNIVERSO'}
      </span>
      <h1>{titulo}</h1>
      <p>{detalhe}</p>
      {!tentar && (
        <span className="cgp-boot-progress" aria-hidden="true">
          <i />
        </span>
      )}
      {tentar && (
        <button type="button" className="cx-play" onClick={tentar}>
          Tentar novamente
        </button>
      )}
      <button type="button" className="cgp-back" onClick={sair}>
        <ArrowLeft size={16} />
        Voltar ao console
      </button>
    </div>
  );
}
