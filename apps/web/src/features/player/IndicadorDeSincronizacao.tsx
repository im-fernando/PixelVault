import type { EstadoDeSincronizacao } from './sram-sincronizacao.js';

const TEXTO: Record<EstadoDeSincronizacao, string> = {
  sincronizado: 'Save sincronizado com a nuvem',
  enviando: 'Enviando save para a nuvem…',
  falhou: 'Falha ao sincronizar — o jogo continua salvo neste aparelho',
};

/**
 * O rodapé discreto da sincronização automática — issue #91.
 *
 * Informação de rodapé, não alarme: mesmo `falhou` não é vermelho gritante
 * nem modal. A gravação local sempre aconteceu (é best-effort só o lado da
 * nuvem), então uma falha aqui nunca é "você vai perder o jogo" — é "o outro
 * aparelho ainda não vai ver isto". Ver `sram-sincronizacao.ts` para quando
 * este indicador aparece em vez da oferta de adoção da #92.
 */
export function IndicadorDeSincronizacao({ estado }: { readonly estado: EstadoDeSincronizacao }) {
  return (
    <p role="status" className="leitura text-ink-700">
      {TEXTO[estado]}
    </p>
  );
}
