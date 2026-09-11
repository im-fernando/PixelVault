import { ChevronRight, Delete, Search } from 'lucide-react';
import { LINHAS_DO_TECLADO } from './teclado-do-console.js';

export function ConsoleSearchKeyboard({
  query,
  alterar,
  digitar,
  concluir,
  resultados,
  colecao,
  controle,
}: {
  query: string;
  alterar: (valor: string) => void;
  digitar: (letra: string) => void;
  concluir: () => void;
  resultados: number;
  colecao: string;
  controle: boolean;
}) {
  return (
    <>
      <div className="cx-search-input">
        <Search size={20} />
        <input
          data-autofocus={!controle ? '' : undefined}
          aria-label="Nome do jogo"
          value={query}
          maxLength={28}
          onChange={(e) => alterar(e.target.value)}
          placeholder="Digite o nome do jogo..."
        />
        <span>{query.length}/28</span>
      </div>
      <p className="cx-search-results" role="status">
        {resultados} resultado{resultados === 1 ? '' : 's'} em {colecao.toLocaleLowerCase()}
      </p>
      <div className="cx-keyboard" role="group" aria-label="Teclado de busca">
        {LINHAS_DO_TECLADO.map((linha, y) => (
          <div key={linha}>
            {linha.split('').map((tecla, x) => (
              <button
                key={tecla}
                type="button"
                data-console-key={tecla}
                data-linha={y}
                data-coluna={x + (10 - linha.length) / 2}
                data-autofocus={controle && y === 0 && x === 0 ? '' : undefined}
                data-console-sound="digitar"
                onClick={() => digitar(tecla)}
              >
                {tecla}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="cx-keyboard-actions">
        <button
          type="button"
          data-console-key="espaco"
          data-linha={4}
          data-coluna={0.75}
          data-console-sound="digitar"
          onClick={() => digitar(' ')}
        >
          Espaço
        </button>
        <button
          type="button"
          data-console-key="apagar"
          data-linha={4}
          data-coluna={3.25}
          data-console-sound="apagar"
          onClick={() => alterar(query.slice(0, -1))}
        >
          <Delete size={16} />
          Apagar
        </button>
        <button
          type="button"
          data-console-key="limpar"
          data-linha={4}
          data-coluna={5.75}
          data-console-sound="apagar"
          onClick={() => alterar('')}
        >
          Limpar
        </button>
        <button
          type="button"
          data-console-key="buscar"
          data-linha={4}
          data-coluna={8.25}
          onClick={concluir}
        >
          Ver jogos <ChevronRight size={16} />
        </button>
      </div>
      <p className="cx-keyboard-hints">
        <span>
          <kbd>✚</kbd> / analógico · Navegar
        </span>
        <span>
          <kbd>A / ✕</kbd> Digitar
        </span>
        <span>
          <kbd>X / □</kbd> Apagar
        </span>
        <span>
          <kbd>Y / △</kbd> Espaço
        </span>
        <span>
          <kbd>Start</kbd> Buscar
        </span>
        <span>
          <kbd>B / ○</kbd> Voltar
        </span>
      </p>
    </>
  );
}
