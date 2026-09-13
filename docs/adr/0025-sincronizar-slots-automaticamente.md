# 0025. Sincronize os slots automaticamente após salvar

Data: 2026-09-12
Status: aceita

## Contexto

O usuário espera que gravar um slot também proteja o progresso na nuvem.
O fluxo da M5 exigia um segundo clique, contrário a essa expectativa.
Além disso, o player passava SHA-256 às rotas de save state que exigem o UUID
da biblioteca, e o limite HTTP padrão recusava JSON de states válidos grandes.

## Decisão

Ao jogar pela biblioteca autenticada, enviar automaticamente os slots locais
pendentes assim que forem gravados, sem debounce nem um segundo clique. A
galeria, o HUD, o atalho F2 e o modo console compartilham o mesmo fluxo.

Preservar os bytes locais e repetir falhas ao reconectar, voltar à janela ou
a cada 15 segundos enquanto o player estiver aberto. Ao reabrir o jogo,
reavaliar as pendências a partir do storage persistido. Uma revisão divergente
continua exigindo escolha explícita, com proteção de revisão na API.

Usar SHA-256 no storage local e UUID da biblioteca na API e nos ponteiros de
sincronização. A miniatura não deve bloquear o backup: usar uma prévia neutra
se a captura faltar ou exceder o limite aceito. Compartilhar a instância de
storage entre gravação e sincronização, inclusive no fallback em memória.

Esta decisão altera a exigência de clique separado da ADR 0020 para slots
na biblioteca autenticada. Login, cadastro e logout continuam sem mover ou
apagar saves. SRAM mantém seu fluxo próprio; conflitos não são resolvidos por
comparação do relógio dos aparelhos.

## Consequências

Salvar passa a iniciar o backup automaticamente, com indicação de envio,
pendência ou confirmação. Gravações em sequência são processadas sem confundir
uma versão anterior confirmada com o save novo ainda local.

O upload exige conexão, sessão válida e espaço na conta. Fechar o navegador
não garante concluir uma requisição: pendências persistidas voltam a ser
tentadas ao reabrir o jogo. No fallback volátil, fechar a aba perde o que
não chegou à nuvem. Saves de outro aparelho continuam sujeitos a conflito.

## Alternativas descartadas

- Manter o segundo clique: foi justamente a fonte de saves esquecidos no aparelho.
- Sobrescrever pela data mais recente: relógio local não arbitra progresso.
- Bloquear a gravação local até a rede responder: impediria salvar offline.
- Recusar o backup sem miniatura: a imagem não deve valer mais que o progresso.
