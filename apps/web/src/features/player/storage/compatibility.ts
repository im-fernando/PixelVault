import type { SystemId } from '@pixelvault/contracts';
import { SaveIncompatibleError } from './errors.js';
import { SAVE_RECORD_FORMAT, type SaveMetadata } from './save-record.js';

/** A identidade da máquina que vai receber o save. */
export interface MachineIdentity {
  readonly systemId: SystemId;
  readonly coreVersion: string;
}

/**
 * Por que este save não serve para esta máquina — ou `null` se serve.
 *
 * Devolve texto em vez de estourar porque a galeria precisa **mostrar** o slot
 * incompatível, e não sumir com ele: quem atualizou o navegador e perdeu
 * acesso a um save merece ver que ele existe e por que não abre.
 *
 * A regra é diferente para cada tipo de save, e essa diferença é o ponto:
 *
 * - **SRAM** é o conteúdo da bateria do cartucho. É do jogo, não do
 *   emulador — sobrevive a troca de versão de core, e por isso `coreVersion`
 *   não entra na conta. Só o console precisa bater.
 * - **Save state** é a fotografia da memória de um core específico. Muda a
 *   versão do core, muda o layout da estrutura, e os mesmos bytes passam a
 *   significar outra coisa. Aqui `coreVersion` é obrigatória e exata.
 */
export function describeIncompatibility(
  metadata: SaveMetadata,
  machine: MachineIdentity,
): string | null {
  if (metadata.format !== SAVE_RECORD_FORMAT) {
    return `gravado no formato ${metadata.format}, este PixelVault lê o ${SAVE_RECORD_FORMAT}`;
  }
  if (metadata.systemId !== machine.systemId) {
    return `gravado em ${metadata.systemId}, este console é ${machine.systemId}`;
  }
  if (metadata.kind === 'sram') {
    return null;
  }
  if (metadata.coreVersion !== machine.coreVersion) {
    return (
      `gravado pelo core ${metadata.coreVersion}, este é o ${machine.coreVersion}. ` +
      'Save state não atravessa versão de core — carregá-lo corromperia a partida.'
    );
  }
  return null;
}

export function isCompatible(metadata: SaveMetadata, machine: MachineIdentity): boolean {
  return describeIncompatibility(metadata, machine) === null;
}

/** Mesma regra, no formato que o caminho de carregar precisa: falhar antes de importar. */
export function assertCompatible(metadata: SaveMetadata, machine: MachineIdentity): void {
  const motivo = describeIncompatibility(metadata, machine);
  if (motivo !== null) {
    throw new SaveIncompatibleError(motivo);
  }
}
