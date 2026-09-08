import type { MotivoDeRecusaDeRom } from '@pixelvault/contracts';

/**
 * O arquivo que chegou à quarentena não é uma ROM que sirva.
 *
 * Carrega o motivo estável, não o status HTTP: quem traduz invariante violada
 * para 4xx é a camada de aplicação (`confirmar-envio-de-rom.ts`), pelo mesmo
 * desenho que o `identity` usa em `domain/erros.ts` + `traduzir-erro.ts`. O
 * domínio não conhece HTTP, e a rota não decide regra de mapeamento.
 */
export class RomRecusada extends Error {
  constructor(
    readonly motivo: MotivoDeRecusaDeRom,
    message: string,
  ) {
    super(message);
    this.name = 'RomRecusada';
  }
}
