import type { RomUploadCompletedResponse } from '@pixelvault/contracts';
import { DomainError, NotFoundError } from '../../../infrastructure/errors.js';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { caminhoDaRom } from '../domain/caminho-da-rom.js';
import type { HashesParaCasar, IdentificarRomNoCatalogo } from '../domain/catalogo-de-roms.js';
import { RomRecusada } from '../domain/erros.js';
import type { AvisarPrimeiraRomEnviada } from '../domain/eventos-de-gamificacao.js';
import { caminhoNaQuarentena } from '../domain/quarentena.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';
import { verificarRom, type RomVerificada } from '../domain/verificacao-de-rom.js';

export interface DependenciasDaConfirmacao {
  armazenamento: ArmazenamentoDeObjetos;
  roms: UserRomRepository;
  /** O match de hash contra o catálogo, que quem monta o caso de uso liga. */
  catalogo: IdentificarRomNoCatalogo;
  /**
   * Avisa `achievements` de que esta conta enviou uma ROM — chamado sempre
   * que a promoção termina, mesmo quando a linha já existia (`registrar` é
   * idempotente). Quem decide se é a "primeira" é o outro lado da fachada,
   * pela constraint única de `user_achievements`; este caso de uso não
   * pergunta, só avisa (issue #120).
   */
  avisarEnvioDeRom: AvisarPrimeiraRomEnviada;
}

/**
 * O cliente avisa que terminou de enviar, e é aqui que a ROM vira ROM.
 *
 * É o passo 4 em diante da [ADR 0014](../../../../../../docs/adr/0014-verificar-a-rom-em-quarentena-antes-de-promover.md):
 * o servidor lê os bytes da quarentena, calcula o SHA-256 **dele**, confere
 * que aquilo é mesmo uma ROM do sistema que o nome promete e só então promove
 * o objeto para `roms/<sha256>` — ou descobre que aquele conteúdo já está lá e
 * não transfere nada.
 *
 * ## O que o cliente ainda decide, e o que ele não decide mais
 *
 * Decide o nome do arquivo, que é dele e vai para a biblioteca dele. Não
 * decide mais nada: o caminho da quarentena sai da sessão (#71), e o caminho
 * definitivo sai do hash calculado aqui. O hash que ele informou no pedido de
 * upload não é lido em lugar nenhum deste arquivo — ele era dica para
 * responder "você já tem esse" antes de transferir, e a dica acaba ali.
 *
 * ## A ordem das operações não é arbitrária
 *
 * Verificar → promover → apagar a quarentena → registrar a referência.
 *
 * Registrar por último porque a linha em `user_roms` é a promessa de que o
 * objeto existe: criá-la antes da cópia produziria biblioteca com ROM que não
 * baixa, que é pior do que upload que falhou. O caminho oposto — objeto
 * promovido sem linha nenhuma — é só um objeto sem referência, que a próxima
 * tentativa reaproveita pelo dedupe e que a coleta da ADR 0013 recolhe.
 *
 * Apagar a quarentena antes de registrar pelo mesmo raciocínio: se apagar
 * falhar, o erro sobe, a pessoa tenta de novo e a segunda tentativa passa pelo
 * mesmo caminho — só que agora o destino já existe e ela cai no dedupe. Nada
 * fica pela metade sem que uma retentativa conserte.
 */
export async function confirmarEnvioDeRom(
  deps: DependenciasDaConfirmacao,
  userId: string,
  uploadId: string,
  fileName: string,
): Promise<RomUploadCompletedResponse> {
  const quarentena = caminhoNaQuarentena(userId, uploadId);

  // A chave é montada a partir do `userId` da sessão, então "o envio de outra
  // pessoa" não existe no caminho de quem pergunta: a resposta é o mesmo 404
  // de um `uploadId` que nunca existiu. Duas respostas idênticas, nenhum
  // oráculo — o mesmo padrão de `autorizarOuNaoEncontrado` no `identity`.
  if (!(await deps.armazenamento.existe(quarentena))) {
    throw new NotFoundError('Envio');
  }

  const verificada = await verificarOuLimpar(deps.armazenamento, quarentena, fileName);

  const destino = caminhoDaRom(verificada.sha256);
  const deduplicado = await deps.armazenamento.existe(destino);
  if (!deduplicado) {
    await deps.armazenamento.copiar(quarentena, destino);
  }
  await deps.armazenamento.apagar(quarentena);

  const identificada = await deps.catalogo(hashesParaCasar(verificada));
  const gameId = identificada?.gameId ?? null;

  const rom = await deps.roms.registrar({
    userId,
    sha256: verificada.sha256,
    md5: verificada.md5,
    storageKey: destino,
    sizeBytes: verificada.sizeBytes,
    fileName: verificada.fileName,
    gameId,
  });

  // Depois de registrar, nunca antes: uma ROM que falhasse a verificação não
  // pode acender conquista de envio que não aconteceu. O aviso vale mesmo
  // numa retentativa que caiu no dedupe do `registrar` — `achievements` é
  // quem decide que aquilo não é novidade, não este caso de uso.
  await deps.avisarEnvioDeRom(userId);

  return {
    status: 'na-biblioteca',
    romId: rom.id,
    sha256: verificada.sha256,
    gameId,
    sizeBytes: verificada.sizeBytes,
    deduplicado,
  };
}

/**
 * Lê os bytes e confere. Recusou, a quarentena some antes do erro subir.
 *
 * Apagar faz parte da recusa, e não é faxina: o que não vai ser promovido não
 * pode ficar ocupando espaço numa conta nem esperando a limpeza de upload
 * abandonado. É o último item do escopo da ADR 0014 — "falhou a verificação, a
 * quarentena é apagada e nada é promovido".
 */
async function verificarOuLimpar(
  armazenamento: ArmazenamentoDeObjetos,
  quarentena: string,
  fileName: string,
): Promise<RomVerificada> {
  const bytes = await armazenamento.ler(quarentena);

  try {
    return verificarRom(bytes, fileName);
  } catch (erro) {
    if (!(erro instanceof RomRecusada)) throw erro;

    await armazenamento.apagar(quarentena);
    // 422, e não 400: a sintaxe da requisição estava certa: o que não passou
    // foi a regra de negócio sobre o conteúdo. O `details.rom` carrega o
    // motivo estável, que é o que o front usa para escolher a frase.
    throw new DomainError('VALIDATION_FAILED', erro.message, 422, { rom: [erro.motivo] });
  }
}

/**
 * Os hashes que o catálogo deve tentar, separados por tipo.
 *
 * Os dois de cada tipo quando há cabeçalho de copiador, porque as bases de
 * metadado catalogam sem ele — sem isso, dump de SNES com header nunca
 * reconheceria o jogo, e a capa nunca apareceria sozinha. O MD5 entra desde a
 * issue #134, pela mesma razão: é o hash que o No-Intro cataloga.
 */
function hashesParaCasar(rom: RomVerificada): HashesParaCasar {
  return {
    sha256: rom.sha256SemHeader === null ? [rom.sha256] : [rom.sha256, rom.sha256SemHeader],
    md5: rom.md5SemHeader === null ? [rom.md5] : [rom.md5, rom.md5SemHeader],
  };
}
