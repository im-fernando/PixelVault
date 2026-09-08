/**
 * Dados de uma tentativa de cadastro, já validados pelo domínio: o e-mail e
 * o handle chegam aqui normalizados, a senha só como hash e o aceite dos
 * termos já datado pelo relógio do servidor.
 */
export interface DadosDeCadastro {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  senhaHash: string;
  termsAcceptedAt: Date;
}

/**
 * O que aconteceu com o INSERT. Não é um booleano porque as duas colisões
 * possíveis têm tratamentos opostos: handle em uso é recusado com mensagem
 * honesta, e-mail em uso é silenciado para não virar oráculo de enumeração.
 */
export type ResultadoDeCadastro = 'criado' | 'email-ja-cadastrado' | 'handle-ja-cadastrado';

/**
 * O usuário como ele aparece para o próprio dono. Não tem `senhaHash` de
 * propósito: este é o objeto que sai pela API, e o que não existe no tipo
 * não escapa numa serialização distraída.
 */
export interface DadosDoUsuario {
  id: string;
  email: string;
  handle: string;
  displayName: string;
}

/** O mesmo usuário, mais o hash da senha — só o login precisa disso. */
export interface CredenciaisDoUsuario extends DadosDoUsuario {
  senhaHash: string;
}

/**
 * Porta de persistência do `identity`.
 *
 * `cadastrar` devolve a colisão em vez de lançar de propósito: colidir não é
 * excepcional, é um dos resultados esperados de um cadastro concorrente. Quem
 * decide o que a colisão vira do lado de fora é a camada de aplicação.
 *
 * `handleEmUso` existe só para dar mensagem decente no caso comum — a
 * garantia contra corrida é a constraint do banco, que `cadastrar` observa.
 * Um `SELECT` antes do `INSERT`, sozinho, é corrida e não validação.
 */
export interface UserRepository {
  handleEmUso(handle: string): Promise<boolean>;
  cadastrar(dados: DadosDeCadastro): Promise<ResultadoDeCadastro>;
  /**
   * O usuário e o hash da senha dele, para o login conferir. `null` quando
   * não há conta com esse e-mail — e quem chama tem obrigação de tratar o
   * `null` sem encurtar caminho, porque encurtar caminho aqui é exatamente
   * o que denuncia a existência da conta pelo relógio. Ver
   * `application/autenticar-usuario.ts`.
   */
  buscarCredenciaisPorEmail(email: string): Promise<CredenciaisDoUsuario | null>;
  /**
   * O mesmo, achando pelo id — é o que a troca de senha autenticada usa para
   * conferir a senha atual. Sem espelho do cuidado acima: quem chega aqui já
   * provou quem é pelo cookie de sessão, então não há existência de conta a
   * esconder de ninguém.
   */
  buscarCredenciaisPorId(id: string): Promise<CredenciaisDoUsuario | null>;
  /** O usuário sem nada derivado de senha — é o que `/me` devolve. */
  buscarPorId(id: string): Promise<DadosDoUsuario | null>;
  /** Regrava o hash migrado pela reidratação do Argon2id (ver issue #44). */
  regravarSenhaHash(id: string, senhaHash: string): Promise<void>;
}
