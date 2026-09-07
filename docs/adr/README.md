# Log de decisões de arquitetura

Registro das decisões que restringem o futuro do projeto. Ver
[0001](0001-registrar-decisoes-de-arquitetura.md) para o porquê deste log
existir e [template.md](template.md) para escrever uma nova.

ADR é imutável: decisão que muda não é editada, é substituída por uma nova que
referencia a antiga.

| #                                                            | Decisão                                                            | Status |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ------ |
| [0001](0001-registrar-decisoes-de-arquitetura.md)            | Registrar decisões de arquitetura                                  | aceita |
| [0002](0002-usar-monolito-modular.md)                        | Usar monólito modular                                              | aceita |
| [0003](0003-fronteiras-de-modulo-verificadas-por-lint.md)    | Verificar as fronteiras de módulo por lint no CI                   | aceita |
| [0004](0004-hexagonal-apenas-nas-integracoes-externas.md)    | Aplicar arquitetura hexagonal apenas nas integrações externas      | aceita |
| [0005](0005-dominio-rico-somente-onde-ha-invariante.md)      | Usar domínio rico somente onde há invariante                       | aceita |
| [0006](0006-byor-mais-catalogo-de-metadados.md)              | Adotar BYOR com catálogo de metadados                              | aceita |
| [0007](0007-fixar-typescript-6.md)                           | Fixar o TypeScript na 6.x                                          | aceita |
| [0008](0008-viabilidade-de-conquistas-por-evento-de-jogo.md) | Habilitar conquistas por evento de jogo lendo a memória do console | aceita |
| [0011](0011-escolha-do-runtime-de-emulacao.md)               | Adotar Nostalgist.js como runtime de emulação                      | aceita |

O código de investigação que sustenta os números da 0008 e da 0011 está em
[docs/spikes](../spikes/README.md).

## Pendentes

Decisões já tomadas no planejamento, a serem escritas quando a milestone
correspondente começar:

- **0009** — modelo de confiança do playtime e do ranking (M6)
- **0010** — regras de gamificação (M6)
