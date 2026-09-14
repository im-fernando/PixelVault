import type { CapaCandidata, IdentificarCapaResponse, SystemId } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';
import { sistemaPelaExtensao } from '../domain/verificacao-de-rom.js';

export interface DependenciasDaCapaDaRom {
  roms: Pick<UserRomRepository, 'buscarPorId' | 'definirCapa'>;
  buscar: (sistema: SystemId, titulo: string) => Promise<string | null>;
  candidatas: (sistema: SystemId, termo: string) => Promise<readonly CapaCandidata[]>;
}

async function sistemaAutorizado(
  deps: DependenciasDaCapaDaRom,
  habilidades: Habilidades,
  romId: string,
  acao: 'read' | 'update',
) {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError('ROM');
  autorizarOuNaoEncontrado(habilidades, acao, recurso('Library', { userId: rom.userId }), 'ROM');
  const sistema = sistemaPelaExtensao(rom.fileName);
  if (sistema === null) throw new NotFoundError('Sistema da ROM');
  return sistema;
}

export async function buscarCapasDaRom(
  deps: DependenciasDaCapaDaRom,
  habilidades: Habilidades,
  romId: string,
  termo: string,
) {
  const sistema = await sistemaAutorizado(deps, habilidades, romId, 'read');
  return { candidatas: [...(await deps.candidatas(sistema, termo))] };
}

export async function identificarCapaDaRom(
  deps: DependenciasDaCapaDaRom,
  habilidades: Habilidades,
  romId: string,
  titulo: string,
): Promise<IdentificarCapaResponse> {
  const sistema = await sistemaAutorizado(deps, habilidades, romId, 'update');
  const coverUrl = await deps.buscar(sistema, titulo);
  if (coverUrl === null) return { status: 'nao-encontrada' };
  await deps.roms.definirCapa(romId, coverUrl);
  return { status: 'encontrada', coverUrl };
}
