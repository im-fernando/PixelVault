import type { RomDownloadResponse } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';

/** O nome do recurso nos dois 404. Um só, e é esse o ponto. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDoDownloadDeRom {
  roms: UserRomRepository;
  /** A porta de storage. Quem assina é ela; o caso de uso só sabe a chave. */
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Assina a leitura de uma ROM da biblioteca — depois de o banco confirmar que
 * ela é de quem está pedindo.
 *
 * É a regra 2 da [ADR 0013](../../../../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md)
 * inteira, em três passos: **acha a linha, pergunta se é sua, assina**. O
 * objeto em `roms/<sha256>` não carrega dono — é compartilhado por todo mundo
 * que tem aquele conteúdo —, então a única coisa que separa a ROM de alguém da
 * ROM de todos é esta consulta a `user_roms`. Sem ela, o hash viraria senha, e
 * a ADR chama isso pelo nome: "download universal de qualquer ROM que alguém
 * já tenha subido".
 *
 * ## Por que 404, e não 403
 *
 * Porque 403 diria "existe, mas não é sua", e isso é informação. Quem varre
 * ids alheios não pode separar "não achei" de "achei e é de outro" — as duas
 * respostas têm que ser iguais byte a byte, e são: as duas saem do mesmo
 * `NotFoundError(NOME_DO_RECURSO)`. É para isso que o `identity` construiu o
 * `autorizarOuNaoEncontrado` na #48, e é por isso que o nome do recurso é uma
 * constante — se as duas mensagens divergissem, a diferença de texto seria o
 * oráculo que o helper existe para fechar.
 *
 * ## Por que a pergunta carrega o dono
 *
 * `recurso('Library', { userId })`, e nunca `'Library'` sozinho. A regra da
 * #48 é `conditions: { userId }`; perguntar pelo nome do tipo é perguntar
 * "pode ler alguma biblioteca?", e a resposta é sim para qualquer pessoa
 * logada — a dela. Quem responde sobre propriedade é a pergunta feita com a
 * linha na mão.
 *
 * ## Por que a checagem mora aqui, e não na rota
 *
 * Porque ela não é pré-requisito da chamada, é um passo dela: só dá para
 * perguntar depois de buscar, e o 404 da negativa precisa ser o mesmo da busca
 * vazia. Separar as duas coisas em camadas diferentes seria apostar que duas
 * mensagens escritas em arquivos distintos continuam idênticas para sempre. A
 * rota faz o que lhe cabe — exige sessão e monta as habilidades de quem pediu.
 */
export async function autorizarDownloadDeRom(
  deps: DependenciasDoDownloadDeRom,
  habilidades: Habilidades,
  romId: string,
): Promise<RomDownloadResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  autorizarOuNaoEncontrado(
    habilidades,
    'read',
    recurso('Library', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  // A validade é a padrão da porta, e não um número deste arquivo: TTL de
  // credencial é decisão de um lugar só, e com o teto que a porta impõe.
  const url = await deps.armazenamento.assinarLeitura(rom.storageKey);

  return {
    url,
    expiresInSeconds: VALIDADE_PADRAO_EM_SEGUNDOS,
    sha256: rom.sha256,
    sizeBytes: rom.sizeBytes,
    fileName: rom.fileName,
  };
}
