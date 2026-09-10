import { COTA_DE_SAVE_NA_NUVEM_EM_BYTES } from '@pixelvault/contracts';

/**
 * A regra da cota de save na nuvem — a #93, mesmo desenho de
 * `library/domain/cota.ts`: pura, conferível sem PostgreSQL, porque o número
 * é política do produto, não detalhe de infraestrutura. Quem soma bytes é o
 * adaptador de banco (`UserSaveRepository.medirUso`); quem decide se a
 * gravação passa é esta função.
 *
 * ## Por que só um eixo, sem "quantidade de saves"
 *
 * A cota de ROM (#76) precisa dos dois eixos porque nada limita quantas ROMs
 * minúsculas cabem em 4 GiB. Aqui o segundo eixo já vem de graça: um
 * `UserSave` só existe amarrado a um `UserRom` (a FK composta do model, ver
 * schema.prisma), então a contagem de saves nunca passa da contagem de ROMs
 * da conta — e essa já tem teto (`COTA_DE_ROMS_POR_CONTA`). O raciocínio
 * completo está no comentário de `COTA_DE_SAVE_NA_NUVEM_EM_BYTES`.
 *
 * ## Por que o save antigo entra na conta
 *
 * Regravar o save de uma ROM que a pessoa já sincroniza não pode ser
 * penalizado duas vezes: `uso.bytes` já inclui o save anterior daquele
 * `romId`, então `tamanhoAntigo` sai da soma antes do `tamanhoNovo` entrar. Sem
 * isso, uma conta exatamente na cota nunca mais conseguiria salvar o próprio
 * jogo de novo — nem trocando um save de 2 KiB por outro de 2 KiB.
 */
export interface UsoDoSaveNaNuvem {
  /** Soma de `sizeBytes` de todos os saves da conta, de todos os `romId`. */
  readonly bytes: number;
}

/**
 * Se a gravação estoura a cota, dado o que ela desloca.
 *
 * `tamanhoAntigo` é `0` quando não existe save anterior para aquele `romId`
 * (primeira gravação) — a soma cresce do tamanho inteiro do novo save, sem
 * nada para descontar.
 *
 * A fronteira é inclusiva, como a de `library/domain/cota.ts`: chegar ao
 * número não é estourá-lo.
 */
export function estouraCotaDeSave(
  uso: UsoDoSaveNaNuvem,
  tamanhoAntigo: number,
  tamanhoNovo: number,
): boolean {
  return uso.bytes - tamanhoAntigo + tamanhoNovo > COTA_DE_SAVE_NA_NUVEM_EM_BYTES;
}
