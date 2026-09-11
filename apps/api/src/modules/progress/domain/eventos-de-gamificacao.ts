/**
 * O que o `progress` precisa avisar quando a conta sincroniza save com a
 * nuvem por conta própria pela primeira vez — mesmo desenho de
 * `AvisarPrimeiraRomEnviada` em `library`, e pelo mesmo motivo: a porta é
 * declarada por quem consome (ADR 0004), sem que o domínio conheça
 * `achievements`.
 *
 * Dois eventos, e não um: `gravar-save-state.ts` chama
 * {@link AvisarPrimeiroSaveState} e `gravar-sram.ts` chama
 * {@link AvisarPrimeiraSincronizacao} — são conquistas diferentes (ADR 0010)
 * porque são gestos diferentes de produto. SRAM sincroniza sozinha, o tempo
 * todo, enquanto a pessoa joga (ver o cabeçalho de `gravar-sram.ts`); save
 * state nasce de um clique explícito num slot da galeria. "Primeira
 * sincronização com a nuvem" é sobre o primeiro gesto invisível; "primeiro
 * save state" é sobre o primeiro gesto deliberado.
 */
export type AvisarPrimeiroSaveState = (userId: string) => Promise<void>;
export type AvisarPrimeiraSincronizacao = (userId: string) => Promise<void>;
