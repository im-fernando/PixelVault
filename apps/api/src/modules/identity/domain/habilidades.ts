import {
  abilityResource,
  createAbility,
  type Ability,
  type AbilityAction,
  type AbilityResource,
  type AbilityRule,
  type AbilitySubject,
} from '@pixelvault/contracts';

/**
 * As regras de autorização do PixelVault, inteiras.
 *
 * Ficam no `identity` porque é ele o dono da conta e do papel dela; os outros
 * módulos consomem tudo pela fachada (`identity/index.ts`), nunca por aqui.
 * Ver docs/adr/0003 e docs/adr/0018.
 *
 * `domain/` e não `application/`: isto é regra de negócio pura — nenhuma
 * linha sabe o que é HTTP, Prisma ou requisição, e o arquivo inteiro se
 * testa sem subir nada.
 *
 * A máquina de avaliar regra (o CASL) fica no `@pixelvault/contracts`, que
 * os dois lados compartilham; aqui mora só a política. É a divisão que
 * permite o front receber estas mesmas regras e montar a mesma `Ability`
 * sem que ninguém as escreva duas vezes.
 */

/** Papel da conta. Espelha o enum `Role` do banco. */
export const PAPEIS = ['user', 'admin'] as const;
export type Papel = (typeof PAPEIS)[number];

/**
 * O mínimo que se precisa saber de alguém para decidir o que ele pode: quem
 * é e qual o papel. `null` é o visitante — quem chega sem sessão.
 */
export interface UsuarioParaHabilidades {
  id: string;
  papel: Papel;
}

export type Acao = AbilityAction;
export type Assunto = AbilitySubject;

/**
 * Os tipos do CASL já fechados no vocabulário do contrato. Os apelidos em
 * português existem para o resto da API não precisar trocar de língua no
 * meio de uma linha — o contrato fala inglês porque é o que atravessa a
 * fronteira HTTP.
 */
export type RecursoDeHabilidade = AbilityResource;
export type Habilidades = Ability;

/**
 * Etiqueta um objeto qualquer como recurso de um tipo. O `identity` reexporta
 * isto para que nenhum módulo precise importar o CASL só para fazer uma
 * pergunta de autorização.
 *
 * Todo recurso com dono carrega `userId` — é a chave que as regras de
 * propriedade comparam. O perfil também, ainda que a coluna correspondente
 * em `users` se chame `id`: a borda que monta o recurso faz esse mapeamento
 * de uma linha, e em troca a regra de propriedade é uma só para os três.
 */
export function recurso(tipo: Assunto, dados: Record<string, unknown>): RecursoDeHabilidade {
  return abilityResource(tipo, dados);
}

/**
 * As regras de quem está pedindo, no formato serializável do próprio CASL.
 *
 * São só regras de `can`. Não existe um `cannot` aqui, e não deveria passar a
 * existir sem uma boa razão: o CASL nega tudo que não foi permitido, então
 * uma rota nova sem regra correspondente já recusa por omissão. Simular um
 * allowlist com negações amplas inverteria isso — passaria a permitir por
 * esquecimento, que é o erro que custa caro.
 *
 * A lista é exatamente a da issue #48, e nada além dela.
 */
export function definirRegrasDeHabilidade(usuario: UsuarioParaHabilidades | null): AbilityRule[] {
  const regras: AbilityRule[] = [
    // O catálogo é de metadados e é público: capa, título e ano são visíveis
    // para quem nem conta tem. Ver docs/adr/0006.
    { action: 'read', subject: 'Game' },
    // Homebrew é o que podemos distribuir, então é o que qualquer um joga sem
    // login e sem upload. Jogar o resto depende de a ROM estar na biblioteca
    // de quem pede — regra do `library`, quando ele existir (M3).
    { action: 'play', subject: 'Game', conditions: { isHomebrew: true } },
  ];

  if (usuario === null) return regras;

  // "Ler e escrever o próprio" — escrever aberto em create/update/delete, e
  // não como `manage`. `manage` é curinga: uma ação nova inventada amanhã
  // já nasceria permitida ao dono sem ninguém decidir isso.
  regras.push(
    {
      action: ['read', 'create', 'update', 'delete'],
      subject: 'Library',
      conditions: { userId: usuario.id },
    },
    {
      action: ['read', 'create', 'update', 'delete'],
      subject: 'Progress',
      conditions: { userId: usuario.id },
    },
    // Conquista não se cria, não se atualiza e não se apaga por aqui: quem
    // desbloqueia é o servidor, a partir de evento de outro módulo — a conta
    // só lê a própria lista (issue #120).
    { action: 'read', subject: 'Achievement', conditions: { userId: usuario.id } },
    // Perfil não se cria nem se apaga por aqui: criar é o cadastro, e apagar
    // a conta é fluxo próprio, com regra própria, quando existir.
    { action: ['read', 'update'], subject: 'Profile', conditions: { userId: usuario.id } },
    // Ranking não tem dono — é sobre várias contas ao mesmo tempo — então,
    // diferente das regras acima, esta não carrega `conditions`: qualquer
    // conta autenticada pode ler o ranking de qualquer jogo (issue #122). O
    // que cada linha do ranking expõe (handle e nome de exibição, nunca
    // e-mail) já é o que a M6 planeja tornar público em `/u/:handle` (#123).
    { action: 'read', subject: 'Leaderboard' },
  );

  // Admin administra o catálogo — e só ele. Não recebe `manage all`: o acervo
  // e o progresso de quem quer que seja continuam fora do alcance dele.
  if (usuario.papel === 'admin') regras.push({ action: 'manage', subject: 'Game' });

  return regras;
}

/**
 * A `Ability` de quem está pedindo, montada a partir das mesmas regras que o
 * front recebe, pela mesma função que o front usa (`createAbility`, do
 * contrato). Uma definição só: o que o servidor decide e o que o front
 * desenha não podem divergir por terem sido escritos duas vezes.
 */
export function definirHabilidades(usuario: UsuarioParaHabilidades | null): Habilidades {
  return createAbility(definirRegrasDeHabilidade(usuario));
}
