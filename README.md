# PixelVault

**Sua biblioteca de jogos retrô, jogável no navegador, com o progresso
sincronizado entre os seus aparelhos.**

[![CI](https://github.com/im-fernando/PixelVault/actions/workflows/ci.yml/badge.svg)](https://github.com/im-fernando/PixelVault/actions/workflows/ci.yml)

> 🚧 Em construção. A M0 (fundação) está pronta; o player chega na M1.
> Uma demonstração em vídeo entra aqui assim que houver jogo rodando.

## Como funciona

A emulação roda **no seu navegador**, em WebAssembly. O servidor não renderiza
o jogo nem transmite vídeo: ele entrega arquivos, cuida das contas e guarda o
progresso.

É o que torna o projeto barato de manter e o que permite jogar com a latência
de um emulador local, e não de um serviço de streaming.

## O modelo: BYOR

Cada pessoa envia as **próprias ROMs**, e elas ficam privadas dela. Quando o
arquivo chega, casamos o SHA-256 contra um catálogo de metadados e a capa
aparece sozinha.

O catálogo público contém apenas **homebrew** — jogável sem login e sem
upload — e metadados, que são livremente redistribuíveis. O PixelVault não
distribui ROM comercial. O nome é literal: um cofre pessoal, não uma loja.

## Estado atual

O roadmap vive nas [milestones do repositório](https://github.com/im-fernando/PixelVault/milestones),
que são a fonte de verdade — esta seção não duplica a lista para não mentir em
duas semanas.

| Milestone | O que entrega                                              |
| --------- | ---------------------------------------------------------- |
| **M0** ✅ | Fundação: monorepo, fronteiras de módulo no CI, ADRs       |
| **M1**    | Jogar no navegador: player, teclado e controle, save local |
| **M2**    | Contas e autenticação                                      |
| **M3**    | Biblioteca e envio de ROM                                  |
| **M4**    | Save na nuvem (SRAM)                                       |
| **M5**    | Save states e múltiplos dispositivos                       |
| **M6**    | Gamificação: XP, conquistas, temporadas e ranking          |
| **M7**    | PWA offline, controles touch, shaders, rewind              |
| **M8**    | Produção                                                   |

## Stack

| Camada   | Escolha                                     | Por quê                                                                       |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Monorepo | pnpm + Turborepo                            | Contratos compartilhados entre front e back, sem publicar pacote              |
| Front    | React + Vite + Tailwind + TanStack          | —                                                                             |
| API      | Fastify + TypeScript + Zod                  | O mesmo schema valida a requisição e tipa o cliente                           |
| Banco    | PostgreSQL + Prisma                         | —                                                                             |
| Storage  | S3-compatible (MinIO local, R2 em produção) | Mesmo código nos dois; o R2 não cobra egress, e ROM e save são o tráfego todo |
| Emulação | Core WebAssembly, por trás de um adapter    | A qualidade vem do core, não da interface — e o adapter permite trocá-lo      |

## Arquitetura

Monólito modular. A API é organizada em módulos de domínio
(`identity`, `catalog`, `library`, `progress`, `sessions`), cada um com
`domain/`, `application/`, `infrastructure/` e `http/`, e um `index.ts` como
única superfície pública.

**A fronteira entre módulos é verificada no CI**, não confiada à disciplina:
`pnpm lint:boundaries` reprova o build se um módulo importar as tripas de
outro, se o domínio conhecer Fastify ou se o Prisma vazar da infraestrutura.

Arquitetura hexagonal só onde há mundo externo instável: storage, runtime de
emulação e provedores de metadados. O banco não é porta.

Detalhes em [docs/arquitetura.md](docs/arquitetura.md) e no
[log de decisões](docs/adr/README.md). O baseline de performance da emulação —
FPS, frame pacing e tempo de carga, com as condições da medição — está em
[docs/performance.md](docs/performance.md).

## Rodando localmente

Requisitos: Node 22+, pnpm 11+, Docker.

```bash
git clone git@github.com:im-fernando/PixelVault.git
cd PixelVault

cp .env.example .env        # os valores padrão já funcionam para desenvolvimento
docker compose up -d        # PostgreSQL na 5437 e MinIO na 9000
pnpm install
pnpm emulator:setup         # baixa o core de emulação (4 MB), conferido por SHA-256
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Front: <http://localhost:5173>
- API: <http://localhost:3333>
- Documentação da API: <http://localhost:3333/docs>
- Console do MinIO: <http://localhost:9001> (`pixelvault` / `pixelvault`)

O passo a passo completo, incluindo os comandos de verificação, está em
[docs/desenvolvimento.md](docs/desenvolvimento.md).

## Contribuindo

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Antes de qualquer mudança estrutural,
leia o [log de decisões](docs/adr/README.md).

## Nota legal

O emulador e os metadados de jogos podem ser distribuídos; as ROMs comerciais,
não. O PixelVault não hospeda nem serve ROM comercial: o arquivo que você envia
é seu e fica acessível apenas para você. O catálogo público tem só homebrew com
licença de redistribuição.

Ter o cartucho original não autoriza automaticamente disponibilizar a ROM para
outras pessoas.

## Licença

[MIT](LICENSE).
