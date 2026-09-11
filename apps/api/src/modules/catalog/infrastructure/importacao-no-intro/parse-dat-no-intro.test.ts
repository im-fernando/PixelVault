import { describe, expect, it } from 'vitest';
import {
  agruparPorJogo,
  ehEntradaIndesejada,
  extrairRevisao,
  parseDatNoIntro,
  slugDoImportado,
  tituloCanonico,
} from './parse-dat-no-intro.js';

/**
 * Um recorte real do `.dat` de SNES do libretro-database (conferido em
 * 2026-09-11) — não um fixture inventado. É o que garante que o parser lida
 * com o formato de verdade, cabeçalho `clrmamepro(...)` incluído, e não com
 * uma versão simplificada dele.
 */
const RECORTE_REAL = `clrmamepro (
	name "Nintendo - Super Nintendo Entertainment System"
	description "Nintendo - Super Nintendo Entertainment System"
	version "2026.08.01"
	homepage "http://github.com/robloach/libretro-dats"
)

game (
	name "Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)"
	region "Europe"
	rom ( name "Donkey Kong Country (Europe) (En,Fr,De) (Rev 1).sfc" size 4194304 crc 17657DB6 md5 00F0BA49B5B2F140B307AFBED33C7997 sha1 6F246ABAE39820E3267704BDF342AD1D27121F19 )
)
game (
	name "Donkey Kong Country (USA)"
	region "USA"
	rom ( name "Donkey Kong Country (USA).sfc" size 4194304 crc C946DCA0 md5 30C5F292FF4CBBFCC00FD8FA96C2DE3B sha1 0FCEE45D9AF5D2F62995ED4B04D22146B906C86B )
)
game (
	name "Super Mario Kart (Japan) (Beta 3)"
	region "Japan"
	rom ( name "Super Mario Kart (Japan) (Beta 3).sfc" size 524288 crc F575F2A0 md5 762D0CD18A901DAAFBC74F6FED28731E sha1 179CED0C566A10A8D0C91BB282F3914B1BCF0806 )
)
game (
	name "Super Mario Kart (USA)"
	region "USA"
	rom ( name "Super Mario Kart (USA).sfc" size 524288 crc CD80DB86 md5 7F25CE5A283D902694C52FB1152FA61A sha1 47E103D8398CF5B7CBB42B95DF3A3C270691163B )
)
game (
	name "3x3 Eyes - Juuma Houkan (Japan)"
	region "Japan"
	serial "A83J"
	rom ( name "3x3 Eyes - Juuma Houkan (Japan).sfc" size 2097152 crc AD4AD163 md5 7E55EE60AA3F1E37F7A7A006201EC035 sha1 B6214C20D83D70F6F83A79F4496486E30F424E17 serial "A83J" )
)
`;

describe('parseDatNoIntro', () => {
  it('lê cada bloco game(...) e ignora o cabeçalho clrmamepro(...)', () => {
    const entradas = parseDatNoIntro(RECORTE_REAL);

    expect(entradas).toHaveLength(5);
    expect(entradas[0]).toEqual({
      nomeBruto: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
      regiao: 'Europe',
      nomeDoArquivo: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1).sfc',
      sizeBytes: 4194304,
      crc32: '17657db6',
      md5: '00f0ba49b5b2f140b307afbed33c7997',
      sha1: '6f246abae39820e3267704bdf342ad1d27121f19',
    });
  });

  it('lê a entrada mesmo com serial pendurado antes e depois do rom(...)', () => {
    const entradas = parseDatNoIntro(RECORTE_REAL);
    const comSerial = entradas.find((e) => e.nomeBruto.startsWith('3x3 Eyes'));

    expect(comSerial?.md5).toBe('7e55ee60aa3f1e37f7a7a006201ec035');
  });

  it('devolve lista vazia para texto sem bloco game(...)', () => {
    expect(parseDatNoIntro('clrmamepro (\n\tname "nada aqui"\n)\n')).toEqual([]);
  });
});

describe('tituloCanonico', () => {
  it('tira tudo a partir da primeira tag entre parênteses', () => {
    expect(tituloCanonico('Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)')).toBe(
      'Donkey Kong Country',
    );
    expect(tituloCanonico("Donkey Kong Country 2 - Diddy's Kong Quest (USA)")).toBe(
      "Donkey Kong Country 2 - Diddy's Kong Quest",
    );
  });

  it('devolve o nome inteiro quando não há tag nenhuma', () => {
    expect(tituloCanonico('Tetris')).toBe('Tetris');
  });
});

describe('extrairRevisao', () => {
  it('lê a tag Rev quando existe', () => {
    expect(extrairRevisao('Donkey Kong Country (USA) (Rev 1)')).toBe('Rev 1');
  });

  it('devolve null quando não há revisão', () => {
    expect(extrairRevisao('Donkey Kong Country (USA)')).toBeNull();
  });
});

describe('ehEntradaIndesejada', () => {
  it.each([
    'Super Mario Kart (Japan) (Beta 3)',
    'Chrono Trigger (Japan) (Proto)',
    'Um Jogo (USA) (Demo)',
    'Outro Jogo (USA) (Sample)',
    'Mais Um (USA) (Debug Version)',
    '[BIOS] Super Nintendo (World)',
  ])('recusa "%s"', (nome) => {
    expect(ehEntradaIndesejada(nome)).toBe(true);
  });

  it('aceita lançamento normal', () => {
    expect(ehEntradaIndesejada('Donkey Kong Country (USA)')).toBe(false);
  });
});

describe('slugDoImportado', () => {
  it('prefixa pelo sistema, porque o mesmo título existe em consoles diferentes', () => {
    expect(slugDoImportado('snes', 'Aladdin')).toBe('snes-aladdin');
    expect(slugDoImportado('genesis', 'Aladdin')).toBe('genesis-aladdin');
  });

  it('normaliza acento, apóstrofo e espaço', () => {
    expect(slugDoImportado('snes', "Donkey Kong Country 2 - Diddy's Kong Quest")).toBe(
      'snes-donkey-kong-country-2-diddy-s-kong-quest',
    );
  });
});

describe('agruparPorJogo', () => {
  it('agrupa as variantes do mesmo jogo e descarta a indesejada', () => {
    const entradas = parseDatNoIntro(RECORTE_REAL);

    const jogos = agruparPorJogo('snes', entradas);

    const dkc = jogos.find((j) => j.titulo === 'Donkey Kong Country');
    expect(dkc?.variantes).toHaveLength(2);
    expect(dkc?.slug).toBe('snes-donkey-kong-country');

    // A entrada (Beta 3) foi descartada — só a "Super Mario Kart (USA)" resta.
    const kart = jogos.find((j) => j.titulo === 'Super Mario Kart');
    expect(kart?.variantes).toHaveLength(1);
    expect(kart?.variantes[0]?.regiao).toBe('USA');
  });
});
