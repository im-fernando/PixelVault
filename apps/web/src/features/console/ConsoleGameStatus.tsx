import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { useState } from 'react';

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
  return (
    <div className="cgp-loading" role={tentar ? 'alert' : 'status'}>
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
