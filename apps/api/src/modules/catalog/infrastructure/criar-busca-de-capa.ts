import type { BuscaDeCapa } from '../domain/busca-de-capa.js';
import { criarBuscaNoLibretroThumbnails } from './capa-libretro-thumbnails.js';

/**
 * O adaptador que não pergunta nada a ninguém.
 *
 * É o que roda na suíte de testes: nenhum teste deve depender de um serviço de
 * terceiro estar de pé, e requisição saindo do processo de teste é exatamente
 * o tipo de coisa que passa despercebida até o CI ficar vermelho por causa da
 * rede de outra pessoa.
 */
const buscaDesligada: BuscaDeCapa = {
  buscar: async () => null,
};

/**
 * Escolhe o adaptador de busca de capa.
 *
 * Mesmo desenho de `identity/infrastructure/criar-envio-de-email.ts`: a
 * escolha é da configuração, com padrão derivado do `NODE_ENV` — `libretro`
 * em desenvolvimento e produção, `desligada` em teste. `CAPA_TRANSPORTE=desligada`
 * também serve de chave de desligamento em produção, para o dia em que o
 * serviço da comunidade estiver instável e não valer a pena insistir.
 *
 * ## Por que isto lê `process.env` em vez de receber a `Config`
 *
 * Porque não há por onde receber. Quem dispara a busca é
 * `application/identificar-rom.ts`, chamado pelo `library` através do
 * `index.ts` do módulo (ADR 0003) com uma assinatura que é a porta que o
 * `library` declarou: uma função de hashes. Não passa `Config` por ali, e
 * mudar essa assinatura para acomodar uma capa seria deixar o detalhe de um
 * módulo vazar para dentro do contrato de outro.
 *
 * A validação, então, é aqui: valor desconhecido derruba o processo na
 * inicialização, do mesmo jeito que `loadConfig` faz com o resto do ambiente —
 * e não vira "capa desligada em silêncio", que é o modo de falha ruim.
 */
export function criarBuscaDeCapa(ambiente: NodeJS.ProcessEnv = process.env): BuscaDeCapa {
  const transporte = ambiente['CAPA_TRANSPORTE'] ?? padraoPara(ambiente['NODE_ENV']);

  if (transporte === 'desligada') return buscaDesligada;
  if (transporte === 'libretro') return criarBuscaNoLibretroThumbnails();

  throw new Error(
    `CAPA_TRANSPORTE inválido: "${transporte}". Os valores aceitos são "libretro" e "desligada".`,
  );
}

function padraoPara(nodeEnv: string | undefined): string {
  return nodeEnv === 'test' ? 'desligada' : 'libretro';
}
