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
}
