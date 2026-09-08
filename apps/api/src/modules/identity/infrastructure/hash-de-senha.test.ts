import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import {
  gerarHashDeSenha,
  HASH_DESCARTAVEL,
  hashPrecisaDeRecalibragem,
  verificarERehash,
  verificarSenha,
} from './hash-de-senha.js';

describe('gerarHashDeSenha', () => {
  it('gera hashes diferentes para o mesmo texto, por causa do salt aleatório', async () => {
    const senha = 'cavalo-marinho-azul';
    const [hashA, hashB] = await Promise.all([gerarHashDeSenha(senha), gerarHashDeSenha(senha)]);
    expect(hashA).not.toBe(hashB);
  });

  it('produz um hash no formato Argon2id', async () => {
    const hash = await gerarHashDeSenha('cavalo-marinho-azul');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});

describe('verificarSenha', () => {
  it('aceita a senha correta', async () => {
    const hash = await gerarHashDeSenha('cavalo-marinho-azul');
    await expect(verificarSenha('cavalo-marinho-azul', hash)).resolves.toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await gerarHashDeSenha('cavalo-marinho-azul');
    await expect(verificarSenha('senha-errada', hash)).resolves.toBe(false);
  });
});

describe('verificarERehash', () => {
  it('sinaliza a senha como válida e sem novo hash quando os parâmetros já estão atuais', async () => {
    const hash = await gerarHashDeSenha('cavalo-marinho-azul');
    const resultado = await verificarERehash('cavalo-marinho-azul', hash);
    expect(resultado.valida).toBe(true);
    expect(resultado.novoHash).toBeUndefined();
  });

  it('recusa a senha errada sem calcular um novo hash', async () => {
    const hash = await gerarHashDeSenha('cavalo-marinho-azul');
    const resultado = await verificarERehash('senha-errada', hash);
    expect(resultado.valida).toBe(false);
    expect(resultado.novoHash).toBeUndefined();
  });

  it('reidrata um hash com parâmetros antigos depois de uma verificação bem-sucedida', async () => {
    const senha = 'cavalo-marinho-azul';
    // Parâmetros propositalmente mais fracos que os atuais, simulando um
    // hash gravado antes de uma futura calibração subir o custo.
    const hashAntigo = await argon2.hash(senha, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const resultado = await verificarERehash(senha, hashAntigo);

    expect(resultado.valida).toBe(true);
    expect(resultado.novoHash).toBeDefined();
    expect(resultado.novoHash).not.toBe(hashAntigo);

    // O novo hash precisa ser válido para a mesma senha e não precisar de
    // outra reidratação — senão a migração nunca converge.
    await expect(verificarSenha(senha, resultado.novoHash as string)).resolves.toBe(true);
    const segundaChecagem = await verificarERehash(senha, resultado.novoHash as string);
    expect(segundaChecagem.novoHash).toBeUndefined();
  });
});

describe('HASH_DESCARTAVEL', () => {
  it('está calibrado com os parâmetros atuais', () => {
    // O hash descartável só cumpre o papel dele — igualar o tempo do login
    // com e sem conta — se custar o mesmo que um hash de verdade. E o custo
    // de uma verificação Argon2 vem dos parâmetros embutidos na string do
    // hash, não da constante do módulo. Recalibrou o Argon2id? Gere um hash
    // descartável novo junto (a receita está em docs/seguranca.md).
    expect(hashPrecisaDeRecalibragem(HASH_DESCARTAVEL)).toBe(false);
  });

  it('não é o hash de nenhuma senha que alguém fosse escolher', async () => {
    await expect(verificarSenha('', HASH_DESCARTAVEL)).resolves.toBe(false);
    await expect(verificarSenha('senha', HASH_DESCARTAVEL)).resolves.toBe(false);
    await expect(verificarSenha(HASH_DESCARTAVEL, HASH_DESCARTAVEL)).resolves.toBe(false);
  });
});
