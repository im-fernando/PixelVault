import type { AchievementCode } from '@pixelvault/contracts';

/**
 * Bronze, prata e ouro são um eixo do domínio (ADR 0010), e a cor de cada
 * um é a única cor com significado na vitrine de conquistas. O nível mora no
 * sufixo do código — `colecionista_bronze`, `dedicacao_ouro` — e é lido de
 * lá, e não de um campo novo no catálogo: o catálogo empresta texto a cada
 * código, e inventar nele um campo que o próprio código já carrega seria
 * duas fontes para o mesmo fato.
 */
export type NivelDaConquista = 'bronze' | 'prata' | 'ouro';

/** `null` para as conquistas de primeiro gesto, que não têm patamar. */
export function nivelDaConquista(code: AchievementCode): NivelDaConquista | null {
  if (code.endsWith('_bronze')) return 'bronze';
  if (code.endsWith('_prata')) return 'prata';
  if (code.endsWith('_ouro')) return 'ouro';
  return null;
}
