import { z } from 'zod';

export const TAMANHO_MINIMO_HANDLE = 3;
export const TAMANHO_MAXIMO_HANDLE = 30;

/** kebab-case: minúsculo, dígitos, hífen só separando blocos. */
export const HANDLE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reservadas porque `handle` vira a rota pública `/u/:handle` na M6 (ver
 * issue #43). Sem isto, a primeira pessoa a se cadastrar como "admin" ou
 * "api" colidiria com uma rota real do sistema assim que ela nascer.
 *
 * `u`, o segmento fixo da própria rota, fica de fora da lista de propósito:
 * com menos de `TAMANHO_MINIMO_HANDLE` caracteres, já é inalcançável.
 */
export const HANDLES_RESERVADOS = [
  'api',
  'admin',
  'play',
  'meus-jogos',
  'enviar-rom',
  'console',
  'login',
  'cadastro',
  'configuracoes',
  'recuperar-senha',
  'redefinir-senha',
  'conquistas',
] as const;

export const handleSchema = z
  .string()
  .min(TAMANHO_MINIMO_HANDLE)
  .max(TAMANHO_MAXIMO_HANDLE)
  .regex(HANDLE_REGEX, 'handle deve ser kebab-case')
  .refine((handle) => !(HANDLES_RESERVADOS as readonly string[]).includes(handle), {
    message: 'handle reservado',
  });
export type HandleInput = z.infer<typeof handleSchema>;
