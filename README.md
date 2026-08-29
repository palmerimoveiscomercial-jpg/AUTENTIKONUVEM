# AUTENTIKO OK NUVEM 2.2

Repositório privado de produção da Palmer Imóveis.

## Estrutura

- `apps-script/`: fonte versionada do Web App atual.
- `media-api/`: API de mídia Next.js/Vercel, região `gru1`.
- `neon/`: schema PostgreSQL para pesquisa, contratos, cache e uso de IA.
- `supabase/migrations/`: tabelas, buckets privados e políticas.
- `scripts/`: migração e reconciliação Drive × Supabase.
- `db/`: bancos locais opcionais. MySQL e MariaDB não são usados em produção.

## Segurança

Nunca grave credenciais em arquivos versionados. Copie `.env.example` para `.env`,
use senhas exclusivas e mantenha as chaves reais em Script Properties, Vercel
Environment Variables, Supabase Secrets e GitHub Actions Secrets.

A versão 2.2 inicia com `MEDIA_CLOUD_ENABLED=NAO` e `ADOBE_ENABLED=NAO`.
Ative cada recurso somente após aplicar as migrações e validar o ambiente de preview.

Consulte [SECURITY.md](SECURITY.md) e [docs/IMPLANTACAO_2.2.md](docs/IMPLANTACAO_2.2.md).

O diagnóstico de desempenho e a implantação híbrida Apps Script + Vercel +
Neon estão em [docs/DIAGNOSTICO_APIS_VERCEL_NEON.md](docs/DIAGNOSTICO_APIS_VERCEL_NEON.md).
