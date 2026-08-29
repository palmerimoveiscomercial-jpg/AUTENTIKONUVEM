begin;

-- Catálogo de endpoints públicos. Não armazene aqui API keys, tokens,
-- service-role keys ou DATABASE_URL.
create table if not exists public.api_endpoint_catalog (
  code text primary key,
  service text not null,
  config_location text not null default 'VERCEL_ENV'
    check (config_location in ('VERCEL_ENV', 'APPS_SCRIPT_PROPERTY', 'PUBLIC')),
  environment text not null default 'production',
  method text not null default 'GET',
  url_template text not null check (url_template ~ '^https://'),
  secret_env_var text,
  enabled boolean not null default true,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_endpoint_catalog_service_idx
  on public.api_endpoint_catalog (service, enabled);

insert into public.api_endpoint_catalog
  (code, service, config_location, environment, method, url_template,
   secret_env_var, description)
values
  ('vercel.web', 'VERCEL', 'PUBLIC', 'production', 'GET',
   'https://autentikonuvem.vercel.app/', null, 'Aplicação web'),
  ('vercel.health', 'VERCEL', 'PUBLIC', 'production', 'GET',
   'https://autentikonuvem.vercel.app/api/health', null, 'Healthcheck'),
  ('vercel.health.deep', 'VERCEL', 'PUBLIC', 'production', 'GET',
   'https://autentikonuvem.vercel.app/api/health?deep=1', null, 'Healthcheck profundo'),
  ('vercel.ai.analyze', 'VERCEL', 'VERCEL_ENV', 'production', 'POST',
   'https://autentikonuvem.vercel.app/api/v1/ai/analyze', 'GEMINI_API_KEY / OPENROUTER_API_KEY', 'Análise IA'),
  ('vercel.contract.issue', 'VERCEL', 'VERCEL_ENV', 'production', 'POST',
   'https://autentikonuvem.vercel.app/api/v1/contracts/issue', 'AUT_DATA_API_KEY', 'Emissão de contrato'),
  ('vercel.contract.get', 'VERCEL', 'VERCEL_ENV', 'production', 'GET',
   'https://autentikonuvem.vercel.app/api/v1/contracts/{id}', 'AUT_DATA_API_KEY', 'Consulta de contrato'),
  ('vercel.search', 'VERCEL', 'VERCEL_ENV', 'production', 'GET',
   'https://autentikonuvem.vercel.app/api/v1/search', 'AUT_DATA_API_KEY', 'Busca paginada'),
  ('vercel.providers.query', 'VERCEL', 'VERCEL_ENV', 'production', 'POST',
   'https://autentikonuvem.vercel.app/api/v1/providers/query', 'TRANSPARENCIA_API_KEY / DATAJUD_API_KEY', 'Consulta de provedores'),
  ('vercel.sync.nuvem', 'VERCEL', 'VERCEL_ENV', 'production', 'POST',
   'https://autentikonuvem.vercel.app/api/v1/sync/nuvem', 'AUT_DATA_SYNC_SECRET', 'Sincronização Nuvem'),
  ('apps_script.ok_docs', 'GOOGLE_APPS_SCRIPT', 'APPS_SCRIPT_PROPERTY', 'production', 'GET',
   'https://script.google.com/macros/s/AKfycbxd7ArUlxizGscu3cjtzQjtkMU2JCA2NpVx_y5dhNz8_NXlBQwZnD3mKqR_GjOE2ZY8sQ/exec', null, 'Web app OK DOCS'),
  ('apps_script.nuvem.bridge', 'GOOGLE_APPS_SCRIPT', 'APPS_SCRIPT_PROPERTY', 'production', 'GET',
   'https://script.google.com/macros/s/AKfycbx-Wc74peh4DwB16yURN-pjsQxxKczVJYiRtD8qKE65Hw6MM23zHKXmvueyB9CBvZGz/exec', 'AUTENTIKO_NUVEM_API_KEY', 'Ponte JSON Nuvem'),
  ('neon.rest', 'NEON', 'VERCEL_ENV', 'production', 'GET',
   'https://ep-rough-shape-axnxsml5.apirest.c-4.us-east-2.aws.neon.tech/neondb/rest/v1', 'DATABASE_URL', 'Data API Neon'),
  ('neon.auth', 'NEON', 'PUBLIC', 'production', 'POST',
   'https://ep-rough-shape-axnxsml5.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth', null, 'Auth Neon'),
  ('neon.jwks', 'NEON', 'PUBLIC', 'production', 'GET',
   'https://ep-rough-shape-axnxsml5.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json', null, 'JWKS Neon'),
  ('supabase.project', 'SUPABASE', 'VERCEL_ENV', 'production', 'GET',
   'https://kgcucxqtzqcsskhjfmzl.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY', 'Projeto Supabase'),
  ('supabase.rest', 'SUPABASE', 'VERCEL_ENV', 'production', 'GET',
   'https://kgcucxqtzqcsskhjfmzl.supabase.co/rest/v1', 'SUPABASE_SERVICE_ROLE_KEY', 'REST Supabase'),
  ('supabase.storage', 'SUPABASE', 'VERCEL_ENV', 'production', 'GET',
   'https://kgcucxqtzqcsskhjfmzl.storage.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY', 'Storage Supabase'),
  ('brasilapi.cep', 'BRASIL_API', 'PUBLIC', 'production', 'GET',
   'https://brasilapi.com.br/api/cep/v2/{CEP}', null, 'Consulta CEP sem chave'),
  ('brasilapi.cnpj', 'BRASIL_API', 'PUBLIC', 'production', 'GET',
   'https://brasilapi.com.br/api/cnpj/v1/{CNPJ}', null, 'Consulta CNPJ sem chave'),
  ('cgu.transparencia', 'CGU', 'VERCEL_ENV', 'production', 'GET',
   'https://api.portaldatransparencia.gov.br/api-de-dados/', 'TRANSPARENCIA_API_KEY', 'Portal da Transparência'),
  ('datajud.search', 'DATAJUD', 'VERCEL_ENV', 'production', 'POST',
   'https://api-publica.datajud.cnj.jus.br/api_publica_{TRIBUNAL}/_search', 'DATAJUD_API_KEY', 'Consulta DataJud'),
  ('gemini.generate', 'GEMINI', 'VERCEL_ENV', 'production', 'POST',
   'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent', 'GEMINI_API_KEY', 'Gemini'),
  ('openrouter.chat', 'OPENROUTER', 'VERCEL_ENV', 'production', 'POST',
   'https://openrouter.ai/api/v1/chat/completions', 'OPENROUTER_API_KEY', 'OpenRouter')
on conflict (code) do update set
  service = excluded.service,
  config_location = excluded.config_location,
  environment = excluded.environment,
  method = excluded.method,
  url_template = excluded.url_template,
  secret_env_var = excluded.secret_env_var,
  description = excluded.description,
  updated_at = now();

alter table public.api_endpoint_catalog enable row level security;
revoke all on public.api_endpoint_catalog from anon, authenticated;

commit;
