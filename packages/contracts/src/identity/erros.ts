import { z } from 'zod';

/**
 * Códigos de erro de domínio do `identity` — mais granulares que o
 * `ErrorCode` genérico de `shared/errors.ts`. Aquele decide o status HTTP
 * (4xx); este diz qual invariante de negócio foi violado, e é o que o
 * cliente usa para escolher a mensagem certa (e-mail já existe não é a
 * mesma coisa que e-mail malformado, mesmo virando o mesmo 422).
 */
export const codigoErroIdentitySchema = z.enum([
  'EMAIL_INVALIDO',
  'HANDLE_INVALIDO',
  'HANDLE_RESERVADO',
  'SENHA_MUITO_CURTA',
  'SENHA_MUITO_LONGA',
  'SENHA_COMUM',
  'NOME_INVALIDO',
  'TERMOS_NAO_ACEITOS',
  // Handle em uso é recusa honesta de propósito: o handle é o nome que a
  // própria pessoa está escolhendo, não a informação sensível "existe conta
  // com este e-mail". Esconder isso só produziria um cadastro que parece ter
  // dado certo e não deu.
  'HANDLE_EM_USO',
  // Um código só para "e-mail não existe" e "senha errada", de propósito.
  // Ter dois códigos derrotaria o ponto do login indistinguível: o cliente
  // não pode saber qual dos dois foi, porque quem pergunta pode não ser o
  // dono da conta. Ver `autenticar-usuario.ts`.
  'CREDENCIAIS_INVALIDAS',
  // Troca de senha autenticada: a senha atual não confere. Código próprio, e
  // não `CREDENCIAIS_INVALIDAS`, porque aqui não há nada a esconder — quem
  // pergunta já provou ser o dono da conta pelo cookie de sessão — e porque
  // os dois viram status diferentes: credencial inválida no login é 401,
  // senha atual errada numa troca é 422 (ver `traduzir-erro.ts`).
  'SENHA_ATUAL_INCORRETA',
]);
export type CodigoErroIdentity = z.infer<typeof codigoErroIdentitySchema>;
