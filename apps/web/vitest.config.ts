import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Configuração separada do `vite.config.ts` porque o teste não precisa do
 * Tailwind nem do `.env` da raiz — e porque o ambiente padrão aqui é `node`.
 *
 * Só o que mexe em DOM paga o preço do jsdom, com `@vitest-environment jsdom`
 * no topo do arquivo. Lógica pura (mapa de teclas, geometria de tela, ciclo de
 * vida da sessão) roda sem navegador nenhum, que é o motivo de ela ter sido
 * escrita fora do React.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
