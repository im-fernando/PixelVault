import { redirect } from '@tanstack/react-router';
import { queryClient } from '../../lib/query-client.js';
import { opcoesDaConsultaDeSessao } from './sessao.js';

/**
 * O guarda de rota que só existe para quem entrou.
 *
 * Roda no `beforeLoad` do roteador — antes de a rota renderizar — e por isso
 * resolve sozinho o pior sintoma do "carregando tratado como anônimo": a
 * pessoa logada que dá F5 numa rota protegida não é chutada para o login
 * enquanto `/api/auth/me` está no ar. O `ensureQueryData` espera a resposta e
 * a guarda no MESMO cache que o cabeçalho vai ler — a rota protegida não
 * custa uma requisição a mais.
 *
 * A recusa é um `redirect` para o login carregando de onde a pessoa veio.
 * Não é conveniência: quem chega por um link direto e é obrigado a entrar
 * espera continuar de onde estava, e não ser despejado na home.
 */
export async function exigirSessao({ location }: { location: { href: string } }): Promise<void> {
  const usuario = await queryClient.ensureQueryData(opcoesDaConsultaDeSessao);
  if (usuario !== null) return;

  throw redirect({ to: '/login', search: { retorno: location.href }, replace: true });
}

/**
 * O destino pós-login, aceito só se for um lugar daqui.
 *
 * `retorno` vem da barra de endereço, que é entrada de fora como qualquer
 * outra: sem esta peneira, `?retorno=https://outro-site` transformaria o
 * nosso login num trampolim para o phishing de qualquer um — a pessoa
 * digitaria a senha no nosso domínio e sairia no domínio de outro. Só
 * caminho interno passa, e `//` é barrado porque o navegador o lê como
 * "outro host, mesmo protocolo".
 */
export function retornoSeguro(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  if (!valor.startsWith('/') || valor.startsWith('//')) return undefined;
  return valor;
}
