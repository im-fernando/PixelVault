import { prisma } from '@pixelvault/database';
import type {
  DadosDoTokenDeRecuperacao,
  TokenDeRecuperacaoRepository,
} from '../domain/token-de-recuperacao-repository.js';

/**
 * O adaptador de banco do token de redefinição.
 *
 * Dois dos quatro métodos são SQL cru, e não Prisma Client, por uma razão de
 * segurança e não de desempenho: as duas operações que decidem alguma coisa
 * precisam ser **um comando só**, e o Client não expressa nem
 * `INSERT ... SELECT` nem `DELETE ... RETURNING`. Escritas com o Client,
 * viravam ler-depois-decidir — e é exatamente essa forma que abre as duas
 * frestas que este fluxo não pode ter (enumeração de conta e token usado
 * duas vezes). Ver `domain/token-de-recuperacao-repository.ts`.
 *
 * O SQL vai em _tagged template_ do Prisma: toda interpolação vira parâmetro
 * de _prepared statement_, nunca concatenação de texto.
 *
 * Todo instante entra como `::timestamptz AT TIME ZONE 'UTC'`. As colunas de
 * data deste schema são `timestamp` sem fuso, e é em UTC que o Prisma Client
 * grava nelas — mas um `Date` entregue cru ao driver chega com o fuso da
 * máquina, e o PostgreSQL o descartaria ao encaixar num `timestamp`,
 * guardando a hora local. As duas escritas da mesma coluna passariam a
 * discordar em três horas, e a poda apagaria token recém-criado. A conversão
 * explícita tira a máquina da conta.
 */
export const prismaTokenDeRecuperacaoRepository: TokenDeRecuperacaoRepository = {
  async criarSeContaExistir(email: string, dados: DadosDoTokenDeRecuperacao): Promise<boolean> {
    // O `SELECT` que descobre se a conta existe é o mesmo comando que grava:
    // ele não existe como leitura em lugar nenhum, e portanto não há um
    // ponto do código com a informação "esta conta existe" nas mãos. Quando
    // não há conta, o `SELECT` não devolve linha, o `INSERT` insere zero e o
    // caso de uso segue igual — só não manda e-mail.
    const gravadas = await prisma.$executeRaw`
      INSERT INTO password_reset_tokens (id, token_hash, user_id, expires_at, created_at)
      SELECT ${dados.id}::uuid, ${dados.tokenHash}, u.id,
             ${dados.expiresAt}::timestamptz AT TIME ZONE 'UTC',
             now() AT TIME ZONE 'UTC'
      FROM users u
      WHERE u.email = ${email}
    `;

    return gravadas > 0;
  },

  async consumir(tokenHash: string, agora: Date): Promise<string | null> {
    // Apagar e devolver no mesmo comando é o que faz o "uma vez só" ser
    // verdade sob concorrência: o `DELETE` trava a linha, e de duas
    // requisições simultâneas com o mesmo token exatamente uma leva o
    // `RETURNING`. A validade entra no mesmo `WHERE` — token vencido não é
    // um segundo caminho de código, é zero linha afetada, igual a token
    // inexistente.
    const linhas = await prisma.$queryRaw<{ user_id: string }[]>`
      DELETE FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
        AND expires_at > ${agora}::timestamptz AT TIME ZONE 'UTC'
      RETURNING user_id
    `;

    return linhas[0]?.user_id ?? null;
  },

  async invalidarDoUsuario(userId: string): Promise<number> {
    const { count } = await prisma.passwordResetToken.deleteMany({ where: { userId } });
    return count;
  },

  async podarExpirados(agora: Date): Promise<number> {
    // Varre pelo índice de `expires_at`; no caso comum (nada vencido), custa
    // uma sondagem. Mesma escolha da poda de `auth_attempts` e da de
    // sessões: preguiçosa, pendurada no trabalho que já está acontecendo, em
    // vez de um cron que o projeto não tem.
    const { count } = await prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: agora } },
    });
    return count;
  },
};
