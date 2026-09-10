import { useEffect, useRef, useState } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import {
  createSaveStorage,
  sramKey,
  type SaveMetadata,
  type SaveStorage,
} from './storage/index.js';
import { gravarRevisaoSincronizada, lerRevisaoSincronizada } from './storage/sram-sync-revision.js';
import {
  base64ParaBytes,
  bytesParaBase64,
  useEnviarSramParaNuvem,
  useSramNaNuvem,
} from './sram-nuvem.js';

/** Tempo parado depois da última gravação local antes de mandar para a nuvem. */
const DEBOUNCE_DE_ENVIO_MS = 4000;

export type EstadoDeSincronizacao = 'sincronizado' | 'enviando' | 'falhou';

export interface SincronizacaoDeSram {
  /**
   * `false` só na janela curta em que este aparelho precisa puxar uma SRAM
   * mais nova da nuvem antes de abrir a partida (ver o comentário da issue
   * #91 mais abaixo). Fora isso, `true` desde o primeiro render — a
   * sincronização de rotina nunca trava o jogo esperando rede.
   */
  readonly pronto: boolean;
  /**
   * `true` quando este aparelho já é conhecido da nuvem para este `romId` —
   * a sincronização automática assume e o indicador de estado substitui a
   * oferta de adoção da #92. `false` enquanto não há vínculo (nuvem vazia) ou
   * enquanto existe uma colisão que só a escolha explícita da #92 resolve.
   */
  readonly vinculado: boolean;
  readonly estado: EstadoDeSincronizacao | null;
  /** Chamar quando a SRAM local acaba de ser regravada — o gatilho da #91. */
  registrarGravacaoLocal(metadata: SaveMetadata): void;
}

/**
 * Mantém a SRAM local e a da nuvem em dia depois que existe vínculo — issue
 * #91. O "vínculo" em si é decisão da #92: não há flag de conta nenhuma,
 * `useSramNaNuvem` devolvendo `status: 'encontrado'` já é a prova de que a
 * conta tem algo sincronizado. O que esta issue acrescenta é o ponteiro **por
 * aparelho** (`storage/sram-sync-revision.ts`) que diz se ESTE navegador já
 * viu aquele save — sem ele não dá para separar "rotina, continue em
 * silêncio" de "colisão nova, exige a escolha explícita da #92".
 *
 * ## Três decisões que a issue pede para documentar
 *
 * 1. **Conflito de revisão (409) durante o envio em segundo plano: a nuvem
 *    vence, sem retry automático da escrita rejeitada.** Quando dois
 *    aparelhos gravam quase junto, o perdedor recebe 409; em vez de tentar
 *    reaplicar o que foi recusado, este código invalida a consulta da nuvem
 *    e deixa o efeito de reconciliação (o mesmo que roda no boot) puxar a
 *    revisão vencedora para o storage local. É o que faz o critério de
 *    aceite da milestone funcionar ("joga, fecha, abre no outro aparelho, o
 *    progresso está lá") sem intervenção manual, e evita ping-pong: se
 *    insistíssemos em reenviar o que perdeu, dois aparelhos jogando ao mesmo
 *    tempo trocariam 409 para sempre. A partida continua rodando pelo save
 *    local o tempo todo — perder uma rodada de sincronização não perde
 *    progresso, só adia quando os dois lados voltam a bater.
 * 2. **Debounce de rede próprio, maior que o do disco.** O `SaveManager` já
 *    junta escritas físicas com `SRAM_DEBOUNCE_PADRAO_MS` (1,5 s). Mandar
 *    para a nuvem a cada uma dessas gravações seria uma requisição a cada
 *    segundo e meio de jogo ativo; `DEBOUNCE_DE_ENVIO_MS` (4 s) absorve uma
 *    sequência de gravações locais numa sincronização só, porque rede é mais
 *    cara que disco.
 * 3. **O indicador é dado, não decisão.** Este hook só expõe `estado`; quem
 *    desenha o rodapé (`IndicadorDeSincronizacao`) decide a aparência. Sem
 *    vínculo, `estado` é `null` de propósito — a tela mostra a oferta de
 *    adoção da #92 em vez do indicador, nunca os dois ao mesmo tempo.
 *
 * ## Por que às vezes `pronto` começa `false`
 *
 * Se este aparelho já está vinculado e a nuvem avançou desde a última vez que
 * ele olhou (outro aparelho sincronizou enquanto este estava fechado), abrir
 * a partida direto do storage local reabriria um save velho — e ele ficaria
 * velho por toda a sessão, porque a SRAM só é lida do storage uma vez, no
 * boot (`SaveManager.restoreSram`). Por isso, só neste caso específico, a
 * tela espera a escrita local da SRAM da nuvem terminar antes de montar o
 * player. É rápido (é decodificar base64 e gravar local, sem rede: os bytes
 * já vieram na mesma resposta que decide vinculação) e é a única janela em
 * que a #91 atrasa o jogo — todo o resto (subir o que mudou, aplicar 409) é
 * best-effort em segundo plano, como a issue exige.
 */
