import type { AgregadoDeJogoDoUsuario } from './agregado-de-jogo.js';

/**
 * Porta de leitura de `user_games`. Declarada no domínio e implementada em
 * `infrastructure/` — o domínio diz o que precisa, a infraestrutura resolve
 * como. Ver docs/adr/0004.
 *
 * Um método só, de propósito: nenhum caso de uso de `progress` escreve em
 * `user_games` ainda (isso é a #119), então não há por que este arquivo
 * declarar `gravar` ou `credenciar` — método sem chamador é código morto
 * com aparência de arquitetura, e inventar a escrita aqui adivinharia a
 * assinatura que a #119 vai precisar de verdade.
 */
export interface UserGameRepository {
  /** O agregado da conta inteira — não por jogo, é isso que a conquista pede. */
  agregarParaUsuario(userId: string): Promise<AgregadoDeJogoDoUsuario>;
}
