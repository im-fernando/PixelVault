import { describe, expect, it } from 'vitest';
import type { MensagemDeEmail } from '../domain/envio-de-email.js';
import type {
  DadosDoTokenDeRecuperacao,
  TokenDeRecuperacaoRepository,
} from '../domain/token-de-recuperacao-repository.js';
import { solicitarRecuperacaoDeSenha } from './solicitar-recuperacao-de-senha.js';

const AGORA = new Date('2026-09-08T12:00:00.000Z');
const TOKEN = 'token-em-claro-de-mentira';
/**
 * O falso do hash devolve um valor que NÃO contém o token, como um hash de
 * verdade. Um dublê do tipo `hash(${token})` faria o teste "o token em claro
 * não vai para o banco" passar sempre, medindo nada.
 */
const HASH = 'valor-opaco-que-nao-lembra-a-entrada';

interface Rastro {
  gravacoes: { email: string; dados: DadosDoTokenDeRecuperacao }[];
  podas: Date[];
  despachadas: MensagemDeEmail[];
}

/**
 * `contas` é o banco: quais e-mails existem. O falso imita a forma do
 * adaptador de verdade — um comando só decide e grava, sem `SELECT` que quem
 * chama possa consultar antes.
 */
function cenario(contas: string[]) {
  const rastro: Rastro = { gravacoes: [], podas: [], despachadas: [] };

  const tokens: TokenDeRecuperacaoRepository = {
    async criarSeContaExistir(email, dados): Promise<boolean> {
      rastro.gravacoes.push({ email, dados });
      return contas.includes(email);
    },
    async consumir(): Promise<string | null> {
      return null;
    },
    async invalidarDoUsuario(): Promise<number> {
      return 0;
    },
    async podarExpirados(agora): Promise<number> {
      rastro.podas.push(agora);
      return 0;
    },
  };

  const deps = {
    tokens,
    gerarToken: () => TOKEN,
    hashDoToken: () => HASH,
    origemDoFront: 'https://pixelvault.dev',
    agora: () => AGORA,
    despachar: (mensagem: MensagemDeEmail) => rastro.despachadas.push(mensagem),
  };

  return { deps, rastro };
}

describe('solicitarRecuperacaoDeSenha', () => {
  it('faz exatamente o mesmo trabalho para e-mail com conta e sem conta', async () => {
    // A anti-enumeração da #45 aplicada aqui: os dois caminhos geram token,
    // hasheiam, oferecem ao banco e podam. A única diferença é o que o banco
    // responde — e quem chamou não fica com essa resposta nas mãos, porque a
    // função não devolve nada.
    const comConta = cenario(['fulano@exemplo.test']);
    const semConta = cenario([]);

    await solicitarRecuperacaoDeSenha(comConta.deps, { email: 'fulano@exemplo.test' });
    await solicitarRecuperacaoDeSenha(semConta.deps, { email: 'fulano@exemplo.test' });

    expect(semConta.rastro.gravacoes).toHaveLength(comConta.rastro.gravacoes.length);
    expect(semConta.rastro.podas).toEqual(comConta.rastro.podas);
  });

  it('só manda e-mail quando o banco confirmou que gravou', async () => {
    const semConta = cenario([]);

    await solicitarRecuperacaoDeSenha(semConta.deps, { email: 'ninguem@exemplo.test' });

    // Mandar mesmo assim, "para gastar o mesmo tempo", transformaria a API
    // num disparador de mensagem para qualquer endereço que alguém digitasse.
    expect(semConta.rastro.despachadas).toEqual([]);
  });

  it('manda o link com o token em claro, e grava só o hash dele', async () => {
    const { deps, rastro } = cenario(['fulano@exemplo.test']);

    await solicitarRecuperacaoDeSenha(deps, { email: 'fulano@exemplo.test' });

    expect(rastro.gravacoes[0]?.dados.tokenHash).toBe(HASH);
    expect(JSON.stringify(rastro.gravacoes[0]?.dados)).not.toContain(TOKEN);
    expect(rastro.despachadas[0]?.texto).toContain(TOKEN);
  });

  it('grava a expiração pelo relógio do servidor, meia hora à frente', async () => {
    const { deps, rastro } = cenario(['fulano@exemplo.test']);

    await solicitarRecuperacaoDeSenha(deps, { email: 'fulano@exemplo.test' });

    expect(rastro.gravacoes[0]?.dados.expiresAt).toEqual(new Date('2026-09-08T12:30:00.000Z'));
  });

  it('normaliza o e-mail como o cadastro o gravou', async () => {
    // Sem isto, alternar maiúsculas daria um caminho diferente para a mesma
    // conta — e a recuperação falharia em silêncio para quem digitou o
    // próprio e-mail do jeito "errado".
    const { deps, rastro } = cenario(['fulano@exemplo.test']);

    await solicitarRecuperacaoDeSenha(deps, { email: '  Fulano@Exemplo.TEST ' });

    expect(rastro.gravacoes[0]?.email).toBe('fulano@exemplo.test');
    expect(rastro.despachadas).toHaveLength(1);
  });

  it('não recusa cedo o que nem seria um e-mail', async () => {
    // Recusar antes criaria um terceiro tempo de resposta, distinguível dos
    // outros dois. O texto vira chave de busca e o banco responde "nenhuma
    // linha", que é o mesmo caminho de um e-mail válido sem conta.
    const { deps, rastro } = cenario([]);

    await solicitarRecuperacaoDeSenha(deps, { email: 'isto-nao-e-um-email' });

    expect(rastro.gravacoes).toHaveLength(1);
    expect(rastro.despachadas).toEqual([]);
  });

  it('poda o que venceu nos dois caminhos', async () => {
    const comConta = cenario(['fulano@exemplo.test']);
    const semConta = cenario([]);

    await solicitarRecuperacaoDeSenha(comConta.deps, { email: 'fulano@exemplo.test' });
    await solicitarRecuperacaoDeSenha(semConta.deps, { email: 'fulano@exemplo.test' });

    expect(comConta.rastro.podas).toEqual([AGORA]);
    expect(semConta.rastro.podas).toEqual([AGORA]);
  });
});