export function useSincronizacaoDeSram(
  romId: string,
  systemId: SystemId | null,
  storageInjetado?: SaveStorage,
): SincronizacaoDeSram {
  // `systemId === null` é "ainda não sei se este romId é meu" (a ROM não
  // resolveu, ou nem é da conta) — não há o que reconciliar, e perguntar à
  // nuvem antes disso seria uma requisição para um `romId` que a tela pode
  // nem chegar a mostrar.
  const nuvem = useSramNaNuvem(systemId === null ? null : romId);
  const enviar = useEnviarSramParaNuvem(romId);

  const [pronto, setPronto] = useState(false);
  const [vinculado, setVinculado] = useState(false);
  const [estado, setEstado] = useState<EstadoDeSincronizacao | null>(null);

  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageRef = useRef<SaveStorage | null>(storageInjetado ?? null);

  const abrirStorage = async (): Promise<SaveStorage> => {
    if (storageInjetado !== undefined) return storageInjetado;
    storageRef.current ??= await createSaveStorage();
    return storageRef.current;
  };

  // Reconciliação: roda no boot e de novo toda vez que `useSramNaNuvem`
  // refaz a leitura (adoção da #92, ou o 409 tratado abaixo invalidando a
  // consulta) — é o mesmo efeito que resolve as duas situações, documentado
  // no cabeçalho da função.
  useEffect(() => {
    let cancelado = false;

    const reconciliar = async (): Promise<void> => {
      if (systemId === null || nuvem.isPending) {
        setPronto(false);
        return;
      }

      if (nuvem.data === undefined || nuvem.data.status === 'sem-save') {
        // Sem cloud (erro ou vazia): nada para puxar. A oferta de adoção da
        // #92 assume quando a nuvem estiver vazia; erro de rede não pode
        // impedir jogar pelo save local, como sempre funcionou.
        if (!cancelado) {
          setVinculado(false);
          setEstado(null);
          setPronto(true);
        }
        return;
      }

      const revisaoConhecida = lerRevisaoSincronizada(romId);
      if (revisaoConhecida === 0) {
        // Este aparelho nunca viu save de nuvem para este romId — só a
        // escolha explícita da #92 resolve, mesmo que a nuvem já tenha algo.
        // Não bloqueia a partida: ela roda pelo save local enquanto a pessoa
        // decide.
        if (!cancelado) {
          setVinculado(false);
          setEstado(null);
          setPronto(true);
        }
        return;
      }

      // Vinculado: este aparelho já reconciliou esse romId antes.
      if (!cancelado) setVinculado(true);

      if (nuvem.data.revision <= revisaoConhecida) {
        // Local já está em dia (ou à frente, com gravação ainda não
        // enviada — o envio em segundo plano cuida disso).
        if (!cancelado) {
          setEstado('sincronizado');
          setPronto(true);
        }
        return;
      }

      // A nuvem avançou desde a última vez que este aparelho olhou: puxa
      // antes de liberar o player, pelo motivo do cabeçalho da função.
      try {
        const bytes = base64ParaBytes(nuvem.data.dataBase64);
        const storage = await abrirStorage();
        await storage.write({
          key: sramKey(romId),
          data: bytes,
          systemId,
          // SRAM não compara `coreVersion` (`compatibility.ts`) — o valor
          // aqui é só para satisfazer o schema, nunca é lido para decidir
          // compatibilidade.
          coreVersion: 'sincronizado-da-nuvem',
          updatedAt: Date.parse(nuvem.data.updatedAt),
        });
        gravarRevisaoSincronizada(romId, nuvem.data.revision);
        if (!cancelado) {
          setEstado('sincronizado');
          setPronto(true);
        }
      } catch {
        // Falhou puxar da nuvem (storage indisponível, aba anônima
        // restrita): segue com o save local mesmo, sem travar a partida —
        // best-effort também vale para o boot.
        if (!cancelado) {
          setEstado('falhou');
          setPronto(true);
        }
      }
    };

    void reconciliar();

    return () => {
      cancelado = true;
    };
  }, [romId, systemId, nuvem.data, nuvem.isPending]);

  const registrarGravacaoLocal = (_metadata: SaveMetadata): void => {
    // O parâmetro só existe para casar com o formato de `onSramWritten` do
    // `EmulatorPlayer` — o envio relê do disco (ver `enviarParaNuvem`), não
    // usa os bytes do evento, porque o debounce pode juntar várias
    // gravações numa sincronização só.
    //
    // Sem vínculo ainda: a colisão pendente é da #92, esta issue não
    // sobrescreve a nuvem sem a escolha explícita dela.
    if (!vinculado) return;

    if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
    temporizadorRef.current = setTimeout(() => {
      temporizadorRef.current = null;
      void enviarParaNuvem();
    }, DEBOUNCE_DE_ENVIO_MS);
  };

  /**
   * Lê os bytes atuais do disco (não os do evento que agendou o envio): o
   * debounce pode juntar várias gravações locais numa sincronização só, e o
   * que importa é o estado mais recente, não o instantâneo de quando o
   * temporizador foi armado.
   */
  const enviarParaNuvem = async (): Promise<void> => {
    setEstado('enviando');
    try {
      const storage = await abrirStorage();
      const guardado = await storage.read(sramKey(romId));
      // Sumiu entre o agendamento e o envio (romId trocou, save apagado): não
      // há o que mandar, e não é falha — só não há mais gravação pendente.
      if (guardado === null) {
        setEstado('sincronizado');
        return;
      }

      const revisaoBase = lerRevisaoSincronizada(romId);
      await enviar.mutateAsync({
        dataBase64: bytesParaBase64(guardado.data),
        revision: revisaoBase,
      });
      // `useEnviarSramParaNuvem` já grava a revisão sincronizada e invalida a
      // consulta da nuvem em `onSuccess` — nada a fazer aqui além de refletir
      // no indicador.
      setEstado('sincronizado');
    } catch (erro) {
      if (erro instanceof ApiRequestError && erro.status === 409) {
        // Decisão documentada no cabeçalho: a nuvem vence, sem retry manual
        // da escrita rejeitada. Invalidar a consulta é o bastante — o efeito
        // de reconciliação acima puxa a revisão vencedora sozinho.
        void nuvem.refetch();
        return;
      }
      setEstado('falhou');
    }
  };

  return { pronto, vinculado, estado, registrarGravacaoLocal };
}
