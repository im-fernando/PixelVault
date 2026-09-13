import { Buffer } from 'node:buffer';
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  heartbeatResponseSchema,
  slotDeSaveStateParamSchema,
  sramDownloadResponseSchema,
  sramUploadRequestSchema,
  sramUploadResponseSchema,
  stateDownloadResponseSchema,
  stateListResponseSchema,
  stateUploadRequestSchema,
  stateUploadResponseSchema,
  TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES,
  TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES,
  TAMANHO_MAXIMO_DE_SRAM_EM_BYTES,
  TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS,
  uuidSchema,
  type SlotDeSaveState,
} from '@pixelvault/contracts';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { avisarPrimeiraSincronizacao, avisarPrimeiroSaveState } from '../../achievements/index.js';
import { habilidadesDoUsuario } from '../../identity/index.js';
import { prismaUserRomRepository } from '../../library/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { creditarHeartbeatDePlaytime } from '../application/creditar-heartbeat-de-playtime.js';
import { gravarSaveState } from '../application/gravar-save-state.js';
import { gravarSram } from '../application/gravar-sram.js';
import { lerSaveState } from '../application/ler-save-state.js';
import { lerSram } from '../application/ler-sram.js';
import { listarSaveStates } from '../application/listar-save-states.js';
import { prismaUserGameRepository } from '../infrastructure/prisma-user-game-repository.js';
import { prismaUserSaveRepository } from '../infrastructure/prisma-user-save-repository.js';

