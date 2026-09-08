import { QueryClient } from '@tanstack/react-query';

/**
 * O cache de servidor da aplicação, num módulo próprio.
 *
 * Ele saiu do `main.tsx` porque deixou de ser assunto só de React: a rota
 * protegida decide antes de renderizar qualquer coisa (`beforeLoad` do
 * roteador), e ali não existe hook — precisa do cliente direto. Um cliente
 * por aplicação é o que garante que a resposta de `GET /api/auth/me` buscada
 * pelo roteador seja a MESMA que o cabeçalho lê em seguida, sem uma segunda
 * requisição e sem os dois discordarem por um instante.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
