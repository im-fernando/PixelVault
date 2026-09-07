/**
 * As partes do RetroArch em WebAssembly que o adapter precisa tocar, tipadas.
 *
 * Nada aqui é API pública do Nostalgist: são símbolos do build emscripten do
 * RetroArch, alcançados por `getEmscriptenModule()` e `getEmscriptenFS()`. A
 * ADR 0008 registra o risco — uma atualização de core pode removê-los sem
 * aviso. Por isso tudo é opcional no tipo e checado antes de usar: o adapter
 * degrada com erro claro em vez de estourar `undefined is not a function`.
 */

/** Onde o RetroArch guarda o que grava. */
export const DIRETORIO_DE_SAVES = '/home/web_user/retroarch/userdata/saves';
export const DIRETORIO_DE_SCREENSHOTS = '/home/web_user/retroarch/userdata/screenshots';

export interface EstatisticaDeArquivo {
  readonly size: number;
  readonly mode: number;
}

export interface SistemaDeArquivosDoEmscripten {
  readdir(caminho: string): string[];
  readFile(caminho: string, opcoes?: { encoding: 'binary' }): Uint8Array;
  unlink(caminho: string): void;
  stat(caminho: string): EstatisticaDeArquivo;
  isDir(mode: number): boolean;
}

export interface ModuloDoRetroArch {
  /** Enfileira um comando da interface de controle. Um por quadro. Ver ADR 0008. */
  EmscriptenSendCommand?: (comando: string) => void;
  EmscriptenReceiveCommandReply?: () => string | null;
  /** Descarrega a SRAM do core para o sistema de arquivos. */
  _cmd_savefiles?: () => void;
}

export interface LacoPrincipalDoEmscripten {
  /** Uma iteração do laço é um quadro emulado. É daqui que sai o FPS honesto. */
  readonly currentFrameNumber?: number;
}

export interface EmscriptenDoRetroArch {
  readonly Browser?: { readonly mainLoop?: LacoPrincipalDoEmscripten } | null;
}

/** Caminho do primeiro arquivo com o sufixo pedido, procurando um nível abaixo da raiz. */
export function procurarArquivo(
  fs: SistemaDeArquivosDoEmscripten,
  raiz: string,
  sufixo: string,
): string | null {
  for (const entrada of listar(fs, raiz)) {
    const caminho = `${raiz}/${entrada}`;
    if (caminho.endsWith(sufixo)) {
      return caminho;
    }
    if (ehDiretorio(fs, caminho)) {
      for (const filho of listar(fs, caminho)) {
        if (filho.endsWith(sufixo)) {
          return `${caminho}/${filho}`;
        }
      }
    }
  }
  return null;
}

export function listar(fs: SistemaDeArquivosDoEmscripten, caminho: string): string[] {
  try {
    return fs.readdir(caminho).filter((nome) => nome !== '.' && nome !== '..');
  } catch {
    // Diretório que ainda não existe é resposta válida: o RetroArch só o cria
    // quando tem algo para escrever nele.
    return [];
  }
}

export function lerArquivo(fs: SistemaDeArquivosDoEmscripten, caminho: string): Uint8Array | null {
  try {
    return fs.readFile(caminho, { encoding: 'binary' });
  } catch {
    return null;
  }
}

export function apagarArquivo(fs: SistemaDeArquivosDoEmscripten, caminho: string): void {
  try {
    fs.unlink(caminho);
  } catch {
    // Apagar o que não existe é o resultado desejado.
  }
}

function ehDiretorio(fs: SistemaDeArquivosDoEmscripten, caminho: string): boolean {
  try {
    return fs.isDir(fs.stat(caminho).mode);
  } catch {
    return false;
  }
}

export function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}
