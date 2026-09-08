// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCadastrar, useSair } from '../../auth/sessao.js';
import { IndexedDbSaveStorage } from './indexeddb-save-storage.js';
import { sramKey, stateKey, type SaveKey } from './save-key.js';
import type { SaveWriteInput } from './save-record.js';

/**
 * O critério de aceite da #53, automatizado: jogar sem conta, salvar, criar
 * conta — e o save continuar exatamente onde estava.
 *
 * Parece tautológico, e hoje é: a porta de save não conhece usuário e a
 * sessão não conhece save, então nada os liga. É justamente por isso que o
 * teste vale. O dia em que alguém pendurar "limpar o save ao trocar de
 * identidade" ou "adotar tudo no cadastro" dentro de `passouASerOutraPessoa`,
 * a decisão da ADR 0020 vira código quebrado sem ninguém notar — e o defeito
 * só aparece no aparelho de quem perdeu o progresso.
 *
 * A regra `sessao-nao-toca-save-local` do dependency-cruiser cobre o vazamento
 * por import; este teste cobre o comportamento, executando o MESMO fluxo de
 * cadastro que a tela executa.
 */

const ROM = 'c'.repeat(64);
const SRAM = new Uint8Array([0x53, 0x52, 0x41, 0x4d, 1, 2, 3]);
const STATE = new Uint8Array([0x50, 0x56, 0x46, 0x4b, 7, 7, 7]);

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'anonimo@exemplo.com',
  handle: 'anonimo',
  displayName: 'Anônimo',
};

const CADASTRO = {
  email: USUARIO.email,
  handle: USUARIO.handle,
  password: 'senha-bem-comprida-1',
  termsAccepted: true,
} as const;

/** Responde o mínimo que `useCadastrar` e `useSair` precisam ouvir. */
function apiDeMentira(): typeof fetch {
  return vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    const corpo = url.endsWith('/api/auth/register')
      ? { status: 'cadastro-recebido' }
      : url.endsWith('/api/auth/logout')
        ? { status: 'sessao-encerrada' }
        : url.endsWith('/api/auth/login')
          ? { user: USUARIO }
          : { rules: [] };

    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function gravacao(key: SaveKey, data: Uint8Array): SaveWriteInput {
  return { key, data, systemId: 'snes', coreVersion: 'fake-1.0.0', updatedAt: 1_700_000_000_000 };
}

function envolvido(queryClient: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('save local diante da conta', () => {
  let storage: IndexedDbSaveStorage;
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.stubGlobal('fetch', apiDeMentira());
    storage = await IndexedDbSaveStorage.open(new IDBFactory());
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryClient.clear();
  });

  it('mantém SRAM e save state intactos depois de criar conta e entrar', async () => {
    await storage.write(gravacao(sramKey(ROM), SRAM));
    await storage.write(gravacao(stateKey(ROM, 2), STATE));

    const { result } = renderHook(() => useCadastrar(), { wrapper: envolvido(queryClient) });
    const resultado = await result.current.mutateAsync(CADASTRO);
    expect(resultado.entrou).toBe(true);
    await waitFor(() => {
      expect(queryClient.getQueryData(['sessao'])).toEqual(USUARIO);
    });

    const sram = await storage.read(sramKey(ROM));
    const state = await storage.read(stateKey(ROM, 2));
    expect(sram?.data).toEqual(SRAM);
    expect(state?.data).toEqual(STATE);
    // Continua endereçado por `romId` + tipo + slot, sem eixo de usuário: é o
    // que permite a M4 oferecer a adoção depois, com a chave dos dois lados.
    expect(await storage.list(ROM)).toHaveLength(2);
  });

  it('mantém o save quando a pessoa sai da conta', async () => {
    await storage.write(gravacao(sramKey(ROM), SRAM));

    const { result } = renderHook(() => useSair(), { wrapper: envolvido(queryClient) });
    await result.current.mutateAsync();
    await waitFor(() => {
      expect(queryClient.getQueryData(['sessao'])).toBeNull();
    });

    expect((await storage.read(sramKey(ROM)))?.data).toEqual(SRAM);
  });
});
