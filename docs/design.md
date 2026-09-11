# Identidade visual — direção "Vitrine"

O PixelVault é uma **vitrine de jogos**: a arte do jogo é a imagem, e a
interface é a luz em volta dela. A direção nasceu no modo console
([ADR 0024](adr/0024-direcao-visual-vitrine.md)) e vale para o produto inteiro
— site e console são a mesma sala, com a mesma marca, a mesma luz e os mesmos
controles.

## A tese

Cartucho guarda o save numa pilha, e pilha acaba. O produto existe para ser o
oposto disso. A frase fecha o rodapé e assina a escultura da vitrine, e é de
onde sai a voz da interface.

## O que evitamos, e por quê

| Clichê                                | Por que não                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Neon synthwave, gradiente roxo→rosa   | Nostalgia de um passado que nunca existiu. Não é o SNES, é a ideia de 1985 vendida nos anos 2010 |
| Scanline de CRT por cima da interface | Simula o defeito do monitor antigo, não a memória. Além de atrapalhar leitura                    |
| Fonte de pixel em título              | O pixel aqui é **utilitário**, não enfeite (ver Tipografia)                                      |
| Moldura de arcade, "insert coin"      | PixelVault é biblioteca doméstica, não fliperama                                                 |
| Quase-preto com um acento vivo        | Um dos três padrões em que design gerado por IA se concentra                                     |
| Grade de cartões todos iguais         | Ninguém decidiu nada. A vitrine tem hierarquia: um jogo em exposição, o resto no trilho          |

O tema **CRT** do modo console tem scanline e bitmap em título de propósito:
é uma escolha da pessoa, não o padrão. O padrão — o tema Aurora, e o site
inteiro — não pode ser clichê.

## Cor

O fundo é **tinta de arquivo**, um azul-marinho profundo com luz em órbita. Não
é preto: preto puro achata a arte da capa, e é o padrão que sai de graça.

```
--color-ink-950 … ink-500    tinta (fundo, superfície, texto fraco)
--color-label-100 … 400      papel (texto principal; o botão que manda)
--color-luz                  luz (seleção, foco, link, o ponto que pulsa)
--color-slot-0 … slot-3      os quatro botões do Super Famicom
--color-bronze/prata/ouro    nível de conquista, e o pódio do ranking
--color-alert                erro e atenção
```

### Cor com significado, nunca decoração

- `slot-0` a `slot-3` são o vermelho, amarelo, azul e verde dos botões do
  Super Famicom, e marcam **os quatro slots de save state** — o mesmo console
  que a pessoa está emulando. Não use nenhuma delas para outra coisa.
- `bronze`, `prata` e `ouro` são o **nível** (ADR 0010): a medalha da
  conquista e os três primeiros do ranking. Nada mais.
- `luz` é luz, não tinta: contorno de seleção, anel de foco, link, o ponto ao
  lado da sobrelinha. Nunca fundo de botão principal — esse é papel.
- Erro tem cor própria (`alert`) justamente para não virar "o quinto slot".
- Precisar de mais uma cor semântica significa acrescentar um token, não
  reaproveitar um destes.

O matiz da arte substituta é derivado do título, de forma estável. Um trilho
todo da mesma cor não parece um trilho.

## Tipografia

| Papel     | Família                             | Uso                                                                                                       |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Cena      | **Archivo** (peso 550, −0,05em)     | Título de cena: o nome do jogo em exposição, o título da página. Classe `.titulo-cena`. É onde a personalidade mora |
| Rótulo    | **Archivo** (larga, caixa alta)     | Nome de seção e marca. Classe `.titulo-estampado`, e o `h2` de `.pv-secao`                                 |
| Sobrelinha| **Instrument Sans** (10px, 0,2em)   | A linha espaçada que diz de que se trata a cena. Classe `.sobrelinha`                                     |
| Corpo     | **Instrument Sans** (15px)          | Todo o resto. Deliberadamente **não** Inter                                                               |
| Leitura   | **Silkscreen** (bitmap)             | **Só dado de máquina**: fps, hash, byte, versão de core, data, número de acervo. Classe `.leitura`          |

