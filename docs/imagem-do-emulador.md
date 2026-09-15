# Imagem do emulador

## Opções no player

O seletor **Imagem** fica no HUD e em **Imagem e som** no menu do modo console.
A escolha é guardada neste navegador por sistema e muda sem reiniciar o jogo.

- **Nítido** (padrão): preserva bordas marcadas, com `video_smooth = false`
  no RetroArch e `image-rendering: pixelated` no navegador.
- **Suave**: aplica interpolação do navegador e um desfoque leve de 0,6 pixel
  de CSS ao quadro já renderizado. Não reconstrói detalhes nem usa xBRZ.
- **TV de tubo**: acrescenta linhas horizontais e escurecimento nas bordas ao
  modo suave. É um efeito CSS leve, não uma simulação física de CRT.

O pós-processamento não aparece nas miniaturas dos saves, capturadas pelo core.
A escala inteira usa altura base de 224 para SNES e 240 para PS1. Em áreas
menores que 1×, a imagem é reduzida para caber. São alturas base: modos PAL,
hi-res e entrelaçados podem exigir outras alturas. A escala trabalha em pixels
CSS; a proporção 4:3 e o zoom do navegador também afetam a uniformidade final.

## Avaliação do PS1 — 14/09/2026

O projeto distribui PCSX ReARMed no build Emscripten 1.22.2.
A inspeção das strings do WASM instalado encontra `pcsx_rearmed_dithering`,
mas não encontra `pcsx_rearmed_neon_enhancement_enable` nem PGXP:

```sh
strings apps/web/public/emulator/pcsx_rearmed/1.22.2/pcsx_rearmed_libretro.wasm | rg 'pcsx_rearmed_.*(enhance|dither)|PGXP'
```

A [documentação do PCSX ReARMed](https://docs.libretro.com/library/pcsx_rearmed/)
associa a resolução dobrada ao renderizador NEON. Não basta acrescentar essa
chave à configuração do nosso WASM. Desativar dithering muda o padrão de cores,
mas não aumenta a definição dos polígonos.

O [DuckStation](https://github.com/stenzek/duckstation#features) oferece aumento
de resolução interna, filtros de textura e correções PGXP. Para aproximar o
PS1 desse resultado, é necessário avaliar um renderizador/core para navegador
que implemente esses recursos, medindo desempenho WebGL/WebGPU, suporte a
celulares e compatibilidade. Esta mudança não portou nem mediu outro core.
Uma migração também precisa preservar memory cards e tratar save states, que
não são portáveis entre cores (ADR 0011).

Os filtros entregues melhoram a apresentação; não equivalem à renderização
3D em alta resolução do DuckStation.
