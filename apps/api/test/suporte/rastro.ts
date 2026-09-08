import { randomUUID } from 'node:crypto';
import { prisma } from '@pixelvault/database';
import { chaveDeTentativa } from '../../src/modules/identity/infrastructure/chave-de-tentativa.js';
import { configDeTeste } from './ambiente.js';

/**
 * O rastro que um arquivo de teste deixa no banco compartilhado.
 *
 * A suíte roda contra o mesmo PostgreSQL que a máquina usa para desenvolver,
 * com os arquivos em paralelo, e por isso não pode limpar por tabela: um
 * `deleteMany` sem `where` apagaria o que outro arquivo estava usando naquele
 * instante, e o catálogo de quem só queria rodar os testes. A saída é a que
 * cada arquivo já tinha inventado por conta própria — identidade nova a cada
 * execução, e no fim apaga-se exatamente o que se criou. Isto aqui é essa
 * mecânica num lugar só.
 *
 * Duas coisas entram na limpeza:
 *
 * - **os usuários**, pelo e-mail. `sessions`, `password_reset_tokens`,
 *   `user_roms` e `user_games` vão junto pela cascata das FKs.
 * - **o contador de tentativas**, por chave. Ele não pende de usuário nenhum
 *   (guarda HMAC de IP e de identificador, ver docs/adr/0019), então some por
 *   fora — e precisa sumir, senão o IP do arquivo chega no limite depois de
 *   algumas execuções seguidas.
 */
export type Identidade = { email: string; handle: string };

export interface RastroDeTeste {
  /**
   * Uma conta que só existe nesta execução. O sufixo aleatório é o que
   * permite duas execuções simultâneas (ou uma execução após a outra, com
   * limpeza falha no meio) não disputarem o mesmo e-mail.
   */
  identidadeNova(prefixo: string): Identidade;
  /** Os e-mails criados até agora — para limpeza extra que o arquivo faça. */
  readonly emails: readonly string[];
  /** Registra IP ou identificador que o arquivo suja no contador. */
  registrarChave(...valores: string[]): void;
  /** Zera o contador de tentativas das chaves deste arquivo. */
  limparContador(): Promise<void>;
  /** Contador + usuários criados + desconexão. É o `afterAll` inteiro. */
  limpar(): Promise<void>;
}

export function rastroDeTeste(...chavesIniciais: string[]): RastroDeTeste {
  const emails: string[] = [];
  const chaves = new Set(chavesIniciais);

  async function limparContador(): Promise<void> {
    // A tabela guarda HMAC, então o teste calcula a mesma chave que a
    // aplicação calcularia — o que, de quebra, deixa explícito que não há
    // e-mail nem IP legível ali.
    await prisma.authAttempt.deleteMany({
      where: {
        keyHash: {
          in: [...chaves].map((valor) => chaveDeTentativa(configDeTeste.SESSION_SECRET, valor)),
        },
      },
    });
  }

  return {
    identidadeNova(prefixo: string): Identidade {
      const sufixo = randomUUID().slice(0, 8);
      const email = `teste-${prefixo}-${sufixo}@exemplo.test`;
      emails.push(email);
      // O e-mail é identificador no contador de tentativas: quem cria a conta
      // já suja essa chave, então ela entra na limpeza sem o arquivo pedir.
      chaves.add(email);
      return { email, handle: `teste-${prefixo}-${sufixo}` };
    },

    get emails(): readonly string[] {
      return emails;
    },

    registrarChave(...valores: string[]): void {
      for (const valor of valores) chaves.add(valor);
    },

    limparContador,

    async limpar(): Promise<void> {
      await limparContador();
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.$disconnect();
    },
  };
}
