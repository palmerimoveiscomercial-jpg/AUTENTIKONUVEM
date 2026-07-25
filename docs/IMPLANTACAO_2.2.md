# Implantação controlada — AUTENTIKO 2.2

## Estado seguro inicial

- `MEDIA_CLOUD_ENABLED=NAO`
- `ADOBE_ENABLED=NAO`
- a URL atual do Apps Script continua funcionando;
- Drive e planilha não são apagados nem substituídos;
- MySQL e MariaDB ficam somente nos perfis locais do Docker.

## 1. Segurança antes da implantação

1. Torne o repositório privado.
2. Troque a credencial publicada anteriormente; removê-la do arquivo atual ou
   tornar o repositório privado não invalida o histórico.
3. Proteja a branch `main` e exija o workflow `CI`.
4. Crie o environment GitHub `production-media` com aprovação manual.
5. Gere `AUT_MEDIA_SIGNING_SECRET` aleatório com ao menos 32 bytes. O mesmo
   segredo deve existir somente em:
   - Script Properties: `AUT_MEDIA_SIGNING_SECRET`;
   - Vercel Environment Variables: `AUT_MEDIA_SIGNING_SECRET`.

## 2. Supabase

1. Crie o projeto em São Paulo (`sa-east-1`).
2. Execute `supabase/migrations/202607240001_media_cloud.sql`.
3. Confirme que os buckets `autentiko-originals`, `autentiko-thumbnails` e
   `autentiko-previews` estão privados.
4. Grave `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente nos secrets da
   Vercel e do environment GitHub.

## 3. Vercel

1. Importe este repositório e selecione `media-api` como Root Directory.
2. Reutilize o projeto/domínio destinado ao AUTENTIKO.
3. Configure a região `gru1` — já declarada em `media-api/vercel.json`.
4. Defina:
   - `SUPABASE_URL`;
   - `SUPABASE_SERVICE_ROLE_KEY`;
   - `AUT_MEDIA_SIGNING_SECRET`;
   - `AUTENTIKO_ALLOWED_ORIGINS`.
5. Em `AUTENTIKO_ALLOWED_ORIGINS`, use uma lista separada por vírgulas com as
   origens reais observadas no Web App oficial. Não use `*`.
6. Publique primeiro um Preview e valide `/api/health`.

## 4. Google

1. Crie uma conta de serviço exclusiva.
2. Habilite Google Drive API e Google Sheets API.
3. Compartilhe somente:
   - a pasta documental do AUTENTIKO;
   - a planilha AUTENTIKO.
4. Grave o JSON em `GOOGLE_SERVICE_ACCOUNT_JSON` no environment GitHub.
5. Grave os IDs em `AUTENTIKO_SPREADSHEET_ID` e
   `AUTENTIKO_DRIVE_ROOT_FOLDER_ID`.

## 5. Apps Script

1. Execute `setupSystem()` para adicionar configurações e cabeçalhos de forma
   idempotente.
2. Mantenha `MEDIA_CLOUD_ENABLED=NAO`.
3. Defina em Script Properties:
   - `AUT_MEDIA_SIGNING_SECRET`.
4. Defina em `CONFIGURACOES`:
   - `MEDIA_API_BASE_URL=https://<dominio-validado>`;
   - `MEDIA_MAX_UPLOAD_MB=25`;
   - `MEDIA_MAX_PDF_SOURCE_MB=100`.
5. Publique uma implantação de teste e valide login, processos e miniaturas.
6. Ative a nuvem somente para o canário administrativo; a habilitação global
   deve ocorrer depois da migração e reconciliação.

## 6. Migração

Execute o workflow `Migrar documentos para Supabase`:

1. primeiro com `dry_run=true`;
2. depois em lotes pequenos;
3. cada documento é identificado por checkpoint;
4. o Drive não é alterado;
5. original e miniatura recebem hashes separados;
6. falhas podem ser repetidas sem sobrescrever objetos.

Execute a reconciliação e confirme igualdade de hashes antes de ativar as
prévias completas.

## 7. Adobe

O processamento Adobe é opcional e usa a API REST oficial. Configure
`ADOBE_CLIENT_ID` e `ADOBE_CLIENT_SECRET` nos secrets GitHub. Mantenha
`ADOBE_ENABLED=false` até o teste controlado.

Quando ativo:

- apenas PDFs acima de 4 MB, sem miniatura ou reprocessados manualmente entram
  na fila;
- o original nunca é substituído;
- a saída compactada é linearizada com `qpdf` e salva como `preview`;
- falha da Adobe não bloqueia o original;
- o limite mensal é verificado antes da transação e há aviso em 80%.

## Rollback

1. Defina `MEDIA_CLOUD_ENABLED=NAO`.
2. Defina `ADOBE_ENABLED=NAO`.
3. Mantenha o Web App na implantação anterior.
4. Não remova buckets nem registros; preserve-os para auditoria.
5. O caminho legado Drive + transferência em blocos continuará disponível.

## Critério de promoção

Promova somente após:

- 23 grupos estáticos e 28 integrações aprovados;
- testes da API e build aprovados;
- `npm audit --omit=dev` sem vulnerabilidades;
- upload de 1 MB, 6 MB, 25 MB e PDF pesado de 100 MB;
- original acima de 25 MB preservado e cópia otimizada processada em segundo plano;
- retomada TUS após queda de rede;
- dois uploads simultâneos;
- primeira página do PDF em PDF.js por URL assinada;
- reconciliação Drive × Supabase sem divergências.
