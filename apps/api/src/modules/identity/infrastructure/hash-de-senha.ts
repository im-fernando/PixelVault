import argon2 from 'argon2';

/**
 * Parâmetros atuais do Argon2id, medidos nesta máquina (ver
 * `docs/seguranca.md`) mirando 200–500 ms por hash — rápido o bastante para
 * não virar vetor de negação de serviço no login (o rate limit que segura a
 * repetição é outro mecanismo, em `http/limite-de-autenticacao.ts`), caro o
 * bastante para tornar força bruta offline inviável.
 *
 * Argon2id já embute esses três números na própria string do hash
 * (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), então "está desatualizado?"
 * vira só comparar o hash salvo com esta constante — sem tabela auxiliar.
 */
const PARAMETROS_ATUAIS = {
  type: argon2.argon2id,
  memoryCost: 131072, // 128 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash de uma senha aleatória de 32 bytes que ninguém nunca soube e que foi
 * descartada assim que este valor foi impresso. Existe por um motivo só:
 * dar ao login um hash contra o qual verificar quando o e-mail informado
 * não tem conta.
 *
 * Sem ele, o login teria dois caminhos com custos diferentes — "achei o
 * usuário, rodo o Argon2" (~330 ms) e "não achei, respondo já" (~1 ms) — e
 * qualquer pessoa com um cronômetro descobriria quem tem conta aqui, um
 * e-mail por requisição, sem precisar acertar nenhuma senha. Verificando
 * contra este hash, os dois caminhos pagam o mesmo. Ver `docs/seguranca.md`
 * e `application/autenticar-usuario.ts`.
 *
 * Ele precisa ter sido gerado com `PARAMETROS_ATUAIS`: o custo de uma
 * verificação Argon2 vem dos parâmetros embutidos na própria string do
 * hash, então um valor calculado com parâmetros antigos verificaria mais
 * rápido que um hash real e reabriria a fresta de tempo. `hash-de-senha.test.ts`
 * guarda essa invariante — se alguém recalibrar o Argon2 e esquecer desta
 * constante, o teste quebra.
 *
 * Não é segredo: é um hash de senha aleatória descartada, versionado de
 * propósito para que a constante seja a mesma em toda instância da API (uma
 * gerada em boot daria custo idêntico, mas tiraria a auditabilidade de saber
 * exatamente contra o quê se está verificando).
 */
export const HASH_DESCARTAVEL =
  '$argon2id$v=19$m=131072,p=1,t=2$eAzxPSxuQWApnAuq/FYmoA$WzKck4kKXwYSrBE0GhUK3yxEP+OasztFz496FVcL5e8';

/** Só para o teste conferir que o hash descartável não envelheceu. */
export function hashPrecisaDeRecalibragem(hash: string): boolean {
  return argon2.needsRehash(hash, PARAMETROS_ATUAIS);
}

/**
 * Gera o hash de uma senha em texto puro. Cada chamada usa um salt novo
 * (o Argon2id gera o dele sozinho), então a mesma senha nunca produz o
 * mesmo hash duas vezes — é isso que impede um ataque de rainbow table.
 */
export async function gerarHashDeSenha(senhaPlana: string): Promise<string> {
  return argon2.hash(senhaPlana, PARAMETROS_ATUAIS);
}

/**
 * Confere se a senha em texto puro corresponde ao hash guardado. Não decide
 * nada sobre reidratação — quem quer isso chama `verificarERehash`.
 */
export async function verificarSenha(senhaPlana: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, senhaPlana);
}

export interface ResultadoVerificacao {
  /** Se a senha em texto puro corresponde ao hash guardado. */
  valida: boolean;
  /**
   * Presente só quando `valida` é `true` e o hash guardado foi calculado
   * com parâmetros diferentes dos atuais. Quem chama regrava esse valor
   * no lugar do hash antigo — esta função não sabe onde é o banco, e não
   * precisa saber. Quem regrava é `application/autenticar-usuario.ts`.
   */
  novoHash?: string;
}

/**
 * Reidratação transparente: verifica a senha e, se ela bater e o hash
 * guardado tiver sido calculado com parâmetros antigos, calcula um hash
 * novo com os parâmetros atuais para o caller regravar. Assim dá para
 * subir o custo do hash no futuro sem invalidar nenhuma senha existente —
 * cada login bem-sucedido migra silenciosamente quem ainda está no hash
 * velho.
 *
 * Nunca re-hasheia uma senha errada: `needsRehash` só é chamado depois que
 * `verify` já confirmou a senha, então uma tentativa de força bruta não
 * consegue arrancar um hash novo daqui.
 */
export async function verificarERehash(
  senhaPlana: string,
  hashAtual: string,
): Promise<ResultadoVerificacao> {
  const valida = await argon2.verify(hashAtual, senhaPlana);
  if (!valida) {
    return { valida: false };
  }

  if (argon2.needsRehash(hashAtual, PARAMETROS_ATUAIS)) {
    return { valida: true, novoHash: await gerarHashDeSenha(senhaPlana) };
  }

  return { valida: true };
}
