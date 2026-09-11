import { describe, expect, it } from 'vitest';
import { createAbility } from '@pixelvault/contracts';
import {
  definirHabilidades,
  definirRegrasDeHabilidade,
  recurso,
  type Habilidades,
} from './habilidades.js';

const DONO = { id: 'usuario-1', papel: 'user' } as const;
const OUTRA_PESSOA = 'usuario-2';

const biblioteca = (userId: string): ReturnType<typeof recurso> => recurso('Library', { userId });
const progresso = (userId: string): ReturnType<typeof recurso> => recurso('Progress', { userId });
const perfil = (userId: string): ReturnType<typeof recurso> => recurso('Profile', { userId });
const conquistas = (userId: string): ReturnType<typeof recurso> =>
  recurso('Achievement', { userId });

const homebrew = recurso('Game', { slug: 'demo', isHomebrew: true });
const comercial = recurso('Game', { slug: 'super-jogo', isHomebrew: false });

describe('habilidades do dono', () => {
  const habilidades: Habilidades = definirHabilidades(DONO);

  it('lê e escreve a própria biblioteca, o próprio progresso e o próprio perfil', () => {
    expect(habilidades.can('read', biblioteca(DONO.id))).toBe(true);
    expect(habilidades.can('update', biblioteca(DONO.id))).toBe(true);
    expect(habilidades.can('read', progresso(DONO.id))).toBe(true);
    expect(habilidades.can('update', progresso(DONO.id))).toBe(true);
    expect(habilidades.can('read', perfil(DONO.id))).toBe(true);
    expect(habilidades.can('update', perfil(DONO.id))).toBe(true);
  });

  it('lê as próprias conquistas, mas não escreve nem apaga', () => {
    expect(habilidades.can('read', conquistas(DONO.id))).toBe(true);
    expect(habilidades.can('create', conquistas(DONO.id))).toBe(false);
    expect(habilidades.can('update', conquistas(DONO.id))).toBe(false);
    expect(habilidades.can('delete', conquistas(DONO.id))).toBe(false);
  });

  it('não alcança a biblioteca, o progresso nem as conquistas de outra pessoa', () => {
    expect(habilidades.can('read', biblioteca(OUTRA_PESSOA))).toBe(false);
    expect(habilidades.can('update', biblioteca(OUTRA_PESSOA))).toBe(false);
    expect(habilidades.can('delete', biblioteca(OUTRA_PESSOA))).toBe(false);
    expect(habilidades.can('read', progresso(OUTRA_PESSOA))).toBe(false);
    expect(habilidades.can('update', progresso(OUTRA_PESSOA))).toBe(false);
    expect(habilidades.can('read', perfil(OUTRA_PESSOA))).toBe(false);
    expect(habilidades.can('read', conquistas(OUTRA_PESSOA))).toBe(false);
  });

  it('não administra o catálogo', () => {
    expect(habilidades.can('update', 'Game')).toBe(false);
    expect(habilidades.can('delete', 'Game')).toBe(false);
    expect(habilidades.can('manage', 'Game')).toBe(false);
  });

  // A armadilha desta modelagem, fixada aqui para não ser redescoberta na
  // marra: perguntar pelo TIPO ("pode ler biblioteca?") é perguntar se
  // existe alguma que ele possa ler — e a resposta é sim, a dele. Só a
  // pergunta com o recurso na mão decide propriedade. É por isso que
  // `autorizarOuNaoEncontrado` exige o recurso e não aceita o nome do tipo.
  it('responde sim ao tipo genérico, que é uma pergunta sobre potencial', () => {
    expect(habilidades.can('read', 'Library')).toBe(true);
    expect(habilidades.can('read', biblioteca(DONO.id))).toBe(true);
    expect(habilidades.can('read', biblioteca(OUTRA_PESSOA))).toBe(false);
  });
});