A regra da bitmap inverte o clichê: o pixel deixa de ser decoração e vira uso
honesto — número que o computador produziu, não frase que uma pessoa escreveu.
**Nunca** em título, nunca em texto corrido.

## O elemento-assinatura: a vitrine

A home abre com **o jogo em exposição**, não com herói de manchete vaga:

- à esquerda, a sobrelinha (console · procedência), o título em `.titulo-cena`,
  a linha de detalhes e as ações — a pílula "Jogar" com a tecla dentro e a
  pílula de vidro "Abrir no console";
- à direita, a **caixa em órbita**: a arte do jogo numa caixa inclinada em
  perspectiva, com dois anéis de luz girando devagar. É a mesma escultura do
  tema Aurora do console;
- embaixo, as contagens do acervo, lidas do conteúdo real.

O que fica em exposição segue uma ordem honesta: o favorito da biblioteca da
pessoa, senão o primeiro cartucho dela, senão um homebrew do catálogo público.
Sem nada disso, a vitrine abre com a tese.

A mesma escultura reaparece na ficha de autenticação (três caixas em leque) e
o mesmo palco na tela de jogo. É assim que o site e o console se reconhecem.

## O cartucho e o trilho

A biblioteca é um **trilho de cartuchos**: molduras quadradas de canto largo
com a arte do jogo dentro, título e nota embaixo, respiro igual ao do console.
O trilho sangra até a borda da tela e continua além dela, porque acervo não
termina onde a janela termina.

A arte tem duas camadas quando há capa — a imagem em `contain`, para nunca
cortar a caixa, sobre uma cópia desfocada preenchendo a moldura. **Sem capa,
não é buraco**: a arte substituta é um gradiente no matiz do título com o nome
do jogo e o console. Todo lugar que mostra capa opcional usa `Arte`
(`apps/web/src/ui/Arte.tsx`), nunca um `<img>` sozinho.

Passar o mouse ou dar foco **acende o cartucho** (contorno de luz, leve
elevação) e revela a barra de ações sobre a arte. O carimbo no canto diz a
procedência ("Homebrew", "Local", "Precisa da sua ROM"); a marca de favorito
fica visível de longe.

Cada seção abre com a **etiqueta da gaveta**: nome, contagem e tamanho, e a
nota à direita. Não é enfeite: é como se consulta um acervo.

## Controles

- **Pílula** (`.pv-pilula`): papel sobre tinta para a ação que manda, vidro
  (`--secundaria`) para a que acompanha, alerta (`--perigo`) para a que apaga.
  Quando há atalho de teclado, a tecla vai **dentro** do botão ("Jogar ↵").
- **Tecla** (`.pv-tecla`) e **dica** (`.pv-dica`): o rodapé do console, em
  qualquer lugar em que o teclado ou o controle façam algo.
- **Chip** (`.pv-chip`): metadado curto — console, tamanho, estado.
- **Campo** (`.pv-campo`): canto de 12px, vidro, foco em luz.
- **Painel** (`.pv-painel`): superfície de vidro, canto de 20px. Diálogo, 24px.

As peças moram em `apps/web/src/ui/` e ficam **abaixo** das features: `ui/`
não importa de `features/`.

## Voz

Nomear pelo que a pessoa controla. Verbo que não muda no meio do caminho: o
botão "Salvar estado" produz "Estado salvo".

Erro não pede desculpa e não é vago — diz o que houve e como resolver. "O acervo
não respondeu", e embaixo o que fazer. Tela vazia é convite: "Sua estante está
vazia.", com o comando que a enche.

Numeração só onde a ordem importa de verdade: o protocolo de entrada de uma
ROM é `01 → 02 → 03` porque é uma sequência. Uma lista de conquistas não é.

## Piso de qualidade

Responsivo até o celular (as grades viram uma coluna; a escultura vai para
cima do título), foco de teclado visível em tudo que se clica,
`prefers-reduced-motion` respeitado (já no `styles.css`), contraste conferido.
Não é identidade, é o mínimo — mas a ausência denuncia tão rápido quanto fonte
errada.
