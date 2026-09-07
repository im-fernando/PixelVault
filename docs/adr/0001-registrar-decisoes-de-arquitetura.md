# 0001. Registrar decisões de arquitetura

Data: 2026-09-07
Status: aceita

## Contexto

Boa parte do código do PixelVault vai ser escrita com auxílio de IA, em sessões
separadas por dias ou semanas. Um agente que abre o repositório enxerga o
código, mas não enxerga o raciocínio que levou até ele — e sem isso tende a
"corrigir" decisões deliberadas de volta ao padrão mais comum da internet.

O mesmo vale para o autor humano seis meses depois.

## Decisão

Toda decisão de arquitetura que restringe o futuro do projeto vira uma ADR
numerada em `docs/adr/`, com contexto, decisão, consequências e alternativas
descartadas.

ADR é imutável: decisão que muda não é editada, é substituída por uma nova que
referencia a antiga.

## Consequências

Custa cerca de quinze minutos por decisão. Em troca, `CLAUDE.md` pode apontar
para as ADRs como leitura obrigatória antes de mudança estrutural, e a
discussão "por que isso é assim?" acontece uma vez só.

O risco real é o log envelhecer sem ninguém perceber. Mitigação: ADR que
descreve algo que não é mais verdade deve ser marcada como substituída, não
apagada.

## Alternativas descartadas

**Documentar tudo num `arquitetura.md` único.** Vira um documento que ninguém
lê inteiro e que perde o histórico: você enxerga o estado atual, mas não o que
já foi tentado e rejeitado.

**Não documentar e confiar no histórico do git.** A mensagem de commit explica
uma mudança; não explica um princípio que atravessa o projeto.
