import { useGames } from './use-games.js';
import { useBiblioteca } from './use-biblioteca.js';
import { useRomsLocais } from './local-roms.js';

/**
 * O frontispício: a etiqueta que vai do lado de fora da caixa de arquivo.
 *
 * Não é herói com manchete vaga. É o que um acervo declara sobre si mesmo:
 * o que guarda, quanto guarda, e sob que regra. Os números são lidos do
 * conteúdo real, não escritos à mão — acervo que mente a própria contagem
 * não é acervo.
 */
export function Frontispicio() {
  const { data: publicos } = useGames();
  const { data: minhas } = useBiblioteca();
  const { data: locais } = useRomsLocais();

  const nPublicos = publicos?.length ?? 0;
  // As duas procedências do que é "seu" somadas: as ROMs enviadas para a conta
  // (#75) e as da biblioteca local de desenvolvimento. Contar só uma delas
  // faria o frontispício mentir sobre as prateleiras logo abaixo dele — e
  // acervo que mente a própria contagem não é acervo.
  const nSeus = (minhas?.length ?? 0) + (locais?.length ?? 0);

  return (
    <header className="mx-6 mb-10 border-b border-ink-850 pb-8">
      <p className="leitura mb-3 text-ink-700">acervo pessoal · super nintendo</p>

      <h1 className="titulo-estampado max-w-2xl text-4xl leading-[0.95] text-label-100 sm:text-5xl">
        Cartucho guarda o save numa pilha.
        <br />
        <span className="text-label-400">Pilha acaba.</span>
      </h1>

      <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-500">
        Aqui não acaba. Seu acervo roda no navegador, e o progresso fica onde você deixou — em
        qualquer aparelho.
      </p>

      <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-3">
        <Verbete rotulo="no catálogo" valor={nPublicos} nota="jogáveis sem conta" />
        <Verbete rotulo="seus" valor={nSeus} nota="privadas de você" />
        <Verbete rotulo="consoles" valor={1} nota="mais vêm" />
      </dl>
    </header>
  );
}

function Verbete({
  rotulo,
  valor,
  nota,
}: {
  readonly rotulo: string;
  readonly valor: number;
  readonly nota: string;
}) {
  return (
    <div>
      <dt className="leitura text-ink-700">{rotulo}</dt>
      <dd className="titulo-estampado text-2xl leading-none text-label-100">
        {String(valor).padStart(2, '0')}
      </dd>
      <p className="mt-1 text-[0.7rem] text-ink-700">{nota}</p>
    </div>
  );
}
