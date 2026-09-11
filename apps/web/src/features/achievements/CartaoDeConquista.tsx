import { Clock, Cloud, Compass, Library, Save, Upload } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { AchievementCode } from '@pixelvault/contracts';
import type { ConquistaDoCatalogo } from './catalogo-de-conquistas.js';
import { nivelDaConquista } from './nivel-da-conquista.js';

/**
 * Uma conquista, do jeito que aparece na vitrine da conta e no perfil
 * público: a medalha à esquerda, título e descrição ao lado, a data quando
 * foi desbloqueada.
 *
 * É um componente só para as duas telas porque elas mostram o MESMO objeto —
 * o perfil público reaproveita o catálogo de `achievements` de propósito
 * (ver o cabeçalho de `PerfilPublicoPage`), e duas grades desenhadas à mão
 * divergiriam na primeira mexida.
 *
 * Bloqueada continua visível, com o texto inteiro: mostrar o que falta é
 * parte do incentivo (#121), e nenhuma conquista de hoje guarda spoiler. Ela
 * só perde a luz — a medalha apaga e o painel esmaece.
 */
export function CartaoDeConquista({
  conquista,
  unlockedAt = null,
}: {
  readonly conquista: ConquistaDoCatalogo;
  /** Carimbo do servidor. `null` é "ainda não desbloqueou". */
  readonly unlockedAt?: string | null;
}) {
  const desbloqueada = unlockedAt !== null;

  return (
    <li
      className={`pv-painel pv-painel--vidro flex items-start gap-4 p-4 ${
        desbloqueada ? '' : 'opacity-60'
      }`}
    >
      <MedalhaDaConquista code={conquista.code} apagada={!desbloqueada} />
      <div className="min-w-0">
        <p
          className={`text-[15px] font-semibold ${desbloqueada ? 'text-label-100' : 'text-ink-500'}`}
        >
          {conquista.titulo}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">{conquista.descricao}</p>
        {desbloqueada && (
          <time dateTime={unlockedAt} className="leitura mt-2 block text-ink-700">
            {formatarData(unlockedAt)}
          </time>
        )}
      </div>
    </li>
  );
}

/**
 * O ícone é por família — o gesto ou o limiar que a conquista mede —, e o
 * nível entra pela cor. Um `Record` fechado sobre `AchievementCode` para o
 * typecheck gritar quando a #120 (ou quem vier) criar um código sem ícone.
 */
const ICONE_DA_CONQUISTA: Record<AchievementCode, typeof Upload> = {
  primeira_rom_enviada: Upload,
  primeiro_save_state: Save,
  primeira_sincronizacao: Cloud,
  colecionista_bronze: Library,
  colecionista_prata: Library,
  colecionista_ouro: Library,
  explorador_bronze: Compass,
  explorador_prata: Compass,
  explorador_ouro: Compass,
  dedicacao_bronze: Clock,
  dedicacao_prata: Clock,
  dedicacao_ouro: Clock,
};

/**
 * Escondida do leitor de tela: o título já diz o nível ("Colecionista —
 * bronze"), e o ícone só repete a família. Sem nível, a variável fica ausente
 * e `.pv-medalha` cai na luz do tema — que é a cor das conquistas de
 * primeiro gesto.
 */
function MedalhaDaConquista({
  code,
  apagada,
}: {
  readonly code: AchievementCode;
  readonly apagada: boolean;
}) {
  const nivel = nivelDaConquista(code);
  const Icone = ICONE_DA_CONQUISTA[code];

  return (
    <span
      aria-hidden="true"
      className={`pv-medalha ${apagada ? 'pv-medalha--apagada' : ''}`}
      style={nivel === null ? undefined : ({ '--nivel': `var(--color-${nivel})` } as CSSProperties)}
    >
      <Icone size={22} strokeWidth={1.75} />
    </span>
  );
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
