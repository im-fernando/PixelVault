import { base } from '@pixelvault/config/eslint';

export default [
  ...base,
  {
    // public/ guarda o core WASM baixado e as ROMs de homebrew — código de
    // terceiros e binário, não fonte do projeto.
    ignores: ['public/**'],
  },
];
