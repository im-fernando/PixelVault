import type { ConquistaDesbloqueadaRepository } from '../domain/conquista-desbloqueada-repository.js';
import type { CodigoDeConquista } from '../domain/conquista-desbloqueada.js';

export interface DependenciasDoRegistroDeEvento {
  conquistas: ConquistaDesbloqueadaRepository;
}

/**
 * O evento já aconteceu — quem chama não pergunta "era a primeira vez?",
 * só avisa. A idempotência é do repositório (a constraint única do banco),
 * de propósito: perguntar antes de gravar seria uma corrida entre a
 * checagem e a gravação, e é exatamente esse tipo de corrida que a #120
 * pede para não existir (enviar duas ROMs quase ao mesmo tempo não pode
 * desbloquear duas vezes).
 *
 * Por isso esta função nem devolve nada — quem chama (`library`, `progress`)
 * não tem decisão nenhuma a tomar a partir do resultado, e não deveria
 * passar a ter.
 */
export async function registrarConquistaDeEvento(
  deps: DependenciasDoRegistroDeEvento,
  userId: string,
  code: CodigoDeConquista,
): Promise<void> {
  await deps.conquistas.desbloquear(userId, code);
}
