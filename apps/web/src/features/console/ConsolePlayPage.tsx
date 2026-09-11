import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { BibliotecaPlayPage } from '../player/BibliotecaPlayPage.js';
import { lerPreferencias } from './temas.js';
import './console.css';
import './console-player.css';
import { Volume2 } from 'lucide-react';
import { ContextoSonoroConsole, useSonsDoConsole } from './use-sons-do-console.js';

export function ConsolePlayPage({ romId }: { romId: string }) {
  const [preferencias] = useState(lerPreferencias);
  const sons = useSonsDoConsole(preferencias);
  const navigate = useNavigate();
  const sair = () => {
    void navigate({ to: '/console', search: { jogo: romId } });
  };
  return (
    <div
      className="console-experience cx-console-player"
      data-console-theme={preferencias.tema}
      data-solstice-mode={preferencias.solsticeEscuro ? 'dark' : 'light'}
      data-motion={preferencias.movimento}
      data-ambient={preferencias.ambiente}
      onClickCapture={sons.aoClicar}
    >
      <ContextoSonoroConsole.Provider value={sons.tocar}>
        <BibliotecaPlayPage key={romId} romId={romId} aoSairDoConsole={sair} />
      </ContextoSonoroConsole.Provider>
      {sons.bloqueado && (
        <button
          type="button"
          className="cx-audio-unlock"
          data-console-sound="nenhum"
          onClick={() => sons.tocar('confirmar')}
        >
          <Volume2 size={16} />
          Ativar sons da interface
        </button>
      )}
    </div>
  );
}
