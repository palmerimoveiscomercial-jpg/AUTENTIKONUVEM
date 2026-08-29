# API JSON do AUTENTIKO OK NUVEM

A API é uma integração servidor-a-servidor em JSON, publicada pelo mesmo Web App do Apps Script. Ela usa chaves rotativas com hash SHA-256, escopo, expiração, limite de requisições e auditoria. Não é uma autenticação oficial do gov.br: é o login único interno do AUTENTIKO para projetos autorizados.

## Endpoint

```text
POST https://script.google.com/macros/s/DEPLOYMENT_ID/exec?api=v1
Content-Type: application/json
```

O `apiKey` deve ser enviado no corpo HTTPS (nunca em planilha, URL pública ou frontend):

```json
{
  "apiKey": "ak_live_...",
  "action": "consultar_processo",
  "protocol": "2608125249"
}
```

Também são aceitos os nomes `protocolo`, `numeroProtocolo`, `cpf`, `cnpj`, `document`, `documento` e `cpfCnpj`.

## Ações e escopos

- `health`: público; retorna somente estado, versão e horário.
- `consultar_processo`: `PROCESSO_CONSULTAR`; consulta por protocolo ou CPF/CNPJ respeitando a visibilidade do proprietário da chave.
- `validar_processo`: `PROCESSO_CONSULTAR`; informa se há uma única correspondência.
- `consultar_cadastro`: `CADASTRO_CONSULTAR`; consulta a Carta de Clientes por CPF/CNPJ validado.
- `consultar_auditoria`: `AUDITORIA_CONSULTAR`; retorna eventos resumidos e hashes, sem conteúdo de arquivos.
- `editar_processo`: `PROCESSO_EDITAR`; exige `processId`/protocolo, `expectedVersion`, `requestId` e `data`. A mesma edição não pode ser repetida.

`PROCESSO_DADOS_CONSULTAR` pode ser associado à chave para incluir o mapa cadastral completo autorizado na resposta de `consultar_processo`. Sem esse escopo, a API retorna apenas o resumo seguro.

Todas as respostas seguem:

```json
{ "ok": true, "data": {} }
```

ou:

```json
{ "ok": false, "code": "API_KEY_INVALID", "message": "..." }
```

## Gestão no painel

Usuários com `API_CHAVE_GERIR` (Desenvolvedor e Administrador) acessam **Administração → API e integrações**. A chave completa aparece somente no momento da criação. O painel permite criar com escopos, expiração e limite, bloquear, ativar e revogar. Revogação é permanente.

As chaves não são recuperáveis: guarde o valor em um cofre de segredos. A planilha armazena somente hash, prefixo e metadados. O proprietário da chave precisa permanecer ativo e continua limitado às permissões de processos do próprio perfil.

## Exemplo de edição concorrente

```json
{
  "apiKey": "ak_live_...",
  "action": "editar_processo",
  "protocol": "2608125249",
  "expectedVersion": 3,
  "requestId": "integracao-20260812-0001",
  "data": { "cliente_email": "novo@exemplo.com" }
}
```

Uma versão desatualizada retorna `PROCESS_VERSION_CONFLICT`. Nunca envie senha de usuário, token de sessão do AUTENTIKO ou conteúdo Base64 de documentos pela API.
