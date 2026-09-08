import { describe, expect, it } from 'vitest';
import { criarBuscaDeCapa } from './criar-busca-de-capa.js';

describe('criarBuscaDeCapa', () => {
  it('fica desligada em teste — nenhuma suíte fala com o serviço da comunidade', async () => {
    const busca = criarBuscaDeCapa({ NODE_ENV: 'test' });

    await expect(busca.buscar({ systemId: 'snes', title: 'Chrono Trigger' })).resolves.toBeNull();
  });

  it('obedece a CAPA_TRANSPORTE quando ela está escrita', async () => {
    const busca = criarBuscaDeCapa({ NODE_ENV: 'production', CAPA_TRANSPORTE: 'desligada' });

    await expect(busca.buscar({ systemId: 'snes', title: 'Chrono Trigger' })).resolves.toBeNull();
  });

  it('recusa valor desconhecido em vez de desligar a capa em silêncio', () => {
    expect(() => criarBuscaDeCapa({ CAPA_TRANSPORTE: 'libretros' })).toThrow(/CAPA_TRANSPORTE/);
  });
});
