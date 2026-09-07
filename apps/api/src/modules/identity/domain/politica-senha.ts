import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from '@pixelvault/contracts';
import { ErroDeIdentidade } from './erros.js';

/**
 * Política por comprimento, não por complexidade: exigir símbolo e
 * maiúscula produz senha previsível ("Senha@123"), não senha forte. O que
 * de fato protege é um mínimo generoso e recusar as senhas mais repetidas
 * em vazamentos conhecidos.
 *
 * A lista abaixo não é exaustiva — não existe lista exaustiva de senha
 * vazada — é só grande o bastante para barrar o óbvio. Comparação é
 * case-insensitive porque "Senha123456" não é menos óbvia que "senha123456".
 */
const SENHAS_MAIS_COMUNS = new Set([
  // Curtas — não passariam no tamanho mínimo, mas valem a checagem
  // independente de comprimento: nada impede a política de mudar depois.
  '123456',
  '123456789',
  'qwerty',
  'password',
  '111111',
  '12345678',
  'abc123',
  'senha123',
  'iloveyou',
  'admin',
  'letmein',
  '000000',
  // Variações "encorpadas" para bater o mínimo de 12 caracteres — é
  // exatamente o tipo de senha que a política por tamanho, sozinha, deixaria
  // passar.
  '123456789012',
  '111111111111',
  'senha1234567',
  'password1234',
  'qwertyuiop12',
  'iloveyou1234',
  'admin1234567',
  'letmein12345',
]);

export function validarPoliticaDeSenha(candidata: string): void {
  if (SENHAS_MAIS_COMUNS.has(candidata.toLowerCase())) {
    throw new ErroDeIdentidade('SENHA_COMUM', 'Senha está entre as mais vazadas conhecidas');
  }

  if (candidata.length < TAMANHO_MINIMO_SENHA) {
    throw new ErroDeIdentidade(
      'SENHA_MUITO_CURTA',
      `Senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`,
    );
  }

  if (candidata.length > TAMANHO_MAXIMO_SENHA) {
    throw new ErroDeIdentidade(
      'SENHA_MUITO_LONGA',
      `Senha deve ter no máximo ${TAMANHO_MAXIMO_SENHA} caracteres`,
    );
  }
}
