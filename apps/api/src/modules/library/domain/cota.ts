import {
  COTA_DE_ARMAZENAMENTO_EM_BYTES,
  COTA_DE_ROMS_POR_CONTA,
  type MotivoDeCota,
} from '@pixelvault/contracts';

/**
 * A regra da cota: o que a biblioteca já ocupa decide se cabe mais uma ROM.
 *
 * Pura, e por isso conferível sem PostgreSQL nem Fastify — o mesmo desenho de
 * `identity/domain/limite-de-tentativas.ts`, e pelo mesmo motivo: os números
 * são política do produto, não detalhe de infraestrutura. Quem soma bytes é o
 * adaptador de banco; quem decide se o envio passa é esta função.
 *
 * O raciocínio de cada número está no contrato, junto da constante, porque o
 * front usa os mesmos dois valores para mostrar o quanto falta. O que fica
 * aqui é o resto da política:
 *
 * ## A cota conta o que a pessoa tem, não o que o bucket guarda
 *
 * Duas pessoas com a mesma ROM dividem um objeto só (ADR 0013), mas cada uma
 * gasta o tamanho inteiro na própria cota. Não é imprecisão contábil: cobrar
 * menos pelo arquivo deduplicado transformaria a cota num oráculo — bastaria
 * olhar quanto ela andou para descobrir que **outra pessoa** já tem aquele
 * conteúdo, que é o que a ADR 0013 proíbe. A cota é direito de guardar, não
 * fatura de armazenamento.
 *
 * ## A fronteira é inclusiva
 *
 * Chegar ao número não é estourá-lo. Uma biblioteca de exatamente 4 GiB está
 * cheia, e não em falta — quem é recusado é o envio seguinte.
 */

/** O que a biblioteca de alguém já ocupa, nos dois eixos da cota. */
export interface UsoDaBiblioteca {
  /** Soma de `sizeBytes` das ROMs da pessoa. */
  readonly bytes: number;
  /** Quantas ROMs ela tem. */
  readonly quantidade: number;
}

/**
 * O eixo que recusa este arquivo, ou `null` quando ele cabe.
 *
 * Os bytes são conferidos antes da quantidade porque são o eixo que a pessoa
 * esbarra na prática — o de arquivos existe para o abuso, não para o uso.
 */
export function recusaPorCota(uso: UsoDaBiblioteca, bytesDoArquivo: number): MotivoDeCota | null {
  if (uso.bytes + bytesDoArquivo > COTA_DE_ARMAZENAMENTO_EM_BYTES) return 'LIMITE_DE_BYTES';
  if (uso.quantidade + 1 > COTA_DE_ROMS_POR_CONTA) return 'LIMITE_DE_ARQUIVOS';

  return null;
}
