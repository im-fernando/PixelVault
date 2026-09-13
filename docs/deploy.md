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

## Futuro CI/CD

Ainda não há pipeline de publicação. A imagem foi construída na VPS usando
`deploy/Dockerfile.api`. O Compose aceita `PIXELVAULT_IMAGE` (por exemplo,
`ghcr.io/ORGANIZACAO/pixelvault-api`) e `PIXELVAULT_RELEASE` (tag do commit),
permitindo depois construir/publicar pelo GitHub Actions e executar `pull`,
migrations e `up -d --wait` na Oracle. Como a VPS é ARM64, a imagem do GHCR
deve incluir `linux/arm64`.

O script `scripts/deploy/configurar-oracle.mjs` foi usado apenas no primeiro
provisionamento: recusa sobrescrever o arquivo de segredos existente.
`scripts/deploy/verificar-producao.mjs` exercita a API com uma conta temporária
e a remove ao terminar. As credenciais R2 existentes são compartilhadas entre
buckets; a rotação para uma credencial exclusiva do bucket PixelVault fica
pendente.
