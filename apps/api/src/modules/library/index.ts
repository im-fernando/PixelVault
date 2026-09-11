/**
 * Superfície pública do módulo `library`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar library/domain, library/application ou library/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono do acervo privado de cada pessoa: as ROMs que ela enviou e o
 * caminho por onde elas entram. Ele não é dono da sessão (pede a resolução ao
 * `sessions`), nem da autorização (pergunta ao `identity`), nem do storage (a
 * porta é encanamento compartilhado da aplicação, injetado pela composition
 * root).
 *
 * Anêmico de propósito: caso de uso fino chamando repositório e porta, sem
 * entidade nem value object. O que existe de regra aqui é convenção de caminho
 * e teto de tamanho, e nenhuma das duas é invariante que uma constraint
 * protegeria melhor. Ver docs/adr/0005.
 *
 * `prismaUserRomRepository` sai daqui desde a #89: o save na nuvem
 * (`progress`) precisa saber se um `romId` é de quem está pedindo antes de
 * gravar ou ler o save dele — a mesma pergunta que `autorizar-download-de-rom.ts`
 * já respondia dentro deste módulo, agora reaproveitada por outro. É a
 * instância mesmo, não só o tipo: o `progress` não monta repositório
 * nenhum, só pergunta ao dono dos dados.
 *
 * `contarRomsNaBiblioteca` sai daqui desde a #120: `achievements` pergunta
 * quantas ROMs a conta tem para a conquista de coleção (ADR 0010), pela
 * composition root — não por import direto, para não fechar um ciclo com o
 * aviso de evento que `library` já faz na direção contrária (ver o
 * cabeçalho de `achievements/domain/portas-de-agregacao.ts`).
 */
export { libraryRoutes } from './http/routes.js';
export type { OpcoesDeLibrary } from './http/routes.js';
export type {
  RomDoUsuario,
  RomDoUsuarioParaDownload,
  UserRomRepository,
} from './domain/user-rom-repository.js';
export type { AvisarPrimeiraRomEnviada } from './domain/eventos-de-gamificacao.js';
export { prismaUserRomRepository } from './infrastructure/prisma-user-rom-repository.js';
export { contarRomsNaBiblioteca } from './application/contar-roms-na-biblioteca.js';
