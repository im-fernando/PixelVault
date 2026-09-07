# Segurança

Este documento existe para registrar decisões de segurança que dependem de
medição na máquina alvo — a primeira é o custo do hash de senha, issue #44.
Sem o número e o ambiente registrados, "200 a 500 ms" vira uma frase de blog
que ninguém pode conferir nem refazer quando a máquina de produção mudar.

## Hash de senha (Argon2id)

### Por que Argon2id, e por que não outro

Argon2id é o ganhador do Password Hashing Competition (2015) e a recomendação
atual da OWASP para hash de senha. bcrypt e scrypt ficaram de fora por
desenho: bcrypt trunca a entrada em 72 bytes e não tem parâmetro de memória
(fica vulnerável a ataque em GPU/ASIC, que é exatamente o que Argon2
encarece); scrypt tem parâmetro de memória mas não a variante híbrida
resistente a _side-channel_ que o "id" do Argon2id garante. SHA (com ou sem
sal) nunca esteve em consideração: é rápido demais de propósito — a
característica que faz um hash de integridade ser bom o torna péssimo para
senha.

A biblioteca usada é [`argon2`](https://www.npmjs.com/package/argon2) (binding
nativo em C, mantido, com pré-compilados para Linux/macOS/Windows). É a lib
Node mais adotada para Argon2 e a única que expõe `needsRehash` pronto — a
peça que sustenta a reidratação abaixo.

### Onde mora o código

`apps/api/src/modules/identity/infrastructure/hash-de-senha.ts`. Três funções,
sem porta/adaptador no `domain/`: a ADR
[0004](adr/0004-hexagonal-apenas-nas-integracoes-externas.md) reserva
hexagonal para pontos com mais de um adaptador plausível, e aqui não existe —
Argon2id é a decisão desta issue, não algo plugável. `domain/User` continua
recebendo um `senhaHash` já pronto e nunca importa `argon2`.

- `gerarHashDeSenha(senhaPlana)` — calcula o hash com os parâmetros atuais.
- `verificarSenha(senhaPlana, hash)` — confere sem se importar com
  parâmetros antigos.
- `verificarERehash(senhaPlana, hashAtual)` — verifica e, se a senha bater e
  o hash guardado usar parâmetros diferentes dos atuais, devolve um
  `novoHash` para o caller regravar. Quem chama essa função e onde o
  `novoHash` é persistido é a issue #46 (login) — esta issue só entrega a
  função pronta.

Os parâmetros usados **não precisam de coluna própria no banco**: o formato
Argon2id já os embute na string do hash
(`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), então `needsRehash` compara
os parâmetros ali dentro contra a constante `PARAMETROS_ATUAIS` do módulo.

### Calibração — medida nesta máquina, não copiada

Meta da issue: 200–500 ms por hash. Abaixo de 200 ms facilita força bruta
offline caso o hash vaze; acima de 500 ms, cada tentativa de login já é cara
o bastante para virar vetor de negação de serviço sozinha — o rate limit da
issue #49 é a segunda linha de defesa, não a primeira, então o hash não pode
depender dele para ser seguro.

**Ambiente da medição** (7 de setembro de 2026):

| Item     | Valor                          |
| -------- | ------------------------------ |
| CPU      | 16 threads (`nproc`)           |
| RAM      | 15 GiB total                   |
| Sistema  | Linux 7.0.0-30-generic, x86_64 |
| Node.js  | v24.19.0                       |
| `argon2` | 0.45.1                         |

**Candidatos testados** (5 repetições cada, `argon2id`, senha de calibração
de 38 caracteres):

| memória (m) | iterações (t) | paralelismo (p) | média medida |
| ----------- | ------------- | --------------- | ------------ |
| 19 MiB      | 2             | 1               | 33,6 ms      |
| 46 MiB      | 1             | 1               | 62,0 ms      |
| 64 MiB      | 2             | 1               | 127,1 ms     |
| 64 MiB      | 3             | 1               | 184,4 ms     |
| **128 MiB** | **2**         | **1**           | **279,8 ms** |
| 128 MiB     | 3             | 1               | 399,0 ms     |
| 128 MiB     | 2             | 2               | 212,9 ms     |
| 256 MiB     | 2             | 1               | 591,5 ms     |
| 256 MiB     | 1             | 2               | 253,4 ms     |

**Escolha:** `m=131072` (128 MiB), `t=2`, `p=1`. Dez execuções adicionais só
com essa configuração deram média de **332,6 ms** (mínimo 286,6 ms, máximo
424,6 ms) — confortavelmente dentro dos 200–500 ms, sem encostar em nenhuma
das duas bordas.

`p=1` foi escolhido em vez de `p=2` de propósito: o paralelismo do Argon2
soma-se ao paralelismo natural do servidor (várias requisições de login
concorrentes já disputam os mesmos núcleos). Usar `p=1` mantém o custo por
hash previsível e não multiplica a contenção quando o login vira alvo de
tráfego concentrado — o cenário de negação de serviço que a nota da issue
pede para não piorar.

Exemplo de hash produzido com esses parâmetros (senha e salt de calibração,
descartáveis):

```
$argon2id$v=19$m=131072,p=1,t=2$TA94O+Kdh5fMRmXqRBSzvA$YypBGINoJhRfBI+5u6Us7mLzOvzlxK+584B3V2wopvg
```

### Reidratação

Testada em `hash-de-senha.test.ts`: um hash calculado com parâmetros mais
fracos (`m=19456,t=2,p=1`, simulando um registro anterior a uma futura
calibração) é aceito pela verificação e vem acompanhado de um `novoHash` — e
o `novoHash`, por sua vez, não pede nova reidratação. Isso é o que permite
subir o custo do Argon2id no futuro sem invalidar nenhuma senha existente:
cada login bem-sucedido migra silenciosamente quem ainda está no hash velho.

A reidratação só roda **depois** que `argon2.verify` já confirmou a senha
certa — uma tentativa de força bruta com senha errada nunca aciona
`needsRehash` nem paga o custo de calcular um hash novo.

### Como reproduzir

```bash
cd apps/api
node -e "
import('argon2').then(async ({ default: argon2 }) => {
  const senha = 'senha-de-calibracao-bem-comprida-1234';
  const opts = { type: argon2.argon2id, memoryCost: 131072, timeCost: 2, parallelism: 1 };
  const t0 = performance.now();
  await argon2.hash(senha, opts);
  console.log(performance.now() - t0, 'ms');
});
"
```

Repita em qualquer máquina nova (em especial a de produção) antes de confiar
nestes números — `nproc` e RAM diferentes mudam o tempo, e a régua de 200–500
ms vale para a máquina de destino, não para esta.

## O que falta (fora do escopo desta issue)

- **Rate limit no login** (#49) — o hash caro reduz o dano de um vazamento de
  banco, mas não impede tentativa em massa contra o endpoint; rate limit é
  quem faz isso.
- **Persistência do `novoHash` da reidratação** e o próprio fluxo de login
  (#46) — esta issue só entrega `verificarERehash` pronta para ser chamada.
