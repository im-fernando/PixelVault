import { useEffect, useRef, useState } from 'react';
import type { AchievementCode } from '@pixelvault/contracts';
import { conquistaDoCatalogo } from './catalogo-de-conquistas.js';
import { gravarConquistasVistas, lerConquistasVistas } from './conquistas-vistas.js';
import { useConquistas } from './use-conquistas.js';
import { useSessao } from '../auth/sessao.js';

/** Mesmo padrão de `EmulatorPlayer.tsx`: aviso discreto, nunca modal, que se apaga sozinho. */
const MILISSEGUNDOS_DO_AVISO = 6000;

/**
 * Detecta "esta conta acabou de desbloquear uma conquista" e devolve o texto
 * do aviso discreto para mostrar — ou `null` quando não há nada de novo.
 *
 * ## Por que comparar duas leituras, e não um evento do servidor
 *
 * `GET /api/achievements` só lista o estado atual (ver o comentário de
 * `achievementListResponseSchema`); não existe "evento de desbloqueio"
 * separado que o front possa assinar. A única forma de notar "desbloqueou
 * agora" é comparar o conjunto de códigos de uma leitura contra o da leitura
 * anterior — e como o desbloqueio pode acontecer em qualquer tela (enviar
 * ROM, gravar save state, sincronizar SRAM), quem invalida `CHAVE_DAS_
 * CONQUISTAS` depois dessas ações (`use-envio-de-rom.ts`, `state-nuvem.ts`,
 * `sram-nuvem.ts`) é quem faz esta consulta refazer e este hook comparar de
 * novo — este hook não sonda em intervalo, só reage a invalidação.
 *
 * ## Por que a base de comparação é `localStorage`, não estado em memória
 *
 * Um `useRef` guardando "o conjunto da última leitura" resolveria o mesmo
 * problema enquanto o componente estivesse montado, mas perderia a memória a
 * cada F5 — e um F5 é exatamente o tipo de recarregamento que aconteceria
 * entre "enviar a ROM" e "ver o toast", se a tela fosse trocada no meio.
 * `conquistas-vistas.ts` (localStorage, por conta) sobrevive a isso.
 */
export function useNotificacaoDeConquista(): string | null {
  const sessao = useSessao();
  const conquistas = useConquistas();
  const [aviso, setAviso] = useState<string | null>(null);

  // Evita reprocessar a mesma resposta duas vezes (ex.: um segundo render
  // com os mesmos dados) — só a TROCA do array de conquistas dispara a
  // comparação.
  const ultimaReferenciaProcessada = useRef<unknown>(undefined);

  useEffect(() => {
    if (sessao.estado !== 'autenticado') return;
    if (conquistas.data === undefined) return;
    if (ultimaReferenciaProcessada.current === conquistas.data) return;
    ultimaReferenciaProcessada.current = conquistas.data;

    const userId = sessao.usuario.id;
    const codigosAtuais = new Set(conquistas.data.achievements.map((item) => item.code));
    const vistas = lerConquistasVistas(userId);

    if (vistas === null) {
      // Primeira leitura deste navegador para esta conta: grava a base em
      // silêncio, sem tratar o que já existia como novidade — ver o
      // comentário de `lerConquistasVistas`.
      gravarConquistasVistas(userId, codigosAtuais);
      return;
    }

    const novas: AchievementCode[] = [...codigosAtuais].filter((codigo) => !vistas.has(codigo));
    gravarConquistasVistas(userId, codigosAtuais);
    if (novas.length === 0) return;

    const titulos = novas.map((codigo) => conquistaDoCatalogo(codigo).titulo);
    setAviso(
      titulos.length === 1
        ? `Conquista desbloqueada: ${titulos[0]}.`
        : `Conquistas desbloqueadas: ${titulos.join(', ')}.`,
    );
  }, [sessao, conquistas.data]);

  useEffect(() => {
    if (aviso === null) return;
    const temporizador = window.setTimeout(() => setAviso(null), MILISSEGUNDOS_DO_AVISO);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  return aviso;
}
