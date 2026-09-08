import { useEffect, useRef } from 'react';
import type { LibraryRom } from '@pixelvault/contracts';
import { emBytesLegiveis } from './tamanho.js';

/**
 * O termo de baixa do acervo: a confirmação antes de tirar uma ROM da estante.
 *
 * Remover é a única ação irreversível da biblioteca — o arquivo é da pessoa, e
 * o servidor não guarda cópia de cortesia. Um clique só seria rápido demais
 * para uma coisa que não tem desfazer, e por isso o caminho passa por aqui.
 *
 * O diálogo mostra o **nome do arquivo**, e não só o título da etiqueta: quem
 * tem duas versões do mesmo jogo precisa saber qual das duas vai embora, e o
 * título das duas é igual.
 *
 * A frase diz o que acontece do lado de cá — "sai da sua biblioteca" — e nada
 * sobre o objeto no storage. Se o arquivo é coletado ou continua lá porque
 * outra pessoa tem o mesmo conteúdo é assunto do servidor, e contá-lo aqui
 * seria contar sobre a biblioteca dos outros (docs/adr/0013).
 */
export function ConfirmarRemocao({
  rom,
  removendo,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  readonly rom: LibraryRom;
  readonly removendo: boolean;
  readonly erro: string | null;
  readonly aoConfirmar: () => void;
  readonly aoCancelar: () => void;
}) {
  const cancelar = useRef<HTMLButtonElement>(null);

  // O foco começa em "Manter", e não em "Remover": num diálogo destrutivo, a
  // tecla de espaço apertada por reflexo não pode ser a que apaga.
  useEffect(() => {
    cancelar.current?.focus();
  }, []);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') aoCancelar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aoCancelar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 px-6"
      onMouseDown={(evento) => {
        // Só o clique que COMEÇA no fundo fecha. Sem isto, arrastar uma
        // seleção de texto de dentro para fora fecharia o diálogo no soltar.
        if (evento.target === evento.currentTarget) aoCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-da-baixa"
        className="w-full max-w-md border border-ink-800 bg-ink-900 px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <h2 id="titulo-da-baixa" className="titulo-estampado text-sm text-label-100">
          Tirar do acervo
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          <span className="text-label-100">{rom.title}</span> sai da sua biblioteca. Para tê-la de
          volta você precisa enviar o arquivo de novo.
        </p>

        <p className="leitura mt-4 break-all text-ink-700">
          {rom.fileName} · {emBytesLegiveis(rom.sizeBytes)}
        </p>

        {erro !== null && (
          <p role="alert" className="mt-4 border-l-2 border-alert pl-3 text-sm text-label-200">
            {erro}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelar}
            type="button"
            onClick={aoCancelar}
            className="border border-ink-700 px-3 py-1 text-xs text-label-200 outline-none hover:border-label-400 hover:text-label-100 focus-visible:border-label-400"
          >
            Manter
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={removendo}
            className="border border-alert px-3 py-1 text-xs text-label-100 outline-none hover:bg-alert/15 focus-visible:bg-alert/15 disabled:opacity-50"
          >
            {removendo ? 'Removendo…' : 'Remover'}
          </button>
        </div>
      </div>
    </div>
  );
}
