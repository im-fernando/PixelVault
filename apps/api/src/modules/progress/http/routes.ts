import { Buffer } from 'node:buffer';
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  sramDownloadResponseSchema,
  sramUploadRequestSchema,
  sramUploadResponseSchema,
  TAMANHO_MAXIMO_DE_SRAM_EM_BYTES,
  uuidSchema,
} from '@pixelvault/contracts';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { habilidadesDoUsuario } from '../../identity/index.js';
import { prismaUserRomRepository } from '../../library/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { gravarSram } from '../application/gravar-sram.js';
import { lerSram } from '../application/ler-sram.js';
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
        { roms: prismaUserRomRepository, saves: prismaUserSaveRepository, armazenamento },
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
};
