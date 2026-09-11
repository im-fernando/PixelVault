import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { BibliotecaPlayPage } from '../player/BibliotecaPlayPage.js';
import { lerPreferencias } from './temas.js';
import './console.css';
import './console-player.css';

export function ConsolePlayPage({ romId }: { romId: string }) {
  const [preferencias] = useState(lerPreferencias);
  const navigate = useNavigate();
  const sair = () => {
    void navigate({ to: '/console', search: { jogo: romId } });
  };
  return (
    <div
      className="console-experience cx-console-player"
      data-console-theme={preferencias.tema}
      data-motion={preferencias.movimento}
      data-ambient={preferencias.ambiente}
    >
      <BibliotecaPlayPage key={romId} romId={romId} aoSairDoConsole={sair} />
    </div>
  );
}
