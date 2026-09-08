import { connect } from 'node:net';

/**
 * Se alguém aceita conexão em `host:porta`, dentro do prazo.
 *
 * Existe porque tanto o PostgreSQL quanto o MinIO da suíte precisam responder
 * à mesma pergunta antes de qualquer client falar com eles: "tem alguém aí, ou
 * eu subo o compose?". Fazer isso com o client de cada um custaria uma cascata
 * de erro logada no console em toda execução — e o caminho normal desta função
 * é justamente falhar, enquanto o container sobe. Um socket que não abre é
 * silencioso e mais rápido.
 */
export async function portaAceitaConexao(
  host: string,
  porta: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((responder) => {
    const socket = connect({ host, port: porta });
    const encerrar = (aberta: boolean): void => {
      socket.destroy();
      responder(aberta);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => encerrar(true));
    socket.once('timeout', () => encerrar(false));
    socket.once('error', () => encerrar(false));
  });
}
