# PlayStation 1

O PixelVault usa PCSX ReARMed (`pcsx_rearmed@1.22.2`) sobre Nostalgist 0.22.0.
Os assets são servidos pelo próprio site e conferidos por SHA-256 no setup.

## Jogar

Envie o jogo pela página **Enviar ROM**. A primeira versão aceita:

- **CHD v5 independente**, de um único CD, criado a partir das faixas BIN/CUE completas.
- **ISO** com setores de 2048 bytes e identificação PlayStation. Esse formato não preserva faixas de áudio de um CD multifaixa; nesses jogos, use CHD.
- **PS-X EXE**, para homebrew. Executáveis de Windows não são aceitos.

O limite é **1 GiB por arquivo**, dentro da cota existente de **4 GiB por conta**.
Os limites menores de cada sistema de cartucho continuam sendo aplicados.
A biblioteca identifica `.bin` como Mega Drive: não renomeie discos PS1 para essa extensão.
BIN/CUE, PBP, M3U, troca de discos, CHDs diferenciais e arquivos SBI não são suportados nesta versão.
Jogos PAL que exigem SBI e jogos que exigem troca de disco durante a partida ainda não são compatíveis.

## BIOS

Ao iniciar um jogo, escolha uma BIOS própria de **512 KiB**, mantendo seu nome original
`scph….bin` ou `PSXONPSP660.bin`. A validação verifica nome, tamanho e identificação Sony;
é uma triagem estrutural, não uma verificação criptográfica de procedência.

A BIOS fica no IndexedDB deste navegador, sem upload nem sincronização na conta.
É possível trocá-la ou removê-la antes de iniciar outra sessão. Se o armazenamento não
estiver disponível, a interface informa que a escolha vale apenas na sessão atual.

**Iniciar com BIOS HLE** dispensa o arquivo de BIOS, mas reduz a compatibilidade:
alguns jogos podem falhar no boot ou no memory card. Nenhuma BIOS proprietária é distribuída.

## Controles e menus

A primeira versão emula um **controle digital de PS1**. O analógico esquerdo do joystick
funciona como direcional, sem eixos analógicos de DualShock. Jogos que exigem DualShock,
como Ape Escape, não estão cobertos. Não há multitap ou segundo controle nesta versão.

| Controle PS1   | Teclado               |
| -------------- | --------------------- |
| Direcional     | Setas                 |
| ✕ / ○ / □ / △  | Z / X / A / S         |
| L1 / R1        | Q / W                 |
| L2 / R2        | E / R                 |
| Select / Start | Shift direito / Enter |

No modo console, **Select + Start** ou **Esc** abre/fecha o menu. L1 + R1 permanece
livre para o jogo. Na página normal, o atalho de reiniciar PS1 é **F8**, para R continuar
sendo R2. A seleção nos menus usa o botão inferior (A no Xbox, ✕ no PlayStation), e o
botão da direita volta. Joysticks com mapeamento padrão do navegador são o caminho de
referência; controles retrô sem L2/R2 precisam do teclado para esses botões.

## Progresso

O primeiro memory card é salvo por jogo, em formato bruto de **128 KiB**, usando o mesmo
fluxo de persistência local e sincronização de progresso da biblioteca. O segundo card
compartilhado do core está desabilitado. A saída pelo menu aguarda a gravação local.

Os quatro slots de save state também funcionam em PS1. O envelope identifica jogo,
sistema e versão do core e recusa estados incompatíveis. Atualizar o core pode invalidar
save states; o memory card continua sendo a forma mais portável de progresso.

## Desenvolvimento e verificação

```bash
pnpm emulator:setup
pnpm --filter @pixelvault/contracts build
pnpm --filter @pixelvault/database db:deploy
pnpm --filter @pixelvault/database build
pnpm --filter @pixelvault/emulator-runtime build
node packages/emulator-runtime/verificacao/verificar-ps1.mjs
```

Há duas migrações: uma adiciona o valor do enum, e outra cadastra o sistema. Elas são
separadas porque PostgreSQL exige o commit do novo valor antes de utilizá-lo.
O seed também contempla instalações novas. Não é necessário reimportar jogos existentes.

O verificador de navegador usa um homebrew MIPS gerado pelo próprio projeto (MIT), com
animação via GPU e áudio ADPCM via SPU. Confere pixels renderizados, sinal de áudio, pausa,
exportação/importação de save state, restauração de memory card alterado e fechamento
dos AudioContexts. Não contém SDK, BIOS ou jogo de terceiros.

Para verificar também os discos, instale `mkisofs` (ou `genisoimage`) e `chdman`:

```bash
node packages/emulator-runtime/verificacao/criar-discos-ps1.mjs /tmp/pixelvault-ps1-verificacao
PS1_ROM=/tmp/pixelvault-ps1-verificacao/pixelvault.iso node packages/emulator-runtime/verificacao/verificar-ps1.mjs
PS1_ROM=/tmp/pixelvault-ps1-verificacao/pixelvault.chd node packages/emulator-runtime/verificacao/verificar-ps1.mjs
```

`CHROME`, `MKISOFS` e `CHDMAN` permitem informar os caminhos dos executáveis.
O smoke test da interface usa API simulada e core, React, navegador e roteador reais:

```bash
pnpm --filter @pixelvault/web dev --host 127.0.0.1 --port 5174
node packages/emulator-runtime/verificacao/verificar-ps1-ui.mjs
```

Use `WEB_URL` se o Vite estiver em outro endereço. O teste cobre entrada no modo console,
atalho de pausa no joystick, ajuste de volume, save state e retorno à biblioteca com a
confirmação ainda segurada. Não valida um joystick físico ou compatibilidade com todo o catálogo.

Na API, a verificação calcula SHA-256 e MD5 incrementalmente, conservando apenas 64 KiB
de cabeçalho dos CDs. O cliente omite o hash antecipado em uploads acima de 64 MiB.
No runtime, o conteúdo fica em Blob até o Nostalgist criar o arquivo do core; o core WASM
ainda precisa carregar o disco no sistema de arquivos em memória. Discos grandes exigem
mais memória e tempo de download, especialmente em celulares. A estrutura de um CHD de CD
não prova sozinha que o jogo é PS1; a recusa definitiva do core aparece na tela de erro.

Referências: [Nostalgist](https://nostalgist.js.org/apis/launch/),
[PCSX ReARMed](https://docs.libretro.com/library/pcsx_rearmed/),
[PS-X EXE e ISO](https://psx-spx.consoledev.net/cdromfileformats/),
[GPU](https://psx-spx.consoledev.net/graphicsprocessingunitgpu/) e
[SPU](https://psx-spx.consoledev.net/soundprocessingunitspu/).
