import { prisma, Prisma } from '@pixelvault/database';
import type {
  DadosDeCadastro,
  ResultadoDeCadastro,
  UserRepository,
} from '../domain/user-repository.js';

/**
 * Qual constraint de unicidade o banco recusou.
 *
 * O alvo muda de lugar conforme o adapter: `meta.target` no formato clássico
 * (`'email'` ou `['email']`), e `meta.driverAdapterError.cause.constraint`
 * com o driver adapter do Prisma 7 sobre `pg`, onde vem o nome do índice
 * (`users_email_key`). Em vez de apostar num dos dois, procuramos o nome da
 * coluna no `meta` inteiro — num P2002 de `users` a única coluna citada é a
 * que colidiu, porque `email` e `handle` são as duas únicas constraints
 * únicas da tabela.
 *
 * Quando não dá para identificar o alvo, o erro sobe: virar 500 é melhor do
 * que chutar "e-mail duplicado" e responder sucesso para uma falha que não é
 * essa.
 */
function alvoDaViolacaoDeUnicidade(erro: unknown): 'email' | 'handle' | null {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') {
    return null;
  }

  const meta = JSON.stringify(erro.meta ?? {});
  if (meta.includes('email')) return 'email';
  if (meta.includes('handle')) return 'handle';
  return null;
}

export const prismaUserRepository: UserRepository = {
  async handleEmUso(handle: string): Promise<boolean> {
    const linha = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
    return linha !== null;
  },

  async cadastrar(dados: DadosDeCadastro): Promise<ResultadoDeCadastro> {
    try {
      await prisma.user.create({
        data: {
          id: dados.id,
          email: dados.email,
          handle: dados.handle,
          displayName: dados.displayName,
          passwordHash: dados.senhaHash,
          termsAcceptedAt: dados.termsAcceptedAt,
        },
        select: { id: true },
      });
      return 'criado';
    } catch (erro) {
      // A unicidade é do banco, não nossa: duas requisições simultâneas com
      // o mesmo e-mail passam juntas por qualquer checagem em memória, e é
      // aqui — no índice único — que uma das duas perde.
      const alvo = alvoDaViolacaoDeUnicidade(erro);
      if (alvo === 'email') return 'email-ja-cadastrado';
      if (alvo === 'handle') return 'handle-ja-cadastrado';
      throw erro;
    }
  },
};
