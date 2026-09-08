import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../lib/api.js';
import { deErroDeApi } from './erros.js';

const CAMPOS_DO_LOGIN = ['email', 'password'] as const;
const CAMPOS_DO_CADASTRO = ['email', 'handle', 'password', 'termsAccepted'] as const;

function recusa(
  status: number,
  payload: { code: 'VALIDATION_FAILED' | 'UNAUTHENTICATED' | 'CONFLICT' | 'RATE_LIMITED' } & {
    message: string;
    details?: Record<string, string[]>;
  },
): ApiRequestError {
  return new ApiRequestError(status, payload);
}

describe('deErroDeApi', () => {
  it('não põe a recusa de credencial em campo nenhum do login', () => {
    const erro = deErroDeApi(
      recusa(401, {
        code: 'UNAUTHENTICATED',
        message: 'E-mail ou senha incorretos',
        details: { credentials: ['CREDENCIAIS_INVALIDAS'] },
      }),
      CAMPOS_DO_LOGIN,
    );

    // O servidor não disse qual dos dois errou, e o front não inventa: se
    // um destes campos ganhasse a mensagem, a tela estaria afirmando o que
    // a API se recusou a afirmar.
    expect(erro.porCampo).toEqual({});
    expect(erro.geral).toBe('E-mail ou senha incorretos');
  });

  it('põe handle em uso embaixo do campo handle, traduzido do código', () => {
    const erro = deErroDeApi(
      recusa(409, {
        code: 'CONFLICT',
        message: 'Esse nome de usuário já está em uso',
        details: { handle: ['HANDLE_EM_USO'] },
      }),
      CAMPOS_DO_CADASTRO,
    );

    expect(erro.porCampo['handle']).toBe('Este nome de usuário já está em uso.');
    expect(erro.geral).toBeNull();
  });

  it('traduz o código, não a mensagem que veio junto', () => {
    const erro = deErroDeApi(
      recusa(422, {
        code: 'VALIDATION_FAILED',
        // Mensagem propositalmente diferente da que a tela mostra: é o
        // código que o contrato promete manter estável.
        message: 'Senha está entre as mais vazadas conhecidas',
        details: { password: ['SENHA_COMUM'] },
      }),
      CAMPOS_DO_CADASTRO,
    );

    expect(erro.porCampo['password']).toBe(
      'Esta senha está entre as mais vazadas que existem. Escolha outra.',
    );
  });

  it('não mostra mensagem do Zod em inglês, e sim a regra do campo', () => {
    const erro = deErroDeApi(
      recusa(400, {
        code: 'VALIDATION_FAILED',
        message: 'Requisição inválida',
        details: { email: ['Invalid email address'] },
      }),
      CAMPOS_DO_CADASTRO,
    );

    expect(erro.porCampo['email']).toBe('Informe um e-mail válido.');
  });

  it('sobe para o topo o que não é de campo nenhum do formulário', () => {
    const erro = deErroDeApi(
      recusa(400, {
        code: 'VALIDATION_FAILED',
        message: 'Requisição inválida',
        details: { '(corpo)': ['Expected object'] },
      }),
      CAMPOS_DO_CADASTRO,
    );

    expect(erro.porCampo).toEqual({});
    expect(erro.geral).toBe('Requisição inválida');
  });

  it('mostra a recusa sem detalhes por campo, como a do teto de tentativas', () => {
    const erro = deErroDeApi(
      recusa(429, {
        code: 'RATE_LIMITED',
        message: 'Tentativas demais. Tente de novo em alguns minutos.',
      }),
      CAMPOS_DO_CADASTRO,
    );

    expect(erro.geral).toBe('Tentativas demais. Tente de novo em alguns minutos.');
  });

  it('sobe a recusa do rate limit para o topo, e não para um campo inventado', () => {
    // O 429 das rotas de credencial traz `details.rateLimit` dizendo qual eixo
    // cortou (por IP ou pela conta tentada). Não é campo de formulário, e o
    // formulário não pode tentar desenhar um erro embaixo de um campo que não
    // existe. Ver docs/seguranca.md.
    const erro = deErroDeApi(
      recusa(429, {
        code: 'RATE_LIMITED',
        message: 'Tentativas demais. Tente de novo em alguns minutos.',
        details: { rateLimit: ['LIMITE_POR_IDENTIFICADOR'] },
      }),
      CAMPOS_DO_LOGIN,
    );

    expect(erro.porCampo).toEqual({});
    expect(erro.geral).toBe('Tentativas demais. Tente de novo em alguns minutos.');
  });

  it('não deixa falha de rede sem explicação', () => {
    const erro = deErroDeApi(new TypeError('Failed to fetch'), CAMPOS_DO_LOGIN);

    expect(erro.geral).toBe('Não foi possível falar com a API. Tente de novo.');
  });
});
