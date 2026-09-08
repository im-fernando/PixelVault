import type { LibraryRom } from '@pixelvault/contracts';
import type { DescreverJogosDoCatalogo, JogoDoCatalogo } from '../domain/catalogo-de-roms.js';
import { tituloPeloNomeDoArquivo } from '../domain/titulo-da-rom.js';
import type { RomNaBiblioteca, UserRomRepository } from '../domain/user-rom-repository.js';
import { sistemaPelaExtensao } from '../domain/verificacao-de-rom.js';

export interface DependenciasDaListagem {
  roms: UserRomRepository;
  /** As fichas dos jogos reconhecidos, que quem monta o caso de uso liga. */
  catalogo: DescreverJogosDoCatalogo;
}

/**
 * A estante de alguém: as ROMs que a pessoa enviou, prontas para desenhar.
 *
 * ## Duas fontes para uma etiqueta
 *
 * O que o BYOR guarda é o arquivo (ADR 0006); o que o catálogo guarda é o
 * metadado. Uma ROM reconhecida tem as duas coisas e a etiqueta sai do
 * catálogo — título curado, capa, sistema certo. Uma ROM não reconhecida tem
 * só a primeira, e `game_id` nulo é o caso comum, não a exceção: o catálogo
 * conhece homebrew, e quase todo envio de verdade cai fora dele.
 *
 * Por isso a listagem não trata "sem jogo" como buraco a preencher com "não
 * identificado". O nome do arquivo é o que a pessoa escolheu chamar aquele
 * cartucho, e a extensão dele é a mesma que a verificação do envio já cobrou
 * contra o conteúdo (ADR 0014) — as duas juntas dão título e sistema sem
 * inventar nada.
 *
 * ## Uma consulta ao catálogo, não uma por linha
 *
 * Os `game_id` distintos vão numa pergunta só. É a diferença entre uma
 * consulta e mil e quinhentas na abertura da estante, e é o motivo de a porta
 * `DescreverJogosDoCatalogo` receber lista.
 *
 * ## Autorização
 *
 * Não acontece aqui, e a assimetria com a remoção é de propósito: esta
 * listagem parte do `userId` da sessão e devolve exatamente as linhas daquela
 * pessoa, então não existe recurso de terceiro para esconder. Quem confere que
 * a pessoa pode ler a própria biblioteca é a rota, com `autorizarOuProibido` —
 * ali 403 é a resposta certa, porque falta permissão e não há existência a
 * negar. Ver `autorizar-download-de-rom.ts` para o caso oposto.
 */
export async function listarBiblioteca(
  deps: DependenciasDaListagem,
  userId: string,
): Promise<LibraryRom[]> {
  const roms = await deps.roms.listar(userId);

  const reconhecidos = roms.map((rom) => rom.gameId).filter((id): id is string => id !== null);
  const fichas = new Map<string, JogoDoCatalogo>(
    (await deps.catalogo(reconhecidos)).map((ficha) => [ficha.gameId, ficha]),
  );

  return roms.map((rom) =>
    paraEtiqueta(rom, rom.gameId === null ? null : (fichas.get(rom.gameId) ?? null)),
  );
}

/**
 * A linha do banco mais a ficha do catálogo, quando ela existe.
 *
 * `ficha` nula cobre dois casos que dão no mesmo para quem lê: a ROM nunca foi
 * reconhecida, ou o jogo saiu do catálogo desde então. Nos dois, a etiqueta
 * volta a ser a do arquivo — a ROM continua sendo da pessoa, e sumir da
 * estante seria a pior resposta possível.
 */
function paraEtiqueta(rom: RomNaBiblioteca, ficha: JogoDoCatalogo | null): LibraryRom {
  return {
    id: rom.id,
    title: ficha?.title ?? tituloPeloNomeDoArquivo(rom.fileName),
    systemId: ficha?.systemId ?? sistemaPelaExtensao(rom.fileName),
    gameId: ficha?.gameId ?? null,
    coverUrl: ficha?.coverUrl ?? null,
    fileName: rom.fileName,
    sizeBytes: rom.sizeBytes,
    sha256: rom.sha256,
    isFavorite: rom.isFavorite,
    uploadedAt: rom.uploadedAt.toISOString(),
  };
}
