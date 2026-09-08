import type { Game, GameDetail, GameListQuery } from '@pixelvault/contracts';
import type { JogoSemCapa } from './busca-de-capa.js';

/**
 * Porta de persistência do catálogo.
 *
 * Declarada no domínio e implementada em infrastructure/ — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * A listagem devolve `Game` e o detalhe devolve `GameDetail` de propósito: a
 * referência da ROM só faz sentido para quem vai carregar o jogo, e arrastá-la
 * pela lista inteira significaria uma junção a mais em toda abertura da home.
 */
/** O que o catálogo sabe sobre um hash de ROM: de que jogo ele é. */
export interface RomDoCatalogo {
  gameId: string;
}

/**
 * A ficha curta de um jogo, para quem já sabe o `game_id` e só precisa
 * chamá-lo pelo nome.
 *
 * O campo se chama `gameId`, e não `id`, pelo mesmo motivo de `RomDoCatalogo`:
 * quem lê isto é outro módulo, e lá dentro aquele valor é a chave estrangeira
 * de `user_roms.game_id`, não "o id" de coisa nenhuma.
 */
export interface FichaDeJogo {
  gameId: string;
  title: string;
  systemId: Game['systemId'];
  coverUrl: string | null;
}

export interface GameRepository {
  list(query: GameListQuery): Promise<Game[]>;
  findBySlug(slug: string): Promise<GameDetail | null>;

  /**
   * O jogo cujo `game_roms.sha256` é um dos hashes, ou `null`.
   *
   * Recebe mais de um hash porque quem pergunta (o BYOR, no `library`) tem
   * dois: o do arquivo como o usuário enviou e o de sem o cabeçalho de
   * copiador de SNES. As bases de metadado catalogam sem cabeçalho, então
   * tentar só o hash cru deixaria de reconhecer metade dos dumps de SNES.
   *
   * Não devolve o jogo inteiro, e isso é o recorte: quem casa hash quer saber
   * a qual jogo ligar a linha de `user_roms`. Título e capa, quem os quer pede
   * ao catálogo pelo caminho normal.
   */
  identificarRomPorHash(hashes: readonly string[]): Promise<RomDoCatalogo | null>;

  /**
   * As fichas curtas de vários jogos de uma vez.
   *
   * Existe para a biblioteca pessoal (#75), que precisa do título e da capa de
   * cada ROM reconhecida para desenhar a estante. Em lote porque o alternativo
   * é uma consulta por linha listada — N+1 para montar uma prateleira.
   *
   * Devolve só o que existe: id que não casa com jogo nenhum some da resposta
   * em vez de virar buraco na lista. Para quem pergunta, "não achei" e "nunca
   * foi reconhecida" dão no mesmo — a ROM continua na estante, com o nome do
   * arquivo.
   */
  descreverJogos(gameIds: readonly string[]): Promise<FichaDeJogo[]>;

  /**
   * O que é preciso saber para procurar a capa de um jogo — ou `null` quando
   * não há o que procurar.
   *
   * "Não há o que procurar" cobre três casos, e é de propósito que os três
   * cheguem como a mesma resposta: o jogo não existe, o jogo já tem
   * `cover_url`, ou o jogo é homebrew. O último não é economia de rede — é a
   * ADR 0016: homebrew não tem capa comercial em banco nenhum, e a lombada da
   * estante existe justamente por causa disso. Procurar arte de homebrew no
   * `libretro-thumbnails` só acharia capa de outro jogo com nome parecido.
   */
  jogoSemCapa(gameId: string): Promise<JogoSemCapa | null>;

  /**
   * Grava a capa encontrada, e só se a coluna ainda estiver vazia.
   *
   * A condição está na cláusula do `UPDATE`, e não num `if` antes dele,
   * porque entre a leitura e a escrita cabe outra requisição fazendo a mesma
   * busca — duas ROMs do mesmo jogo chegando juntas é o caso comum, não o
   * exótico. Quem chegar depois não sobrescreve o que já está lá.
   */
  definirCapa(gameId: string, coverUrl: string): Promise<void>;
}
