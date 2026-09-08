/**
 * Porta de object storage: a fronteira por onde ROM e save saem do processo.
 *
 * ## Por que é porta
 *
 * Pelo critério da [ADR 0004](../../../../../docs/adr/0004-hexagonal-apenas-nas-integracoes-externas.md):
 * existe mais de um adaptador plausível, e a escolha do fornecedor não está
 * fechada para sempre — MinIO no desenvolvimento, R2 na produção, e a
 * [ADR 0012](../../../../../docs/adr/0012-usar-cloudflare-r2-como-object-storage.md)
 * registra B2 e Garage como saídas reais caso a exposição a DMCA ou o preço
 * mudem de figura. Que hoje um único adaptador atenda MinIO e R2 (os dois
 * falam S3) é o resultado desejado, não o argumento contra: a porta é o que
 * permite trocar o fornecedor escrevendo outro adaptador, sem que caso de uso
 * nenhum saiba disso.
 *
 * ## Por que mora aqui, e não dentro de um módulo nem num pacote do workspace
 *
 * O primeiro consumidor é o módulo `library` (BYOR, M3), mas o segundo já está
 * marcado: o save na nuvem da M4, no módulo `progress`. Isso elimina a saída
 * mais óbvia — `library/infrastructure/` —, porque `progress` só enxergaria
 * essa porta pelo `index.ts` do `library` (ADR 0003), e a fachada de um módulo
 * de negócio passaria a reexportar encanamento técnico que não tem nada a ver
 * com biblioteca de jogos. Fronteira que se atravessa por conveniência é
 * fronteira que já dissolveu.
 *
 * A outra saída seria um pacote do workspace, no espírito do
 * `@pixelvault/database`. Foi descartada porque o que justifica aquele pacote
 * não se repete aqui: ele tem toolchain própria (`prisma generate`), artefato
 * gerado e migrations — é uma unidade de build de verdade. Isto aqui são
 * duzentas linhas de TypeScript consumidas por exatamente uma aplicação. O
 * pacote custaria `package.json`, `tsconfig`, config de ESLint, mais um alvo
 * no Turbo e mais um nó no grafo, em troca de nada que este diretório não dê.
 * É o mesmo raciocínio da [ADR 0002](../../../../../docs/adr/0002-usar-monolito-modular.md),
 * que recusa pacote por módulo: pacote se paga quando há build próprio ou mais
 * de uma aplicação consumindo.
 *
 * Sobra `apps/api/src/infrastructure/`, que já é exatamente isto — encanamento
 * da aplicação, abaixo de todos os módulos e sem dono. `errors.ts` mora lá e é
 * importado por `application/` e `http/` de mais de um módulo hoje, e o
 * `.dependency-cruiser.cjs` já trata o diretório como infraestrutura legítima.
 * Duas regras de fronteira novas sustentam a decisão em vez de deixá-la como
 * promessa de comentário: infraestrutura compartilhada não importa módulo (a
 * dependência aponta para baixo) e o `@aws-sdk` só existe dentro desta pasta
 * (ninguém contorna a porta).
 *
 * Não virou ADR porque não restringe o futuro: mover a pasta para um pacote é
 * um `git mv` e um `package.json` no dia em que uma segunda aplicação precisar
 * de storage — que é o gatilho para reabrir a discussão. O log guarda as
 * decisões que custam caro para desfazer.
 *
 * ## O que a porta não faz
 *
 * Listar o bucket, e escrever nele sem ser por URL assinada. Não há caso de
 * uso: quem escreve é o cliente, pela URL que a API assina, e a limpeza de
 * quarentena abandonada apaga por chave conhecida, nunca por varredura. Porta
 * cresce com consumidor; método sem chamador é código morto com aparência de
 * arquitetura.
 */

/**
 * Validade padrão das URLs assinadas: cinco minutos.
 *
 * O que a validade precisa cobrir não é a transferência. Tanto o S3 quanto o
 * MinIO conferem a expiração quando a requisição **chega**, e não enquanto o
 * corpo trafega — uma ROM de trezentos megabytes que começou a subir no quarto
 * minuto termina de subir em paz. O que a janela cobre é o intervalo entre a
 * API assinar e o navegador disparar a requisição, mais alguma retentativa.
 * Cinco minutos é folgado para isso até em rede ruim e com o usuário
 * confirmando um diálogo de arquivo no meio.
 *
 * Do outro lado, a janela é o tempo em que uma URL vazada vale alguma coisa —
 * e ela vaza por caminhos banais: histórico do navegador, log de proxy, print
 * de tela, `Referer`. TTL generoso transforma presigned em link público, que é
 * exatamente o que a [ADR 0013](../../../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md)
 * proíbe ao decidir que o bucket é privado e que a autorização vem do banco.
 * Cinco minutos sobra para o caso normal e não sobra para quem achou a URL
 * depois.
 *
 * É constante, e não variável de ambiente: TTL de credencial não é coisa que
 * se afrouxe em produção por decisão de operação, sem passar por revisão de
 * código.
 */
export const VALIDADE_PADRAO_EM_SEGUNDOS = 300;

/**
 * Teto de validade que qualquer chamada pode pedir: uma hora.
 *
 * Existe para que "TTL curto" seja regra verificável, e não hábito. Sem teto, o
 * parâmetro por chamada seria o caminho silencioso para uma URL de sete dias (o
 * máximo que a SigV4 aceita) nascer numa rota qualquer e virar link permanente
 * de ROM.
 */
