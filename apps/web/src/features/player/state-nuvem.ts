import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES,
  stateDownloadResponseSchema,
  stateListResponseSchema,
  stateUploadResponseSchema,
  type SlotDeSaveState,
  type StateListResponse,
  type StateUploadResponse,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { CHAVE_DAS_CONQUISTAS } from '../achievements/use-conquistas.js';
import { toArrayBuffer } from './storage/bytes.js';
import { gravarPointerDeSaveState } from './storage/state-sync-pointer.js';

/**
 * Client HTTP do save state na nuvem (`progress`, M5) — mesma convenção de
 * `sram-nuvem.ts`, aplicada aos endpoints da #105/#106.
 *
 * O envio automático e a comparação por revisão são coordenados pelo hook
 * de sincronização; esta camada só confirma o ponteiro após sucesso da API.
 */
export function chaveDosSaveStatesNaNuvem(romId: string): QueryKey {
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

/**
 * O upload em si, sem hook — a #108 chama isto de dentro de um efeito
 * assíncrono próprio (upload de slot "apenas local", disparado por clique,
 * não por render), onde um `useMutation` não serve: o slot varia em tempo de
 * execução, e chamar o hook uma vez por slot dentro de um loop violaria a
 * regra de hooks. `useEnviarSaveStateParaNuvem`, abaixo, é o wrapper para
 * quem já sabe o slot no momento de montar o componente (`ResolucaoDeConflitoDeSaveState`).
 *
 * `updatedAtLocal` é um parâmetro à parte, não um campo de `entrada`: ele
 * nunca vai no corpo da requisição (a API não pede, nem devia — é o
 * `updatedAt` do save LOCAL que foi lido para montar este envio, e serve só
 * para o ponteiro de sincronização (issue #108, ver o comentário de
 * `gravarPointerDeSaveState` sobre por que a revisão sozinha não basta).
 */
export async function enviarSaveState(
  romId: string,
  slot: SlotDeSaveState,
  entrada: EnvioDeSaveState,
  updatedAtLocal: number,
): Promise<StateUploadResponse> {
  const resposta = await apiFetch(
    `/api/progress/state/${encodeURIComponent(romId)}/${slot}`,
    stateUploadResponseSchema,
    { method: 'POST', body: JSON.stringify(entrada), signal: AbortSignal.timeout(30_000) },
  );
  // Toda gravação bem-sucedida marca ESTE aparelho como reconciliado com
  // essa revisão E com o `updatedAt` local que gerou o envio — issue #108.
  // É o que faz o próximo boot (ou a próxima leitura da listagem) tratar o
  // slot como sincronizado, e não como colisão de novo — até a próxima vez
  // que o local mudar. Ver `storage/state-sync-pointer.ts`.
  gravarPointerDeSaveState(romId, slot, resposta.revision, updatedAtLocal);
  return resposta;
}

export function useEnviarSaveStateParaNuvem(romId: string, slot: SlotDeSaveState) {
  const queryClient = useQueryClient();

  return useMutation<StateUploadResponse, unknown, EnvioDeSaveState & { updatedAtLocal: number }>({
    mutationFn: ({ updatedAtLocal, ...entrada }) =>
      enviarSaveState(romId, slot, entrada, updatedAtLocal),
    onSuccess: () => {
      // Refaz a listagem: é dela que a galeria (#108) vai ler o estado de
      // sincronização de cada slot depois de uma escolha.
      void queryClient.invalidateQueries({ queryKey: chaveDosSaveStatesNaNuvem(romId) });
      // Gravar o primeiro save state pode desbloquear `primeiro_save_state`
      // (ADR 0010) — mesmo raciocínio de `use-envio-de-rom.ts`.
      void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_CONQUISTAS });
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

/** Uma prévia ausente ou grande demais nunca deve impedir o backup do progresso. */
export async function miniaturaParaEnvio(thumbnail: Blob | null): Promise<string> {
  if (thumbnail !== null && thumbnail.size <= TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES) {
    return blobParaBase64(thumbnail);
  }
  // WebP transparente de 1×1; não reutiliza uma imagem de outro momento do jogo.
  return 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
}
