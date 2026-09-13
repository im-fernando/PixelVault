/**
 * O que a pessoa escolhe ver na abertura da home — hoje, um interruptor só:
 * mostrar ou não a seção do catálogo público (`GameLibrary`) abaixo da
 * própria biblioteca.
 *
 * Fica no navegador, não na conta: é preferência de tela, não dado que
 * precise seguir a pessoa para outro aparelho nem ser protegido de mais
 * ninguém — ninguém além dela vê a própria home. Guardar isso no servidor
 * custaria uma coluna, uma rota e uma viagem de rede para uma escolha que só
 * importa neste navegador, agora. Mesmo padrão de `console/temas.ts`.
 */
export interface PreferenciaDeHome {
  /** Mostrar a seção "Catálogo público" (o homebrew que qualquer visitante vê). */
  readonly catalogoPublico: boolean;
}

const CHAVE = 'pixelvault.home.preferences.v1';
const PADRAO: PreferenciaDeHome = { catalogoPublico: true };

export function lerPreferenciaDeHome(): PreferenciaDeHome {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    if (typeof valor !== 'object' || valor === null) return PADRAO;

    const dados = valor as Record<string, unknown>;
    return {
      catalogoPublico:
        typeof dados.catalogoPublico === 'boolean' ? dados.catalogoPublico : PADRAO.catalogoPublico,
    };
  } catch {
    // Armazenamento bloqueado (aba privada, site data desligado) não pode
    // impedir a home de abrir — cai no padrão, que é mostrar tudo.
    return PADRAO;
  }
}

export function salvarPreferenciaDeHome(preferencia: PreferenciaDeHome): boolean {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(preferencia));
    return true;
  } catch {
    return false;
  }
}
