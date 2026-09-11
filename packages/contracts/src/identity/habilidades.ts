import {
  createMongoAbility,
  subject,
  type ForcedSubject,
  type MongoAbility,
  type RawRuleOf,
} from '@casl/ability';
import { z } from 'zod';

/**
 * Vocabulário de autorização, compartilhado pelos dois lados.
 *
 * Os nomes ficam em inglês, ao contrário do resto do domínio, por duas
 * razões: eles atravessam a API pública (o front recebe estas strings como
 * vieram) e são o vocabulário do próprio CASL, onde `read`, `manage` e o
 * nome do subject entram literalmente na regra. Traduzir aqui obrigaria a
 * destraduzir na hora de montar a `Ability`.
 *
 * A lista é curta de propósito: é exatamente o que o produto tem hoje.
 * Papel granular, moderação e time ficam de fora até existir a necessidade
 * (issue #48).
 */
export const abilityActionSchema = z.enum([
  'read',
  'create',
  'update',
  'delete',
  /** Curinga do CASL: cobre todas as ações sobre aquele subject. */
  'manage',
  /** Carregar a ROM e rodar o emulador — não é leitura de metadado. */
  'play',
]);
export type AbilityAction = z.infer<typeof abilityActionSchema>;

/**
 * Sobre o que se age. `Game` é o catálogo de metadados; `Library` é o acervo
 * privado de uma pessoa (as ROMs que ela subiu); `Progress` é o save e o
 * playtime dela; `Profile` é a conta dela; `Achievement` são as conquistas de
 * plataforma que ela já desbloqueou (M6, issue #120); `Leaderboard` é o
 * ranking de playtime por jogo (M6, issue #122) — sem dono (é sobre várias
 * contas ao mesmo tempo), por isso a regra dele não carrega `conditions` de
 * `userId` como `Library`/`Progress`/`Achievement`/`Profile` carregam.
 *
 * `Library` e `Progress` ainda não têm rota (M3 e M4), e é de propósito que
 * o vocabulário venha antes: a regra que os protege é a mesma para os dois,
 * e escrevê-la agora evita que cada módulo invente a sua quando chegar.
 */
export const abilitySubjectSchema = z.enum([
  'Game',
  'Library',
  'Progress',
  'Profile',
  'Achievement',
  'Leaderboard',
]);
export type AbilitySubject = z.infer<typeof abilitySubjectSchema>;

/**
 * Uma regra do CASL como ela viaja em JSON — é o formato nativo dele
 * (`ability.rules`), não uma tradução nossa: o front joga isto direto no
 * `createMongoAbility` e obtém a mesma `Ability` que o servidor montou.
 *
 * As condições que emitimos hoje são só igualdade simples (`userId` do dono,
 * `isHomebrew` do jogo), então o valor é string ou booleano. Uma condição
 * mais rica que isso pede uma revisão deste schema — e provavelmente uma
 * conversa sobre se ela deveria mesmo sair do servidor.
 */
export const abilityRuleSchema = z.object({
  action: z.union([abilityActionSchema, z.array(abilityActionSchema)]),
  subject: z.union([abilitySubjectSchema, z.array(abilitySubjectSchema)]),
  conditions: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  /**
   * Regra de negação. Não emitimos nenhuma hoje — negar é o padrão do CASL,
   * e um allowlist ao contrário seria um jeito de errar. O campo existe no
   * schema para que uma negação futura não seja silenciosamente descartada
   * na serialização, o que deixaria o front mais permissivo que o servidor.
   */
  inverted: z.boolean().optional(),
});
export type AbilityRule = z.infer<typeof abilityRuleSchema>;

/**
 * Resposta de `GET /api/auth/abilities`.
 *
 * O front usa isto para decidir o que desenhar, nunca para decidir o que
 * acontece: quem autoriza é o servidor, em cada requisição. Esconder um
 * botão é conveniência; a regra que vale é a que roda do outro lado.
 */
export const abilitiesResponseSchema = z.object({
  rules: z.array(abilityRuleSchema),
});
export type AbilitiesResponse = z.infer<typeof abilitiesResponseSchema>;

/**
 * Um recurso concreto etiquetado com o tipo dele — o "subject" do CASL.
 *
 * Perguntar pelo nome do tipo ("pode ler biblioteca?") é perguntar se existe
 * ALGUMA que a pessoa possa ler, e a resposta é sim, a dela. Quem responde
 * sobre propriedade é a pergunta feita com o recurso na mão.
 */
export type AbilityResource = Record<string, unknown> & ForcedSubject<AbilitySubject>;

/** A `Ability` do CASL fechada no vocabulário acima. */
export type Ability = MongoAbility<[AbilityAction, AbilitySubject | AbilityResource]>;

/**
 * A máquina de autorização vive aqui, no pacote que os dois lados
 * compartilham, porque o CASL é isomórfico e o pedido é literalmente que a
 * mesma definição de habilidades chegue ao front (issue #48).
 *
 * O que NÃO mora aqui é a política — quem pode o quê. Essa é do módulo
 * `identity`, que é dono da conta e do papel dela; este pacote só sabe montar
 * uma `Ability` a partir de regras que alguém escreveu.
 */
export function createAbility(rules: AbilityRule[]): Ability {
  return createMongoAbility<Ability>(rules.map(toRawRule));
}

export function abilityResource(
  type: AbilitySubject,
  data: Record<string, unknown>,
): AbilityResource {
  return subject(type, data);
}

/**
 * A mesma regra, no tipo que o CASL aceita. A cópia campo a campo existe por
 * causa do `exactOptionalPropertyTypes`: o schema descreve `conditions` como
 * "ausente ou um objeto", e o CASL como "ausente" — passar a propriedade
 * valendo `undefined` não é a mesma coisa que não passá-la.
 */
function toRawRule(rule: AbilityRule): RawRuleOf<Ability> {
  return {
    action: rule.action,
    subject: rule.subject,
    ...(rule.conditions === undefined ? {} : { conditions: rule.conditions }),
    ...(rule.inverted === undefined ? {} : { inverted: rule.inverted }),
  };
}
