import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RomRecusada } from './erros.js';
import {
  nomeDeArquivoSeguro,
  sistemaPelaExtensao,
  verificarRom,
  TAMANHO_DO_CABECALHO_DE_COPIADOR,
} from './verificacao-de-rom.js';

/**
 * A verificação da ADR 0014 sem storage, sem banco e sem HTTP — que é o ponto
 * de ela ser função pura sobre bytes.
 *
 * O que estes testes protegem é a promessa que sustenta o `roms/<sha256>`
 * compartilhado: o hash é calculado sobre o que chegou, e o que chega e não é
 * ROM não chega a virar objeto.
 */

function sha256De(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * As ROMs de mentira nascem aqui, e não num helper compartilhado com os testes
 * de integração: o que este arquivo verifica é justamente a regra que constrói
 * o arquivo, e ler os bytes ao lado da asserção é o que torna o teste uma
 * descrição do formato em vez de uma chamada de função opaca.
 *
 * Conteúdo determinístico de propósito: o cabeçalho de SNES é reconhecido por
 * aritmética sobre dois inteiros de 16 bits, e bytes aleatórios acertariam
 * isso de vez em quando.
 */
function romDeSnes(opcoes: { comCabecalhoDeCopiador?: boolean; tamanho?: number } = {}) {
  const corpo = new Uint8Array(opcoes.tamanho ?? 64 * 1024).fill(0x5a);
  // O cartucho grava `checksum` e `~checksum`, e a soma dos dois é 0xFFFF. É a
  // única marca que o formato tem.
  escreverUint16(corpo, 0x7fc0 + 0x1c, 0xffff - 0xabcd);
  escreverUint16(corpo, 0x7fc0 + 0x1e, 0xabcd);
  if (opcoes.comCabecalhoDeCopiador !== true) return corpo;

  const comHeader = new Uint8Array(TAMANHO_DO_CABECALHO_DE_COPIADOR + corpo.byteLength);
  comHeader.set(corpo, TAMANHO_DO_CABECALHO_DE_COPIADOR);
  return comHeader;
}

/** O cabeçalho iNES e um banco de PRG. */
function romDeNes(): Uint8Array {
  const bytes = new Uint8Array(16 + 32 * 1024).fill(0x11);
  bytes.set([0x4e, 0x45, 0x53, 0x1a, 0x02, 0x01], 0);
  return bytes;
}

/** Texto puro: nenhum cabeçalho de console vai bater. */
function naoEUmaRom(): Uint8Array {
  return new Uint8Array(64 * 1024).fill(0x41);
}

function arquivoZip(): Uint8Array {
  const bytes = naoEUmaRom();
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  return bytes;
}

function escreverUint16(bytes: Uint8Array, offset: number, valor: number): void {
  bytes[offset] = valor & 0xff;
  bytes[offset + 1] = (valor >> 8) & 0xff;
}

function motivoDaRecusa(bytes: Uint8Array, nome: string): string {
  try {
    verificarRom(bytes, nome);
  } catch (erro) {
    if (erro instanceof RomRecusada) return erro.motivo;
    throw erro;
  }
  throw new Error('a verificação aceitou o que deveria recusar');
}

describe('verificarRom', () => {
  it('calcula o SHA-256 do arquivo como ele chegou', () => {
    const bytes = romDeSnes();

    const verificada = verificarRom(bytes, 'jogo.sfc');

    expect(verificada.sha256).toBe(sha256De(bytes));
    expect(verificada.sizeBytes).toBe(bytes.byteLength);
    expect(verificada.systemId).toBe('snes');
    // Sem cabeçalho de copiador não há o que descontar, e inventar um segundo
    // hash igual ao primeiro só faria o match perguntar duas vezes a mesma
    // coisa.
    expect(verificada.sha256SemHeader).toBeNull();
  });

  it('desconta o cabeçalho de copiador de SNES no segundo hash, e só nele', () => {
    // O mesmo jogo, com e sem os 512 bytes na frente. O arquivo é outro (e o
    // hash dele também, porque é assim que ele foi guardado), mas o conteúdo
    // que o catálogo conhece é o mesmo — e é esse que casa.
    const semHeader = romDeSnes();
    const comHeader = romDeSnes({ comCabecalhoDeCopiador: true });

    const verificada = verificarRom(comHeader, 'jogo.smc');

    expect(verificada.sha256).toBe(sha256De(comHeader));
    expect(verificada.sha256).not.toBe(sha256De(semHeader));
    expect(verificada.sha256SemHeader).toBe(sha256De(semHeader));
    expect(comHeader.byteLength).toBe(semHeader.byteLength + TAMANHO_DO_CABECALHO_DE_COPIADOR);
  });

  it('aceita ROM de NES pela assinatura iNES', () => {
    const verificada = verificarRom(romDeNes(), 'jogo.nes');

    expect(verificada.systemId).toBe('nes');
    expect(verificada.sha256SemHeader).toBeNull();
  });

  it('higieniza o nome do arquivo antes de guardá-lo', () => {
    const verificada = verificarRom(romDeSnes(), '../../etc/Jogo Favorito.SFC');

    expect(verificada.fileName).toBe('Jogo Favorito.SFC');
    // A extensão é reconhecida sem depender da caixa: `.SFC` é tão SNES
    // quanto `.sfc`.
    expect(verificada.systemId).toBe('snes');
  });

  it('recusa extensão que não é de sistema nenhum', () => {
    expect(motivoDaRecusa(romDeSnes(), 'jogo.zip')).toBe('EXTENSAO_NAO_RECONHECIDA');
    expect(motivoDaRecusa(romDeSnes(), 'jogo')).toBe('EXTENSAO_NAO_RECONHECIDA');
  });

  it('recusa tamanho fora da faixa do console', () => {
    // Pequeno demais para ser cartucho de SNES, e grande demais para ser
    // cartucho de NES. O teto de 64 MiB do contrato não diria nada sobre
    // nenhum dos dois.
    expect(motivoDaRecusa(romDeSnes({ tamanho: 8 * 1024 }), 'jogo.sfc')).toBe(
      'TAMANHO_IMPLAUSIVEL',
    );
    expect(motivoDaRecusa(new Uint8Array(5 * 1024 * 1024), 'jogo.nes')).toBe('TAMANHO_IMPLAUSIVEL');
  });

  it('recusa dump de SNES que não é múltiplo de 512', () => {
    const torto = new Uint8Array(64 * 1024 + 7);
    torto.set(romDeSnes(), 0);

    expect(motivoDaRecusa(torto, 'jogo.sfc')).toBe('TAMANHO_IMPLAUSIVEL');
  });

  it('recusa arquivo compactado, mesmo renomeado', () => {
    // O caso mais comum de todos: a pessoa baixou o `.zip` e trocou a
    // extensão. Descompactar no servidor seria aceitar entrada hostil na
    // fronteira mais sensível do produto.
    expect(motivoDaRecusa(arquivoZip(), 'jogo.sfc')).toBe('SISTEMA_DIVERGENTE');
  });

  it('recusa ROM de outro console, mesmo com a extensão certa para ela', () => {
    // É o que protege o SNES, que não tem assinatura própria: sem reconhecer
    // a assinatura alheia, qualquer coisa passaria por `.sfc`.
    expect(motivoDaRecusa(romDeNes(), 'jogo.sfc')).toBe('SISTEMA_DIVERGENTE');
    expect(motivoDaRecusa(romDeSnes(), 'jogo.nes')).toBe('CONTEUDO_NAO_RECONHECIDO');
  });

  it('recusa o que não é ROM nenhuma', () => {
    expect(motivoDaRecusa(naoEUmaRom(), 'jogo.sfc')).toBe('CONTEUDO_NAO_RECONHECIDO');
    expect(motivoDaRecusa(naoEUmaRom(), 'jogo.gba')).toBe('CONTEUDO_NAO_RECONHECIDO');
  });
});

describe('sistemaPelaExtensao', () => {
  it('conhece as extensões dos cinco sistemas suportados', () => {
    expect(sistemaPelaExtensao('a.sfc')).toBe('snes');
    expect(sistemaPelaExtensao('a.smc')).toBe('snes');
    expect(sistemaPelaExtensao('a.nes')).toBe('nes');
    expect(sistemaPelaExtensao('a.gbc')).toBe('gb');
    expect(sistemaPelaExtensao('a.gba')).toBe('gba');
    expect(sistemaPelaExtensao('a.md')).toBe('genesis');
  });

  it('não inventa sistema para arquivo sem extensão', () => {
    expect(sistemaPelaExtensao('jogo')).toBeNull();
    expect(sistemaPelaExtensao('jogo.')).toBeNull();
    expect(sistemaPelaExtensao('.sfc')).toBeNull();
  });
});

describe('nomeDeArquivoSeguro', () => {
  it('tira diretório e caractere de controle', () => {
    expect(nomeDeArquivoSeguro('/etc/passwd')).toBe('passwd');
    expect(nomeDeArquivoSeguro('C:\\jogos\\zelda.sfc')).toBe('zelda.sfc');
    expect(nomeDeArquivoSeguro('zel\u0000da\u001b.sfc')).toBe('zelda.sfc');
  });
});
