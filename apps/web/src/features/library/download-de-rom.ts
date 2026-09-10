import { useQuery } from '@tanstack/react-query';
import { romDownloadResponseSchema, type RomDownloadResponse } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * A URL assinada de leitura de uma ROM da biblioteca, e os metadados que vêm
 * junto — ver o comentário de `romDownloadResponseSchema` em
 * `@pixelvault/contracts` para o porquê de tudo isso vir numa resposta só.
 *
 * `romId` de outra conta e `romId` inexistente respondem o mesmo 404
 * (`autorizar-download-de-rom.ts`, no servidor) — este hook não tenta
 * distinguir os dois casos, só propaga o erro para quem chamou.
 *
 * `staleTime: 0` de propósito: a URL vence rápido (curta por decisão da ADR
 * 0013), então uma resposta antiga no cache do React Query não serve para a
 * próxima montagem do player — é melhor pedir de novo do que arriscar uma URL
 * vencida.
 */
export function useDownloadDeRom(romId: string | null) {
  return useQuery<RomDownloadResponse>({
    queryKey: ['download-de-rom', romId],
    queryFn: () =>
      apiFetch(
        `/api/library/roms/${encodeURIComponent(romId!)}/download`,
        romDownloadResponseSchema,
      ),
    enabled: romId !== null,
    staleTime: 0,
  });
}
