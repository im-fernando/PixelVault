import type { EscopoDeTentativa, TipoDeChave } from './limite-de-tentativas.js';

/**
 * Uma chave contada. `hash` já chega mascarado — o domínio nunca vê IP nem
 * e-mail em claro, e a tabela também não. Ver `infrastructure/chave-de-tentativa.ts`.
 */
export interface ChaveDeTentativa {
  tipo: TipoDeChave;
  hash: string;
}

/**
 * Uma tentativa a gravar. O id vem de fora para que quem gravou consiga
 * desfazer exatamente as próprias linhas quando a credencial se provar
 * correta — sem isso, "perdoar esta tentativa" viraria "apagar as tentativas
 * daquele IP", que é coisa bem diferente.
 */
export interface TentativaAGravar {
  id: string;
  chave: ChaveDeTentativa;
}

/** Uma linha de `auth_attempts`, reduzida ao que a política precisa. */
export interface TentativaRegistrada {
  tipo: TipoDeChave;
  em: Date;
}

/**
 * Porta do contador de tentativas.
 *
 * Existe pela mesma razão que `SessionRepository`: a política de força bruta
 * é regra, e regra não pode depender de Prisma para ser testada. O adaptador
 * de verdade está em `infrastructure/prisma-tentativa-repository.ts`.
 */
export interface TentativaRepository {
  /**
   * As tentativas das chaves dadas, no escopo dado, a partir de `desde`.
   * Devolve as linhas em vez de uma contagem porque cada eixo tem a própria
   * janela — quem recorta é a política, numa consulta só.
   */
  listarDesde(
    escopo: EscopoDeTentativa,
    chaves: ChaveDeTentativa[],
    desde: Date,
  ): Promise<TentativaRegistrada[]>;

  /** Grava a tentativa para todas as chaves de uma vez. */
  registrar(escopo: EscopoDeTentativa, tentativas: TentativaAGravar[]): Promise<void>;

  /** Apaga linhas específicas — as da requisição que acabou de dar certo. */
  apagar(ids: string[]): Promise<void>;

  /** Zera o contador de uma chave inteira. */
  esquecer(escopo: EscopoDeTentativa, chave: ChaveDeTentativa): Promise<void>;

  /** Poda o que já não pode influenciar contagem nenhuma. */
  podarAnterioresA(momento: Date): Promise<number>;
}
