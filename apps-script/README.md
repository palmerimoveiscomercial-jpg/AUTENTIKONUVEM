# Apps Script

Fonte do AUTENTIKO 2.2.0. O arquivo `.clasp.json` real não é versionado.

Antes de publicar:

1. copie `.clasp.json.example` para `.clasp.json`;
2. configure o projeto correto da Palmer Imóveis;
3. execute `node tests/static-audit.mjs`;
4. execute `node tests/smoke.mjs`;
5. mantenha `MEDIA_CLOUD_ENABLED=NAO` até Vercel e Supabase estarem validados;
6. nunca grave `AUT_MEDIA_SIGNING_SECRET` no código: use Script Properties.
