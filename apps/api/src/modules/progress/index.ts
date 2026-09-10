/**
 * Superfície pública do módulo `progress`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar progress/domain, progress/application ou progress/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * A M4 (save na nuvem) começa aqui: a tabela `user_saves` e a porta de
 * leitura (`domain/user-save-repository.ts`, `infrastructure/prisma-user-save-repository.ts`)
 * já existem (#88), mas ninguém fora do módulo precisa delas ainda — não há
 * rota. `export {}` some quando a #89 (upload) e a #90 (download) trouxerem
 * a primeira coisa que outro código precisa importar daqui.
 */
export {};
