import type { SaveKey } from './save-key.js';

/**
 * Código estável de falha da persistência de save.
 *
 * Mesmo contrato dos erros do runtime de emulação e da API: a UI decide o que
 * fazer a partir do código, nunca da mensagem — mensagem é para humano e muda.
 */
export type SaveStorageErrorCode =
  /** Nenhum backend disponível: nem OPFS, nem IndexedDB. */
  | 'STORAGE_UNAVAILABLE'
  /** Acabou o espaço que o navegador concede a esta origem. */
  | 'QUOTA_EXCEEDED'
  /** Não existe save nessa chave. */
  | 'SAVE_NOT_FOUND'
  /** O save existe, mas não serve para esta máquina (outro core, outro console). */
  | 'SAVE_INCOMPATIBLE'
  /** O save existe e está ilegível: metadados quebrados, arquivo pela metade. */
  | 'SAVE_CORRUPTED'
  /** Este core não faz save state ou não tem SRAM. */
  | 'CAPABILITY_UNSUPPORTED'
  /** Falha de leitura ou escrita que não se encaixa nas anteriores. */
  | 'IO_FAILED';

/** Raiz de tudo que a persistência de save estoura. */
export class SaveStorageError extends Error {
  constructor(
    readonly code: SaveStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SaveStorageError';
  }
}

/**
 * Nem OPFS nem IndexedDB responderam.
 *
 * Acontece de verdade: aba anônima em alguns navegadores, storage bloqueado
 * por política do site, extensão de privacidade agressiva. Quem joga precisa
 * saber que **nada será salvo** antes de perder duas horas de progresso.
 */
export class SaveStorageUnavailableError extends SaveStorageError {
  constructor(readonly reason: string) {
    super(
      'STORAGE_UNAVAILABLE',
      `este navegador não deixou o PixelVault gravar nada localmente (${reason}). ` +
        'O progresso desta sessão não será salvo.',
    );
    this.name = 'SaveStorageUnavailableError';
  }
}

/**
 * Estourou a cota do navegador.
 *
 * Merece classe própria porque a saída é acionável e específica: apagar save
 * states antigos resolve, e "erro ao salvar" não diz isso a ninguém.
 */
export class SaveQuotaExceededError extends SaveStorageError {
  constructor(
    readonly key: SaveKey,
    options?: ErrorOptions,
  ) {
    super(
      'QUOTA_EXCEEDED',
      'o espaço local reservado ao PixelVault acabou. Apague save states antigos ' +
        'ou libere espaço no navegador e tente de novo.',
      options,
    );
    this.name = 'SaveQuotaExceededError';
  }
}

export class SaveNotFoundError extends SaveStorageError {
  constructor(readonly key: SaveKey) {
    super(
      'SAVE_NOT_FOUND',
      key.kind === 'sram' ? 'não há save deste jogo' : `o slot ${key.slot} está vazio`,
    );
    this.name = 'SaveNotFoundError';
  }
}

/**
 * O save existe, mas foi gravado por outra máquina.
 *
 * É o erro que a issue #22 exige: carregar um state de outra versão de core
 * não dá tela de erro, dá partida corrompida com sintoma aleatório meia hora
 * depois. A mensagem diz o que era esperado e o que foi encontrado, porque
 * quem lê precisa entender que não é bug do jogo.
 */
export class SaveIncompatibleError extends SaveStorageError {
  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super('SAVE_INCOMPATIBLE', `save incompatível: ${reason}`, options);
    this.name = 'SaveIncompatibleError';
  }
}

export class SaveCorruptedError extends SaveStorageError {
  constructor(
    readonly key: SaveKey,
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super('SAVE_CORRUPTED', `save ilegível: ${reason}`, options);
    this.name = 'SaveCorruptedError';
  }
}

export class SaveCapabilityUnsupportedError extends SaveStorageError {
  constructor(readonly capability: 'sram' | 'saveState') {
    super(
      'CAPABILITY_UNSUPPORTED',
      capability === 'sram'
        ? 'este core não tem SRAM: o jogo não grava na bateria do cartucho'
        : 'este core não faz save state',
    );
    this.name = 'SaveCapabilityUnsupportedError';
  }
}

export class SaveIoError extends SaveStorageError {
  constructor(
    readonly operation: string,
    options?: ErrorOptions,
  ) {
    super('IO_FAILED', `falha ao ${operation} o save local`, options);
    this.name = 'SaveIoError';
  }
}

export function isSaveStorageError(valor: unknown): valor is SaveStorageError {
  return valor instanceof SaveStorageError;
}

/**
 * Cota estourada é `DOMException` com `name` fixo, em OPFS e em IndexedDB.
 *
 * Reconhecer pelo `name` — e não pelo `instanceof`, nem pela mensagem — é o
 * que funciona nos dois backends e em navegador que ainda não expõe a classe
 * `QuotaExceededError` global.
 */
export function isQuotaExceeded(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'name' in erro &&
    (erro as { name?: unknown }).name === 'QuotaExceededError'
  );
}

/**
 * Traduz a falha crua do backend para o vocabulário da porta.
 *
 * Todo adaptador passa por aqui: sem isso, cota estourada no OPFS e cota
 * estourada no IndexedDB chegariam na UI como dois erros diferentes, e a tela
 * precisaria conhecer os dois backends para dizer a mesma frase.
 */
export function translateStorageFailure(
  operation: string,
  key: SaveKey,
  erro: unknown,
): SaveStorageError {
  if (isSaveStorageError(erro)) {
    return erro;
  }
  if (isQuotaExceeded(erro)) {
    return new SaveQuotaExceededError(key, { cause: erro });
  }
  return new SaveIoError(operation, { cause: erro });
}
