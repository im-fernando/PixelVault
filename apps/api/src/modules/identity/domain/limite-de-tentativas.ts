/**
 * A política de força bruta: quantas tentativas cabem numa janela e por
 * quanto tempo a chave que estourou fica de fora.
 *
 * Puro de propósito. Quem conta linhas é o adaptador de banco; quem decide
 * se a tentativa passa é esta função, e ela precisa ser conferível sem subir
 * PostgreSQL nem Fastify — os números escolhidos aqui são a segurança do
 * login, não detalhe de infraestrutura. O raciocínio de cada parâmetro está
 * em `docs/seguranca.md`; o de onde o contador mora, em `docs/adr/0019`.
 */

/** Superfície de credencial. Os valores espelham o enum `AuthAttemptScope`. */
export type EscopoDeTentativa = 'login' | 'register' | 'change_password';

/** Eixo de contagem. Os valores espelham o enum `AuthAttemptKey`. */
export type TipoDeChave = 'ip' | 'identifier';

export interface ParametrosDeLimite {
  /** Tentativas toleradas dentro da janela antes de o bloqueio começar. */
  limite: number;
  /** Quanto tempo uma tentativa continua contando. */
  janelaMs: number;
  /** Duração do primeiro bloqueio. Dobra a cada tentativa excedente. */
  bloqueioBaseMs: number;
  /** Teto do bloqueio. Existe para o limite nunca virar trava permanente. */
  bloqueioMaximoMs: number;
}

const MINUTO = 60_000;

/**
 * Os parâmetros, por escopo e por eixo.
 *
 * A escolha que mais importa é o teto por identificador ser **maior** que o
 * teto por IP nas duas rotas abertas ao público, com a mesma janela. É o que
 * impede o rate limit por conta de virar arma contra o dono dela: um
 * atacante sozinho esbarra no próprio teto por IP (20 no login) antes de
 * conseguir encostar no teto da vítima (25), porque o bloqueio progressivo
 * do IP só o deixa emendar mais três ou quatro tentativas dentro dos mesmos
 * quinze minutos. Bloquear a conta de alguém escolhido passa a exigir mais
 * de um IP — e continua custando à vítima no máximo 15 minutos de espera
 * para um login novo, sem derrubar as sessões que ela já tem abertas nem
 * tocar na recuperação de senha.
 *
 * Vinte e cinco erros em quinze minutos também está muito longe de quem só
 * digitou errado (três, quatro) e muito perto de zero para quem está
 * adivinhando: a política de senha exige 12 caracteres, então 2.400
 * tentativas por dia não chegam a lugar nenhum.
 *
 * **Troca de senha** inverte a assimetria de propósito: ali o identificador
 * é o `userId` de quem já provou ser dono da conta pelo cookie, então
 * ninguém de fora consegue gastar a cota alheia, e cinco erros em quinze
 * minutos é seguro justamente por ser estreito.
 *
 * **Cadastro** conta toda requisição, e não só as que falham, porque ele
 * responde igual para conta criada e para e-mail repetido — não existe
 * "falha" observável para contar. O teto por e-mail é generoso de propósito:
 * apertá-lo só daria a alguém o poder de impedir um desconhecido de criar
 * conta com o próprio e-mail.
 */
export const LIMITES: Record<EscopoDeTentativa, Record<TipoDeChave, ParametrosDeLimite>> = {
  login: {
    ip: {
      limite: 20,
      janelaMs: 15 * MINUTO,
      bloqueioBaseMs: MINUTO,
      bloqueioMaximoMs: 30 * MINUTO,
    },
    identifier: {
      limite: 25,
      janelaMs: 15 * MINUTO,
      bloqueioBaseMs: MINUTO,
      bloqueioMaximoMs: 15 * MINUTO,
    },
  },
  register: {
    ip: {
      limite: 5,
      janelaMs: 10 * MINUTO,
      bloqueioBaseMs: 5 * MINUTO,
      bloqueioMaximoMs: 30 * MINUTO,
    },
    identifier: {
      limite: 10,
      janelaMs: 10 * MINUTO,
      bloqueioBaseMs: 5 * MINUTO,
      bloqueioMaximoMs: 30 * MINUTO,
    },
  },
  change_password: {
    ip: {
      limite: 20,
      janelaMs: 15 * MINUTO,
      bloqueioBaseMs: MINUTO,
      bloqueioMaximoMs: 30 * MINUTO,
    },
    identifier: {
      limite: 5,
      janelaMs: 15 * MINUTO,
      bloqueioBaseMs: MINUTO,
      bloqueioMaximoMs: 15 * MINUTO,
    },
  },
};

