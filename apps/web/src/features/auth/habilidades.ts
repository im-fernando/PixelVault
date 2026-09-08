import { useQuery } from '@tanstack/react-query';
import {
  abilitiesResponseSchema,
  abilityResource,
  createAbility,
  type Ability,
  type AbilitiesResponse,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * A chave da consulta, exportada porque quem muda de identidade precisa
 * invalidá-la: as regras são calculadas para quem está pedindo, e as do
 * visitante não são as de quem acabou de entrar. Ver `sessao.tsx`.
 */
export const CHAVE_DAS_HABILIDADES = ['abilities'] as const;

/**
 * O que a pessoa pode fazer, do ponto de vista do front.
 *
 * As regras não são escritas aqui: vêm de `GET /api/auth/abilities`, montadas
 * pelo servidor, e são as MESMAS que ele usa para decidir cada requisição.
 * O front só as usa para escolher o que desenhar — esconder um botão que a
 * pessoa não pode apertar é cortesia, não segurança. Quem impede a ação é o
 * servidor, sempre, e é por isso que nada aqui é "a autorização".
 *
 * A rota responde 200 para visitante também (ler o catálogo, jogar homebrew),
 * então este hook não depende de haver sessão.
 */
export function useHabilidades(): { habilidades: Ability; carregando: boolean } {
  const consulta = useQuery<AbilitiesResponse>({
    queryKey: CHAVE_DAS_HABILIDADES,
    queryFn: () => apiFetch('/api/auth/abilities', abilitiesResponseSchema),
  });

  // Enquanto não chegou (ou se falhou), ninguém pode nada: uma `Ability`
  // vazia esconde o que talvez fosse permitido, e isso é um botão a menos
  // por um instante. O contrário — assumir permissão e desenhar o botão —
  // renderiza uma interface que a API vai recusar.
  return {
    habilidades: createAbility(consulta.data?.rules ?? []),
    carregando: consulta.isPending,
  };
}

/**
 * Reexportado para a interface fazer a pergunta certa: `pode('update',
 * recurso('Profile', { userId }))` decide sobre AQUELE perfil. Perguntar
 * pelo nome do tipo responde "pode em algum", que não é a mesma coisa.
 */
export { abilityResource as recurso };