describe('habilidades de qualquer um', () => {
  const visitante: Habilidades = definirHabilidades(null);
  const logado: Habilidades = definirHabilidades(DONO);

  it('lê o catálogo público com ou sem conta', () => {
    expect(visitante.can('read', 'Game')).toBe(true);
    expect(visitante.can('read', comercial)).toBe(true);
    expect(logado.can('read', 'Game')).toBe(true);
  });

  it('joga homebrew com ou sem conta, e só homebrew', () => {
    expect(visitante.can('play', homebrew)).toBe(true);
    expect(logado.can('play', homebrew)).toBe(true);
    expect(visitante.can('play', comercial)).toBe(false);
    expect(logado.can('play', comercial)).toBe(false);
  });

  it('não dá ao visitante acervo, progresso nem conquista de ninguém', () => {
    expect(visitante.can('read', biblioteca(DONO.id))).toBe(false);
    expect(visitante.can('read', progresso(DONO.id))).toBe(false);
    expect(visitante.can('read', perfil(DONO.id))).toBe(false);
    expect(visitante.can('read', conquistas(DONO.id))).toBe(false);
  });
});

describe('habilidades de admin', () => {
  const admin: Habilidades = definirHabilidades({ id: 'admin-1', papel: 'admin' });

  it('administra o catálogo', () => {
    expect(admin.can('create', 'Game')).toBe(true);
    expect(admin.can('update', 'Game')).toBe(true);
    expect(admin.can('delete', 'Game')).toBe(true);
  });

  // Administrar o catálogo não é administrar as pessoas. Se um dia isso
  // precisar mudar, muda com a regra escrita e com a razão junto.
  it('não alcança a biblioteca nem o progresso de ninguém', () => {
    expect(admin.can('read', biblioteca(DONO.id))).toBe(false);
    expect(admin.can('update', progresso(DONO.id))).toBe(false);
    expect(admin.can('read', perfil(DONO.id))).toBe(false);
  });
});

describe('as mesmas regras do outro lado do fio', () => {
  // O front recebe estas regras em JSON e monta a `Ability` com a mesma
  // função. Se a serialização perdesse a condição de dono, o front passaria
  // a desenhar acesso ao acervo alheio — e é isto que o teste vigia.
  it('sobrevive à ida e volta em JSON com as mesmas respostas', () => {
    const regras = definirRegrasDeHabilidade(DONO);
    const noFront = createAbility(
      JSON.parse(JSON.stringify(regras)) as ReturnType<typeof definirRegrasDeHabilidade>,
    );

    expect(noFront.can('read', biblioteca(DONO.id))).toBe(true);
    expect(noFront.can('read', biblioteca(OUTRA_PESSOA))).toBe(false);
    expect(noFront.can('play', homebrew)).toBe(true);
    expect(noFront.can('play', comercial)).toBe(false);
  });
});

describe('negar por padrão', () => {
  it('recusa a ação e o assunto que ninguém previu', () => {
    // A mesma `Ability`, com o tipo afrouxado: o TypeScript barraria estas
    // perguntas, e o ponto é justamente fazê-las como faria o dia em que
    // alguém acrescenta um recurso novo e esquece de escrever a regra dele.
    // As mesmas regras, sem uma linha a mais, já respondem "não".
    const habilidades = definirHabilidades(DONO) as unknown as {
      can(acao: string, assunto: string): boolean;
    };

    // `Leaderboard` ainda não existe (nasce com `achievements` na M6, mas
    // ainda não recebeu regra nenhuma) — `Achievement` já é assunto real
    // desde a #120, então deixou de servir a este teste.
    expect(habilidades.can('read', 'Leaderboard')).toBe(false);
    expect(habilidades.can('publicar', 'Game')).toBe(false);
    expect(habilidades.can('manage', 'all')).toBe(false);
  });

  it('não emite regra de negação — negar é o padrão, não uma lista', () => {
    const regras = [
      ...definirRegrasDeHabilidade(null),
      ...definirRegrasDeHabilidade(DONO),
      ...definirRegrasDeHabilidade({ id: 'admin-1', papel: 'admin' }),
    ];

    expect(regras.every((regra) => regra.inverted !== true)).toBe(true);
  });

  it('condiciona ao dono toda regra sobre recurso de alguém', () => {
    const comDono = definirRegrasDeHabilidade(DONO).filter((regra) =>
      ['Library', 'Progress', 'Profile', 'Achievement'].includes(String(regra.subject)),
    );

    expect(comDono).not.toHaveLength(0);
    expect(comDono.every((regra) => regra.conditions?.userId === DONO.id)).toBe(true);
  });
});