/** O que o contador sabe sobre uma chave dentro da janela. */
export interface ContagemDeTentativas {
  tentativas: number;
  /** A mais antiga ainda dentro da janela; é ela que libera a primeira vaga. */
  primeiraTentativaEm: Date | null;
  /** A mais recente; é dela que o bloqueio conta o tempo. */
  ultimaTentativaEm: Date | null;
}

export interface Veredito {
  bloqueado: boolean;
  /** Quantas tentativas ainda cabem antes do bloqueio. */
  restantes: number;
  limite: number;
  /**
   * Quando a chave volta a ter vaga: o fim do bloqueio, se bloqueada; a
   * saída da tentativa mais antiga da janela, se não. É o que vira
   * `ratelimit-reset` e `retry-after`.
   */
  liberadoEm: Date;
}

/**
 * Bloqueio temporário, e não atraso artificial na resposta.
 *
 * Segurar a requisição por alguns segundos antes de responder é a outra
 * receita clássica contra força bruta, e ela é ruim aqui pelo mesmo motivo
 * que o Argon2id caro é: cada tentativa pendurada ocupa uma conexão e um
 * pedaço do event loop do servidor, então "atrasar" o atacante é atrasar o
 * servidor junto. Recusar rápido com 429 e um `retry-after` custa quase
 * nada e diz ao cliente honesto exatamente quando voltar.
 *
 * A progressão dobra a cada tentativa que passa do limite (1, 2, 4, 8… min),
 * até o teto do escopo. O efeito é que erro humano quase nunca chega a ser
 * bloqueado, insistência curta custa um minuto, e insistência longa custa
 * cada vez mais — sem nunca virar trava permanente, que é o que
 * transformaria o limite por conta numa arma contra o dono dela.
 */
export function avaliarTentativas(
  parametros: ParametrosDeLimite,
  contagem: ContagemDeTentativas,
  agora: Date,
): Veredito {
  const { limite, janelaMs, bloqueioBaseMs, bloqueioMaximoMs } = parametros;
  const restantes = Math.max(0, limite - contagem.tentativas);

  if (contagem.tentativas < limite || contagem.ultimaTentativaEm === null) {
    const liberadoEm =
      contagem.primeiraTentativaEm === null
        ? agora
        : new Date(contagem.primeiraTentativaEm.getTime() + janelaMs);
    return { bloqueado: false, restantes, limite, liberadoEm };
  }

  // Uma tentativa além do limite dobra o bloqueio da anterior. O expoente é
  // limitado antes da potência: sem isso, uma contagem alta viraria
  // `Infinity` e o `Math.min` deixaria de ser um teto legível.
  const excedentes = contagem.tentativas - limite + 1;
  const duracaoMs = Math.min(bloqueioBaseMs * 2 ** Math.min(excedentes - 1, 20), bloqueioMaximoMs);
  const fimDoBloqueio = new Date(contagem.ultimaTentativaEm.getTime() + duracaoMs);

  // Bloqueio vencido não vira bloqueio novo sozinho: a chave ganha uma
  // tentativa, e é ela que decide se o próximo bloqueio existe — e ele já
  // nasce o dobro do anterior, porque a contagem subiu.
  if (fimDoBloqueio.getTime() <= agora.getTime()) {
    return { bloqueado: false, restantes, limite, liberadoEm: agora };
  }

  return { bloqueado: true, restantes: 0, limite, liberadoEm: fimDoBloqueio };
}
