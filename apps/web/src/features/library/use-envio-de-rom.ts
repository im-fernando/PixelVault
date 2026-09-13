import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHAVE_DAS_CONQUISTAS } from '../achievements/use-conquistas.js';
import { sistemaPelaExtensao } from './arquivo-de-rom.js';
import type { RecusaDeEnvio } from './erros-de-envio.js';
import {
  enviarRom,
  type ArquivoEmEnvio,
  type EstadoDoEnvio,
  type RomEnviada,
} from './envio-de-rom.js';

/** Uma ROM que entrou na biblioteca nesta sessão da tela. */
export interface RomDaSessao {
  readonly arquivo: ArquivoEmEnvio;
  readonly rom: RomEnviada;
}

/** Um arquivo do lote que a verificação recusou — a fila continua sem ele. */
export interface ItemRecusadoDoLote {
  readonly arquivo: ArquivoEmEnvio;
  readonly recusa: RecusaDeEnvio;
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
  /** O que a verificação recusou nesta sessão — a fila não parou por causa deles. */
  readonly falhas: readonly ItemRecusadoDoLote[];
  /**
   * Quantos arquivos ainda esperam atrás do que está em `estado` agora.
   * `0` é "nenhum" e também é o valor de repouso, sem lote em andamento.
   */
  readonly restantesNaFila: number;
  readonly ocupado: boolean;
  /**
   * Recebe o que veio do input ou do arrastar — um arquivo, vários, ou os de
   * uma pasta inteira. Chega em cima de um envio já em andamento, e entra na
   * fila em vez de disputar com ele: soltar mais arquivos enquanto os
   * primeiros ainda sobem não deveria exigir esperar de propósito.
   */
  readonly enviar: (arquivos: readonly File[]) => void;
  readonly limpar: () => void;
}

/**
 * Só o que a extensão promete ser ROM.
 *
 * Filtra um lote de mais de um arquivo antes de qualquer rede — soltar uma
 * pasta inteira costuma trazer `readme.txt`, capa em `.png`, o `.zip`
 * original, e nenhum dos três merece um upload, uma verificação de servidor
 * e uma recusa de 422 só para dizer o que a extensão já dizia aqui. Um
 * arquivo escolhido a dedo continua indo inteiro pela verificação de
 * verdade — é ela quem decide, e a pessoa que escolheu UM arquivo esquisito
 * de propósito merece saber exatamente por que ele foi recusado, não que ele
 * simplesmente não apareceu.
 */
function filtraLote(arquivos: readonly File[]): readonly File[] {
  if (arquivos.length <= 1) return arquivos;
  return arquivos.filter((arquivo) => sistemaPelaExtensao(arquivo.name) !== null);
}

export function useEnvioDeRom(): EnvioDeRom {
  const [estado, setEstado] = useState<EstadoDoEnvio>({ fase: 'ocioso' });
  const [nestaSessao, setNestaSessao] = useState<readonly RomDaSessao[]>([]);
  const [falhas, setFalhas] = useState<readonly ItemRecusadoDoLote[]>([]);
  const [restantesNaFila, setRestantesNaFila] = useState(0);
  const queryClient = useQueryClient();

  // A fila vive em `ref`, não em estado: cada arquivo processado dispara o
  // próximo antes de o React re-renderizar, e um `useState` leria o valor de
  // quando o fechamento foi criado, não o de agora — a mesma armadilha que
  // `setEstado(anterior => ...)` existe para evitar, só que aqui não há
  // "anterior" que resolva, porque quem manda no ritmo é uma promessa, não
  // um evento do React.
  const fila = useRef<File[]>([]);
  const processando = useRef(false);

  const ocupado =
    estado.fase === 'conferindo' || estado.fase === 'enviando' || estado.fase === 'verificando';

  const processarProximo = useCallback(() => {
    const proximo = fila.current.shift();
    setRestantesNaFila(fila.current.length);

    if (proximo === undefined) {
      processando.current = false;
      return;
    }

    void enviarRom(proximo, setEstado).then((final) => {
      if (final.fase === 'pronto') {
        setNestaSessao((anteriores) => [
          { arquivo: final.arquivo, rom: final.rom },
          ...anteriores.filter((item) => item.rom.romId !== final.rom.romId),
        ]);
        // Enviar a primeira ROM é gesto que pode desbloquear
        // `primeira_rom_enviada` (ADR 0010) — invalida a consulta de
        // conquistas para o front comparar contra o que já tinha visto.
        void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_CONQUISTAS });
      } else if (final.fase === 'recusado') {
        setFalhas((anteriores) => [
          ...anteriores,
          { arquivo: final.arquivo, recusa: final.recusa },
        ]);
      }

      processarProximo();
    });
  }, [queryClient]);

  const enviar = useCallback(
    (arquivos: readonly File[]) => {
      const validos = filtraLote(arquivos);
      if (validos.length === 0) return;

      fila.current.push(...validos);

      if (processando.current) {
        // Já tem lote andando: só atualiza a contagem. O arquivo que acaba
        // de entrar é atendido quando `processarProximo` chegar nele.
        setRestantesNaFila(fila.current.length);
        return;
      }

      processando.current = true;
      processarProximo();
    },
    [processarProximo],
  );

  const limpar = useCallback(() => {
    setEstado({ fase: 'ocioso' });
  }, []);

  return { estado, nestaSessao, falhas, restantesNaFila, ocupado, enviar, limpar };
}
