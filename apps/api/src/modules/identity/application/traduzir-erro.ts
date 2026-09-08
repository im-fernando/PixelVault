import type { CodigoErroIdentity } from '@pixelvault/contracts';
import { DomainError } from '../../../infrastructure/errors.js';
import { ErroDeIdentidade } from '../domain/erros.js';

/**
 * O domínio fala `ErroDeIdentidade` (código estável, sem status HTTP); a
 * borda fala `DomainError` (código, status e detalhe por campo). A tradução
 * mora aqui, na aplicação, porque é a única camada que conhece as duas
 * línguas: o domínio não pode conhecer HTTP, e a rota não deveria decidir
 * regra de mapeamento.
 */
const CAMPO_POR_CODIGO: Record<CodigoErroIdentity, string> = {
  EMAIL_INVALIDO: 'email',
  HANDLE_INVALIDO: 'handle',
  HANDLE_RESERVADO: 'handle',
  HANDLE_EM_USO: 'handle',
  SENHA_MUITO_CURTA: 'password',
  SENHA_MUITO_LONGA: 'password',
  SENHA_COMUM: 'password',
  NOME_INVALIDO: 'displayName',
  TERMOS_NAO_ACEITOS: 'termsAccepted',
  // Não é um campo do formulário: é o par e-mail+senha tratado como uma
  // coisa só. Dizer qual dos dois está errado é exatamente o vazamento que
  // o login precisa evitar — ver `autenticar-usuario.ts`.
  CREDENCIAIS_INVALIDAS: 'credentials',
};

/**
 * Credencial inválida é 401; handle já tomado é conflito de recurso (409);
 * o resto é entrada que não passa na regra de negócio (422). O 422 e não
 * 400 porque a sintaxe estava certa — o Zod da borda já teria barrado o que
 * é malformado.
 */
export function traduzirErroDeIdentidade(erro: ErroDeIdentidade): DomainError {
  const detalhes = { [CAMPO_POR_CODIGO[erro.codigo]]: [erro.codigo] };

  // Credencial errada é 401: não é entrada malformada, é a afirmação de
  // quem é você que não se sustentou.
  if (erro.codigo === 'CREDENCIAIS_INVALIDAS') {
    return new DomainError('UNAUTHENTICATED', erro.message, 401, detalhes);
  }

  if (erro.codigo === 'HANDLE_EM_USO') {
    return new DomainError('CONFLICT', erro.message, 409, detalhes);
  }

  return new DomainError('VALIDATION_FAILED', erro.message, 422, detalhes);
}

/**
 * Reempacota qualquer `ErroDeIdentidade` que escape do domínio durante a
 * execução de `acao`. O que não for erro de identidade sobe intacto — falha
 * de infraestrutura tem que continuar virando 500, não 422.
 */
export async function comErrosTraduzidos<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof ErroDeIdentidade) throw traduzirErroDeIdentidade(erro);
    throw erro;
  }
}
