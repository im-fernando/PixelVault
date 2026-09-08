import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { systemIdSchema } from '@pixelvault/contracts';

/**
 * Biblioteca pessoal de desenvolvimento — um ensaio do BYOR da M3.
 *
 * As ROMs vivem em `apps/web/public/roms-local/`, que é ignorado pelo git.
 * Elas NÃO passam pela API e NÃO entram no catálogo: o catálogo é público e
 * só serve homebrew (ver docs/adr/0006). Aqui é o arquivo da própria pessoa,
 * na máquina dela, exatamente como será depois do upload da M3 — só que sem
 * conta e sem storage ainda.
 *
 * Sem o manifesto, a seção simplesmente não aparece. Quem clonar o repositório
 * não vê nada quebrado.
 */
const romLocalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  systemId: systemIdSchema,
  file: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  /**
   * O SHA-256 sem o cabeçalho de copiador, quando existe.
   *
   * Dump de SNES costuma vir com 512 bytes de header do copiador, e é por isso
   * que o hash do arquivo cru NÃO bate com as bases No-Intro, que catalogam
   * sem header. O match por hash da M3 vai precisar tentar os dois.
   */
  sha256SemHeader: z.string().regex(/^[a-f0-9]{64}$/),
  temHeaderDeCopiador: z.boolean(),
  /**
   * Caminho da imagem de lombada, relativo a `apps/web/public/roms-local/`.
   *
   * Opcional porque a maioria dos jogos locais não vai ter uma: sem o campo,
   * o cartucho fechado continua mostrando o título vertical gerado, exatamente
   * como hoje.
   */
  spineImageUrl: z.string().min(1).optional(),
});

export type RomLocal = z.infer<typeof romLocalSchema>;

const manifestoSchema = z.object({ roms: z.array(romLocalSchema) });

export const CAMINHO_ROMS_LOCAIS = '/roms-local';

export function urlDaRomLocal(rom: RomLocal): string {
  return `${CAMINHO_ROMS_LOCAIS}/${rom.file}`;
}

export function urlDaLombadaLocal(rom: RomLocal): string | null {
  return rom.spineImageUrl ? `${CAMINHO_ROMS_LOCAIS}/${rom.spineImageUrl}` : null;
}

export function useRomsLocais() {
  return useQuery<RomLocal[]>({
    queryKey: ['roms-locais'],
    queryFn: async () => {
      const resposta = await fetch(`${CAMINHO_ROMS_LOCAIS}/manifest.json`);
      // 404 é o caso normal de quem não montou biblioteca local.
      if (!resposta.ok) return [];
      return manifestoSchema.parse(await resposta.json()).roms;
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useRomLocal(id: string) {
  const { data, ...resto } = useRomsLocais();
  return { ...resto, data: data?.find((rom) => rom.id === id) ?? null };
}
