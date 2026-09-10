import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  stateDownloadResponseSchema,
  stateListResponseSchema,
  stateUploadResponseSchema,
  type SlotDeSaveState,
  type StateListResponse,
  type StateUploadResponse,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { toArrayBuffer } from './storage/bytes.js';

/**
 * Client HTTP do save state na nuvem (`progress`, M5) — mesma convenção de
 * `sram-nuvem.ts`, aplicada aos endpoints da #105/#106.
 *
 * Não existe aqui um "vínculo" para guardar: diferente da SRAM, save state
 * nasce de clique deliberado (issue #105), então não há sincronização
 * automática cujo gatilho dependa de saber se "este aparelho já viu aquele
 * save" — cada operação (listar, baixar, enviar) já carrega a revisão de que
 * precisa na própria resposta.
 */
function chaveDosSaveStatesNaNuvem(romId: string): QueryKey {
  return ['save-states-na-nuvem', romId];
}

/** Os 4 slots da conta para este `romId`, cada um com miniatura embutida — issue #106. */
export function useSaveStatesNaNuvem(romId: string | null) {
  return useQuery<StateListResponse>({
    queryKey: chaveDosSaveStatesNaNuvem(romId ?? ''),
    queryFn: () =>
      apiFetch(`/api/progress/state/${encodeURIComponent(romId!)}`, stateListResponseSchema),
    enabled: romId !== null,
    // Mesmo raciocínio de `sram-nuvem.ts`: a revisão que volta daqui é a
    // base da próxima gravação, e uma resposta velha no cache levaria a
    // próxima tentativa a mandar uma `revision` que o servidor já superou.
    staleTime: 0,
  });
}

/**
 * Os bytes de um slot específico — pede a URL assinada (`GET
 * .../:romId/:slot`, #106) e baixa dela. Não é um hook porque quem resolve
 * conflito só chama isto uma vez, na hora de aplicar a escolha "manter a
 * nuvem" — não há UI que precise reagir a este estado continuamente.
 *
 * `null` quando o slot não tem save na nuvem (não deveria acontecer para
 * quem está resolvendo um conflito, que por definição tem os dois lados —
 * mas a função não presume isso, só reporta o que a API disse).
 */
export async function baixarBytesDoSaveState(
  romId: string,
  slot: SlotDeSaveState,
): Promise<Uint8Array | null> {
  const resposta = await apiFetch(
    `/api/progress/state/${encodeURIComponent(romId)}/${slot}`,
    stateDownloadResponseSchema,
  );
  if (resposta.status === 'sem-save') return null;

  const bytes = await fetch(resposta.url);
  if (!bytes.ok) {
    throw new Error(`Falha ao baixar o save state da nuvem (HTTP ${bytes.status}).`);
  }
  return new Uint8Array(await bytes.arrayBuffer());
}

export interface EnvioDeSaveState {
  readonly dataBase64: string;
  readonly thumbnailBase64: string;
  /** `0` para o primeiro envio deste slot (sem save na nuvem ainda). */
  readonly revision: number;
}

export function useEnviarSaveStateParaNuvem(romId: string, slot: SlotDeSaveState) {
  const queryClient = useQueryClient();

  return useMutation<StateUploadResponse, unknown, EnvioDeSaveState>({
    mutationFn: (entrada) =>
      apiFetch(
        `/api/progress/state/${encodeURIComponent(romId)}/${slot}`,
        stateUploadResponseSchema,
        { method: 'POST', body: JSON.stringify(entrada) },
      ),
    onSuccess: () => {
      // Refaz a listagem: é dela que a galeria (#108) vai ler o estado de
      // sincronização de cada slot depois de uma escolha.
      void queryClient.invalidateQueries({ queryKey: chaveDosSaveStatesNaNuvem(romId) });
    },
  });
}

/**
 * Bytes para base64, em pedaços — mesma função de `sram-nuvem.ts`, repetida
 * aqui porque é pura e pequena, e o teto de save state (4 MiB) muda quantos
 * pedaços saem, não o raciocínio: `String.fromCharCode(...bytes)` estoura a
 * pilha de argumentos bem antes disso.
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

/** O inverso de {@link bytesParaBase64}. */
export function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

/** A miniatura local (`Blob`) para o que o upload manda — mime fixo, mesmo da API (`image/webp`). */
export async function blobParaBase64(thumbnail: Blob): Promise<string> {
  return bytesParaBase64(new Uint8Array(await thumbnail.arrayBuffer()));
}

/** O inverso de {@link blobParaBase64} — para escrever a miniatura da nuvem no storage local. */
export function base64ParaBlob(base64: string): Blob {
  // `Blob` não aceita `Uint8Array` apoiado em `SharedArrayBuffer` — mesmo
  // raciocínio de `toArrayBuffer` em `storage/bytes.ts`, reaproveitado aqui.
  return new Blob([toArrayBuffer(base64ParaBytes(base64))], { type: 'image/webp' });
}
