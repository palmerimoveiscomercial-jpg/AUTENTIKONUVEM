# Supabase do AUTENTIKO

Projeto Palmer destinado à nuvem documental:

- Project ref: `kgcucxqtzqcsskhjfmzl`
- URL pública: `https://kgcucxqtzqcsskhjfmzl.supabase.co`
- Edge API: `https://kgcucxqtzqcsskhjfmzl.supabase.co/functions/v1/media-api`

As URLs e o identificador do projeto não são credenciais. Chaves, senhas e o segredo HMAC nunca devem ser gravados neste repositório.

## Implantação segura

1. Aplicar as migrações da pasta `migrations` em ordem.
2. Publicar a função `media-api` com verificação JWT desativada; ela usa tickets HMAC curtos do AUTENTIKO.
3. Configurar somente nos Secrets do Supabase: `AUT_MEDIA_SIGNING_SECRET` e `AUT_ALLOWED_ORIGINS`. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pelo próprio runtime.
4. Gravar o mesmo `AUT_MEDIA_SIGNING_SECRET` em Script Properties do Apps Script.
5. Manter `MEDIA_CLOUD_ENABLED = NAO` até migrações, health check, upload, leitura e auditoria passarem.
6. Manter `AUT_DRIVE_SYNC_WORKER_ENABLED=false`, `MEDIA_DRIVE_SYNC_WORKER_READY=NAO` e
   `MEDIA_LARGE_UPLOAD_ENABLED=NAO` até o worker Supabase -> Drive estar publicado e validado.
   Sem esses três sinais, o backend bloqueia arquivos acima de 6 MB antes de criar qualquer registro.

O segredo HMAC deve possuir no mínimo 32 caracteres aleatórios. A chave `service_role` nunca deve ir para HTML, planilha, Git ou logs.

Para o HTML Service, use `AUT_ALLOWED_ORIGINS=https://script.google.com,https://*-script.googleusercontent.com`. O wildcard é reconhecido pelo código apenas nesse sufixo oficial restrito; tickets HMAC continuam obrigatórios.
