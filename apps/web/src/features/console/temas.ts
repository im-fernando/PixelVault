import type { SystemId } from '@pixelvault/contracts';

export const TEMAS = [
  {
    id: 'aurora',
    nome: 'Aurora',
    estilo: 'Fluido · imersivo',
    descricao: 'Luz em movimento, jogos em órbita. Seu próximo universo começa aqui.',
  },
  {
    id: 'obsidian',
    nome: 'Obsidian',
    estilo: 'Cinemático · editorial',
    descricao: 'O jogo ocupa a cena. Uma biblioteca vertical com presença de cinema.',
  },
  {
    id: 'solstice',
    nome: 'Solstice',
    estilo: 'Escultural · dia e noite',
    descricao:
      'Capas flutuantes e espaço para respirar. A luz do dia ou a calma de uma noite âmbar.',
  },
  {
    id: 'crt',
    nome: 'CRT',
    estilo: 'Retrô · analógico',
    descricao: 'Fósforo âmbar, cartuchos e linhas de varredura. A máquina do tempo está ligada.',
  },
] as const;

export type TemaConsole = (typeof TEMAS)[number]['id'];
export type ItemDoConsole = {
  readonly id: string;
  readonly titulo: string;
  readonly sistema: SystemId | null;
  readonly capaUrl: string | null;
  readonly favorito: boolean;
  readonly tamanho: string;
};
export type PreferenciasConsole = {
  tema: TemaConsole;
  solsticeEscuro: boolean;
  movimento: boolean;
  ambiente: boolean;
  sons: boolean;
};

export const CHAVE_PREFERENCIAS = 'pixelvault.console.preferences.v1';
const PADRAO: PreferenciasConsole = {
  tema: 'aurora',
  solsticeEscuro: false,
  movimento: true,
  ambiente: true,
  sons: true,
};

export function lerPreferencias(): PreferenciasConsole {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) ?? 'null');
    if (typeof valor !== 'object' || valor === null) return PADRAO;
    const dados = valor as Record<string, unknown>;
    return {
      tema: TEMAS.find((tema) => tema.id === dados.tema)?.id ?? PADRAO.tema,
      solsticeEscuro:
        typeof dados.solsticeEscuro === 'boolean' ? dados.solsticeEscuro : PADRAO.solsticeEscuro,
      movimento: typeof dados.movimento === 'boolean' ? dados.movimento : PADRAO.movimento,
      ambiente: typeof dados.ambiente === 'boolean' ? dados.ambiente : PADRAO.ambiente,
      sons: typeof dados.sons === 'boolean' ? dados.sons : PADRAO.sons,
    };
  } catch {
    // Armazenamento bloqueado não deve impedir o console de abrir.
    return PADRAO;
  }
}

export function salvarPreferencias(preferencias: PreferenciasConsole): boolean {
  try {
    localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(preferencias));
    return true;
  } catch {
    return false;
  }
}

export function matizDoJogo(titulo: string): number {
  return Array.from(titulo).reduce((hash, letra) => (hash * 31 + letra.charCodeAt(0)) % 360, 0);
}
