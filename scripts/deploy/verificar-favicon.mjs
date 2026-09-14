import { setTimeout as aguardar } from 'node:timers/promises';

/** A promoção de um deploy pode demorar a chegar a todos os pontos de acesso. */
export async function verificarFavicon(
  origem,
  { buscar = fetch, esperar = aguardar, avisar = console.warn, tentativas = 8 } = {},
) {
  const verificacao = `${process.env.GITHUB_SHA ?? 'local'}-${Date.now()}`;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const url = new URL('/favicon.svg', origem);
      url.searchParams.set('verificacao', `${verificacao}-${tentativa}`);
      const resposta = await buscar(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const tipo = resposta.headers.get('content-type') ?? '';
      const conteudo = await resposta.text();
      if (
        resposta.status !== 200 ||
        !/image\/svg\+xml/i.test(tipo) ||
        !/<svg[\s>]/.test(conteudo)
      ) {
        throw new Error(
          `Favicon inválido: HTTP ${resposta.status}, Content-Type ${tipo || 'ausente'}`,
        );
      }
      return;
    } catch (erro) {
      if (tentativa === tentativas) {
        throw new Error(`Favicon não ficou disponível após ${tentativas} tentativas.`, {
          cause: erro,
        });
      }
      avisar(
        `Favicon ainda indisponível (${tentativa}/${tentativas}); nova tentativa em 5s. ${erro.message}`,
      );
      await esperar(5000);
    }
  }
}
