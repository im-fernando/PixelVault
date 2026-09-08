import { randomUUID } from 'node:crypto';
import type { MotivoDeLimite } from '@pixelvault/contracts';
import {
  avaliarTentativas,
  LIMITES,
  type EscopoDeTentativa,
  type TipoDeChave,
  type Veredito,
} from '../domain/limite-de-tentativas.js';
import type {
  ChaveDeTentativa,
  TentativaAGravar,
  TentativaRegistrada,
  TentativaRepository,
} from '../domain/tentativa-repository.js';

export interface DependenciasDeTentativas {
  tentativas: TentativaRepository;
  agora: () => Date;
}

/**
 * As duas chaves de uma requisição, já mascaradas. `identificador` é nulo
 * quando não há o que contar por conta — corpo sem e-mail, requisição sem
 * sessão — e nesse caso só o eixo do IP vale.
 */
export interface ChavesDaRequisicao {
  ip: string;
  identificador: string | null;
}

export interface EstadoDoLimite extends Veredito {
  /** Qual eixo produziu este estado. Nulo quando não havia nada a contar. */
  motivo: MotivoDeLimite | null;
}

const MOTIVO_POR_TIPO: Record<TipoDeChave, MotivoDeLimite> = {
  ip: 'LIMITE_POR_IP',
  identifier: 'LIMITE_POR_IDENTIFICADOR',
};

/** A maior janela de todos os escopos: nada mais velho que isso conta. */
const JANELA_MAXIMA_MS = Math.max(
  ...Object.values(LIMITES).flatMap((porEixo) =>
    Object.values(porEixo).map((parametros) => parametros.janelaMs),
  ),
);

/**
 * Decide se a requisição pode seguir, olhando os dois eixos.
 *
 * Uma consulta só para os dois: ela busca pela maior janela da tabela e o
 * recorte de cada eixo acontece aqui, sobre as linhas que voltaram. É o que
 * permite a um eixo ter janela diferente do outro sem virar um segundo
 * `SELECT`. São poucas linhas por chave — o bloqueio começa no limite e
 * requisição bloqueada não é registrada, então a contagem não cresce sem fim.
 *
 * Quando os dois eixos estão vivos, vale o mais apertado: bloqueio ganha de
 * não-bloqueio e, entre dois iguais, ganha o que tem menos tentativas
 * restantes. É esse o estado que vira cabeçalho na resposta — informar o
 * eixo folgado enquanto o outro está prestes a cortar seria mentir para o
 * cliente honesto.
 */
export async function verificarTentativas(
  deps: DependenciasDeTentativas,
  escopo: EscopoDeTentativa,
  chaves: ChavesDaRequisicao,
): Promise<EstadoDoLimite> {
  const agora = deps.agora();
  const paraConsultar = chavesDe(chaves);
  const registradas = await deps.tentativas.listarDesde(
    escopo,
    paraConsultar,
    new Date(agora.getTime() - JANELA_MAXIMA_MS),
  );

  const estados = paraConsultar.map((chave) => avaliarEixo(escopo, chave.tipo, registradas, agora));
  return estados.reduce(maisApertado);
}

/** O rastro que uma requisição em curso deixou no contador. */
export interface TentativaEmCurso {
  ids: string[];
  identificador: string | null;
}

/**
 * Registra a tentativa nos dois eixos e aproveita para podar o que
 * envelheceu.
 *
 * A gravação acontece **antes** de a credencial ser conferida, não depois de
 * ela falhar. Duas razões: contar só o fracasso deixaria uma janela em que
 * um punhado de requisições simultâneas passa junto pela verificação antes
 * de qualquer contador subir; e o custo que precisamos limitar (o Argon2id)
 * é pago tanto pelo acerto quanto pelo erro. O acerto se resolve depois, com
 * `esquecerTentativas`.
 *
 * A poda segue a mesma escolha da limpeza de sessões da #47: preguiçosa,
 * pendurada no trabalho que já está acontecendo, em vez de um cron que o
 * projeto não tem. Ela é global (por idade, não por chave) porque o índice
 * de `created_at` torna isso uma sondagem barata quando não há nada a
 * apagar, que é o caso quase sempre.
 */
export async function registrarTentativa(
  deps: DependenciasDeTentativas,
  escopo: EscopoDeTentativa,
  chaves: ChavesDaRequisicao,
): Promise<TentativaEmCurso> {
  const aGravar: TentativaAGravar[] = chavesDe(chaves).map((chave) => ({
    id: randomUUID(),
    chave,
  }));

  await deps.tentativas.registrar(escopo, aGravar);
  await deps.tentativas.podarAnterioresA(new Date(deps.agora().getTime() - JANELA_MAXIMA_MS));

  return { ids: aGravar.map((tentativa) => tentativa.id), identificador: chaves.identificador };
}

/**
 * Apaga o rastro depois de uma credencial correta.
 *
 * Duas escalas diferentes, de propósito:
 *
 * - **Do identificador, tudo.** Quem acabou de provar que sabe a senha não
 *   deve chegar mais perto do bloqueio por ter errado a digitação antes.
 * - **Do IP, só as linhas desta requisição.** Zerar o eixo do IP inteiro
 *   entregaria o limite de graça: bastaria ao atacante ter uma conta própria
 *   e logar nela de vez em quando para limpar o rastro das tentativas contra
 *   as outras. Apagando só o que esta requisição gravou, o efeito é o
 *   desejado — login que deu certo não consome cota de ninguém, e o IP
 *   continua carregando exatamente as tentativas que falharam. É o que
 *   mantém um escritório inteiro atrás do mesmo NAT fora do limite.
 */
export async function esquecerTentativas(
  deps: DependenciasDeTentativas,
  escopo: EscopoDeTentativa,
  emCurso: TentativaEmCurso,
): Promise<void> {
  await deps.tentativas.apagar(emCurso.ids);
  if (emCurso.identificador !== null) {
    await deps.tentativas.esquecer(escopo, { tipo: 'identifier', hash: emCurso.identificador });
  }
}

function chavesDe(chaves: ChavesDaRequisicao): ChaveDeTentativa[] {
  const lista: ChaveDeTentativa[] = [{ tipo: 'ip', hash: chaves.ip }];
  if (chaves.identificador !== null) {
    lista.push({ tipo: 'identifier', hash: chaves.identificador });
  }
  return lista;
}

function avaliarEixo(
  escopo: EscopoDeTentativa,
  tipo: TipoDeChave,
  registradas: TentativaRegistrada[],
  agora: Date,
): EstadoDoLimite {
  const parametros = LIMITES[escopo][tipo];
  const inicioDaJanela = agora.getTime() - parametros.janelaMs;
  const naJanela = registradas
    .filter((tentativa) => tentativa.tipo === tipo && tentativa.em.getTime() > inicioDaJanela)
    .map((tentativa) => tentativa.em.getTime())
    .sort((a, b) => a - b);

  const veredito = avaliarTentativas(
    parametros,
    {
      tentativas: naJanela.length,
      primeiraTentativaEm: naJanela.length > 0 ? new Date(naJanela[0] ?? 0) : null,
      ultimaTentativaEm: naJanela.length > 0 ? new Date(naJanela[naJanela.length - 1] ?? 0) : null,
    },
    agora,
  );

  return { ...veredito, motivo: MOTIVO_POR_TIPO[tipo] };
}

function maisApertado(a: EstadoDoLimite, b: EstadoDoLimite): EstadoDoLimite {
  if (a.bloqueado !== b.bloqueado) return a.bloqueado ? a : b;
  return b.restantes < a.restantes ? b : a;
}
