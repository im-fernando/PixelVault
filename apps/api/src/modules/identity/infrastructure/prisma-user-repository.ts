import { prisma, Prisma } from '@pixelvault/database';
import type { Papel } from '../domain/habilidades.js';
import type {
  CredenciaisDoUsuario,
  DadosDeCadastro,
  DadosDoUsuario,
  PerfilPublico,
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

  async buscarCredenciaisPorEmail(email: string): Promise<CredenciaisDoUsuario | null> {
    // O e-mail chega normalizado pelo value object `Email`; a coluna guarda
    // o mesmo formato desde o cadastro, então isto é uma leitura por índice
    // único, não uma comparação case-insensitive.
    const linha = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        handle: true,
        displayName: true,
        publicProfile: true,
        passwordHash: true,
      },
    });
    if (linha === null) return null;

    const { passwordHash, ...usuario } = linha;
    return { ...usuario, senhaHash: passwordHash };
  },

  async buscarCredenciaisPorId(id: string): Promise<CredenciaisDoUsuario | null> {
    const linha = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        handle: true,
        displayName: true,
        publicProfile: true,
        passwordHash: true,
      },
    });
    if (linha === null) return null;

    const { passwordHash, ...usuario } = linha;
    return { ...usuario, senhaHash: passwordHash };
  },

  async buscarPorId(id: string): Promise<DadosDoUsuario | null> {
    // Sem `passwordHash` no select: o que `/me` devolve não tem por que
    // sair do banco.
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, handle: true, displayName: true, publicProfile: true },
    });
  },

  async buscarPapelPorId(id: string): Promise<Papel | null> {
    // O enum `Role` do Prisma tem exatamente os mesmos valores de `Papel`, e
    // é assim que se mantêm alinhados: quem adicionar um papel no banco sem
    // adicioná-lo no domínio (ou vice-versa) quebra a compilação aqui.
    const linha = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    return linha?.role ?? null;
  },

  async regravarSenhaHash(id: string, senhaHash: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { passwordHash: senhaHash },
      select: { id: true },
    });
  },

  async perfisPublicosPorIds(ids: readonly string[]): Promise<PerfilPublico[]> {
    if (ids.length === 0) return [];

    // Sem `email` no select, de propósito: este método é a única porta por
    // onde dado de OUTRA conta sai para exibição, e o que não está no select
    // não escapa numa serialização distraída — o mesmo raciocínio de
    // `buscarPorId`, agora mais estrito.
    const linhas = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, handle: true, displayName: true },
    });
    return linhas.map((linha) => ({
      userId: linha.id,
      handle: linha.handle,
      displayName: linha.displayName,
    }));
  },

  async perfilPublicoPorHandle(handle: string): Promise<PerfilPublico | null> {
    // Mesmo select restrito de `perfisPublicosPorIds`, de propósito: sem
    // `email` no `select`, para que dado de outra conta não escape numa
    // serialização distraída. `publicProfile: false` entra no `where`, e não
    // num `if` depois do `findUnique` — as duas formas de "não achou" (handle
    // inexistente, perfil desligado) precisam produzir exatamente a mesma
    // consulta e o mesmo `null`, sem diferença observável de tempo ou de forma
    // que denunciasse qual dos dois casos era.
    const linha = await prisma.user.findFirst({
      where: { handle, publicProfile: true },
      select: { id: true, handle: true, displayName: true },
    });
    if (linha === null) return null;

    return { userId: linha.id, handle: linha.handle, displayName: linha.displayName };
  },

  async definirPerfilPublico(id: string, ativo: boolean): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { publicProfile: ativo },
      select: { id: true },
    });
  },
};
