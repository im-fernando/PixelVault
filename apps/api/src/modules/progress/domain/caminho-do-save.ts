import type { TipoDeSaveNaNuvem } from './user-save.js';

/**
 * Onde o save de uma conta mora no bucket.
 *
 * `saves/<userId>/<sha256>/<kind>/<uuid>` — o prefixo carrega o dono, como a
 * quarentena da ROM (`library/domain/quarentena.ts`): objeto de outra
 * pessoa nem existe no seu caminho. O `<uuid>` no fim é o que faz cada
 * tentativa de gravação escrever num objeto novo, nunca por cima do save
 * atual — é isso que evita que uma gravação perdedora (revisão desatualizada,
 * `gravar-sram.ts`) corrompa os bytes de quem venceu a corrida antes de o
 * banco decidir quem venceu. Quem limpa o objeto órfão é o caso de uso,
 * depois de saber o resultado.
 */
export const PREFIXO_DOS_SAVES = 'saves';

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function caminhoDoSave(
  userId: string,
  sha256: string,
  kind: TipoDeSaveNaNuvem,
  tentativa: string,
): string {
  if (!UUID.test(userId) || !UUID.test(tentativa)) {
    throw new TypeError('Caminho de save só se monta com UUID — ver caminho-do-save.ts');
  }
  if (!SHA256.test(sha256)) {
    throw new TypeError(
      'Caminho de save só se monta com SHA-256 hexadecimal — ver caminho-do-save.ts',
    );
  }

  return `${PREFIXO_DOS_SAVES}/${userId}/${sha256}/${kind}/${tentativa}`;
}
