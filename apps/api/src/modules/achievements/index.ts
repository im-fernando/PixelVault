/**
 * Superfície pública do módulo `achievements`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar achievements/domain, achievements/application ou
 * achievements/infrastructure. A regra é verificada no CI pelo
 * dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono das conquistas de plataforma da M6 — ADR 0008 (plano B) e
 * ADR 0010 (a lista e os limites). Issue #120.
 *
 * ## As três funções de evento
 *
 * `avisarPrimeiraRomEnviada`, `avisarPrimeiroSaveState` e
 * `avisarPrimeiraSincronizacao` são o que `library` e `progress` chamam
 * quando o evento correspondente acontece — importadas direto daqui nos
 * `http/routes.ts` deles, do mesmo jeito que `library` já importa
 * `identificarRomPorHash` de `catalog`. Cada uma é uma função pronta, já
 * amarrada ao próprio repositório: quem chama não monta dependência
 * nenhuma, só avisa. São idempotentes — chamar de novo para quem já tem a
 * conquista não faz nada (ver `domain/conquista-desbloqueada-repository.ts`).
 *
 * `library` e `progress` declaram, cada um no seu próprio domínio, o tipo da
 * porta que consomem (`AvisarPrimeiraRomEnviada` em `library`,
 * `AvisarPrimeiroSaveState`/`AvisarPrimeiraSincronizacao` em `progress`) —
 * não importam tipo nenhum de cá. A compatibilidade é estrutural
 * (`(userId: string) => Promise<void>` nas duas pontas), o mesmo desenho de
 * `IdentificarRomNoCatalogo`.
 *
 * ## Por que não há uma função simétrica para `library`/`progress` chamarem
 * na direção contrária
 *
 * Não existe, porque a agregação (coleção, jogos distintos, horas jogadas)
 * não é evento — é pergunta. `achievements` PERGUNTA a `library` e a
 * `progress` quanto a conta tem, em vez de esperar que avisem. Se também
 * exportássemos algo daqui para eles chamarem, mais o que já existe, os dois
 * lados se importariam um ao outro e o `dependency-cruiser` reprovaria por
 * ciclo (docs/adr/0003). Por isso a pergunta passa pela composition root:
 * `app.ts` injeta `contarRomsNaBiblioteca` (de `library`) e
 * `agregadoDeJogoDoUsuario` (de `progress`) em `achievementsRoutes` — ver o
 * comentário de `domain/portas-de-agregacao.ts`.
 */
export { achievementsRoutes } from './http/routes.js';
export type { OpcoesDeAchievements } from './http/routes.js';
export type {
  AgregadoDeJogoDoUsuario,
  ContarRomsNaBiblioteca,
  ObterAgregadoDeJogoDoUsuario,
} from './domain/portas-de-agregacao.js';
export type { CodigoDeConquista, ConquistaDesbloqueada } from './domain/conquista-desbloqueada.js';
export type { ConquistaDesbloqueadaRepository } from './domain/conquista-desbloqueada-repository.js';

import { registrarConquistaDeEvento } from './application/registrar-evento.js';
import { prismaConquistaDesbloqueadaRepository } from './infrastructure/prisma-conquista-desbloqueada-repository.js';

const conquistas = prismaConquistaDesbloqueadaRepository;

/** O `library` chama isto em `confirmar-envio-de-rom.ts`, depois de registrar a ROM. */
export async function avisarPrimeiraRomEnviada(userId: string): Promise<void> {
  await registrarConquistaDeEvento({ conquistas }, userId, 'primeira_rom_enviada');
}

/** O `progress` chama isto em `gravar-save-state.ts`, depois de gravar com sucesso. */
export async function avisarPrimeiroSaveState(userId: string): Promise<void> {
  await registrarConquistaDeEvento({ conquistas }, userId, 'primeiro_save_state');
}

/** O `progress` chama isto em `gravar-sram.ts`, depois de gravar com sucesso. */
export async function avisarPrimeiraSincronizacao(userId: string): Promise<void> {
  await registrarConquistaDeEvento({ conquistas }, userId, 'primeira_sincronizacao');
}
