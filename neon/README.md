# Neon — AUTENTIKO OK NUVEM

O Neon é o índice transacional de leitura e o registro de emissão do backend
Vercel. O navegador e o Google Apps Script **não recebem** a `DATABASE_URL`.

## Instalação

1. Crie um projeto PostgreSQL no Neon na região mais próxima disponível.
2. Copie uma conexão **pooled** para `DATABASE_URL` no Vercel.
3. Execute, no SQL Editor do Neon, `migrations/0001_autentiko_data_cloud.sql`.
4. Defina no Vercel `AUT_DATA_API_KEY` e `AUT_DATA_SYNC_SECRET` com valores
   aleatórios e diferentes, de no mínimo 32 caracteres.
5. Mantenha `AUT_CONTRACT_FINAL_ENABLED=false` até a homologação jurídica,
   a sincronização completa e o teste do adaptador Google Drive.

## Modelo de acesso

- `/api/v1/sync/nuvem`: recebe lotes assinados com HMAC e mantém o índice.
- `/api/v1/search`: consulta com filtros exatos, texto completo e cursor.
- `/api/v1/contracts/issue`: valida, versiona e gera HTML determinístico.
- `/api/v1/contracts/:id`: consulta o registro emitido.
- `/api/v1/providers/query`: BrasilAPI, CGU e DataJud com cache e estados explícitos.
- `/api/v1/ai/analyze`: Gemini/OpenRouter com JSON controlado e contagem de tokens.

A geração final no Vercel fica separada da gravação no Google Drive. O primeiro
serviço produz e registra o artefato imutável; o Apps Script/Docs continua como
adaptador autorizado para criar o Google Doc editável e o PDF no Drive.
