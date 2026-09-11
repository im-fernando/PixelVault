import { achievementCodeSchema, type AchievementCode } from '@pixelvault/contracts';

/**
 * A lista fechada de conquistas, do lado do front.
 *
 * `GET /api/achievements` só devolve o que a conta já desbloqueou — o
 * comentário de `achievementListResponseSchema` (`@pixelvault/contracts`) é
 * explícito: a lista completa é estática e vive aqui, porque não precisa de
 * uma viagem de rede para saber quais conquistas EXISTEM, só para saber quais
 * a conta já tem. `achievementCodeSchema` é a fonte da verdade dos doze
 * códigos; este catálogo só empresta texto e limiar a cada um — nunca inventa
 * um treze.
 *
 * Os limiares vêm do [ADR 0010](../../../../../docs/adr/0010-regras-de-gamificacao-da-m6.md):
 * coleção 10/50/100 ROMs, jogos distintos 5/20/50, horas jogadas 1/10/50h.
 * Nenhuma conquista aqui é do tipo "surpresa" — todas dizem o que falta sem
 * spoiler, porque nenhuma delas guarda segredo de conteúdo. Se um dia
 * nascer uma que guarde, o campo `descricao` de quem ainda não desbloquou
 * precisa ficar mais discreto que o de quem já tem — não é o caso hoje.
 */
export interface ConquistaDoCatalogo {
  readonly code: AchievementCode;
  readonly titulo: string;
  /** O que a conta vê tanto desbloqueada quanto bloqueada — sem spoiler. */
  readonly descricao: string;
}

export const CATALOGO_DE_CONQUISTAS: readonly ConquistaDoCatalogo[] = [
  {
    code: 'primeira_rom_enviada',
    titulo: 'Primeiro cartucho',
    descricao: 'Enviou a primeira ROM para a própria biblioteca.',
  },
  {
    code: 'primeiro_save_state',
    titulo: 'Ponto de retorno',
    descricao: 'Gravou o primeiro save state num slot da galeria.',
  },
  {
    code: 'primeira_sincronizacao',
    titulo: 'Save na nuvem',
    descricao: 'Sincronizou a primeira SRAM com a nuvem.',
  },
  {
    code: 'colecionista_bronze',
    titulo: 'Colecionista — bronze',
    descricao: 'Chegou a 10 ROMs na biblioteca.',
  },
  {
    code: 'colecionista_prata',
    titulo: 'Colecionista — prata',
    descricao: 'Chegou a 50 ROMs na biblioteca.',
  },
  {
    code: 'colecionista_ouro',
    titulo: 'Colecionista — ouro',
    descricao: 'Chegou a 100 ROMs na biblioteca.',
  },
  {
    code: 'explorador_bronze',
    titulo: 'Explorador — bronze',
    descricao: 'Jogou 5 jogos distintos.',
  },
  {
    code: 'explorador_prata',
    titulo: 'Explorador — prata',
    descricao: 'Jogou 20 jogos distintos.',
  },
  {
    code: 'explorador_ouro',
    titulo: 'Explorador — ouro',
    descricao: 'Jogou 50 jogos distintos.',
  },
  {
    code: 'dedicacao_bronze',
    titulo: 'Dedicação — bronze',
    descricao: 'Somou 1 hora jogada, certificada pelo servidor.',
  },
  {
    code: 'dedicacao_prata',
    titulo: 'Dedicação — prata',
    descricao: 'Somou 10 horas jogadas, certificadas pelo servidor.',
  },
  {
    code: 'dedicacao_ouro',
    titulo: 'Dedicação — ouro',
    descricao: 'Somou 50 horas jogadas, certificadas pelo servidor.',
  },
];

// Trava em tempo de build/teste: se a #120 (ou uma issue futura) mudar o
// enum de códigos sem que este catálogo acompanhe, o mismatch aparece aqui,
// não numa tela em produção mostrando uma conquista sem texto.
const codigosDoEnum = new Set(achievementCodeSchema.options);
const codigosDoCatalogo = new Set(CATALOGO_DE_CONQUISTAS.map((conquista) => conquista.code));
if (
  codigosDoEnum.size !== codigosDoCatalogo.size ||
  [...codigosDoEnum].some((codigo) => !codigosDoCatalogo.has(codigo))
) {
  throw new Error(
    'CATALOGO_DE_CONQUISTAS está desalinhado com achievementCodeSchema — atualize os dois juntos.',
  );
}

export function conquistaDoCatalogo(code: AchievementCode): ConquistaDoCatalogo {
  const conquista = CATALOGO_DE_CONQUISTAS.find((item) => item.code === code);
  if (conquista === undefined) {
    // Inalcançável enquanto a trava acima passar — grita alto se um dia não passar.
    throw new Error(`Código de conquista sem entrada no catálogo: ${code}`);
  }
  return conquista;
}
