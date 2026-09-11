import type { IdentificarRomNoCatalogo } from '../domain/catalogo-de-roms.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';

export interface DependenciasDoReprocessamento {
  roms: Pick<UserRomRepository, 'listarSemJogoReconhecido' | 'atualizarJogoReconhecido'>;
  /** O mesmo match de hash que o upload usa — ver o cabeçalho abaixo. */
  catalogo: IdentificarRomNoCatalogo;
}

export interface ResultadoDoReprocessamento {
  /** Quantas `user_roms` sem jogo foram examinadas nesta varredura. */
  analisadas: number;
  /** Quantas casaram com o catálogo e tiveram o `game_id` religado. */
  reconhecidas: number;
}

/**
 * A lacuna 2 da issue #114: religar `user_roms.game_id` quando o catálogo
 * ganha uma entrada nova depois que alguém já subiu aquele jogo.
 *
 * `identificarRomPorHash` (o `catalogo` injetado aqui) só é chamado hoje na
 * confirmação do upload — uma vez, no momento em que a ROM chega. Se o hash
 * dela não estava em `game_roms` naquele instante, `game_id` fica nulo para
 * sempre, mesmo que a curadoria adicione o jogo no dia seguinte. Sem um
 * caminho de reprocessamento, a única saída seria SQL manual, que é
 * exatamente o que esta issue pede para não precisar.
 *
 * ## Por que reaproveitar `identificarRomPorHash`, e não reimplementar o match
 *
 * Reaproveitar em vez de duplicar a consulta em `game_roms` — e, de quebra,
 * ganhar de graça o gatilho de busca de capa (#77) que já vive lá
 * (`procurarCapaEmSegundoPlano`, em `catalog/application/identificar-rom.ts`):
 * um jogo recém-reconhecido por este reprocessamento dispara a mesma busca
 * que um upload reconhecido na hora dispararia. Reimplementar o match aqui
 * duplicaria a regra e teria que lembrar de disparar a capa também — dois
 * jeitos de esquecer a mesma coisa.
 *
 * ## Por que é varredura global, e não por conta
 *
 * A alternativa óbvia era uma rota que a própria pessoa aciona sobre a
 * própria biblioteca (`POST /library/roms/reconhecer`, dentro da habilidade
 * que ela já tem sobre `Library`). Foi descartada: quem tem uma ROM presa sem
 * `game_id` não tem como saber que o catálogo acabou de ganhar aquele jogo, e
 * pedir para cada pessoa lembrar de clicar em algo depois de uma curadoria
 * deixaria a maioria das ROMs paradas do mesmo jeito. O evento que dispara o
 * reprocessamento é "o catálogo mudou" — que pertence a quem administra o
 * catálogo, não a quem enviou a ROM. Por isso a varredura é sobre
 * `user_roms` inteira (`listarSemJogoReconhecido`, sem `userId`) e a rota que
 * a chama exige `manage` sobre `Game` (docs/adr/0018) — a mesma habilidade
 * que já administra o catálogo —, não uma habilidade sobre `Library`.
 *
 * ## Por que sequencial, e não em paralelo
 *
 * O projeto não tem fila nem job em segundo plano (a #47 recusou cron, ver
 * ADR 0019) — isto roda inteiro dentro do request-response de uma rota
 * administrativa. Paralelizar ganharia tempo de parede e perderia
 * previsibilidade de carga contra o Postgres e contra o próprio catálogo, e
 * esta é uma operação rara e disparada por quem sabe o que está fazendo. Se
 * o volume um dia doer, é hora de revisar — não antes.
 *
 * ## Uma limitação que herda do que `user_roms` guarda
 *
 * No upload, `confirmarEnvioDeRom` tenta dois hashes contra o catálogo — o do
 * arquivo como chegou e o de sem o cabeçalho de copiador de SNES, porque as
 * bases de metadado catalogam sem ele. Só o primeiro é gravado em
 * `user_roms.sha256`; o segundo nunca é persistido, porque não é endereço de
 * nada (ADR 0013), só uma tentativa extra de match. Este reprocessamento só
 * tem o que a tabela guarda, então uma ROM com cabeçalho cujo hash no
 * catálogo é o de sem cabeçalho não será reconhecida aqui — ficaria por SQL
 * manual, ou por resolver isto numa issue própria. Não é regressão: é o mesmo
 * hash que o upload já registrou.
 */
export async function reprocessarReconhecimento(
  deps: DependenciasDoReprocessamento,
): Promise<ResultadoDoReprocessamento> {
  const semJogo = await deps.roms.listarSemJogoReconhecido();

  let reconhecidas = 0;
  for (const rom of semJogo) {
    const identificada = await deps.catalogo([rom.sha256]);
    if (identificada === null) continue;

    await deps.roms.atualizarJogoReconhecido(rom.id, identificada.gameId);
    reconhecidas += 1;
  }

  return { analisadas: semJogo.length, reconhecidas };
}