export interface OpcoesDeProgress extends FastifyPluginOptions {
  /** Toda rota daqui exige sessão — o save é da conta, nunca do visitante. */
  sessoes: Sessoes;
  /** A porta de object storage, injetada pela composition root (mesma do `library`). */
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Camada HTTP fina: valida, autoriza, delega e serializa. Mesma disciplina
 * do `library` (`http/routes.ts` de lá é o modelo).
 */
export const progressRoutes: FastifyPluginAsyncZod<OpcoesDeProgress> = async (app, opcoes) => {
  const { sessoes, armazenamento } = opcoes;

  app.post(
    '/progress/sram/:romId',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['progress'],
        summary: 'Grava a SRAM de uma ROM da biblioteca, com checagem de conflito por revisão',
        description:
          'A `revision` do corpo é a que o cliente leu por último — `0` quando ele não ' +
          'conhece nenhum save ainda. Bate com a revisão do servidor: grava e devolve a ' +
          'nova revisão. Diverge: recusa com 409 e devolve, em `details`, a revisão, o ' +
          'tamanho e o `updatedAt` atuais do servidor — nunca sobrescreve por conta ' +
          `própria (docs/adr/0020, regra 4). Teto de ${TAMANHO_MAXIMO_DE_SRAM_EM_BYTES} ` +
          'bytes por gravação (os bytes decodificados do base64, conferidos pelo ' +
          'contrato) — bem menor que o de ROM, porque SRAM não é cartucho. Só quem tem ' +
          'o `romId` na própria biblioteca pode gravar save nele — o mesmo 404 uniforme ' +
          'do download de ROM para `romId` inexistente ou de outra conta.',
        params: z.object({ romId: uuidSchema }),
        body: sramUploadRequestSchema,
        response: {
          200: sramUploadResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      const habilidades = await habilidadesDoUsuario(userId);

      // O tamanho já foi conferido pelo `.refine` do contrato, sobre a
      // mesma string — decodificar aqui não pode estourar o teto de novo.
      const bytes = Buffer.from(request.body.dataBase64, 'base64');

      return gravarSram(
        {
          roms: prismaUserRomRepository,
          saves: prismaUserSaveRepository,
          armazenamento,
          avisarSincronizacao: avisarPrimeiraSincronizacao,
        },
        habilidades,
        userId,
        request.params.romId,
        { revision: request.body.revision, bytes },
      );
    },
  );

  app.get(
    '/progress/sram/:romId',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['progress'],
        summary: 'Lê a SRAM na nuvem de uma ROM da biblioteca',
        description:
          'Devolve os bytes em `dataBase64` e a `revision` atual — é o número que a ' +
          'próxima gravação manda de volta como base. `status: "sem-save"` é resposta ' +
          'de sucesso, não erro: a ROM é da conta que pediu, só não foi sincronizada ' +
          'ainda. Só quem tem o `romId` na própria biblioteca pode ler o save dele — o ' +
          'mesmo 404 uniforme do download de ROM para `romId` inexistente ou de outra ' +
          'conta.',
        params: z.object({ romId: uuidSchema }),
        response: {
          200: sramDownloadResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      const habilidades = await habilidadesDoUsuario(userId);

      return lerSram(
        { roms: prismaUserRomRepository, saves: prismaUserSaveRepository, armazenamento },
        habilidades,
        userId,
        request.params.romId,
      );
    },
  );

  app.post(
    '/progress/state/:romId/:slot',
    {
      // Base64 cresce 4/3; o limite padrão de JSON recusava states válidos.
      bodyLimit:
        4 * Math.ceil(TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES / 3) +
        4 * Math.ceil(TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES / 3) +
        1024,
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['progress'],
        summary: 'Grava o save state de um slot, com checagem de conflito por revisão',
        description:
          'Mesma disciplina da SRAM (`POST /progress/sram/:romId`), agora por slot (0 a ' +
          '3) e com uma miniatura obrigatória ao lado do estado — a `revision` do corpo ' +
          'é a que o cliente leu por último (`0` para "nenhum save state ainda neste ' +
          'slot"); batendo com a do servidor, grava e incrementa; divergindo, recusa com ' +
          '409 e devolve em `details` a revisão, o tamanho, o `updatedAt` e a miniatura ' +
          '(`thumbnailBase64`) atuais do servidor — o bastante para a interface de ' +
          `conflito desenhar os dois lados sem uma segunda viagem. Teto de ` +
          `${TAMANHO_MAXIMO_DE_SAVE_STATE_EM_BYTES} bytes para o estado e ` +
          `${TAMANHO_MAXIMO_DA_MINIATURA_EM_BYTES} para a miniatura. Só quem tem o ` +
          '`romId` na própria biblioteca pode gravar save nele — o mesmo 404 uniforme ' +
          'que a SRAM já usa.',
        params: z.object({ romId: uuidSchema, slot: slotDeSaveStateParamSchema }),
        body: stateUploadRequestSchema,
        response: {
          200: stateUploadResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      const habilidades = await habilidadesDoUsuario(userId);

      // Tamanhos já conferidos pelo `.refine` do contrato, sobre as mesmas
      // strings — decodificar aqui não pode estourar teto nenhum de novo.
      const bytes = Buffer.from(request.body.dataBase64, 'base64');
      const thumbnailBytes = Buffer.from(request.body.thumbnailBase64, 'base64');

      // A rota já validou `0..3` (`slotDeSaveStateParamSchema`); o cast é só
      // para o `number` genérico da coerção de URL virar a união fechada que
      // o domínio espera — ver o comentário do schema em
      // `@pixelvault/contracts` para o porquê de não ser `SlotDeSaveState`
      // desde a validação.
      return gravarSaveState(
        {
          roms: prismaUserRomRepository,
          saves: prismaUserSaveRepository,
          armazenamento,
          avisarSaveState: avisarPrimeiroSaveState,
        },
        habilidades,
        userId,
        request.params.romId,
        request.params.slot as SlotDeSaveState,
        { revision: request.body.revision, bytes, thumbnailBytes },
      );
    },
  );

  app.get(
    '/progress/state/:romId',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['progress'],
        summary: 'Lista os save states na nuvem de uma ROM, com miniatura',
        description:
          'Os até 4 slots de save state que a conta já sincronizou para esta ROM, com a ' +
          'miniatura de cada um embutida em base64 — o suficiente para a galeria desenhar ' +
          'os 4 quadros sem baixar o estado inteiro de nenhum. Slot sem save simplesmente ' +
          'não aparece no array; nenhum sincronizado ainda é um array vazio, não erro. Só ' +
          'quem tem o `romId` na própria biblioteca pode listar o save state dele — o ' +
          'mesmo 404 uniforme que a SRAM já usa.',
        params: z.object({ romId: uuidSchema }),
        response: {
          200: stateListResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      const habilidades = await habilidadesDoUsuario(userId);

      return listarSaveStates(
        { roms: prismaUserRomRepository, saves: prismaUserSaveRepository, armazenamento },
        habilidades,
        userId,
        request.params.romId,
      );
    },
  );

  app.get(
    '/progress/state/:romId/:slot',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['progress'],
        summary: 'Assina a leitura do save state de um slot específico',
        description:
          'Devolve uma URL de GET assinada para os bytes do estado (não bytes diretos, ' +
          'diferente da SRAM — o teto de save state é grande o bastante para não caber ' +
          'folgado num corpo de resposta em base64) e a `revision` atual, o número que a ' +
          'próxima gravação manda de volta como base. `status: "sem-save"` é resposta de ' +
          'sucesso, não erro: a ROM é da conta que pediu, só aquele slot ainda não foi ' +
          'sincronizado. Só quem tem o `romId` na própria biblioteca pode ler o save state ' +
          'dele — o mesmo 404 uniforme que a SRAM já usa.',
        params: z.object({ romId: uuidSchema, slot: slotDeSaveStateParamSchema }),
        response: {
          200: stateDownloadResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      const habilidades = await habilidadesDoUsuario(userId);

      return lerSaveState(
        { roms: prismaUserRomRepository, saves: prismaUserSaveRepository, armazenamento },
        habilidades,
        userId,
        request.params.romId,
        request.params.slot as SlotDeSaveState,
      );
    },
  );

  app.post(
    '/progress/heartbeat/:romId',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['progress'],
        summary: 'Heartbeat de playtime: credita, pelo relógio do servidor, o tempo desde o último',
        description:
          'Sem corpo — não existe timestamp de cliente aqui, de propósito (docs/adr/0009). ' +
          'O servidor credita o intervalo desde o último heartbeat aceito para o jogo ' +
          `daquela ROM, com teto de ${TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS}s por heartbeat ` +
          '— um hiato maior (aba oculta e voltou, laptop suspenso) nunca credita o hiato ' +
          'inteiro. `status: "sem-jogo-reconhecido"` é sucesso, não erro: a ROM é da conta ' +
          'que pediu, só não bate com hash nenhum do catálogo (BYOR, ADR 0006) — sem ' +
          '`gameId` não há `UserGame` para creditar. Só quem tem o `romId` na própria ' +
          'biblioteca pode mandar heartbeat dele — o mesmo 404 uniforme da SRAM e do save ' +
          'state.',
        params: z.object({ romId: uuidSchema }),
        response: {
          200: heartbeatResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      const habilidades = await habilidadesDoUsuario(userId);

      return creditarHeartbeatDePlaytime(
        { roms: prismaUserRomRepository, userGames: prismaUserGameRepository },
        habilidades,
        userId,
        request.params.romId,
        TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS,
      );
    },
  );
};
