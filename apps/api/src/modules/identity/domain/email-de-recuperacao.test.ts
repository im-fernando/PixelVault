import { describe, expect, it } from 'vitest';
import { emailDeRecuperacao, linkDeRedefinicao } from './email-de-recuperacao.js';

const TOKEN = 'Sd3bQ1o5J8kO9pL2mN4xY7zA6bC8dE0fG1hI2jK3lM4';

describe('linkDeRedefinicao', () => {
  it('aponta para a tela de redefinição da origem dada, com o token na busca', () => {
    const link = linkDeRedefinicao('https://pixelvault.dev', TOKEN);

    const url = new URL(link);
    expect(url.origin).toBe('https://pixelvault.dev');
    expect(url.pathname).toBe('/redefinir-senha');
    expect(url.searchParams.get('token')).toBe(TOKEN);
  });

  it('ignora o caminho da origem em vez de emendá-lo', () => {
    // A origem é `WEB_ORIGIN`, e alguém pode configurá-la com barra no fim.
    // As duas formas precisam produzir o mesmo link, senão o front recebe
    // `/algo/redefinir-senha` e a rota não existe.
    expect(linkDeRedefinicao('https://pixelvault.dev/', TOKEN)).toBe(
      linkDeRedefinicao('https://pixelvault.dev', TOKEN),
    );
  });

  it('escapa o token na URL em vez de colá-lo cru', () => {
    // base64url não produz caractere que precise de escape, mas a garantia
    // não pode depender disso: quem monta a busca é o `URLSearchParams`.
    const link = linkDeRedefinicao('https://pixelvault.dev', 'a b&c=d');

    expect(new URL(link).searchParams.get('token')).toBe('a b&c=d');
    expect(link).not.toContain('&c=d');
  });
});

describe('emailDeRecuperacao', () => {
  const mensagem = emailDeRecuperacao(
    'fulano@exemplo.test',
    linkDeRedefinicao('https://pixelvault.dev', TOKEN),
  );

  it('leva o link nos dois corpos, para quem bloqueia HTML também recebê-lo', () => {
    expect(mensagem.texto).toContain(TOKEN);
    expect(mensagem.html).toContain(TOKEN);
  });

  it('diz o prazo e o uso único, que é o que a pessoa precisa saber', () => {
    expect(mensagem.texto).toContain('30 minutos');
    expect(mensagem.texto).toContain('uma vez só');
  });

  it('avisa que todas as sessões caem — é efeito colateral, não surpresa', () => {
    expect(mensagem.texto).toContain('encerra todas as sessões');
  });

  it('não devolve nada sobre a conta além do endereço para onde vai', () => {
    // Quem lê pode não ser o dono da conta: endereço digitado errado por um
    // terceiro, caixa compartilhada. Um e-mail que trouxesse o nome de
    // exibição ou o handle seria um oráculo de enumeração entregue pelo
    // correio — e é por isso que esta função nem os recebe como parâmetro.
    expect(emailDeRecuperacao.length).toBe(2);
    expect(mensagem.para).toBe('fulano@exemplo.test');
  });

  it('escapa o que entra no HTML', () => {
    const comAspas = emailDeRecuperacao('fulano@exemplo.test', 'https://x.test/?a="><script>');

    expect(comAspas.html).not.toContain('"><script>');
    expect(comAspas.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
