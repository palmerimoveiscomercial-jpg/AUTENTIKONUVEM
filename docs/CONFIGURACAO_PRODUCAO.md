# Configuração de produção — AUTENTIKO OK NUVEM

Data da verificação: 28/08/2026

## Recursos confirmados

- Vercel Project ID: `prj_oLIUWwkmnSZoFt0vPZx2dj9HcB73`
- Equipe Vercel: `palmeimoveis`
- Repositório: `palmerimoveiscomercial-jpg/AUTENTIKONUVEM`
- Domínio de produção pretendido: `https://autentikonuvem.vercel.app`
- Neon Organization ID: `org-old-math-41715124`
- Neon Project ID: `royal-unit-51650801`
- Neon Project Region: `aws-us-east-2`
- Neon Data API: `https://ep-rough-shape-axnxsml5.apirest.c-4.us-east-2.aws.neon.tech/neondb/rest/v1`
- Neon Auth: `https://ep-rough-shape-axnxsml5.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth`
- Supabase Project URL: `https://kgcucxqtzqcsskhjfmzl.supabase.co`

## Estado observado

- O JWKS do Neon Auth responde JSON com HTTP 200.
- A Neon Data API exige um JWT válido, como esperado para uma API protegida.
- `https://autentikonuvem.vercel.app/api/health` responde 404: o domínio ainda
  não está associado a uma implantação de produção válida.
- A implantação de preview informada está protegida pelo Vercel Authentication
  e não pode ser usada pelo Apps Script como API pública server-to-server.
- O código atualizado está em um branch local 12 commits à frente do `main`
  remoto, além das mudanças 2.7.0 ainda não publicadas no GitHub.

## Variáveis obrigatórias no Vercel

As variáveis abaixo são nomes, nunca valores para expor no Git ou navegador:

- `DATABASE_URL`: conexão PostgreSQL pooled criada pela integração Neon.
- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta administrativa; a chave
  `sb_publishable_...` não substitui este valor.
- `AUT_MEDIA_SIGNING_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `AUT_DATA_API_KEY`: segredo aleatório com pelo menos 32 caracteres.
- `AUT_DATA_SYNC_SECRET`: outro segredo aleatório com pelo menos 32 caracteres.
- `AUTENTIKO_ALLOWED_ORIGINS` e `AUT_DATA_ALLOWED_ORIGINS`.
- Chaves opcionais/funcionais: `TRANSPARENCIA_API_KEY`, `DATAJUD_API_KEY`,
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENROUTER_API_KEY` e
  `OPENROUTER_MODEL`.

## Separação correta das integrações

- Supabase continua responsável pelo armazenamento/mídia já existente.
- Neon é o banco de busca, cache, contratos e telemetria das APIs.
- Neon Data API/Auth não deve ser colocado no campo `DATABASE_URL`.
- Apps Script acessa somente o backend Vercel por HTTPS; não recebe conexão
  PostgreSQL, service role nem chaves de IA.
