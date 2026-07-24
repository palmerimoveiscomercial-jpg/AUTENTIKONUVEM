-- Exemplo de inicialização para Supabase (Postgres)
-- Cria tabela simples de exemplo

\connect supabase_db

CREATE TABLE IF NOT EXISTS users_supabase (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

INSERT INTO users_supabase (email, name) VALUES ('user@example.com', 'Usuário Supabase')
ON CONFLICT (email) DO NOTHING;
