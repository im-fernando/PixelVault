import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  sramDownloadResponseSchema,
  sramUploadResponseSchema,
  type SramDownloadResponse,
  type SramUploadResponse,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * Client HTTP da SRAM na nuvem (`progress`, M4) — mesma convenção de
 * `download-de-rom.ts` (`library`).
 *
 * ## Onde mora o "vínculo" que a #91 vai usar
 *
 * Esta issue não grava nenhuma flag de "este romId foi adotado". A própria
 * existência de um save na nuvem (`status: 'encontrado'` aqui) já é a fonte
 * de verdade: não há como a nuvem ter algo para um `romId` sem que a #92
 * (esta issue) ou a sincronização automática da #91 tenham escrito ali antes
 * — e as duas únicas gravações possíveis, por servidor (#89), exigem posse da
 * ROM. Uma flag separada seria uma segunda cópia do mesmo fato, capaz de
 * divergir dele (ex.: adoção que grava a flag mas falha antes de confirmar o
 * upload). Quem pegar a #91 lê o mesmo `useSramNaNuvem` daqui: `status ===
 * 'encontrado'` é "existe vínculo, a sincronização automática assume".
 */
function chaveDoSramNaNuvem(romId: string): QueryKey {
  return ['sram-na-nuvem', romId];
}

export function useSramNaNuvem(romId: string | null) {
  return useQuery<SramDownloadResponse>({
    queryKey: chaveDoSramNaNuvem(romId ?? ''),
    queryFn: () =>
      apiFetch(`/api/progress/sram/${encodeURIComponent(romId!)}`, sramDownloadResponseSchema),
    enabled: romId !== null,
    // A revisão que volta daqui é a base da próxima gravação (regra 4 do ADR
    // 0020) — uma resposta velha no cache levaria a próxima adoção a mandar
    // uma `revision` que o servidor já superou.
    staleTime: 0,
  });
}

export interface EnvioDeSram {
  readonly dataBase64: string;
  /** `0` para a primeira adoção (sem save na nuvem ainda). */
  readonly revision: number;
}

/**
 * Bytes para base64, em pedaços — `String.fromCharCode(...bytes)` estoura a
 * pilha de argumentos bem antes do teto de SRAM (256 KiB); 8 KiB por vez é
 * folgado para qualquer motor.
 */
const TAMANHO_DO_PEDACO = 8 * 1024;

export function bytesParaBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let inicio = 0; inicio < bytes.length; inicio += TAMANHO_DO_PEDACO) {
    const pedaco = bytes.subarray(inicio, inicio + TAMANHO_DO_PEDACO);
    binario += String.fromCharCode(...pedaco);
  }
  return btoa(binario);
}

export function useEnviarSramParaNuvem(romId: string) {
  const queryClient = useQueryClient();

  return useMutation<SramUploadResponse, unknown, EnvioDeSram>({
    mutationFn: ({ dataBase64, revision }) =>
      apiFetch(`/api/progress/sram/${encodeURIComponent(romId)}`, sramUploadResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ dataBase64, revision }),
      }),
    onSuccess: () => {
      // Refaz a leitura: é o `useSramNaNuvem` atualizado que vira o "vínculo"
      // visível para o resto da tela (e, depois, para a #91).
      void queryClient.invalidateQueries({ queryKey: chaveDoSramNaNuvem(romId) });
    },
  });
}
