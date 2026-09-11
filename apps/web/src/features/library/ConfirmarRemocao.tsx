import type { LibraryRom } from '@pixelvault/contracts';
import { BotaoPilula } from '../../ui/Botao.js';
import { Dialogo } from '../../ui/Dialogo.js';
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
 *
 * O foco começa em "Manter", e não em "Remover": num diálogo destrutivo, a
 * tecla de espaço apertada por reflexo não pode ser a que apaga.
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
  return (
    <Dialogo titulo="Tirar do acervo" sobrelinha="Termo de baixa" fechar={aoCancelar}>
      <p className="mt-4 text-[14px] leading-relaxed text-ink-500">
        <span className="text-label-100">{rom.title}</span> sai da sua biblioteca. Para tê-la de
        volta você precisa enviar o arquivo de novo.
      </p>

      <p className="leitura mt-4 break-all text-ink-700">
        {rom.fileName} · {emBytesLegiveis(rom.sizeBytes)}
      </p>

      {erro !== null && (
        <p role="alert" className="mt-4 text-[13px] text-alert">
          {erro}
        </p>
      )}

      <div className="mt-7 flex flex-wrap justify-end gap-3">
        <BotaoPilula variante="secundaria" pequena data-autofocus="" onClick={aoCancelar}>
          Manter
        </BotaoPilula>
        <BotaoPilula variante="perigo" pequena disabled={removendo} onClick={aoConfirmar}>
          {removendo ? 'Removendo…' : 'Remover'}
        </BotaoPilula>
      </div>
    </Dialogo>
  );
}
