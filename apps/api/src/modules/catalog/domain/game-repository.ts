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
