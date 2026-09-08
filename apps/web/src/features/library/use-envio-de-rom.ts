import { useCallback, useState } from 'react';
import {
  descreverArquivo,
  enviarRom,
  type ArquivoEmEnvio,
  type EstadoDoEnvio,
  type RomEnviada,
} from './envio-de-rom.js';
import { RECUSA_POR_LOTE } from './erros-de-envio.js';

/** Uma ROM que entrou na biblioteca nesta sessão da tela. */
export interface RomDaSessao {
  readonly arquivo: ArquivoEmEnvio;
  readonly rom: RomEnviada;
}

/**
 * O estado do envio, do ponto de vista da tela.
 *
 * A lista `nestaSessao` existe para a tela poder mostrar o que acabou de
 * entrar — e só isso. **Não é a biblioteca**: a listagem de verdade, com
 * favoritar e remover, é a #75, e inventar aqui uma versão provisória dela
 * criaria uma segunda fonte de verdade para a próxima issue apagar.
 */
export interface EnvioDeRom {
  readonly estado: EstadoDoEnvio;
  readonly nestaSessao: readonly RomDaSessao[];
  readonly ocupado: boolean;
  /** Recebe o que veio do input ou do arrastar. */
  readonly enviar: (arquivos: readonly File[]) => void;
  readonly limpar: () => void;
}

export function useEnvioDeRom(): EnvioDeRom {
  const [estado, setEstado] = useState<EstadoDoEnvio>({ fase: 'ocioso' });
  const [nestaSessao, setNestaSessao] = useState<readonly RomDaSessao[]>([]);

  const ocupado =
    estado.fase === 'conferindo' || estado.fase === 'enviando' || estado.fase === 'verificando';

  const enviar = useCallback(
    (arquivos: readonly File[]) => {
      if (ocupado || arquivos.length === 0) return;

      const primeiro = arquivos[0];
      if (primeiro === undefined) return;

      // Um arquivo por vez, e a recusa é dita em vez de silenciosa: mandar só
      // o primeiro de um punhado arrastado seria descartar os outros sem
      // avisar, que é a única saída pior do que recusar.
      if (arquivos.length > 1) {
        setEstado({
          fase: 'recusado',
          arquivo: descreverArquivo(primeiro),
          recusa: RECUSA_POR_LOTE,
        });
        return;
      }

      void enviarRom(primeiro, setEstado).then((final) => {
        if (final.fase !== 'pronto') return;
        setNestaSessao((anteriores) => [
          { arquivo: final.arquivo, rom: final.rom },
          ...anteriores.filter((item) => item.rom.romId !== final.rom.romId),
        ]);
      });
    },
    [ocupado],
  );

  const limpar = useCallback(() => {
    setEstado({ fase: 'ocioso' });
  }, []);

  return { estado, nestaSessao, ocupado, enviar, limpar };
}
