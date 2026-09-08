import type { RomUploadCompletedResponse } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { caminhoNaQuarentena } from '../domain/quarentena.js';

export interface DependenciasDaConfirmacao {
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * O cliente avisa que terminou de enviar.
 *
 * Hoje isto faz uma coisa só: confirma que o objeto está mesmo na quarentena
 * daquela pessoa. É pouco de propósito — o passo seguinte da ADR 0014 (ler os
 * bytes, calcular o SHA-256 de verdade, validar cabeçalho e sistema, promover
 * para `roms/<sha256>` ou apagar) é a **#72**, e é ali que ele entra: entre a
 * confirmação de existência abaixo e o retorno.
 *
 * O que já está resolvido aqui, e a #72 herda pronto, é a autorização. A chave
 * é montada a partir do `userId` da sessão, então "o envio de outra pessoa"
 * não é um caso a tratar: ele simplesmente não existe no caminho de quem
 * pergunta, e a resposta é o mesmo 404 de um `uploadId` que nunca existiu.
 * Duas respostas idênticas, nenhum oráculo — o mesmo padrão de
 * `autorizarOuNaoEncontrado` no `identity`.
 *
 * Enquanto a #72 não chega, o estado que o cliente vê é "recebido, aguardando
 * verificação". Nada foi para a biblioteca: `user_roms` continua sem linha, e
 * o objeto continua na quarentena, onde a limpeza de upload abandonado (issue
 * própria) o encontra se ninguém verificar.
 */
export async function confirmarEnvioDeRom(
  deps: DependenciasDaConfirmacao,
  userId: string,
  uploadId: string,
): Promise<RomUploadCompletedResponse> {
  const chave = caminhoNaQuarentena(userId, uploadId);

  if (!(await deps.armazenamento.existe(chave))) {
    throw new NotFoundError('Envio');
  }

  // #72 entra aqui.

  return { status: 'recebido-aguardando-verificacao', uploadId };
}
