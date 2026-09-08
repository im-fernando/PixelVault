import { describe, expect, it } from 'vitest';
import {
  COTA_DE_ROMS_POR_CONTA,
  motivoDeCotaSchema,
  motivoDeRecusaDeRomSchema,
} from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { ErroDeEnvioAoStorage, recusaDeEnvio, RECUSA_POR_TAMANHO } from './erros-de-envio.js';

function recusa(
  status: number,
  payload: { code: 'VALIDATION_FAILED' | 'CONFLICT' | 'NOT_FOUND' | 'INTERNAL' } & {
    message: string;
    details?: Record<string, string[]>;
  },
): ApiRequestError {
  return new ApiRequestError(status, payload);
}

describe('recusaDeEnvio', () => {
  it.each(motivoDeRecusaDeRomSchema.options)(
    'dá uma frase própria para o motivo %s da verificação',
    (motivo) => {
      const traduzida = recusaDeEnvio(
        recusa(422, {
          code: 'VALIDATION_FAILED',
          message: 'mensagem técnica do servidor',
          details: { rom: [motivo] },
        }),
      );

      // A frase é escolhida pelo CÓDIGO, e a mensagem do servidor não vaza
      // para a tela: ela é para humano e pode mudar sem aviso.
      expect(traduzida.titulo).not.toBe('mensagem técnica do servidor');
      expect(traduzida.detalhe).not.toContain('mensagem técnica');
    },
  );

  it('não repete a mesma frase para os quatro motivos de recusa', () => {
    const frases = motivoDeRecusaDeRomSchema.options.map(
      (motivo) =>
        recusaDeEnvio(
          recusa(422, { code: 'VALIDATION_FAILED', message: 'x', details: { rom: [motivo] } }),
        ).titulo,
    );

    // O escopo da issue é explícito: erro por caso, não uma genérica. Se dois
    // motivos convergirem para a mesma frase, a pessoa perde a instrução que
    // separa "descompacte" de "o arquivo está truncado".
    expect(new Set(frases).size).toBe(frases.length);
  });

  it.each(motivoDeCotaSchema.options)('separa os dois eixos da cota (%s)', (motivo) => {
    const traduzida = recusaDeEnvio(
      recusa(409, { code: 'CONFLICT', message: 'x', details: { cota: [motivo] } }),
    );

    const citaOsArquivos = traduzida.titulo.includes(String(COTA_DE_ROMS_POR_CONTA));
    expect(citaOsArquivos).toBe(motivo === 'LIMITE_DE_ARQUIVOS');
  });

  it('trata o teto por arquivo que o servidor recusou na borda', () => {
    const traduzida = recusaDeEnvio(
      recusa(422, {
        code: 'VALIDATION_FAILED',
        message: 'x',
        details: { sizeBytes: ['TAMANHO_DE_ROM_INVALIDO'] },
      }),
    );

    expect(traduzida).toEqual(RECUSA_POR_TAMANHO);
  });

  it('ignora código que este front ainda não conhece e cai na mensagem do servidor', () => {
    const traduzida = recusaDeEnvio(
      recusa(422, {
        code: 'VALIDATION_FAILED',
        message: 'Motivo que só o servidor conhece',
        details: { rom: ['MOTIVO_QUE_AINDA_NAO_EXISTE'] },
      }),
    );

    expect(traduzida.detalhe).toBe('Motivo que só o servidor conhece');
  });

  it('diz que o envio expirou quando a quarentena já não existe', () => {
    const traduzida = recusaDeEnvio(recusa(404, { code: 'NOT_FOUND', message: 'Envio' }));

    expect(traduzida.titulo).toContain('expirou');
  });

  it('separa a falha do storage da falha da API', () => {
    const doStorage = recusaDeEnvio(new ErroDeEnvioAoStorage('HTTP 403'));
    const daRede = recusaDeEnvio(new TypeError('Failed to fetch'));

    expect(doStorage.titulo).not.toBe(daRede.titulo);
    // Nem uma nem outra deixam a pessoa achando que a ROM entrou pela metade.
    expect(doStorage.detalhe).toContain('Envie de novo');
  });
});
