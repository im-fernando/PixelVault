import globals from 'globals';
import { base } from '@pixelvault/config/eslint';

export default [
  ...base,
  {
    // O harness de verificação roda metade em Node (servidor, Playwright) e
    // metade dentro da página (`page.evaluate`). Os dois conjuntos de globais
    // convivem no mesmo arquivo por natureza.
    files: ['verificacao/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
