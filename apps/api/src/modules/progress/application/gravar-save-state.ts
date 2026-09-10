import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { COTA_DE_SAVE_NA_NUVEM_EM_BYTES, type StateUploadResponse } from '@pixelvault/contracts';
import type {
  ArmazenamentoDeObjetos,
  OpcoesDeEscrita,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { ConflictError, NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../../library/index.js';
import { caminhoDoSave } from '../domain/caminho-do-save.js';
import { estouraCotaDeSave } from '../domain/cota.js';
import type { SaveNaNuvem, SlotDeSaveState } from '../domain/user-save.js';
import type { UserSaveRepository } from '../domain/user-save-repository.js';

/** O nome do recurso nos dois 404 — mesmo raciocínio de `gravar-sram.ts`. */
const NOME_DO_RECURSO = 'ROM';

const TIPO_DE_CONTEUDO_DO_ESTADO = 'application/octet-stream';
const TIPO_DE_CONTEUDO_DA_MINIATURA = 'image/webp';

/**
 * A frase da recusa por cota — #109, mesmo teto compartilhado de
 * `gravar-sram.ts` (#93). Ver o raciocínio completo em `domain/cota.ts` e no
 * comentário desta issue sobre por que save state soma no mesmo eixo.
 */
const MENSAGEM_DE_COTA_DE_SAVE =
  `Sua conta chegou ao limite de ${COTA_DE_SAVE_NA_NUVEM_EM_BYTES / 1024 ** 2} MiB de save ` +
  'na nuvem. Remover uma ROM da biblioteca libera o save dela também.';

export interface DependenciasDaGravacaoDeSaveState {
  roms: UserRomRepository;
  saves: UserSaveRepository;
  armazenamento: ArmazenamentoDeObjetos;
}

export interface EntradaDaGravacaoDeSaveState {
  revision: number;
  bytes: Uint8Array;
  thumbnailBytes: Uint8Array;
}

/**
 * Grava o save state de um slot, recusando por conflito de revisão — issue
 * #105, mesma regra 4 do ADR 0020 que `gravar-sram.ts` já aplica à SRAM,
 * agora com o eixo `slot` (#104) e uma segunda escrita para a miniatura.
 *
 * ## Por que a miniatura nunca é opcional aqui
 *
 * `PrismaUserSaveRepository.gravar` grava `thumbnailKey: novo.thumbnailKey
 * ?? null` tanto no `create` quanto no `updateMany` condicional — uma
 * regravação sem miniatura nova APAGARIA a miniatura da gravação anterior,
 * porque o `UPDATE` reescreve a linha inteira, não só os campos "que
 * mudaram". `stateUploadRequestSchema` (`@pixelvault/contracts`) já torna
 * `thumbnailBase64` obrigatório por isso: não existe caminho, nesta rota,
 * para gravar estado sem miniatura.
 *
 * ## Sem sincronização automática — decisão desta issue
 *
 * SRAM sincroniza em segundo plano (#91) porque grava sozinha, o tempo
 * todo, durante a partida. Save state é o oposto: nasce de um clique num
 * slot específico da galeria. Por isso esta issue entrega só a rota — um
 * envio é sempre uma chamada explícita a ela, nunca um efeito colateral de
 * jogar. Se a #108 (front) decidir automatizar o envio depois de um clique
 * local (ex.: "sempre subir o slot que acabou de salvar, sem pedir de
 * novo"), a decisão e a UX são dela; esta rota não presume nem impede isso —
 * ela só recebe uma gravação por vez, do jeito que a SRAM já recebe.
 *
 * ## Cota: mesmo teto de SRAM, não um separado (issue #109)
 *
 * `COTA_DE_SAVE_NA_NUVEM_EM_BYTES` (32 MiB) já soma SRAM e save state juntos
 * — `medirUso` agrega `sizeBytes` **e** `thumbnailSizeBytes` de toda a conta,
 * sem filtrar por `kind`. Um teto separado exigiria decidir como repartir 32
 * MiB entre dois usos que competem pelo mesmo risco (upload é vetor de
 * abuso), sem nenhum motivo de produto para a soma dos dois ser maior que a
 * de um só: 1500 ROMs com os 4 slots cheios de save state de 4 MiB é um
 * cenário tão fora do uso real quanto 1500 ROMs com SRAM de 256 KiB cada — a
 * folga de `COTA_DE_SAVE_NA_NUVEM_EM_BYTES` já foi calibrada pensando no
 * perfil real (poucos slots preenchidos, poucas ROMs com save state), e
 * reaproveitar o número existente evita duas constantes que a mesma pergunta
 * ("quanto uma conta pode guardar de progresso na nuvem?") teria que manter
 * em sincronia.
 *
 * A checagem soma os DOIS objetos de cada lado — o estado que sai/entra e a
 * miniatura que sai/entra — porque `estouraCotaDeSave` não distingue de onde
 * vêm os bytes, só quanto a gravação desloca no total.
 *
 * ## O resto é igual a `gravar-sram.ts`
 *
 * Autoriza → confere a cota → escreve os dois objetos novos (estado e
 * miniatura) → grava a linha condicionada à revisão → limpa os objetos
 * anteriores.
 */
export async function gravarSaveState(
  deps: DependenciasDaGravacaoDeSaveState,
  habilidades: Habilidades,
  userId: string,
  romId: string,
  slot: SlotDeSaveState,
  entrada: EntradaDaGravacaoDeSaveState,
): Promise<StateUploadResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  // Mesmo assunto `Progress` que a SRAM usa (#89) — a habilidade em jogo é
  // escrever o save daquela conta, não o `Library` da ROM em si.
  autorizarOuNaoEncontrado(
    habilidades,
    'update',
    recurso('Progress', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  // Capturado antes de escrever: os dois objetos (estado e miniatura) que a
  // gravação, se vencer, deixa de referenciar.
  const antes = await deps.saves.buscarPorRom(userId, rom.sha256, 'state', slot);

  // Soma os dois objetos de cada lado — ver o cabeçalho da função. O tamanho
  // antigo inclui a miniatura anterior (0 se não existia, primeira gravação
  // deste slot); o novo inclui a miniatura que está chegando agora.
  const uso = await deps.saves.medirUso(userId);
  const tamanhoAntigo = (antes?.sizeBytes ?? 0) + (antes?.thumbnailSizeBytes ?? 0);
  const tamanhoNovo = entrada.bytes.length + entrada.thumbnailBytes.length;
  if (estouraCotaDeSave(uso, tamanhoAntigo, tamanhoNovo)) {
    throw new ConflictError(MENSAGEM_DE_COTA_DE_SAVE, { cota: ['LIMITE_DE_BYTES'] });
  }

  // Dois UUIDs, não um com sufixo: `caminhoDoSave` exige UUID estrito em
  // `tentativa` — cada objeto (estado e miniatura) é uma tentativa própria,
  // mesmo nascendo da mesma chamada.
  const chaveDoEstado = caminhoDoSave(userId, rom.sha256, 'state', randomUUID(), slot);
  const chaveDaMiniatura = caminhoDoSave(userId, rom.sha256, 'state', randomUUID(), slot);

  const opcoesDoEstado: OpcoesDeEscrita = { tipoDeConteudo: TIPO_DE_CONTEUDO_DO_ESTADO };
  const opcoesDaMiniatura: OpcoesDeEscrita = { tipoDeConteudo: TIPO_DE_CONTEUDO_DA_MINIATURA };
  await deps.armazenamento.escrever(chaveDoEstado, entrada.bytes, opcoesDoEstado);
  await deps.armazenamento.escrever(chaveDaMiniatura, entrada.thumbnailBytes, opcoesDaMiniatura);

  const resultado = await deps.saves.gravar({
    userId,
    sha256: rom.sha256,
    kind: 'state',
    slot,
    storageKey: chaveDoEstado,
    sizeBytes: entrada.bytes.length,
    thumbnailKey: chaveDaMiniatura,
    thumbnailSizeBytes: entrada.thumbnailBytes.length,
    revisaoEsperada: entrada.revision,
  });

  if (resultado.tipo === 'conflito') {
    await limparMelhorEsforco(deps.armazenamento, chaveDoEstado);
    await limparMelhorEsforco(deps.armazenamento, chaveDaMiniatura);
    throw new ConflictError(
      'O save state na nuvem foi atualizado por outro dispositivo desde a última leitura',
      await detalhesDoConflito(deps.armazenamento, resultado.atual),
    );
  }

  if (antes !== null) {
    if (antes.storageKey !== chaveDoEstado) {
      await limparMelhorEsforco(deps.armazenamento, antes.storageKey);
    }
    if (antes.thumbnailKey !== null && antes.thumbnailKey !== chaveDaMiniatura) {
      await limparMelhorEsforco(deps.armazenamento, antes.thumbnailKey);
    }
  }

  return {
    status: 'gravado',
    revision: resultado.save.revision,
    sizeBytes: resultado.save.sizeBytes,
    updatedAt: resultado.save.updatedAt.toISOString(),
  };
}

/**
 * `details` de um `ApiError` só aceita `Record<string, string[]>` — números
 * e data viram string, como em `gravar-sram.ts`. A miniatura da nuvem entra
 * como base64 dentro do mesmo formato: é o que deixa a #107 (tela de
 * conflito) desenhar os dois lados sem uma segunda viagem de rede — o 409 já
 * carrega a imagem inteira. `atual === null` (revisão não-zero que nunca
 * existiu) devolve só `revision: ['0']`, sem miniatura nenhuma.
 */
async function detalhesDoConflito(
  armazenamento: ArmazenamentoDeObjetos,
  atual: SaveNaNuvem | null,
): Promise<Record<string, string[]>> {
  if (atual === null) {
    return { revision: ['0'] };
  }

  const detalhes: Record<string, string[]> = {
    revision: [String(atual.revision)],
    sizeBytes: [String(atual.sizeBytes)],
    updatedAt: [atual.updatedAt.toISOString()],
  };

  if (atual.thumbnailKey !== null) {
    // Melhor esforço: se a miniatura não puder ser lida (objeto órfão de uma
    // corrida anterior, por exemplo), o 409 ainda é útil sem ela — a #107
    // mostra a data e o tamanho da nuvem mesmo sem a imagem.
    try {
      const bytesDaMiniatura = await armazenamento.ler(atual.thumbnailKey);
      detalhes.thumbnailBase64 = [Buffer.from(bytesDaMiniatura).toString('base64')];
    } catch {
      // Sem miniatura no 409 — ver o comentário acima.
    }
  }

  return detalhes;
}

async function limparMelhorEsforco(
  armazenamento: ArmazenamentoDeObjetos,
  chave: string,
): Promise<void> {
  try {
    await armazenamento.apagar(chave);
  } catch {
    // Melhor esforço: objeto órfão não corrompe nada, só ocupa espaço. Ver o
    // cabeçalho de `gravar-sram.ts` para o raciocínio completo.
  }
}
