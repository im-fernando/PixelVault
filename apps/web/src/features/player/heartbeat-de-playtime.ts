import { useEffect, useRef } from 'react';
import {
  heartbeatResponseSchema,
  INTERVALO_DE_HEARTBEAT_SEGUNDOS,
  type HeartbeatResponse,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * Dispara `POST /progress/heartbeat/:romId` enquanto o jogo está de fato
 * rodando — issue #119, modelo de confiança no
 * [ADR 0009](../../../../../docs/adr/0009-modelo-de-confianca-do-playtime.md).
 *
 * `romId` aqui é o `id` da linha da biblioteca (o mesmo que
 * `/progress/sram/:romId` já usa), não o `sha256` que `EmulatorPlayer` usa
 * para o storage local — os dois têm nomes parecidos e identidades
 * diferentes. `null` (ROM não reconhecida pelo catálogo, ou player fora da
 * biblioteca — `PlayPage`/`LocalPlayPage`) desliga o hook inteiro: nenhum
 * heartbeat é mandado, e o servidor nem chegaria a creditar nada mesmo que
 * fosse (docs/adr/0009, decisão 3) — a checagem aqui só evita a viagem de
 * rede morta.
 *
 * `ativo` é `abaVisivel && status === 'running'`, o mesmo sinal que já pausa
 * a emulação desde a M1 (`use-emulator.ts`) — nenhum sinal novo, só o
 * primeiro consumidor dele do lado do playtime.
 *
 * O primeiro heartbeat dispara imediatamente ao ficar `ativo` (não espera o
 * intervalo inteiro para o servidor saber que a sessão começou), e os
 * seguintes a cada `INTERVALO_DE_HEARTBEAT_SEGUNDOS`. Parar de estar `ativo`
 * (pausou, aba escondeu, ROM trocou) para o timer — não manda um heartbeat
 * de despedida, porque não há nada de especial a creditar no fim: o próximo
 * heartbeat, sempre que ele vier, retoma medindo a partir de onde o servidor
 * parou.
 */
export function useHeartbeatDePlaytime(romId: string | null, ativo: boolean): void {
  // Falha de heartbeat é best-effort: uma rede instável perde alguns segundos
  // de crédito, nunca quebra o jogo. Guardado só para não empilhar erro no
  // console a cada tentativa nova.
  const emVooRef = useRef(false);

  useEffect(() => {
    if (romId === null || !ativo) return;

    const mandar = (): void => {
      if (emVooRef.current) return;
      emVooRef.current = true;
      apiFetch<HeartbeatResponse>(
        `/api/progress/heartbeat/${encodeURIComponent(romId)}`,
        heartbeatResponseSchema,
        { method: 'POST' },
      )
        .catch(() => undefined)
        .finally(() => {
          emVooRef.current = false;
        });
    };

    mandar();
    const intervalo = window.setInterval(mandar, INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1000);
    return () => window.clearInterval(intervalo);
  }, [romId, ativo]);
}
