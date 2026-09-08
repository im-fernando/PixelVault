import { describe, expect, it } from 'vitest';
import {
  avaliarTentativas,
  LIMITES,
  type ContagemDeTentativas,
  type ParametrosDeLimite,
} from './limite-de-tentativas.js';

const MINUTO = 60_000;
const AGORA = new Date('2026-09-08T12:00:00.000Z');

const PARAMETROS: ParametrosDeLimite = {
  limite: 5,
  janelaMs: 10 * MINUTO,
  bloqueioBaseMs: MINUTO,
  bloqueioMaximoMs: 8 * MINUTO,
};

function contagem(
  tentativas: number,
  ultimaHaMs = 0,
  primeiraHaMs = ultimaHaMs,
): ContagemDeTentativas {
  if (tentativas === 0)
    return { tentativas: 0, primeiraTentativaEm: null, ultimaTentativaEm: null };
  return {
    tentativas,
    primeiraTentativaEm: new Date(AGORA.getTime() - primeiraHaMs),
    ultimaTentativaEm: new Date(AGORA.getTime() - ultimaHaMs),
  };
}

describe('avaliarTentativas', () => {
  it('libera quem ainda não chegou ao limite e diz quantas restam', () => {
    const veredito = avaliarTentativas(PARAMETROS, contagem(3, 0, 2 * MINUTO), AGORA);

    expect(veredito.bloqueado).toBe(false);
    expect(veredito.restantes).toBe(2);
    expect(veredito.limite).toBe(5);
    // A vaga volta quando a tentativa mais antiga sai da janela.
    expect(veredito.liberadoEm.getTime()).toBe(AGORA.getTime() - 2 * MINUTO + 10 * MINUTO);
  });

  it('bloqueia exatamente ao encostar no limite, não uma tentativa depois', () => {
    const veredito = avaliarTentativas(PARAMETROS, contagem(5), AGORA);

    expect(veredito.bloqueado).toBe(true);
    expect(veredito.restantes).toBe(0);
    expect(veredito.liberadoEm.getTime()).toBe(AGORA.getTime() + MINUTO);
  });

  it('dobra o bloqueio a cada tentativa excedente', () => {
    const duracoes = [5, 6, 7, 8].map(
      (tentativas) =>
        avaliarTentativas(PARAMETROS, contagem(tentativas), AGORA).liberadoEm.getTime() -
        AGORA.getTime(),
    );

    expect(duracoes).toEqual([MINUTO, 2 * MINUTO, 4 * MINUTO, 8 * MINUTO]);
  });

  it('para de dobrar no teto, para o bloqueio nunca virar trava permanente', () => {
    // É o que impede o limite por identificador de ser usado contra o dono
    // da conta: por mais que um atacante insista, a espera tem um máximo.
    for (const tentativas of [9, 20, 500]) {
      const veredito = avaliarTentativas(PARAMETROS, contagem(tentativas), AGORA);
      expect(veredito.liberadoEm.getTime() - AGORA.getTime()).toBe(8 * MINUTO);
    }
  });

  it('libera de novo quando o bloqueio vence, sem esperar a janela inteira', () => {
    const veredito = avaliarTentativas(PARAMETROS, contagem(5, MINUTO + 1), AGORA);

    expect(veredito.bloqueado).toBe(false);
    expect(veredito.restantes).toBe(0);
  });

  it('não bloqueia quem não tem tentativa nenhuma', () => {
    const veredito = avaliarTentativas(PARAMETROS, contagem(0), AGORA);

    expect(veredito.bloqueado).toBe(false);
    expect(veredito.restantes).toBe(5);
    expect(veredito.liberadoEm).toEqual(AGORA);
  });
});

describe('LIMITES', () => {
  it.each(['login', 'register'] as const)(
    'mantém, em %s, o teto por identificador acima do teto por IP na mesma janela',
    (escopo) => {
      // A invariante que impede o limite por conta de virar arma contra o
      // dono dela: com a mesma janela e um teto por IP menor, um atacante
      // sozinho esbarra no próprio limite antes de encostar no da vítima —
      // bloquear alguém escolhido passa a exigir mais de um IP.
      const { ip, identifier } = LIMITES[escopo];
      expect(identifier.janelaMs).toBe(ip.janelaMs);
      expect(identifier.limite).toBeGreaterThan(ip.limite);
    },
  );

  it('inverte a assimetria na recuperação de senha, de propósito', () => {
    // A exceção à invariante acima, e ela precisa estar escrita para não
    // parecer esquecimento. Ali o que se limita é adivinhação de credencial;
    // aqui é gasto — cada requisição que acha conta manda uma mensagem que
    // custa dinheiro e um pedaço da reputação do domínio. Proteger a caixa de
    // entrada de quem não pediu nada vale meia hora de espera para quem
    // esqueceu a senha no pior caso.
    const { ip, identifier } = LIMITES.forgot_password;
    expect(identifier.limite).toBeLessThan(ip.limite);
    // E a janela por e-mail é maior que a do IP: três mensagens por hora para
    // o mesmo endereço, não três a cada quinze minutos.
    expect(identifier.janelaMs).toBeGreaterThan(ip.janelaMs);
  });

  it('nunca deixa um bloqueio passar de meia hora', () => {
    for (const porEixo of Object.values(LIMITES)) {
      for (const parametros of Object.values(porEixo)) {
        expect(parametros.bloqueioMaximoMs).toBeLessThanOrEqual(30 * MINUTO);
        expect(parametros.bloqueioBaseMs).toBeLessThanOrEqual(parametros.bloqueioMaximoMs);
      }
    }
  });
});
