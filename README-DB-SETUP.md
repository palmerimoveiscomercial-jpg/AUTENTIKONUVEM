# Configuração de bancos (MySQL, MariaDB e Supabase local)

Este diretório adiciona suporte local via Docker para:
- MySQL (mysql:8)
- MariaDB (mariadb:10)
- Supabase local (imagem supabase/postgres — PostgreSQL)

O que foi adicionado
- docker-compose.yml
- .env.example (copie para .env e ajuste)
- db/init/* (scripts SQL de inicialização para cada serviço)

Instruções rápidas
1) Copiar o arquivo de ambiente e ajustar senhas:
   cp .env.example .env
   # edite .env e altere as senhas

2) Subir os serviços:
   docker compose --profile local-supabase up -d

3) Verificar status / logs:
   docker compose ps
   docker compose logs -f mysql
   docker compose logs -f mariadb
   docker compose logs -f supabase

MySQL e MariaDB são opcionais e não participam da produção do AUTENTIKO 2.2:

```bash
docker compose --profile local-mysql up -d mysql
docker compose --profile local-mariadb up -d mariadb
```

Acessando os bancos
- MySQL (cliente):
  host: localhost
  port: (ver .env) 3306 por padrão
  user: app
  password: ${MYSQL_PASSWORD}
  database: app_db

  Exemplo:
    mysql -h 127.0.0.1 -P 3306 -u app -p

- MariaDB (cliente):
  host: localhost
  port: 3307 (mapeado)
  user: app
  password: ${MARIADB_PASSWORD}
  database: app_db

  Exemplo:
    mysql -h 127.0.0.1 -P 3307 -u app -p

- Supabase / Postgres (psql):
  host: localhost
  port: 5432
  user: postgres
  password: (ver SUPABASE_POSTGRES_PASSWORD)
  database: supabase_db

  Exemplo:
    PGPASSWORD=$SUPABASE_POSTGRES_PASSWORD psql -h 127.0.0.1 -p 5432 -U postgres -d supabase_db

Observações importantes
- Supabase é um conjunto de ferramentas sobre Postgres. Aqui estamos apenas inicializando uma instância Postgres compatível usada pela stack Supabase local.
- Os diretórios db/init/* contêm scripts que serão executados na inicialização dos containers (pelo entrypoint das imagens). Ajuste conforme necessário.
- Não use as senhas do .env.example em produção. Troque por valores fortes.

Parar e remover dados
  docker compose down
  # para remover volumes locais (dados):
  docker compose down -v

Problemas comuns
- Porta 3306/5432 ocupada: altere as variáveis em .env antes de subir.
- Permissões em scripts init: os arquivos em db/init devem ser legíveis pelo Docker (mode 644 normalmente).

Se quiser, posso:
- Adicionar migrations iniciais mais específicas (ex.: tabelas de usuários, roles).
- Configurar o supabase CLI e um serviço adicional para o REST/Realtime do Supabase.
