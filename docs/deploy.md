# Publicação

Frontend de produção: https://pixelvault.nullpath.com.br

Alias Vercel: https://pixelvault-fawn.vercel.app

`WEB_ORIGIN` na API aponta para o domínio de produção. O CORS do R2 autoriza
esse domínio e o alias da Vercel. HTTP redireciona para HTTPS; o cookie de
sessão exige HTTPS e pertence ao domínio em que o login foi feito.

Projeto Vercel: `fernando-morais-projects/pixelvault`.

A API está em https://pixelvault-api.nullpath.com.br, na Oracle
(`ubuntu@129.80.173.47`). O frontend encaminha `/api/*` para essa API.
API e PostgreSQL 17 rodam em Docker Compose; o banco tem volume persistente,
sem porta pública. O Nginx termina HTTPS e encaminha para `127.0.0.1:3400`.
O limite de corpo no Nginx deve ser `6m`, como no arquivo
`deploy/pixelvault-api.nginx.conf`, para aceitar states de 4 MiB e miniaturas
codificados em base64. Ao atualizar instalações existentes, aplique esse
limite também no bloco HTTPS ativo e recarregue o Nginx após `nginx -t`.
O certificado é renovado pelo Certbot. ROMs e saves usam o bucket R2 privado
`pixelvault`, com CORS para a origem do frontend. O Resend está configurado
com remetente `nao-responda@nullpath.com.br` (domínio verificado).

Foram aplicadas 14 migrations e o seed de 5 sistemas/4 homebrews. Cadastro,
login, cookie seguro, upload, favorito e download íntegro foram verificados
pela URL da Vercel. O envio real de e-mail não foi exercitado.

## Publicar o frontend

Na raiz do repositório, com a Vercel autenticada:

```sh
vercel link --yes --project pixelvault
pnpm build
pnpm emulator:verify
PIXELVAULT_API_ORIGIN=https://pixelvault-api.nullpath.com.br node scripts/deploy/preparar-front.mjs
```

O último comando gera um pacote temporário e imprime o comando de publicação
com `vercel deploy --prebuilt --prod`. Execute o comando impresso.
Somente HTML, assets, emulador e ROMs do catálogo público entram no pacote.
As ROMs pessoais em `roms-local`, os arquivos `.env` e o código do backend
não são publicados.

Para outra origem HTTPS da API:

```sh
PIXELVAULT_API_ORIGIN=https://ENDERECO-DA-API node scripts/deploy/preparar-front.mjs
```

Publique novamente usando o comando impresso. O pacote encaminha `/api/*`
à origem informada; o navegador continua usando a origem do frontend para
preservar os cookies de sessão. Configure `WEB_ORIGIN` na API com a URL
de produção do frontend e valide autenticação, URLs assinadas e CORS do storage.

As regras de publicação seguem o formato Build Output API da Vercel:
https://vercel.com/docs/build-output-api/v3/configuration

## Docker na Oracle

- Release inicial: `/opt/pixelvault/releases/20260911-initial`.
- Release ativa: `/opt/pixelvault/current` (link simbólico).
- Segredos: `/opt/pixelvault/.env`, permissão `600`; cada release aponta para ele.
- Imagem atual: `pixelvault-api:20260911-initial` (ARM64).
- Containers: `pixelvault-api-1` e `pixelvault-postgres-1`.
- Volume: `pixelvault_postgres`.

Para consultar o estado na VPS:

```sh
cd /opt/pixelvault/current
export PIXELVAULT_RELEASE=20260911-initial
docker compose --env-file /opt/pixelvault/.env -f deploy/compose.yml ps
```

O Dockerfile compila os pacotes da API e valida os imports com Node, sem
carregar segredos na imagem. Migrations são uma etapa explícita do deploy:

```sh
docker compose --env-file /opt/pixelvault/.env -f deploy/compose.yml run --rm api pnpm --filter @pixelvault/database db:deploy
docker compose --env-file /opt/pixelvault/.env -f deploy/compose.yml up -d --wait api
```

Em atualizações, faça backup do PostgreSQL antes das migrations. Não use
`down -v`: isso remove o volume persistente. Este primeiro deploy não
configurou backup automático.

## Publicação automática

Todo merge no `main` publica sozinho, pelo job `publicar` do
`.github/workflows/ci.yml`. Ele depende do job `verificar`, então commit que
reprova no CI não chega em produção.

A ordem é API primeiro, frontend depois — para o frontend novo nunca falar com
a API velha — e tudo num job só: dois merges seguidos não podem intercalar a
API de um com o front do outro. O grupo de concorrência `producao` não cancela
no meio, porque cancelar pode ser cancelar durante uma migration.

Na API, `scripts/deploy/publicar-na-oracle.sh` roda na VPS e faz, em ordem:
envio da release por `git archive` (só o que está versionado), build da imagem
ARM64, backup do PostgreSQL, migrations, `up -d --wait` e conferência de saúde
pela porta publicada. Se a subida ou a saúde falharem, ele volta para a release
anterior e reprova o job. Se a migration falhar, ele para antes de trocar o
container: a API antiga continua no ar e o banco fica no último estado bom.

Ao final, a faxina guarda as 5 últimas releases, os 10 últimos backups e as 3
últimas imagens. Tudo escopado em `pixelvault`: a VPS roda outros produtos em
produção, e um comando Docker de escopo global ali derruba serviço de terceiro.

O frontend é montado pelo `preparar-front.mjs` e publicado com
`vercel deploy --prebuilt --prod`. Por fim, `verificar-producao.mjs` exercita
produção pelos dois domínios com uma conta temporária, que ele mesmo apaga.

### Segredos necessários

| Secret                               | Para quê                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VPS_SSH_KEY`                        | Chave dedicada à publicação, só dela — a chave pessoal não vai para o GitHub. Revogar é tirar a linha `github-actions-pixelvault-deploy` do `authorized_keys` da VPS. |
| `VPS_HOST_KEY`                       | Chave pública do host, fixada. Evita aceitar na hora o que o outro lado apresentar.                                                                                   |
| `VPS_HOST`, `VPS_USER`               | Endereço e usuário da Oracle.                                                                                                                                         |
| `VERCEL_TOKEN`                       | Token de publicação, criado em https://vercel.com/account/tokens.                                                                                                     |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vínculo com o projeto, já que `.vercel/` não é versionado.                                                                                                            |

Para exigir aprovação manual antes de cada publicação, basta proteger o
Environment `producao` com um reviewer em Settings › Environments; o job já
está preso a ele e passa a esperar o OK sem mudar nenhuma linha de código.

### Rollback à mão

```sh
cd /opt/pixelvault/releases/<RELEASE-ANTERIOR>
PIXELVAULT_RELEASE=<RELEASE-ANTERIOR> docker compose --env-file /opt/pixelvault/.env -f deploy/compose.yml up -d --wait api
ln -sfn /opt/pixelvault/releases/<RELEASE-ANTERIOR> /opt/pixelvault/current
```

Os backups ficam em `/opt/pixelvault/backups`, um por publicação, feitos antes
das migrations. Restaurar schema é `zcat <backup> | docker exec -i
pixelvault-postgres-1 psql -U pixelvault -d pixelvault`.

O `configurar-oracle.mjs` continua sendo só do primeiro provisionamento: ele
recusa sobrescrever o arquivo de segredos existente. As credenciais R2 ainda
são compartilhadas entre buckets; a rotação para uma credencial exclusiva do
bucket PixelVault continua pendente.
