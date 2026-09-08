import { describe, expect, it } from 'vitest';
import { retornoSeguro } from './rota-protegida.js';

describe('retornoSeguro', () => {
  it('aceita caminho de dentro da aplicação, com busca e âncora', () => {
    expect(retornoSeguro('/configuracoes')).toBe('/configuracoes');
    expect(retornoSeguro('/play/castle-platformer?slot=2#topo')).toBe(
      '/play/castle-platformer?slot=2#topo',
    );
  });

  it('recusa destino em outro site — o login não vira trampolim de phishing', () => {
    expect(retornoSeguro('https://exemplo-mau.test/roubo')).toBeUndefined();
    // `//host` é URL absoluta para o navegador: mesmo protocolo, outro host.
    expect(retornoSeguro('//exemplo-mau.test/roubo')).toBeUndefined();
    expect(retornoSeguro('javascript:alert(1)')).toBeUndefined();
  });

  it('recusa o que nem string é, porque vem da barra de endereço', () => {
    expect(retornoSeguro(undefined)).toBeUndefined();
    expect(retornoSeguro(['/configuracoes'])).toBeUndefined();
    expect(retornoSeguro(42)).toBeUndefined();
  });
});
