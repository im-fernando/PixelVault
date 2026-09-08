/**
 * Onde a ROM enviada aterrissa antes de ser conferida.
 *
 * O caminho é `quarentena/<userId>/<uploadId>`, e nenhuma parte dele vem do
 * cliente: o `userId` sai da sessão, o `uploadId` é sorteado pelo servidor.
 * É a decisão da [ADR 0014](../../../../../../docs/adr/0014-verificar-a-rom-em-quarentena-antes-de-promover.md),
 * e ela existe porque o destino definitivo (`roms/<sha256>`, ADR 0013) é
 * compartilhado por todo mundo que tem aquele conteúdo — deixar o cliente
 * escolher onde escreve seria deixá-lo escrever por cima da ROM alheia.
 *
 * Vale reparar no que a quarentena dá de graça: como o prefixo carrega o dono,
 * o objeto de outra pessoa simplesmente não existe no seu caminho. A rota de
 * conclusão não precisa perguntar "este envio é seu?" — ela monta a chave a
 * partir de quem está pedindo, e a pergunta some junto com a chance de
 * respondê-la errado.
 *
 * `domain/` e anêmico, como manda a [ADR 0005](../../../../../../docs/adr/0005-dominio-rico-somente-onde-ha-invariante.md)
 * para o `library`: aqui só existe a convenção de nome do objeto, sem entidade
 * nem value object. O que ela protege, uma constraint não protegeria — é
 * formato de chave, não invariante de banco.
 */

/** Prefixo da quarentena no bucket. Nunca `roms/`, que é o destino promovido. */
export const PREFIXO_DA_QUARENTENA = 'quarentena';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A chave do objeto na quarentena.
 *
 * Os dois pedaços são conferidos contra o formato de UUID antes de virarem
 * caminho. Hoje isso não pode falhar — um vem do banco e o outro do
 * `randomUUID` —, e é exatamente por isso que a checagem é barata e vale a
 * pena: no dia em que alguém montar a chave a partir de algo que o cliente
 * mandou, o erro estoura aqui, e não vira um `../` passeando pelo bucket.
 */
export function caminhoNaQuarentena(userId: string, uploadId: string): string {
  if (!UUID.test(userId) || !UUID.test(uploadId)) {
    throw new TypeError('Caminho de quarentena só se monta com UUID — ver quarentena.ts');
  }

  return `${PREFIXO_DA_QUARENTENA}/${userId}/${uploadId}`;
}
