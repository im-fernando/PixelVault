/**
 * Um token de redefinição pronto para gravar. O valor em claro não está aqui
 * de propósito — quem persiste só conhece o hash, como em `sessions`
 * (docs/adr/0017).
 */
export interface DadosDoTokenDeRecuperacao {
  id: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Porta de persistência do token de redefinição de senha.
 *
 * Os dois métodos que decidem alguma coisa têm a mesma forma, e ela não é
 * acidente: **um comando só, que o banco resolve, devolvendo o resultado**.
 * Nenhum dos dois lê antes para decidir depois.
 *
 * - `criarSeContaExistir` é a anti-enumeração da #45 aplicada aqui: não há
 *   `SELECT` por e-mail em lugar nenhum do fluxo, porque um `SELECT` isolado
 *   cria, no código de quem o chamou, a informação "esta conta existe" — e
 *   mais cedo ou mais tarde alguém a transforma numa resposta diferente. O
 *   `INSERT ... SELECT` do adaptador deixa essa decisão dentro do banco, e o
 *   que volta é um booleano que só serve para uma coisa: mandar ou não
 *   mandar o e-mail.
 * - `consumir` é o uso único de verdade: a linha é apagada e devolvida no
 *   mesmo comando. Ler, validar e apagar em três passos deixaria duas
 *   requisições simultâneas com o mesmo token passarem juntas pela
 *   validação — e o "uma vez só" viraria "uma vez só, quase sempre".
 */
export interface TokenDeRecuperacaoRepository {
  /**
   * Grava o token para a conta desse e-mail, se ela existir. `true` quando
   * gravou.
   *
   * O e-mail chega normalizado exatamente como o cadastro o gravou (ver
   * `Email.chaveDeBusca`), inclusive quando não é um e-mail válido: a
   * consulta precisa ser a mesma para qualquer texto que chegue, senão o
   * formato da entrada vira um caminho de código diferente.
   */
  criarSeContaExistir(email: string, dados: DadosDoTokenDeRecuperacao): Promise<boolean>;

  /**
   * Gasta o token: apaga a linha e devolve de quem ela era. `null` quando o
   * token não existe, já foi gasto ou venceu — os três indistinguíveis, e é
   * o banco que os torna indistinguíveis, não a disciplina de quem chama.
   */
  consumir(tokenHash: string, agora: Date): Promise<string | null>;

  /**
   * Invalida todos os tokens de uma conta. Chamado depois de uma redefinição
   * bem-sucedida: quem acabou de trocar a senha não deve ter outro link vivo
   * na caixa de entrada, e quem pediu dois links não deve conseguir usar o
   * segundo depois de já ter usado o primeiro.
   */
  invalidarDoUsuario(userId: string): Promise<number>;

  /** Poda preguiçosa: apaga o que já venceu, de qualquer conta. */
  podarExpirados(agora: Date): Promise<number>;
}
