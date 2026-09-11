/**
 * O que o `library` precisa avisar quando a primeira ROM da conta entra na
 * biblioteca: "avise quem cuida disso", sem saber quem é.
 *
 * É uma porta declarada por quem consome (ADR 0004), pelo mesmo motivo de
 * `IdentificarRomNoCatalogo`: o domínio não conhece `achievements`, nem pelo
 * `index.ts` dele. Quem amarra os dois é a borda (`http/routes.ts`), na hora
 * de montar o caso de uso — importando `avisarPrimeiraRomEnviada` direto de
 * `achievements/index.ts` e passando como esta porta, por compatibilidade
 * estrutural.
 *
 * A assinatura é o recorte mínimo: `library` não decide o que "primeira ROM
 * enviada" significa para conquista nenhuma — isso é vocabulário de
 * `achievements`. Aqui só existe "avise que este evento aconteceu para esta
 * conta".
 */
export type AvisarPrimeiraRomEnviada = (userId: string) => Promise<void>;
