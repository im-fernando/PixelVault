// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERVALO_DE_HEARTBEAT_SEGUNDOS } from '@pixelvault/contracts';
import { useHeartbeatDePlaytime } from './heartbeat-de-playtime.js';

const ROM_ID = '11111111-1111-4111-8111-111111111111';

function respostaJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    respostaJson({ status: 'creditado', segundosCreditados: 0, totalPlaytimeSeconds: 0 }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useHeartbeatDePlaytime', () => {
  it('não manda nada quando romId é null, mesmo com o jogo rodando', async () => {
    const fetch = fetchMock();
    vi.stubGlobal('fetch', fetch);

    renderHook(() => useHeartbeatDePlaytime(null, true));
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1000 * 3);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('não manda nada quando não está ativo (pausado ou aba oculta) — mesma ideia da aba oculta não creditar', async () => {
    const fetch = fetchMock();
    vi.stubGlobal('fetch', fetch);

    renderHook(() => useHeartbeatDePlaytime(ROM_ID, false));
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1000 * 3);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('manda o primeiro heartbeat imediatamente ao ficar ativo, e depois a cada intervalo', async () => {
    const fetch = fetchMock();
    vi.stubGlobal('fetch', fetch);

    renderHook(() => useHeartbeatDePlaytime(ROM_ID, true));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(`/progress/heartbeat/${ROM_ID}`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });

    await vi.advanceTimersByTimeAsync(INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('para de mandar quando deixa de estar ativo', async () => {
    const fetch = fetchMock();
    vi.stubGlobal('fetch', fetch);

    const { rerender } = renderHook(
      ({ ativo }: { ativo: boolean }) => useHeartbeatDePlaytime(ROM_ID, ativo),
      {
        initialProps: { ativo: true },
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ ativo: false });
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1000 * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
