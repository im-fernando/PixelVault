import { randomUUID } from 'node:crypto';
import type { SramUploadResponse } from '@pixelvault/contracts';
import type {
  ArmazenamentoDeObjetos,
  OpcoesDeEscrita,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { ConflictError, NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../../library/index.js';
import { caminhoDoSave } from '../domain/caminho-do-save.js';
import type { SaveNaNuvem } from '../domain/user-save.js';
import type { UserSaveRepository } from '../domain/user-save-repository.js';

/** O nome do recurso nos dois 404 — mesmo raciocínio de `autorizar-download-de-rom.ts`. */
const NOME_DO_RECURSO = 'ROM';

const TIPO_DE_CONTEUDO_DA_SRAM = 'application/octet-stream';

export interface DependenciasDaGravacaoDeSram {
  roms: UserRomRepository;
  saves: UserSaveRepository;
  armazenamento: ArmazenamentoDeObjetos;
}

export interface EntradaDaGravacaoDeSram {
  revision: number;
  bytes: Uint8Array;
}

/**
 * Grava a SRAM de uma ROM da biblioteca, recusando por conflito de revisão
 * — a regra 4 do [ADR 0020](../../../../../../docs/adr/0020-adotar-o-progresso-local-so-por-escolha-explicita.md)
 * aplicada à sincronização contínua.
 *
 * ## A ordem das operações não é arbitrária
 *
 * Autoriza → escreve os bytes num objeto novo → grava a linha condicionada
 * à revisão → limpa o objeto que deixou de ser referenciado.
 *
 * Escrever antes de gravar é o mesmo raciocínio de
 * `confirmar-envio-de-rom.ts`: a linha em `user_saves` é a promessa de que o
 * objeto existe, então criá-la antes da escrita produziria um save que não
 * baixa. Cada tentativa escreve num **objeto novo** (`caminhoDoSave` sorteia
 * um `uuid`), nunca por cima do atual — é o que garante que duas gravações
 * concorrentes, baseadas na mesma revisão, nunca corrompam os bytes uma da
 * outra: cada uma escreve no seu próprio objeto, e só o `UserSaveRepository`
 * (com um `UPDATE` condicional atômico) decide qual das duas venceu.
 *
 * A perdedora limpa o objeto que escreveu; a vencedora limpa o objeto
 * **anterior**, que parou de ser referenciado quando a linha apontou para o
 * novo. As duas limpezas são melhor esforço: um objeto órfão ocupa espaço,
 * não corrompe nada, e não há teste de aceite pedindo a coleta dele agora.
 */
export async function gravarSram(
  deps: DependenciasDaGravacaoDeSram,
  habilidades: Habilidades,
  userId: string,
  romId: string,
  entrada: EntradaDaGravacaoDeSram,
): Promise<SramUploadResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  // O assunto é `Progress`, não `Library`: a habilidade que está em jogo é
  // escrever o save daquela conta, e a regra já existe desde a #48
  // (`{ action: [...], subject: 'Progress', conditions: { userId } }`),
  // esperando esta issue para ter o primeiro chamador. O `buscarPorId` acima
  // é quem resolve "esta ROM é de quem" — a mesma checagem de posse que
  // `autorizar-download-de-rom.ts` faz para `Library`, aplicada aqui ao dono
  // da ROM em vez de ao dono da sessão.
  autorizarOuNaoEncontrado(
    habilidades,
    'update',
    recurso('Progress', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  // Capturado antes de escrever: é o objeto que a gravação, se vencer, deixa
  // de referenciar.
  const antes = await deps.saves.buscarPorRom(userId, rom.sha256, 'sram');

  const chave = caminhoDoSave(userId, rom.sha256, 'sram', randomUUID());
  const opcoesDeEscrita: OpcoesDeEscrita = { tipoDeConteudo: TIPO_DE_CONTEUDO_DA_SRAM };
  await deps.armazenamento.escrever(chave, entrada.bytes, opcoesDeEscrita);

  const resultado = await deps.saves.gravar({
    userId,
    sha256: rom.sha256,
    kind: 'sram',
    storageKey: chave,
    sizeBytes: entrada.bytes.length,
    revisaoEsperada: entrada.revision,
  });

  if (resultado.tipo === 'conflito') {
    await limparMelhorEsforco(deps.armazenamento, chave);
    throw new ConflictError(
      'O save na nuvem foi atualizado por outro dispositivo desde a última leitura',
      detalhesDoConflito(resultado.atual),
    );
  }

  if (antes !== null && antes.storageKey !== chave) {
    await limparMelhorEsforco(deps.armazenamento, antes.storageKey);
  }

  return {
    status: 'gravado',
    revision: resultado.save.revision,
    sizeBytes: resultado.save.sizeBytes,
    updatedAt: resultado.save.updatedAt.toISOString(),
  };
}

/**
 * `details` de um `ApiError` só aceita `Record<string, string[]>` — os
 * números e a data viram string para caber nesse contrato, e é o front quem
 * os reconverte. `atual === null` (revisão não-zero que nunca existiu)
 * devolve `revision: ['0']` e mais nada: não há tamanho nem data de algo
 * que nunca foi gravado.
 */
function detalhesDoConflito(atual: SaveNaNuvem | null): Record<string, string[]> {
  if (atual === null) {
    return { revision: ['0'] };
  }

  return {
    revision: [String(atual.revision)],
    sizeBytes: [String(atual.sizeBytes)],
    updatedAt: [atual.updatedAt.toISOString()],
  };
}

async function limparMelhorEsforco(
  armazenamento: ArmazenamentoDeObjetos,
  chave: string,
): Promise<void> {
  try {
    await armazenamento.apagar(chave);
  } catch {
    // Melhor esforço: objeto órfão não corrompe nada, só ocupa espaço. Ver o
    // cabeçalho desta função para o raciocínio completo.
  }
}
