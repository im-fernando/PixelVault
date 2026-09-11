# Log de decisões de arquitetura

Registro das decisões que restringem o futuro do projeto. Ver
[0001](0001-registrar-decisoes-de-arquitetura.md) para o porquê deste log
existir e [template.md](template.md) para escrever uma nova.

ADR é imutável: decisão que muda não é editada, é substituída por uma nova que
referencia a antiga.

| #                                                                 | Decisão                                                                        | Status |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| [0001](0001-registrar-decisoes-de-arquitetura.md)                 | Registrar decisões de arquitetura                                              | aceita |
| [0002](0002-usar-monolito-modular.md)                             | Usar monólito modular                                                          | aceita |
| [0003](0003-fronteiras-de-modulo-verificadas-por-lint.md)         | Verificar as fronteiras de módulo por lint no CI                               | aceita |
| [0004](0004-hexagonal-apenas-nas-integracoes-externas.md)         | Aplicar arquitetura hexagonal apenas nas integrações externas                  | aceita |
| [0005](0005-dominio-rico-somente-onde-ha-invariante.md)           | Usar domínio rico somente onde há invariante                                   | aceita |
| [0006](0006-byor-mais-catalogo-de-metadados.md)                   | Adotar BYOR com catálogo de metadados                                          | aceita |
| [0007](0007-fixar-typescript-6.md)                                | Fixar o TypeScript na 6.x                                                      | aceita |
| [0008](0008-viabilidade-de-conquistas-por-evento-de-jogo.md)      | Habilitar conquistas por evento de jogo lendo a memória do console             | aceita |
| [0009](0009-modelo-de-confianca-do-playtime.md)                   | Creditar playtime por heartbeat, medido pelo relógio do servidor               | aceita |
| [0010](0010-regras-de-gamificacao-da-m6.md)                       | Regras de gamificação da M6: as conquistas de plataforma                       | aceita |
| [0011](0011-escolha-do-runtime-de-emulacao.md)                    | Adotar Nostalgist.js como runtime de emulação                                  | aceita |
| [0012](0012-usar-cloudflare-r2-como-object-storage.md)            | Usar Cloudflare R2 como object storage de produção                             | aceita |
| [0013](0013-enderecar-roms-pelo-conteudo.md)                      | Endereçar ROMs pelo conteúdo, com contagem de referências                      | aceita |
| [0014](0014-verificar-a-rom-em-quarentena-antes-de-promover.md)   | Verificar a ROM em quarentena antes de promover o objeto                       | aceita |
| [0015](0015-audio-do-emulador-no-navegador.md)                    | Manter a saída de áudio do RetroArch e pendurar um barramento nela             | aceita |
| [0016](0016-identidade-visual-arquivo.md)                         | Adotar a direção visual "Arquivo"                                              | substituída em parte pela 0024 |
| [0017](0017-sessao-em-banco.md)                                   | Usar sessão em banco, com renovação deslizante e cookie assinado               | aceita |
| [0018](0018-autorizacao-com-casl-e-negacao-como-inexistente.md)   | Autorizar com CASL e negar recurso alheio como inexistente                     | aceita |
| [0019](0019-contador-de-tentativas-no-postgresql.md)              | Contar tentativas de autenticação no PostgreSQL                                | aceita |
| [0020](0020-adotar-o-progresso-local-so-por-escolha-explicita.md) | Adotar o progresso local só por escolha explícita, item a item                 | aceita |
| [0021](0021-usar-resend-para-email-transacional.md)               | Usar Resend para e-mail transacional                                           | aceita |
| [0022](0022-banco-de-teste-pelo-compose-do-projeto.md)            | Subir o banco de teste pelo compose do projeto, não por Testcontainers         | aceita |
| [0023](0023-input-do-teclado-por-configuracao-do-retroarch.md)    | Configurar o teclado do RetroArch no boot, em vez de simular estado por quadro | aceita |
| [0024](0024-direcao-visual-vitrine.md)                            | Levar o site inteiro à direção visual "Vitrine", a do modo console            | aceita |

O código de investigação que sustenta os números da 0008 e da 0011 está em
[docs/spikes](../spikes/README.md). Os da 0015 são reproduzíveis por
`pnpm --filter @pixelvault/emulator-runtime verify:audio`.

## Pendentes

Decisões já tomadas no planejamento, a serem escritas quando a milestone
correspondente começar:

(nenhuma pendente — 0009 e 0010 já escritas)
