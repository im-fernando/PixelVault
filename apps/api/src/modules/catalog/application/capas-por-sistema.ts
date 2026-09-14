import type { SystemId } from '@pixelvault/contracts';
import { criarBuscaDeCapa } from '../infrastructure/criar-busca-de-capa.js';
import { criarBuscaDeCapaPorNomeNoLibretro } from '../infrastructure/capa-libretro-thumbnails-por-nome.js';

const busca = criarBuscaDeCapa();
const candidatas = criarBuscaDeCapaPorNomeNoLibretro();

/** Busca arte pelo sistema, sem criar ou alterar reconhecimento de catálogo. */
export function procurarCapaPorSistema(systemId: SystemId, title: string) {
  return busca.buscar({ systemId, title });
}
export function procurarCapasCandidatasPorSistema(systemId: SystemId, termo: string) {
  return candidatas(systemId, termo);
}
