import type { RomRemovedResponse } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';

/** O mesmo nome de recurso do download. Um só, e é esse o ponto. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDaRemocaoDeRom {
  roms: UserRomRepository;
  /** A porta de storage. É por ela que o objeto órfão é coletado. */
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Tira a ROM da biblioteca de quem pediu — e coleta o objeto só se ninguém
 * mais o referenciar.
 *
 * É a regra 3 da [ADR 0013](../../../../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md),
 * inteira: "apagar é remover a referência; o objeto só é coletado quando
 * nenhuma linha o referencia mais". O objeto em `roms/<sha256>` não carrega
 * dono — ele é o mesmo arquivo para todo mundo que tem aquele conteúdo —,
 * então apagá-lo por causa de uma remoção é destruir a ROM de estranhos.
 *
 * A ordem é: acha a linha, pergunta se é sua, apaga a referência contando o
 * que sobrou (na mesma transação), e só então coleta.
 *
 * ## Por que a contagem mora na transação, e a coleta fora dela
 *
 * Dentro, porque "posso apagar o arquivo?" só tem resposta confiável se a
 * contagem enxergar a remoção que acabou de acontecer — contar antes de apagar
 * responderia sobre um estado que já não existe.
 *
 * Fora, porque a coleta é uma chamada de rede a outro serviço, e segurá-la
 * dentro de uma transação aberta seria manter lock de banco pelo tempo do
 * storage responder. O preço é conhecido e cai para o lado certo: se a coleta
 * falhar, sobra um objeto sem referência — desperdício de bytes, recuperável
 * por uma varredura futura. O erro na direção oposta — apagar objeto que ainda
 * tem dono — não tem conserto, porque os bytes não voltam.
 *
 * A mesma assimetria decide o isolamento da transação, que é o padrão do banco
 * e não `Serializable`: duas remoções simultâneas do mesmo conteúdo, cada uma
 * enxergando a linha da outra ainda de pé, terminam com **ninguém** coletando.
 * Objeto órfão de novo, e de novo é o lado barato do erro.
 *
 * ## Por que 404 para a ROM de outra pessoa
 *
 * Mesma disciplina do download: 403 diria "existe, mas não é sua", e quem
 * varre ids alheios não pode separar isso de "não achei". As duas respostas
 * saem do mesmo `NotFoundError`, com o mesmo nome de recurso — e é por isso
 * que o nome é constante nos dois arquivos.
 */
export async function removerRomDaBiblioteca(
  deps: DependenciasDaRemocaoDeRom,
  habilidades: Habilidades,
  romId: string,
): Promise<RomRemovedResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  autorizarOuNaoEncontrado(
    habilidades,
    'delete',
    recurso('Library', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  const { ultimaReferencia } = await deps.roms.apagarReferencia(rom.id, rom.sha256);
  if (ultimaReferencia) await coletar(deps.armazenamento, rom.storageKey);

  return { status: 'rom-removida' };
}

/**
 * Apaga o objeto órfão, e não deixa a falha derrubar a remoção.
 *
 * Do ponto de vista de quem pediu, a ROM já saiu da biblioteca: a linha
 * sumiu, e é ela que dá direito ao arquivo. Estourar aqui reportaria um erro
 * sobre uma operação que deu certo, e a retentativa responderia 404 — pior
 * ainda. O que fica é um objeto sem referência e um aviso no log, que é o
 * lado barato do erro (ver o cabeçalho).
 *
 * `console.warn` e não o logger do Fastify pelo mesmo motivo de
 * `catalog/application/identificar-rom.ts`: o caso de uso não conhece
 * requisição.
 */
async function coletar(armazenamento: ArmazenamentoDeObjetos, chave: string): Promise<void> {
  try {
    await armazenamento.apagar(chave);
  } catch (erro) {
    console.warn(`[library] falha ao coletar o objeto órfão ${chave}`, erro);
  }
}
