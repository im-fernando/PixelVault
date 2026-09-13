import { configDefaults, defineConfig } from 'vitest/config';

/**
 * A suíte da API é a única do monorepo que fala com fornecedor externo de
 * verdade — PostgreSQL e storage S3 —, e é aqui que ela cuida disso sozinha:
 *
 * - `globalSetup` garante os dois fornecedores externos de pé antes do
 *   primeiro arquivo — o PostgreSQL migrado e o MinIO com bucket criado —,
 *   subindo os serviços do `docker-compose.yml` se não houver nada
 *   respondendo, e derrubando no fim só o que ele mesmo subiu. Ver
 *   docs/adr/0022.
 * - `setupFiles` carrega o `.env` da raiz antes de qualquer import do arquivo
 *   de teste, que é o preâmbulo que todo arquivo de integração repetia.
 * - `exclude` tira o `dist/`: depois de um `pnpm build` o teste compilado vira
 *   um segundo arquivo de teste, e a suíte roda duas vezes — Argon2 em dobro
 *   chega a estourar o tempo e reprovar sem haver defeito nenhum.
 */
export default defineConfig({
  test: {
    globalSetup: ['./test/suporte/postgres-de-teste.ts', './test/suporte/minio-de-teste.ts'],
    setupFiles: ['./test/suporte/ambiente.ts'],
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
