# Identidade visual — direção "Arquivo"

O PixelVault é um **acervo**, não um fliperama. A tensão que o desenho persegue
é entre o objeto nostálgico — o cartucho, o papel impresso da etiqueta — e a
catalogação fria: o índice, o hash, o número de acervo.

## A tese

Cartucho guarda o save numa pilha, e pilha acaba. O produto existe para ser o
oposto disso. É a frase que abre a home, e é de onde sai a voz da interface.

## O que evitamos, e por quê

A categoria "retrô" tem clichês tão previsíveis quanto os do design gerado por
IA. Estes são proibidos aqui, e a proibição é deliberada:

| Clichê                                | Por que não                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Neon synthwave, gradiente roxo→rosa   | Nostalgia de um passado que nunca existiu. Não é o SNES, é a ideia de 1985 vendida nos anos 2010 |
| Scanline de CRT por cima da interface | Simula o defeito do monitor antigo, não a memória. Além de atrapalhar leitura                    |
| Fonte de pixel em título              | O pixel aqui é **utilitário**, não enfeite (ver Tipografia)                                      |
| Moldura de arcade, "insert coin"      | PixelVault é biblioteca doméstica, não fliperama                                                 |
| Quase-preto com um acento vivo        | É um dos três padrões em que design gerado por IA se concentra — e era exatamente a paleta da M0 |

## Cor

O fundo é **tinta de arquivo**, um azul-ardósia profundo. Não é preto: preto puro
achata a etiqueta, e é o padrão que sai de graça.

O **papel de etiqueta** é creme impresso, e é cor de **objeto** — aparece em
superfície pequena (a etiqueta do cartucho), nunca como fundo de página.

```
--color-ink-950 … ink-500    tinta de arquivo (fundo, superfície, texto fraco)
--color-label-100 … 400      papel de etiqueta (só em objeto)
--color-slot-0 … slot-3      os quatro botões do Super Famicom
--color-alert                erro e atenção
```

### As quatro cores têm significado

`slot-0` a `slot-3` são o vermelho, amarelo, azul e verde dos botões do Super
Famicom, e marcam **os quatro slots de save state** — o mesmo console que a
pessoa está emulando. Não use nenhuma delas para outra coisa.

Erro tem cor própria (`alert`) justamente para não virar "o quinto slot".

O matiz da faixa de cada cartucho é derivado do título, de forma estável. Uma
prateleira toda da mesma cor não parece uma prateleira.

## Tipografia

| Papel   | Família                             | Uso                                                                                                 |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Display | **Archivo** (expandida, caixa alta) | Marca e títulos de seção. É onde a personalidade mora, e é usada com contenção                      |
| Corpo   | **Instrument Sans**                 | Todo o resto. Deliberadamente **não** Inter, que é a marca registrada de interface nunca estilizada |
| Leitura | **Silkscreen** (bitmap)             | **Só dado de máquina**: fps, hash, byte, versão de core, número de acervo                           |

A regra da bitmap inverte o clichê: o pixel deixa de ser decoração e vira uso
honesto — número que o computador produziu, não frase que uma pessoa escreveu.
**Nunca** em título, nunca em texto corrido.

Use as classes `.titulo-estampado` e `.leitura`.

## O elemento-assinatura: a prateleira

A biblioteca não é grade de capas. É uma **prateleira de cartuchos**, e passar o
mouse **puxa o cartucho para fora**.

A escolha resolve um problema real antes de ser estética: **homebrew quase nunca
tem arte de caixa**. O Super Sudoku tem `coverUrl` nulo. Uma grade de capas
ficaria cheia de retângulo vazio com "sem capa" escrito no meio — o design
quebraria no primeiro dado real.

Na etiqueta, a ausência de capa não é buraco: vira **tarja de catalogação**
hachurada no matiz do jogo, que é o que uma etiqueta de acervo teria mesmo. E
todo item recebe um **número de acervo** (`SNES-41014`), estável e derivado do
título, porque num arquivo todo item tem um.

Gastamos a ousadia aqui. O resto da interface fica quieto.

## Voz

Nomear pelo que a pessoa controla. Verbo que não muda no meio do caminho: o
botão "Salvar estado" produz "Estado salvo".

Erro não pede desculpa e não é vago — diz o que houve e como resolver. "O acervo
não respondeu", e embaixo o que fazer. Tela vazia é convite: "A prateleira está
vazia", com o comando que a enche.

## Piso de qualidade

Responsivo até o celular, foco de teclado visível, `prefers-reduced-motion`
respeitado (já no `styles.css`), contraste conferido. Não é identidade, é o
mínimo — mas a ausência denuncia tão rápido quanto fonte errada.
