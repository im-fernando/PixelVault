import { randomUUID } from 'node:crypto';
import {
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
  TIPO_DE_CONTEUDO_DA_ROM,
  type RomUploadRequest,
  type RomUploadResponse,
} from '@pixelvault/contracts';
import { DomainError } from '../../../infrastructure/errors.js';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { caminhoNaQuarentena } from '../domain/quarentena.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';

export interface DependenciasDoEnvioDeRom {
  roms: UserRomRepository;
  /** A porta de storage. Quem assina é ela; o caso de uso só sabe o caminho. */
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Autoriza o envio de uma ROM para a quarentena.
 *
 * Três decisões moram aqui, e as três são da ADR 0014:
 *
 * 1. **O caminho é do servidor.** O `uploadId` é sorteado aqui, e o prefixo
 *    sai da sessão. Não existe campo de entrada que influencie onde o objeto
 *    vai parar — nem o hash, que é o que tornaria a rota um vetor de
 *    envenenamento do `roms/<sha256>` compartilhado.
 * 2. **O hash é dica.** Se a pessoa já tem aquele conteúdo, respondemos "já
 *    está na sua biblioteca" e não assinamos nada. Se ela mentir o hash, o
 *    pior que acontece é ela receber a ROM que ela mesma tem — a mentira não
 *    alcança ninguém, porque a consulta é restrita à biblioteca dela.
 * 3. **Tipo e tamanho entram na assinatura.** A URL vale para exatamente
 *    aqueles bytes, com aquele `Content-Type`. Sem isso, uma URL pedida para
 *    dois megabytes serviria para despejar dois gigabytes na quarentena, e a
 *    cota da #76 nasceria já contornável.
 *
 * O que este caso de uso **não** faz é conferir a ROM: nada foi enviado ainda,
 * e mesmo depois de enviado quem lê os bytes e calcula o hash de verdade é a
 * verificação da #72.
 */
export async function solicitarEnvioDeRom(
  deps: DependenciasDoEnvioDeRom,
  userId: string,
  entrada: RomUploadRequest,
): Promise<RomUploadResponse> {
  // O contrato já barra o tamanho fora da faixa na borda, e é ali que a
  // recusa acontece na prática. Isto é a rede embaixo: o dia em que este caso
  // de uso for chamado de outro lugar (uma fila, um script de importação), o
  // teto continua valendo. Nunca se assina antes de ele passar.
  if (
    !Number.isInteger(entrada.sizeBytes) ||
    entrada.sizeBytes <= 0 ||
    entrada.sizeBytes > TAMANHO_MAXIMO_DE_ROM_EM_BYTES
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `A ROM precisa ter entre 1 byte e ${TAMANHO_MAXIMO_DE_ROM_EM_BYTES} bytes`,
      422,
      { sizeBytes: ['TAMANHO_DE_ROM_INVALIDO'] },
    );
  }

  if (entrada.sha256 !== undefined) {
    const jaTem = await deps.roms.buscarPorHash(userId, entrada.sha256);
    if (jaTem !== null) return { status: 'ja-na-biblioteca', romId: jaTem.id };
  }

  const uploadId = randomUUID();
  const url = await deps.armazenamento.assinarEnvio(caminhoNaQuarentena(userId, uploadId), {
    tipoDeConteudo: TIPO_DE_CONTEUDO_DA_ROM,
    tamanhoEmBytes: entrada.sizeBytes,
  });

  return {
    status: 'envio-autorizado',
    uploadId,
    url,
    contentType: TIPO_DE_CONTEUDO_DA_ROM,
    sizeBytes: entrada.sizeBytes,
    expiresInSeconds: VALIDADE_PADRAO_EM_SEGUNDOS,
  };
}
