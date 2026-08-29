# Diagnóstico das APIs, desempenho e plano Vercel/Neon

Data da auditoria: 28/08/2026
Versão Apps Script publicada: 2.7.0 (versão 77)

## Causas reais encontradas

1. **Endpoint incorreto para JSON.** O deployment `AKfycbxd7...` devolve HTML
   mesmo com `?action=health`. Qualquer `JSON.parse` desse conteúdo falha. A API
   do AUTENTIKO OK NUVEM é o deployment `AKfycbx-Wc...`, que devolve
   `application/json; charset=utf-8` e está publicado na versão 2.7.0.
2. **As integrações citadas não existiam no código.** Não havia cliente para
   BrasilAPI, CGU, Gemini, OpenRouter ou DataJud. Por isso não havia requisição
   ao provedor nem contagem de tokens: a chamada nunca chegava a uma IA.
3. **Emissão síncrona e serializada.** A implementação antiga adquiria um lock
   global por até 30 segundos, lia várias abas, gerava HTML/PDF, gravava dois
   arquivos no Drive, calculava hashes e atualizava Sheets na mesma chamada.
4. **Sheets como mecanismo de consulta.** Antes do índice materializado, várias
   pesquisas varriam abas completas. Mesmo com índice local, Apps Script e Drive
   mantêm latência de inicialização a frio e cotas incompatíveis com consultas
   intensivas.
5. **URLs de Web App são ambíguas.** A raiz sem `action` é a SPA HTML. JSON
   externo deve usar o endpoint certo e o contrato certo (GET de health ou POST
   JSON com ação, chave e sessão/escopo quando exigidos).

## Correções implementadas

- Índice materializado local de processos, cadastros e Drive.
- Busca Neon com filtros exatos, busca textual, GIN/trigram e cursor estável.
- Sincronização Apps Script → Vercel assinada com HMAC e idempotência.
- Motor contratual no Vercel com validação, snapshot, HTML determinístico,
  número, hash, idempotência e bloqueio de versão final não homologada.
- BrasilAPI direta por REST, sem instalação de pacote ou criação de conta.
- Consulta CEIS/CGU server-to-server com `chave-api-dados`.
- Consulta processual DataJud por tribunal e número CNJ, com chave pública
  configurável, lista fechada de tribunais e cache de uma hora.
- Gemini e OpenRouter com saída JSON controlada, timeout, erros separados e
  registro de tokens de entrada, saída e total no Neon.
- Cache de consultas externas no Neon para reduzir latência e consumo de cotas.
- Painel do Apps Script para configurar os segredos de sincronização, testar e
  carregar o índice Neon sem revelar valores ao navegador.

## Arquitetura de produção

```text
Navegador autenticado
        |
        v
Apps Script (login, permissões, Drive/Docs, interface)
        | HMAC / API privada
        v
Vercel Functions (consultas, validação, emissão, IA)
        |
        +--> Neon Postgres (índice, contratos, cache, uso de tokens)
        +--> BrasilAPI
        +--> Portal da Transparência / CGU
        +--> Gemini ou OpenRouter
```

O navegador nunca recebe `DATABASE_URL`, chaves de IA ou segredos de
sincronização. O Google Docs/Drive permanece como adaptador autorizado para o
documento editável e o PDF final; o Vercel registra primeiro o artefato e seu
hash.

## O que falta para ativar em produção

1. Criar o projeto Neon e executar
   `neon/migrations/0001_autentiko_data_cloud.sql`.
2. Criar ou vincular o projeto Vercel na pasta `media-api`.
3. Configurar as variáveis descritas em `media-api/.env.example`.
4. No Apps Script, abrir **Administração → Configurações**, informar
   `DATA_API_BASE_URL`, ativar `DATA_CLOUD_ENABLED` e salvar os dois segredos na
   aba **Segurança**.
5. Testar Neon e executar **Sincronizar Neon**.
6. Manter `AUT_CONTRACT_FINAL_ENABLED=false` até os testes jurídicos e o
   adaptador Google Docs serem homologados.

## Endpoint correto do Apps Script

```text
https://script.google.com/macros/s/AKfycbx-Wc74peh4DwB16yURN-pjsQxxKczVJYiRtD8qKE65Hw6MM23zHKXmvueyB9CBvZGz/exec
```

Health JSON:

```text
GET <endpoint>?action=health
```

O deployment `AKfycbxd7...` é uma aplicação HTML diferente e não deve ser usado
como endpoint JSON do AUTENTIKO OK NUVEM.

## Validação técnica executada

- 16 testes automatizados aprovados.
- TypeScript e build de produção Next.js aprovados.
- BrasilAPI respondeu HTTP 200 para CEP e CNPJ.
- DataJud respondeu HTTP 200 e encontrou o processo usado no exemplo oficial;
  a chamada externa levou aproximadamente 5 segundos, justificando o cache.
- Apps Script publicado como versão 77 e health JSON confirmado na versão 2.7.0.
