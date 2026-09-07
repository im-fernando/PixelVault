import { z } from 'zod';

/**
 * Só o tamanho é validado aqui. Bloqueio de senha comum é regra de negócio
 * viva (a lista de piores senhas cresce) e mora no domínio — não faz sentido
 * subir para o contrato, que é o formato da borda.
 *
 * Mínimo generoso por comprimento, não por complexidade: exigir símbolo e
 * maiúscula produz senha previsível ("Senha@123"), não senha forte.
 */
export const TAMANHO_MINIMO_SENHA = 12;
export const TAMANHO_MAXIMO_SENHA = 128;

export const senhaCandidataSchema = z.string().min(TAMANHO_MINIMO_SENHA).max(TAMANHO_MAXIMO_SENHA);
export type SenhaCandidata = z.infer<typeof senhaCandidataSchema>;