export const VALIDADE_MAXIMA_EM_SEGUNDOS = 3_600;

/** O que toda URL assinada aceita ajustar. */
export interface OpcoesDeUrlAssinada {
  /**
   * Sobrescreve a {@link VALIDADE_PADRAO_EM_SEGUNDOS}, respeitando o teto de
   * {@link VALIDADE_MAXIMA_EM_SEGUNDOS}. Serve a fluxo que justifique janela
   * diferente — e ao teste de integração, que prova a expiração de verdade
   * assinando com um segundo, em vez de afirmá-la em comentário.
   */
  validadeEmSegundos?: number;
}

export interface OpcoesDeEnvioAssinado extends OpcoesDeUrlAssinada {
  /**
   * Entra na assinatura como `Content-Type`. O cliente passa a ser obrigado a
   * mandar exatamente este valor: qualquer outro derruba a assinatura.
   */
  tipoDeConteudo?: string;
  /**
   * Entra na assinatura como `Content-Length`, prendendo o envio a um tamanho
   * exato. É o que impede uma URL pedida para um arquivo de dois megabytes de
   * ser usada para despejar dois gigabytes na quarentena — a cota da #76
   * depende de o tamanho ser decidido por quem assina, não por quem envia.
   */
  tamanhoEmBytes?: number;
}

/**
 * As seis operações de que o BYOR inteiro (#71 a #77) precisa.
 *
 * A chave é o caminho do objeto dentro do bucket — `roms/<sha256>` ou
 * `quarentena/<userId>/<uuid>`, conforme as ADRs 0013 e 0014. A porta não
 * conhece esse vocabulário: ela move bytes, e quem decide onde eles moram é o
 * módulo dono do fluxo.
 */
export interface ArmazenamentoDeObjetos {
  /**
   * URL para o cliente escrever o objeto direto no storage, sem passar pela
   * API. É o que permite a um Fastify modesto lidar com ROM grande (ADR 0014).
   */
  assinarEnvio(chave: string, opcoes?: OpcoesDeEnvioAssinado): Promise<string>;

  /** URL para o cliente ler o objeto direto do storage. */
  assinarLeitura(chave: string, opcoes?: OpcoesDeUrlAssinada): Promise<string>;

  /**
   * Lê o objeto **no servidor**, inteiro, na memória do processo.
   *
   * É o que a verificação da quarentena (ADR 0014) precisa: sem ler os bytes
   * não há SHA-256 calculado por nós, e sem ele o caminho definitivo passaria
   * a depender do que o cliente disse que enviou.
   *
   * Devolve um `Uint8Array` de uma vez, e não um stream, por três razões que
   * se somam:
   *
   * 1. **O teto é conhecido e pequeno.** O maior objeto possível tem 64 MiB
   *    (`TAMANHO_MAXIMO_DE_ROM_EM_BYTES`), e não por confiança: o tamanho
   *    entra na assinatura do PUT como `Content-Length`, então o storage
   *    recusa quem tenta escrever mais do que foi negociado.
   * 2. **A verificação precisa do arquivo inteiro de qualquer jeito** — são
   *    dois hashes (com e sem cabeçalho de copiador) sobre os mesmos bytes,
   *    mais a inspeção do começo do arquivo. Por stream, isso seria duas
   *    passagens ou um buffer montado à mão, e o ganho de memória evaporaria
   *    justamente onde ele importaria.
   * 3. **O domínio fica puro e síncrono.** As funções de verificação recebem
   *    `Uint8Array` e são testáveis sem storage, sem I/O e sem async.
   *
   * O que isso custa é pico de memória proporcional a uploads verificando ao
   * mesmo tempo. Se um dia isso apertar, o caminho já está claro — hash
   * incremental sobre o stream, com um prefixo bufferizado para o cabeçalho —
   * e ele muda este adaptador, não quem chama.
   *
   * Objeto ausente é erro, e não `null`: quem chama pergunta antes com
   * {@link ArmazenamentoDeObjetos.existe}, e a ausência depois disso é falha
   * de verdade, não caso normal.
   */
  ler(chave: string): Promise<Uint8Array>;

  /**
   * Copia um objeto dentro do bucket, servidor a servidor: nenhum byte passa
   * por aqui. É a promoção da quarentena para o caminho definitivo.
   *
   * Não há `mover`, e a ausência é deliberada: nem S3 nem R2 têm operação
   * atômica de mover, então `mover` seria `copiar` mais `apagar` com cara de
   * primitiva — e esconderia justamente a falha que interessa, a de ter
   * copiado e não ter conseguido apagar. Quem promove compõe as duas e decide
   * o que fazer no meio.
   */
  copiar(origem: string, destino: string): Promise<void>;

  /**
   * Apaga o objeto. É idempotente: apagar o que não existe não é erro, nem no
   * S3 nem no R2 — a limpeza de quarentena abandonada roda sem precisar saber
   * se o arquivo chegou a existir.
   */
  apagar(chave: string): Promise<void>;

  /**
   * Se o objeto existe. O endereçamento por conteúdo da ADR 0013 pergunta isto
   * antes de promover: `roms/<sha256>` que já existe dispensa a transferência.
   */
  existe(chave: string): Promise<boolean>;
}
