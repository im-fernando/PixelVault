import { erroNaImagemPs1, TAMANHO_MAXIMO_DE_PS1_EM_BYTES } from '@pixelvault/contracts';
import { RomInvalidError } from '../adapter/errors.js';
import { openRomStream, readRomHeader, type RomSource } from '../adapter/rom-source.js';
import type { ConteudoRetroarch } from '../retroarch/retroarch-emulator-adapter.js';

export async function lerRomDePs1(source: RomSource): Promise<ConteudoRetroarch> {
  const fileName =
    source.fileName ??
    (source.kind === 'url'
      ? new URL(source.url, 'https://local/').pathname.split('/').at(-1)
      : undefined);
  if (!fileName) throw new RomInvalidError('Informe o nome e formato do jogo de PS1.');
  const inicio = await readRomHeader(source, 65536);
  // Sem tamanho declarado, os offsets são limitados ao teto e reconferidos
  // com o tamanho real após a leitura. Formatos errados falham antes do CD.
  const erroInicial = erroNaImagemPs1(
    inicio,
    source.byteLength ?? TAMANHO_MAXIMO_DE_PS1_EM_BYTES,
    fileName,
  );
  if (erroInicial) throw new RomInvalidError(erroInicial);
  let tamanho = 0;
  let hash = 0x811c9dc5;
  const stream = (await openRomStream(source)).pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        tamanho += chunk.byteLength;
        if (tamanho > TAMANHO_MAXIMO_DE_PS1_EM_BYTES)
          throw new RomInvalidError('O disco excede 1 GiB.');
        for (const byte of chunk) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
        controller.enqueue(chunk);
      },
    }),
  );
  // Response produz um Blob sem concatenar pedaços em outro Uint8Array de CD.
  // O Nostalgist materializa esse Blob uma vez ao criar o arquivo do core.
  const bytes = await new Response(stream).blob();
  const erro = erroNaImagemPs1(inicio, bytes.size, fileName);
  if (erro) throw new RomInvalidError(erro);
  return { fileName, bytes, romId: `${tamanho.toString(16)}-${hash.toString(16)}` };
}
