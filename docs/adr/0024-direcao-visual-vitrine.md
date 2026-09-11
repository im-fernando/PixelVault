# 0024. Levar o site inteiro à direção visual "Vitrine"

Data: 2026-09-10
Status: aceita — substitui parte da [0016](0016-identidade-visual-arquivo.md)

## Contexto

A ADR 0016 adotou a direção "Arquivo": tinta de arquivo como fundo, papel de
etiqueta como cor de objeto, e a **prateleira de lombadas** como o único lugar
em que se gastava ousadia. O resto da interface ficava quieto de propósito.

O modo console (#116, #132) nasceu depois e com outro briefing — "tela cheia,
como ligar um console de verdade" — e chegou a um resultado muito mais forte:
a arte do jogo como imagem principal, títulos grandes e apertados, luz de
fundo em órbita, botões-pílula com a tecla dentro, dicas de controle no
rodapé, quatro temas completos. Colocados lado a lado, o site parecia o
rascunho e o console o produto.

A distância não era de acabamento; era de **estrutura**. A lombada de 14px
com título na vertical escondia a capa até o hover, e a home abria com uma
frase e três números. O que o console provou é que, neste produto, a imagem
que importa é a do jogo — e que quase todo jogo do catálogo tem uma (a
premissa de 2016 de que "homebrew quase nunca tem arte de caixa" valia para
dois títulos de dez).

## Decisão

O site inteiro passa a falar a língua do tema **Aurora**, que é o padrão do
console. Chamamos a direção de **"Vitrine"**: o jogo em exposição, a
interface como luz em volta dele. Detalhamento em [docs/design.md](../design.md).

O que muda:

1. **A arte da capa é o objeto.** Cartuchos são molduras quadradas com a capa
   dentro (a mesma peça do console: imagem em `contain` sobre uma cópia
   desfocada; sem capa, gradiente por matiz do título com o nome do jogo).
   Trilhos no lugar de lombadas encostadas.
2. **A vitrine abre a home.** Não é herói com manchete vaga: é o favorito da
   biblioteca da pessoa (ou o primeiro cartucho dela, ou um homebrew do
   catálogo público para quem não tem conta), com o botão de jogar e a caixa
   em órbita — o mesmo palco do console.
3. **Escala tipográfica do console.** Archivo em peso 550 e tracking −0,05em
   para título de cena; sobrelinha espaçada em caixa alta para dizer de que se
   trata; corpo em 15px. O bitmap continua **só** para dado de máquina.
4. **Controles do console.** Pílula de papel sobre tinta para a ação que
   manda, vidro para a que acompanha, tecla dentro do botão quando há atalho.
5. **A mesma sala.** Marca, atmosfera e rodapé do site são os do console. Quem
   vai de um lado ao outro reconhece o produto.

O que **não** muda, e continua sendo regra:

- As quatro cores dos botões do Super Famicom marcam os quatro slots de save
  state, e nada mais.
- Contagem, hash, tamanho e número de acervo são lidos do conteúdo real.
- Neon synthwave, scanline por cima da interface e fonte de pixel em título
  continuam proibidos **no padrão**. O tema CRT do console é uma escolha da
  pessoa, não o padrão do produto.

Duas cores semânticas entram: `luz` (o acento do Aurora: seleção, foco, link)
e `bronze`/`prata`/`ouro` (o nível das conquistas, ADR 0010). Entram como
tokens novos, e não reaproveitando um slot — é a regra da 0016 aplicada.

## Consequências

A identidade deixa de depender de um objeto que a maioria das pessoas nunca
segurou (a lombada do cartucho) e passa a depender do que o produto de fato
tem: a arte dos jogos e o gesto de escolher um. Isso é mais fácil de manter
coerente entre site e console, porque é a mesma peça nos dois.

A camada `apps/web/src/ui/` nasce para guardar as peças compartilhadas (arte,
pílula, painel, diálogo, texto). Ela fica **abaixo** das features: `ui/` não
importa de `features/`, nunca.

Em troca:

- O site fica mais dependente de imagem. A arte substituta por matiz existe
  para isso, e é obrigatória onde houver capa opcional — nunca um `<img>`
  sozinho.
- Duas famílias tipográficas continuam no bundle, agora com o eixo de largura
  da Archivo (`wdth.css`), que a 0016 usava sem importar.
- `docs/design.md` foi reescrito. A 0016 continua valendo no que esta ADR não
  toca (voz, cor com significado, o bitmap como leitura de máquina).

## Alternativas descartadas

**Rebaixar o console ao nível do site.** Seria jogar fora o melhor trabalho do
projeto para manter uma tese estética que o conteúdo real não sustentava.

**Manter dois produtos visuais.** Um "site-arquivo" e um "console-vitrine"
convivendo. Foi o que existiu entre a #132 e esta ADR, e é exatamente o
problema: a pessoa sai do console e cai num lugar que parece outro produto.

**Trocar só os tokens.** Paleta e fonte novas com o esqueleto de lombadas
intacto. Pareceria diferente numa captura e continuaria sendo o mesmo site —
a armadilha central de "dar identidade" a um front.
