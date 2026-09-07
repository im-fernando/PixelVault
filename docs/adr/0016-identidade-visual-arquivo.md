# 0016. Adotar a direção visual "Arquivo"

Data: 2026-09-07
Status: aceita

## Contexto

A paleta que a M0 entregou era **azul quase-preto com um único acento
vermelhão**. Isso não foi escolha: é literalmente um dos três agrupamentos em
que o design gerado por IA se concentra hoje, e saiu por omissão.

Os outros dois, para registro: creme quente com serifada de alto contraste e
acento terracota; e layout de jornal com fios capilares e raio zero.

A causa é conhecida — o modelo prevê o design mais provável, que é a média de
tudo que viu, e todo mundo gera a partir das mesmas peças. Sem restrição e sem
direção, o resultado converge.

A categoria "retrô" tem os próprios clichês, igualmente previsíveis: neon
synthwave, scanline de CRT falsa e fonte de pixel em título — nostalgia de um
passado que nunca existiu.

## Decisão

Direção **"Arquivo"**: o PixelVault é um acervo, não um fliperama. Tinta de
arquivo como fundo, papel de etiqueta como cor de objeto, Archivo expandida no
display, Instrument Sans no corpo, e bitmap **só** para leitura de máquina.

Detalhamento em [docs/design.md](../design.md).

Duas regras que carregam a decisão:

1. **As quatro cores dos botões do Super Famicom marcam os quatro slots de save
   state.** Cor com significado, não decoração. Nenhuma delas serve para outra
   coisa.
2. **O elemento-assinatura é a prateleira de cartuchos vista de lado**, e ela
   nasce de uma limitação real: homebrew quase nunca tem arte de caixa. Uma
   grade de capas quebraria com o nosso conteúdo de verdade.

## Consequências

A identidade passa a depender de um objeto concreto do mundo do assunto — o
cartucho — em vez de um estilo emprestado. Isso resiste melhor: o cartucho
continua existindo quando a moda de neon passar.

A limitação de conteúdo vira vantagem. O que num design convencional seria
buraco ("sem capa") aqui é tarja de catalogação, que é o que uma etiqueta de
acervo teria mesmo.

Em troca, aceitamos restrições que precisam ser respeitadas para a identidade
não se dissolver:

- Bitmap **nunca** em título ou texto corrido. É a diferença entre uso honesto
  e o clichê que estamos evitando.
- As quatro cores de slot ficam reservadas. Precisar de mais uma cor semântica
  significa acrescentar um token, não reaproveitar um slot.
- A prateleira é o único lugar onde gastamos ousadia. Todo o resto fica quieto.

Também aceitamos duas famílias tipográficas a mais no bundle. São
auto-hospedadas por `@fontsource`, sem CDN de terceiro em tempo de execução.

## Alternativas descartadas

**"Hardware"** — o design industrial do próprio console: plástico cinza-lavanda,
ranhuras, roxo dos botões. Mais frio e mais focado no objeto-console.
Descartada pelo risco de execução: plástico mal feito vira esqueumorfismo de
2010, e o custo de acertar é alto.

**"Noturno"** — o quarto à noite, com a tela como única fonte de luz, e a
interface iluminada pelas cores do quadro atual. Ideia forte e genuinamente
fora dos padrões. Descartada porque só brilha quando há jogo na tela: a home,
que é a primeira coisa que alguém vê, ficaria sem a identidade inteira.

**Manter a paleta da M0.** Funcionava, e é justamente o problema: funcionava do
mesmo jeito que funciona em qualquer outro produto gerado sem direção.
