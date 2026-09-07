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
]);
export type CodigoErroIdentity = z.infer<typeof codigoErroIdentitySchema>;
