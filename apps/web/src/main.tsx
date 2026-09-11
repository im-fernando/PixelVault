// O CSS global vem ANTES das rotas de propósito: é ele que declara a ordem
// das camadas do Tailwind. Um CSS de feature importado antes dele (o do
// player, o do console) abriria a cascata com a própria camada e o preflight
// passaria a vencer toda classe `pv-*` do site.
import './styles.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { router } from './app/routes.js';
import { ProvedorDeSessao } from './features/auth/sessao.js';
import { queryClient } from './lib/query-client.js';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado no index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Acima do roteador porque o cabeçalho, que é dele, precisa saber
          quem está logado — e porque assim a pergunta "quem está logado" é
          feita uma vez por carregamento da página, não uma por rota. */}
      <ProvedorDeSessao>
        <RouterProvider router={router} />
      </ProvedorDeSessao>
    </QueryClientProvider>
  </StrictMode>,
);
