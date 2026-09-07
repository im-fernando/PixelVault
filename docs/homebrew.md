# Catálogo público de homebrew

O PixelVault é público e **não distribui ROM comercial**. O catálogo público
tem só homebrew, e homebrew só entra aqui com a permissão de redistribuição
escrita pelo autor — ver [ADR 0006](adr/0006-byor-mais-catalogo-de-metadados.md).

Este arquivo é a procedência de cada título: de onde veio, quem escreveu, sob
qual licença, e **qual frase do autor autoriza a redistribuição**. Se um dia
alguém reclamar, é este documento que responde.

## A regra

"É homebrew" não é licença. Um jogo gratuito não é automaticamente
redistribuível: quem faz download não ganha o direito de reservir o arquivo.
Para entrar no catálogo, o título precisa dos quatro:

1. Uma licença nomeada, ou uma autorização explícita do autor, publicada por
   ele num lugar estável (repositório, página do jogo, arquivo dentro do
   pacote).
2. Uma frase que cubra **redistribuir o binário**, e não só ler o código.
3. Cobertura dos **assets**, não só do código — a ROM leva arte e música
   dentro.
4. Um arquivo baixável e verificável por SHA-256.

Falhou em qualquer um: fica de fora, e o motivo é registrado na seção
[Descartados](#descartados). Dois títulos com licença sólida valem mais que
cinco duvidosos.

## Títulos no catálogo

| Título                     | Autor                       | Licença                                 | Redistribuição permitida por                         | SRAM                    | Arquivo                                                        | SHA-256                                                            |
| -------------------------- | --------------------------- | --------------------------------------- | ---------------------------------------------------- | ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Super Sudoku (v1.1)        | Raphaël Assenat (raphnet)   | MIT                                     | `LICENSE` no repositório do autor                    | não                     | `apps/web/public/roms/super-sudoku/super-sudoku.sfc`           | `2810aa0c4d95ed225c3ac0e669575d20285272b69ec0359a52bfb79628fb0939` |
| Castle Platformer (v1.04)  | Marcus Rowe (undisbeliever) | MIT (código) + CC0 (arte)               | `LICENSE` dentro do próprio zip de release do autor  | não                     | `apps/web/public/roms/castle-platformer/castle-platformer.sfc` | `8b325cbc3b5eee257b906f11b0a0bced2925c503293e9f242ca0492f23804df8` |
| EUC Thrills — SNES Edition | Edwin Rodmen (VibezZzCoder) | CC BY-NC-ND 4.0 + permissões adicionais | `PERMISSIONS.md`, escrito pelo detentor dos direitos | **sim — 2 KB, bateria** | `apps/web/public/roms/euc-thrills/euc-thrills.sfc`             | `076c9d236453ad1363bc5f6ca6f7dc3198fbeb9509982087ba85330c52de8503` |

---

### Super Sudoku

- **Autor:** Raphaël Assenat (raphnet), autor conhecido de hardware e firmware retro.
- **Fonte:** <https://github.com/raphnet/super_sudoku>
- **Arquivo exato:** `releases/super_sudoku_v1.1.sfc`, publicado pelo próprio autor no repositório.
- **Licença:** MIT — `LICENSE` na raiz do repositório, e o `README.md` termina com "## License / MIT".
- **Evidência da permissão:**

  > Permission is hereby granted, free of charge, to any person obtaining a copy
  > of this software and associated documentation files (the "Software"), to deal
  > in the Software without restriction, including without limitation the rights
  > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  > copies of the Software

  A licença fica na raiz do repositório, junto do binário — cobre o repositório
  inteiro, código e ROM compilada.

- **Obrigação que assumimos:** manter o aviso de copyright junto do arquivo.
  Por isso o `LICENSE` está copiado ao lado da ROM.
- **Cabeçalho SNES:** LoROM, 256 KB, tipo de cartucho `$00` (ROM only),
  `SRAMSIZE $00`. Não salva — confirmado tanto pelo `header.inc` do fonte
  quanto pela leitura do cabeçalho do arquivo.
- **Capa:** nenhuma. O projeto não publica arte no repositório, e as capturas
  de tela da página do autor não estão sob a MIT. Preferimos `coverUrl` nulo a
  hotlink ou a arte de licença desconhecida.

### Castle Platformer

- **Autor:** Marcus Rowe (undisbeliever).
- **Fonte:** <https://github.com/undisbeliever/castle_platformer>
- **Arquivo exato:** `Castle Platformer (v1.04).sfc`, de dentro do zip oficial
  de release <https://github.com/undisbeliever/castle_platformer/releases/download/v1.04/Castle.Platformer.v1.04.zip>.
  O zip é a distribuição do próprio autor e já vem com `LICENSE` e `README.md`
  dentro — a permissão viaja com o arquivo desde a origem.
- **Licença:** MIT para o código; a arte é de terceiros sob CC0.
- **Evidência da permissão:** o `README.md` que vem no zip diz:

  > The game is licensed under the MIT license.

  e, sobre a arte:

  > The demo uses graphics sourced from OpenGameArt.org and are licensed under CC0.

  Este é o ponto que costuma faltar em homebrew: a licença do código não cobre
  automaticamente a arte. Aqui cobre, porque a arte é CC0 (domínio público).
  As três fontes são nomeadas no README (Jetrel, qubodup, Jason-Em).

- **Obrigação que assumimos:** manter o aviso de copyright MIT junto do
  arquivo. `LICENSE` e `README.md` originais estão copiados ao lado da ROM.
- **Cabeçalho SNES:** LoROM (FastROM), 128 KB, tipo de cartucho `$00`,
  `SRAMSIZE $00`. Não salva.
- **Capa:** `screenshot.png` do repositório (256×224, captura do próprio jogo),
  coberta pela MIT/CC0 como o resto do projeto.

### EUC Thrills — SNES Edition

- **Autor:** Edwin Rodmen (VibezZzCoder).
- **Fonte:** <https://github.com/VibezZzCoder/EUC-Thrills-SNES-Edition>
- **Arquivo exato:** `euc-thrills-snes.sfc` da raiz do repositório. O
  repositório traz `SHA256SUMS.txt` publicado pelo autor, e o hash do arquivo
  que baixamos confere com o que ele declara — a integridade não depende de nós.
- **Licença:** CC BY-NC-ND 4.0 (`LICENSE`), com permissões adicionais
  concedidas pelo detentor dos direitos em `PERMISSIONS.md`.
- **Evidência da permissão:** `PERMISSIONS.md`, seção "Yes, definitely":

  > **Share the whole thing, free of charge.** Redistribute this package complete
  > and unmodified — including on homebrew sites, ROM preservation archives, and
  > homebrew collections — as long as it is free to the recipient and `LICENSE`,
  > `NOTICE.md`, `THIRD_PARTY_NOTICES.txt` and this file travel with it.

  e, sobre rodar em emulador:

  > **Get it running, however you have to.** Convert, patch, byte-swap, add or strip
  > a header, compress, rename, or repackage this ROM in whatever way your console,
  > flash cart, emulator, or frontend requires.

  É por causa da segunda frase que renomear o arquivo para `euc-thrills.sfc`
  não é problema.

- **Obrigações que assumimos — leia antes de mexer:**
  - `LICENSE`, `NOTICE.md`, `PERMISSIONS.md` e `THIRD_PARTY_NOTICES.txt` estão
    versionados ao lado da ROM e **não podem ser removidos**. É condição da
    permissão, não decoração.
  - **NonCommercial.** A permissão vale enquanto o jogo for gratuito para quem
    recebe. `PERMISSIONS.md` proíbe explicitamente gate por pagamento,
    assinatura, área de membros ou "ad-wall que um download gratuito evitaria".
    **Se o PixelVault um dia cobrar por acesso ou colocar o catálogo atrás de
    anúncio, este título sai do ar** — ou pede-se autorização ao autor.
    Os outros dois títulos (MIT/CC0) não têm essa restrição.
  - **NoDerivatives.** Não publicamos versão modificada. Servimos o arquivo
    byte a byte como veio; o SHA-256 no seed é o mecanismo que denuncia se
    isso mudar.
- **Cabeçalho SNES:** LoROM, 512 KB, tipo de cartucho **`$02` (ROM + RAM +
  bateria)**, `SRAMSIZE $01` = **2 KB de SRAM**. Checksum do cabeçalho válido.
- **Capa:** `media/1-city-plaza.png` do repositório (256×224, captura do
  próprio jogo). `PERMISSIONS.md`: "Screenshots and gameplay footage may be
  used freely, with credit."
- **Ressalva registrada pelo próprio autor:** o `NOTICE.md` declara que a arte
  da tela de título e da capa da caixa foi gerada por IA (Google Gemini 2.5
  Flash Image) e que "purely machine-generated images have uncertain copyright
  standing", concedendo apenas os direitos que ele de fato detém. Não é
  impedimento para redistribuir a ROM — o autor autoriza o que pode autorizar —
  mas fica registrado aqui porque é exatamente o tipo de coisa que ninguém
  lembra depois. A capa que usamos no catálogo é captura de gameplay, não a
  arte gerada.

## SRAM

A issue #24 pede pelo menos um título que **salve internamente**, porque é ele
que valida o ciclo de save da M1 e da M4. Homebrew de SNES com bateria é raro:
a maioria é demo de game jam, sem nada a salvar.

**Temos um: EUC Thrills — SNES Edition.**

E a prova não é a palavra do README. O cabeçalho do próprio arquivo declara:

| Campo            | Offset  | Valor | Significado             |
| ---------------- | ------- | ----- | ----------------------- |
| Tipo de cartucho | `$FFD6` | `$02` | ROM + RAM + **bateria** |
| Tamanho da SRAM  | `$FFD8` | `$01` | 2 KB (2048 bytes)       |

O README do jogo descreve o que isso é na prática:

> **HI** is a battery save, not a save state — the cartridge writes it itself,
> so your best run survives closing the app without you having to remember
> anything.

Ou seja: o recorde é escrito pelo jogo na SRAM, não é save state do emulador.
São coisas diferentes e o `saveKindSchema` do contrato já as separa (`sram` x
`state`) — este título exercita o caminho `sram`.

Os outros dois têm `SRAMSIZE $00` e tipo de cartucho `$00`: não salvam nada.

**Consequência para o planejamento:** hoje o ciclo de save da M1/M4 depende de
um único título, e é justamente o que tem a licença mais restrita da lista
(NonCommercial). Se ele precisar sair, ficamos sem homebrew que exercite SRAM
até achar outro — vale procurar um segundo candidato antes da M4.

## Descartados

Foram avaliados e ficaram de fora. Registrado para ninguém repetir a pesquisa:

| Título / fonte                                                                                   | Por que não entrou                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coleção `retrobrews/snes-games` (14 ROMs)                                                        | O README diz: "The ROMs listed here have been approved for free distribution **on this site/project only**. If you want to share it, please contact owner/developer." A permissão é daquele repositório, não nossa. Reservir de lá seria exatamente o que a nota proíbe.                                                  |
| Furry RPG! (`Ramsis-SNES/furryrpg`)                                                              | Tem SRAM (ExHiROM com save por bateria) e seria ótimo para a M1, mas **não tem arquivo de licença**. O README chama o projeto de "open-source freeware", o que é intenção, não concessão de direitos. Sem termos escritos, não dá para afirmar que podemos redistribuir.                                                  |
| Space Rescue Squad (`undisbeliever/space-rescue-squad`)                                          | Código sob zlib, mas o `LICENSE` diz dos assets: "All game resources in the `game/resources` directories are source available and only intended to be used in this game. They are not to be used in other projects." A ROM binária carrega esses assets e não há concessão explícita para redistribuí-la. Ambíguo — fora. |
| Uwol: Quest for Money (port SNES por alekmaul)                                                   | O jogo original dos Mojon Twins é CC BY-NC-SA 3.0, mas o port de SNES não declara licença própria em lugar nenhum, e a página de download citada pelo PDRoms (portabledev.com) está morta. Sem licença do port e sem fonte estável, não dá.                                                                               |
| Dottie Flowers (goldlocke)                                                                       | Divulgado como download gratuito e "não comercial", mas não encontramos declaração explícita de que terceiros podem **redistribuir** o arquivo. Gratuito ≠ redistribuível.                                                                                                                                                |
| Super Boss Gaiden                                                                                | Distribuído gratuitamente desde 2016, mas sem licença declarada pelos autores em fonte primária. Só espelhos de ROM, que não servem de procedência.                                                                                                                                                                       |
| Super Dodge Ball SNES (`rumbleminze/super-super-dodgeball`)                                      | Repositório MIT, mas é port de um jogo comercial da Technos. A licença do porte não vale nada sobre a obra original.                                                                                                                                                                                                      |
| CelesteSNES (`iProgramMC/CelesteSNES`)                                                           | Demake de obra comercial. Mesmo problema: MIT sobre código não licencia o conteúdo derivado.                                                                                                                                                                                                                              |
| Asteroids SNES (`undisbeliever/asteroids`)                                                       | MIT e limpo do lado do código, mas "Asteroids" é marca da Atari. Não vale o risco por um jogo a mais.                                                                                                                                                                                                                     |
| snestris (`MinusKelvin/snestris`)                                                                | GPLv3 e sem binário publicado — mas o problema real é outro: é um Tetris moderno. A licença resolve o copyright do autor e não resolve a marca da The Tetris Company.                                                                                                                                                     |
| Super Sokonyan (`Acedio/super-sokonyan`), Der Wanderknecht, Carrot Man, Garden Wars, bomberworld | `.sfc` gratuito no itch.io, nenhum arquivo de licença no repositório nem declaração na página. Freeware sem termos.                                                                                                                                                                                                       |
| `bbbradsmith/SNES_stuff` (rainwarrior)                                                           | ROMs commitadas direto no repositório, nenhuma licença em lugar nenhum.                                                                                                                                                                                                                                                   |
| Nova the Squirrel 2, Unarmed (`stuij/unarmed`)                                                   | Licenças excelentes (GPLv3, com a arte e a música cobertas explicitamente), mas nenhum dos dois publica binário — só fonte. Entrariam se alguém compilasse e documentasse o build.                                                                                                                                        |
| Super Action Square (`JordanMajd/SuperActionSquare`)                                             | MIT sólido, sem ressalva. Ficou fora só por conteúdo: é um quadrado que se move, sem ROM pronta publicada. Candidato válido se um dia precisarmos de mais um título irrepreensível.                                                                                                                                       |

### Avaliados, aprovados, e mesmo assim fora

Não são descartes por licença — são títulos que passariam. Ficam registrados
para quando o catálogo crescer:

- **Gothicvania** (<https://github.com/donth77/snes-homebrew>, MIT, ROM de 512 KB
  publicada em release) é o homebrew mais bem-acabado que encontramos: um
  action-platformer com parallax, três tipos de inimigo e trilha própria. A arte
  vem do pacote _GothicVania Cemetery_ do ansimuz, declarado **CC0** na página
  do itch.io — só que **o próprio autor escreveu nos comentários da mesma página
  "Use in commercial projects, don't redistribute or sell the assets"**, o que
  contradiz a CC0 que ele declarou. Redistribuir uma ROM com a arte adaptada
  provavelmente não é "redistribuir os assets", mas "provavelmente" não é o
  padrão desta lista. Como já temos um platformer cuja arte é CC0 sem
  contradição (Castle Platformer, do OpenGameArt), não vale gastar a ressalva.
- **Lote "1 Game A Month" do undisbeliever** — Asteroids, Memory Game, Cannons,
  Elevator Madness DX, Pipes, Bat Cave, Falling Tower, First Person Tetromones.
  Todos MIT, todos com zip de release contendo o `LICENSE` junto do `.sfc`, arte
  do próprio autor. É a fonte mais barata de expandir o catálogo com risco zero.
  (Exceção: _Asteroids_ carrega marca da Atari no nome.)

## Os arquivos ficam versionados no git

Os `.sfc` estão **commitados** em `apps/web/public/roms/`, e não baixados por
script. `apps/web/public/roms/` **não** está no `.gitignore` — ao contrário de
`apps/web/public/emulator/`, que continua ignorado.

O porquê:

- **Tamanho não é problema.** Os três somam 917 KB. Um script de download para
  economizar isso custaria mais em manutenção do que economiza em repositório.
- **Reprodutibilidade.** `pnpm db:seed` grava um SHA-256 e o arquivo servido
  precisa bater com ele. Com o arquivo no repositório, os dois andam juntos no
  mesmo commit. Com download por script, o dia em que um autor republicar o
  binário o hash quebra silenciosamente e o catálogo passa a apontar para um
  arquivo que não existe mais.
- **Fonte pode sumir.** Homebrew vive em repositório pessoal e página de autor.
  Depender de um `curl` na hora do setup é depender de infraestrutura de
  terceiros para o projeto subir.
- **A licença exige que os avisos viajem junto.** No caso do EUC Thrills isso é
  condição escrita da permissão. Versionar o pacote inteiro cumpre a obrigação
  por construção; um script que baixasse só o `.sfc` a violaria.
- **`git clone` e pronto.** Ninguém precisa de rede nem de passo extra para ter
  catálogo jogável.

Isso vale enquanto forem poucos arquivos pequenos. Se o catálogo público
crescer para dezenas de megabytes, a decisão deve ser revista — aí sim script
de download com verificação de hash, ou os arquivos no bucket.

## Para adicionar um título novo

1. Ache a **fonte primária**: o repositório ou a página do autor. Espelho de
   ROM não serve como procedência.
2. Leia a licença inteira. Confirme os quatro itens da seção [A regra](#a-regra)
   — em especial, se ela cobre os **assets** e não só o código.
3. Se a permissão for ambígua, **descarte** e registre em
   [Descartados](#descartados). Ambiguidade não se resolve com otimismo.
4. Baixe o arquivo e confira o cabeçalho SNES (`$FFD6` tipo de cartucho,
   `$FFD8` tamanho da SRAM) — é assim que se sabe se o jogo salva, sem depender
   do que o README promete.
5. Coloque em `apps/web/public/roms/<slug>/<slug>.sfc`, junto de **todos** os
   arquivos de licença e aviso que a permissão exigir.
6. Calcule o hash (`sha256sum`) e adicione a entrada em
   `packages/database/prisma/seed.ts`.
7. Documente aqui: fonte, autor, licença, **citação literal** da permissão,
   SRAM e hash.
