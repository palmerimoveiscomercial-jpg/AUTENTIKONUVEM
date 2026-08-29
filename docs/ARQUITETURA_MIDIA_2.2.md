# Arquitetura de mídia 2.2

```text
Navegador AUTENTIKO
  ├─ miniatura local <= 80 KB → IndexedDB (7 dias)
  ├─ ticket HMAC curto ← Apps Script
  ├─ upload TUS direto → Supabase Storage privado
  └─ PDF.js + URL assinada → primeira página por Range Request

Apps Script / Sheets
  ├─ login, permissão e processo
  ├─ emite ticket sem expor token de sessão
  └─ guarda somente metadados e estados

Vercel gru1
  ├─ valida ticket, origem, tamanho, MIME e idempotência
  ├─ cria upload assinado
  ├─ verifica SHA-256 por streaming
  └─ emite comprovante HMAC

Supabase sa-east-1
  ├─ originals (privado)
  ├─ thumbnails (privado)
  ├─ previews (privado)
  └─ metadados, jobs e eventos

GitHub Actions
  ├─ cópia redundante Supabase → Drive
  ├─ migração Drive → Supabase
  ├─ miniatura Poppler/Sharp
  ├─ Adobe opcional + qpdf
  └─ reconciliação diária de hashes
```

O original é imutável por chave. Miniatura e PDF otimizado são derivados e
podem ser regenerados. Nenhum byte de PDF, Base64 ou URL assinada é salvo em
célula da planilha.
