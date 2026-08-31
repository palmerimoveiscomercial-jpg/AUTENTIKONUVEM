/*
 * Cofre administrativo de integrações do AUTENTIKO OK NUVEM.
 *
 * Segredos são aceitos pelo formulário administrativo, validados no servidor
 * e persistidos exclusivamente em Script Properties. A tela recebe somente
 * indicadores booleanos; nenhum valor secreto salvo volta ao navegador.
 */

function autIntegrationCatalog_() {
  return [
    {
      id: 'BACKEND', badge: 'NV', name: 'API AUTENTIKO · Vercel + Neon',
      description: 'Ponte principal entre o Apps Script, as APIs publicadas no Vercel e o banco operacional Neon.',
      help: 'A conexão direta do Postgres permanece somente no Vercel. Aqui entram a URL pública e os segredos compartilhados com o backend.',
      fields: [
        { key: 'baseUrl', label: 'URL pública do backend', type: 'url', required: true, property: 'AUT_INT_BACKEND_BASE_URL', configKey: 'DATA_API_BASE_URL', defaultValue: 'https://autentikonuvem-zeta.vercel.app', maxLength: 1000 },
        { key: 'apiKey', label: 'Chave privada da API', type: 'password', secret: true, required: true, property: 'AUT_DATA_API_KEY', minLength: 32, maxLength: 256 },
        { key: 'syncSecret', label: 'Segredo de sincronização', type: 'password', secret: true, required: true, property: 'AUT_DATA_SYNC_SECRET', minLength: 32, maxLength: 256 },
        { key: 'mediaSigningSecret', label: 'Chave de assinatura da mídia', type: 'password', secret: true, required: true, property: 'AUT_MEDIA_SIGNING_SECRET', minLength: 64, maxLength: 256, pattern: '^[A-Za-z0-9_-]+$' }
      ]
    },
    {
      id: 'CLOUDINARY', badge: 'CL', name: 'Cloudinary · imagens e miniaturas',
      description: 'Banco operacional de imagens, CDN, miniaturas e transformações com entrega autenticada.',
      help: 'O cloud name já está definido como llbdih6f. O API Secret permanece protegido no servidor.',
      fields: [
        { key: 'apiBaseUrl', label: 'URL da API Cloudinary', type: 'url', required: true, property: 'AUT_INT_CLOUDINARY_API_URL', defaultValue: 'https://api.cloudinary.com', maxLength: 1000 },
        { key: 'cloudName', label: 'Cloud name', type: 'text', required: true, property: 'AUT_INT_CLOUDINARY_CLOUD_NAME', configKey: 'CLOUDINARY_CLOUD_NAME', defaultValue: 'llbdih6f', minLength: 2, maxLength: 120, pattern: '^[A-Za-z0-9_-]+$' },
        { key: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true, property: 'AUT_INT_CLOUDINARY_API_KEY', minLength: 3, maxLength: 256 },
        { key: 'apiSecret', label: 'API Secret', type: 'password', secret: true, required: true, property: 'AUT_INT_CLOUDINARY_API_SECRET', minLength: 20, maxLength: 512 },
        { key: 'folderMode', label: 'Modo de pastas', type: 'select', required: true, property: 'AUT_INT_CLOUDINARY_FOLDER_MODE', configKey: 'CLOUDINARY_FOLDER_MODE', defaultValue: 'DYNAMIC_FOLDERS', options: [
          { value: 'DYNAMIC_FOLDERS', label: 'Dynamic folders' },
          { value: 'FIXED_FOLDERS', label: 'Fixed folders' }
        ] }
      ]
    },
    {
      id: 'SUPABASE', badge: 'SB', name: 'Supabase · réplica e Storage',
      description: 'Réplica operacional, funções RPC e armazenamento auxiliar de originais, prévias e miniaturas.',
      help: 'Use a Project URL e uma chave secreta de servidor. A chave nunca é devolvida à interface.',
      fields: [
        { key: 'projectUrl', label: 'Project URL', type: 'url', required: true, property: 'AUT_INT_SUPABASE_URL', maxLength: 1000 },
        { key: 'storageUrl', label: 'Storage URL (opcional)', type: 'url', required: false, property: 'AUT_INT_SUPABASE_STORAGE_URL', maxLength: 1000 },
        { key: 'serviceRoleKey', label: 'Secret / service role key', type: 'password', secret: true, required: true, property: 'AUT_INT_SUPABASE_SERVICE_ROLE_KEY', minLength: 20, maxLength: 2000 }
      ]
    },
    {
      id: 'GOOGLE', badge: 'GO', name: 'Google Drive + Google Sheets',
      description: 'Backup dos arquivos originais no Drive e espelho administrativo da base no Google Sheets.',
      help: 'Compartilhe a planilha e a pasta com o client_email existente no JSON da conta de serviço.',
      fields: [
        { key: 'serviceAccountJson', label: 'JSON da conta de serviço', type: 'textarea', secret: true, required: true, property: 'AUT_INT_GOOGLE_SERVICE_ACCOUNT_JSON', minLength: 100, maxLength: 8500, json: true },
        { key: 'spreadsheetId', label: 'ID da planilha AUTENTIKO', type: 'text', required: true, property: 'AUT_INT_GOOGLE_SPREADSHEET_ID', minLength: 10, maxLength: 300, pattern: '^[A-Za-z0-9_-]+$' },
        { key: 'driveFolderId', label: 'ID da pasta de backup no Drive', type: 'text', required: true, property: 'AUT_INT_GOOGLE_DRIVE_FOLDER_ID', minLength: 10, maxLength: 300, pattern: '^[A-Za-z0-9_-]+$' }
      ]
    },
    {
      id: 'TRANSPARENCIA', badge: 'CG', name: 'Portal da Transparência · CGU',
      description: 'Consulta controlada de sanções e dados públicos pela API oficial do Portal da Transparência.',
      help: 'Informe o token recebido após o cadastro no Portal da Transparência.',
      fields: [
        { key: 'baseUrl', label: 'URL base da API', type: 'url', required: true, property: 'AUT_INT_TRANSPARENCIA_URL', defaultValue: 'https://api.portaldatransparencia.gov.br/api-de-dados', maxLength: 1000 },
        { key: 'apiKey', label: 'Chave da API', type: 'password', secret: true, required: true, property: 'AUT_INT_TRANSPARENCIA_API_KEY', minLength: 8, maxLength: 1000 }
      ]
    },
    {
      id: 'DATAJUD', badge: 'DJ', name: 'DataJud · CNJ',
      description: 'Consulta de metadados públicos de processos judiciais por tribunal na API Pública do DataJud.',
      help: 'A chave pública do CNJ pode mudar. Salve a chave vigente exibida na documentação oficial.',
      fields: [
        { key: 'baseUrl', label: 'URL base da API', type: 'url', required: true, property: 'AUT_INT_DATAJUD_URL', defaultValue: 'https://api-publica.datajud.cnj.jus.br', maxLength: 1000 },
        { key: 'apiKey', label: 'API Key vigente', type: 'password', secret: true, required: true, property: 'AUT_INT_DATAJUD_API_KEY', minLength: 20, maxLength: 2000 },
        { key: 'tribunal', label: 'Tribunal usado no teste', type: 'text', required: true, property: 'AUT_INT_DATAJUD_TRIBUNAL', defaultValue: 'tjpa', minLength: 2, maxLength: 30, pattern: '^[A-Za-z0-9-]+$' }
      ]
    },
    {
      id: 'GEMINI', badge: 'GM', name: 'Google Gemini',
      description: 'Análise assistida de coerência, lacunas e divergências nos dados contratuais.',
      help: 'O teste verifica a chave e a disponibilidade do modelo sem enviar dados de clientes.',
      fields: [
        { key: 'baseUrl', label: 'URL base da Gemini API', type: 'url', required: true, property: 'AUT_INT_GEMINI_URL', defaultValue: 'https://generativelanguage.googleapis.com/v1beta', maxLength: 1000 },
        { key: 'apiKey', label: 'Gemini API Key', type: 'password', secret: true, required: true, property: 'AUT_INT_GEMINI_API_KEY', minLength: 20, maxLength: 1000 },
        { key: 'model', label: 'Modelo', type: 'text', required: true, property: 'AUT_INT_GEMINI_MODEL', defaultValue: 'gemini-flash-latest', minLength: 3, maxLength: 160 }
      ]
    },
    {
      id: 'OPENROUTER', badge: 'OR', name: 'OpenRouter',
      description: 'Provedor alternativo de IA com seleção de modelo e fallback controlado.',
      help: 'O teste consulta apenas o estado da chave; não consome uma análise de contrato.',
      fields: [
        { key: 'baseUrl', label: 'URL base da API', type: 'url', required: true, property: 'AUT_INT_OPENROUTER_URL', defaultValue: 'https://openrouter.ai/api/v1', maxLength: 1000 },
        { key: 'apiKey', label: 'OpenRouter API Key', type: 'password', secret: true, required: true, property: 'AUT_INT_OPENROUTER_API_KEY', minLength: 20, maxLength: 1000 },
        { key: 'model', label: 'Modelo principal', type: 'text', required: true, property: 'AUT_INT_OPENROUTER_MODEL', defaultValue: 'openrouter/free', minLength: 3, maxLength: 200 },
        { key: 'publicUrl', label: 'URL pública do AUTENTIKO', type: 'url', required: true, property: 'AUT_INT_OPENROUTER_PUBLIC_URL', defaultValue: 'https://autentikonuvem-zeta.vercel.app', maxLength: 1000 }
      ]
    },
    {
      id: 'ADOBE', badge: 'AD', name: 'Adobe PDF Services',
      description: 'Compressão, processamento e tratamento avançado dos PDFs gerados ou anexados.',
      help: 'O teste solicita um token Adobe e não envia documentos.',
      fields: [
        { key: 'tokenUrl', label: 'URL de autenticação', type: 'url', required: true, property: 'AUT_INT_ADOBE_TOKEN_URL', defaultValue: 'https://pdf-services.adobe.io/token', maxLength: 1000 },
        { key: 'clientId', label: 'Client ID', type: 'text', required: true, property: 'AUT_INT_ADOBE_CLIENT_ID', minLength: 3, maxLength: 1000 },
        { key: 'clientSecret', label: 'Client Secret', type: 'password', secret: true, required: true, property: 'AUT_INT_ADOBE_CLIENT_SECRET', minLength: 20, maxLength: 2000 },
        { key: 'webhookSecret', label: 'Webhook Secret (opcional)', type: 'password', secret: true, required: false, property: 'AUT_INT_ADOBE_WEBHOOK_SECRET', minLength: 32, maxLength: 256 },
        { key: 'monthlyLimit', label: 'Limite mensal', type: 'number', required: true, property: 'AUT_INT_ADOBE_MONTHLY_LIMIT', defaultValue: '500', min: 1, max: 100000 }
      ]
    },
    {
      id: 'GITHUB', badge: 'GH', name: 'GitHub · código e automações',
      description: 'Repositório do backend, histórico de versões e rotinas automatizadas de sincronização.',
      help: 'Para repositório público o token é opcional. Em repositório privado, use um token de escopo mínimo e somente leitura para o teste.',
      fields: [
        { key: 'apiUrl', label: 'URL da API GitHub', type: 'url', required: true, property: 'AUT_INT_GITHUB_API_URL', defaultValue: 'https://api.github.com', maxLength: 1000 },
        { key: 'repository', label: 'Repositório (dono/nome)', type: 'text', required: true, property: 'AUT_INT_GITHUB_REPOSITORY', defaultValue: 'palmerimoveiscomercial-jpg/AUTENTIKONUVEM', minLength: 3, maxLength: 300, pattern: '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' },
        { key: 'token', label: 'Token de acesso (opcional)', type: 'password', secret: true, required: false, property: 'AUT_INT_GITHUB_TOKEN', minLength: 20, maxLength: 1000 }
      ]
    },
    {
      id: 'BRASILAPI', badge: 'BR', name: 'BrasilAPI · CEP e CNPJ',
      description: 'Autopreenchimento de CEP e consulta pública de CNPJ sem necessidade de chave privada.',
      help: 'Esta integração não exige chave. O teste consulta apenas um CEP público de referência.',
      fields: [
        { key: 'baseUrl', label: 'URL base da BrasilAPI', type: 'url', required: true, property: 'AUT_INT_BRASILAPI_URL', defaultValue: 'https://brasilapi.com.br', maxLength: 1000 }
      ]
    }
  ];
}

function autIntegrationRequireAdmin_(token) {
  var actor = autRequireAuth_(token);
  autAssert_(autHasPermission_(actor, 'API_CHAVE_GERIR') || actor.PERFIL === 'DESENVOLVEDOR',
    'Você não possui permissão para gerenciar integrações.', 'FORBIDDEN');
  return actor;
}

function autIntegrationFind_(id) {
  var safeId = autNormalize_(id);
  var integration = autIntegrationCatalog_().filter(function(item) { return item.id === safeId; })[0];
  autAssert_(integration, 'Integração não encontrada.', 'NOT_FOUND');
  return integration;
}

function autIntegrationStateKey_(id, suffix) {
  return 'AUT_INT_' + autNormalize_(id).replace(/[^A-Z0-9_]/g, '') + '_' + suffix;
}

function autIntegrationStoredValue_(integration, field) {
  var properties = PropertiesService.getScriptProperties();
  var stored = properties.getProperty(field.property);
  if (stored != null && String(stored) !== '') return String(stored);
  if (field.configKey) {
    var configValue = autConfigMap_()[field.configKey];
    if (configValue != null && String(configValue) !== '') return String(configValue);
  }
  return String(field.defaultValue == null ? '' : field.defaultValue);
}

function autIntegrationResolvedValues_(integration, overrides) {
  var values = {};
  overrides = overrides || {};
  integration.fields.forEach(function(field) {
    var supplied = Object.prototype.hasOwnProperty.call(overrides, field.key) ? overrides[field.key] : null;
    var text = supplied == null ? '' : String(supplied).trim();
    values[field.key] = text || autIntegrationStoredValue_(integration, field);
  });
  return values;
}

function autIntegrationNormalizeField_(field, rawValue) {
  var value = String(rawValue == null ? '' : rawValue).trim();
  if (!value) {
    autAssert_(!field.required, 'Preencha o campo “' + field.label + '”.', 'INTEGRATION_CONFIG_REQUIRED');
    return '';
  }
  if (field.type === 'url') {
    autAssert_(/^https:\/\/[^\s]+$/i.test(value), 'Informe uma URL HTTPS válida em “' + field.label + '”.', 'INTEGRATION_CONFIG_REQUIRED');
    value = value.replace(/\/+$/, '');
  }
  if (field.type === 'number') {
    var number = Number(value);
    autAssert_(isFinite(number) && number >= Number(field.min || 0) && number <= Number(field.max || Number.MAX_SAFE_INTEGER),
      'Informe um número válido em “' + field.label + '”.', 'INTEGRATION_CONFIG_REQUIRED');
    value = String(number);
  }
  if (field.options) {
    autAssert_(field.options.some(function(option) { return option.value === value; }),
      'Selecione uma opção válida em “' + field.label + '”.', 'INTEGRATION_CONFIG_REQUIRED');
  }
  if (field.minLength) autAssert_(value.length >= field.minLength,
    'O campo “' + field.label + '” deve possuir ao menos ' + field.minLength + ' caracteres.', 'INTEGRATION_CONFIG_REQUIRED');
  if (field.maxLength) autAssert_(value.length <= field.maxLength,
    'O campo “' + field.label + '” ultrapassa o limite permitido.', 'FIELD_TOO_LARGE');
  if (field.pattern) autAssert_(new RegExp(field.pattern).test(value),
    'O formato de “' + field.label + '” é inválido.', 'INTEGRATION_CONFIG_REQUIRED');
  if (field.json) {
    var parsed = autJsonParse_(value, null);
    autAssert_(parsed && typeof parsed === 'object' && !Array.isArray(parsed),
      'O campo “' + field.label + '” deve conter um JSON válido.', 'INVALID_JSON');
    value = JSON.stringify(parsed);
  }
  return value;
}

function autIntegrationValidateRequired_(integration, values) {
  integration.fields.forEach(function(field) {
    if (field.required) autIntegrationNormalizeField_(field, values[field.key]);
  });
}

function autIntegrationAdminItem_(integration) {
  var properties = PropertiesService.getScriptProperties();
  var required = integration.fields.filter(function(field) { return field.required; });
  var configuredRequired = required.filter(function(field) {
    return !!String(autIntegrationStoredValue_(integration, field) || '').trim();
  }).length;
  var lastTestOk = properties.getProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_OK')) === 'SIM';
  return {
    id: integration.id,
    badge: integration.badge,
    name: integration.name,
    description: integration.description,
    help: integration.help,
    enabled: properties.getProperty(autIntegrationStateKey_(integration.id, 'ENABLED')) === 'SIM',
    configured: configuredRequired === required.length,
    configuredRequired: configuredRequired,
    requiredCount: required.length,
    lastTest: {
      ok: lastTestOk,
      at: properties.getProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_AT')) || '',
      message: properties.getProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_MESSAGE')) || ''
    },
    fields: integration.fields.map(function(field) {
      var value = autIntegrationStoredValue_(integration, field);
      return {
        key: field.key,
        label: field.label,
        type: field.type,
        required: !!field.required,
        secret: !!field.secret,
        configured: !!String(value || '').trim(),
        value: field.secret ? '' : value,
        minLength: Number(field.minLength || 0),
        maxLength: Number(field.maxLength || 5000),
        min: field.min == null ? null : Number(field.min),
        max: field.max == null ? null : Number(field.max),
        options: field.options || []
      };
    })
  };
}

function autIntegrationsAdminData_() {
  return {
    version: '1.0.0',
    items: autIntegrationCatalog_().map(autIntegrationAdminItem_)
  };
}

function autIntegrationUpdateConfig_(key, value, actorName) {
  var row = autFind_('CONFIGURACOES', 'CHAVE', key);
  if (!row) return;
  autUpdateRow_('CONFIGURACOES', row._row, {
    VALOR: value,
    ATUALIZADO_EM: autNow_(),
    ATUALIZADO_POR: actorName || 'INTEGRACOES'
  });
}

function autIntegrationMirrorValues_(integration, values, actorName) {
  if (integration.id === 'BACKEND' && values.baseUrl) {
    autIntegrationUpdateConfig_('DATA_API_BASE_URL', values.baseUrl, actorName);
    autIntegrationUpdateConfig_('MEDIA_API_BASE_URL', values.baseUrl, actorName);
  }
  if (integration.id === 'CLOUDINARY') {
    if (values.cloudName) autIntegrationUpdateConfig_('CLOUDINARY_CLOUD_NAME', values.cloudName, actorName);
    if (values.folderMode) autIntegrationUpdateConfig_('CLOUDINARY_FOLDER_MODE', values.folderMode, actorName);
  }
  if (integration.id === 'GOOGLE' && values.driveFolderId) {
    PropertiesService.getScriptProperties().setProperty('AUT_DOCUMENTS_FOLDER_ID', values.driveFolderId);
  }
  autInvalidateCaches_();
}

function autIntegrationMirrorActivation_(integration, enabled, actorName) {
  var value = enabled ? 'SIM' : 'NAO';
  if (integration.id === 'BACKEND') {
    autIntegrationUpdateConfig_('DATA_CLOUD_ENABLED', value, actorName);
    autIntegrationUpdateConfig_('REMOTE_BACKEND_ENABLED', value, actorName);
  }
  if (integration.id === 'CLOUDINARY') {
    autIntegrationUpdateConfig_('CLOUDINARY_ENABLED', value, actorName);
    autIntegrationUpdateConfig_('MEDIA_CLOUD_ENABLED', value, actorName);
    if (enabled) autIntegrationUpdateConfig_('MEDIA_PROVIDER', 'CLOUDINARY', actorName);
  }
  autInvalidateCaches_();
}

function apiAdminSalvarIntegracao(token, integrationId, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autIntegrationRequireAdmin_(token);
    var integration = autIntegrationFind_(integrationId);
    payload = payload || {};
    lock.waitLock(30000);
    var properties = PropertiesService.getScriptProperties();
    var changed = [];
    var savedValues = {};
    integration.fields.forEach(function(field) {
      if (!Object.prototype.hasOwnProperty.call(payload, field.key)) return;
      var raw = String(payload[field.key] == null ? '' : payload[field.key]).trim();
      if (field.secret && !raw) return;
      if (!field.secret && !raw && !field.required) {
        properties.deleteProperty(field.property);
        changed.push(field.key);
        savedValues[field.key] = '';
        return;
      }
      var value = autIntegrationNormalizeField_(field, raw);
      properties.setProperty(field.property, value);
      changed.push(field.key);
      savedValues[field.key] = value;
    });
    autAssert_(changed.length, 'Nenhum campo foi informado para atualização.', 'VALIDATION_ERROR');
    var resolved = autIntegrationResolvedValues_(integration, savedValues);
    autIntegrationValidateRequired_(integration, resolved);
    autIntegrationMirrorValues_(integration, resolved, actor.NOME);
    properties.deleteProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_OK'));
    properties.deleteProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_AT'));
    properties.deleteProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_MESSAGE'));
    var disabledForRetest = properties.getProperty(autIntegrationStateKey_(integration.id, 'ENABLED')) === 'SIM';
    if (disabledForRetest) {
      properties.setProperty(autIntegrationStateKey_(integration.id, 'ENABLED'), 'NAO');
      autIntegrationMirrorActivation_(integration, false, actor.NOME);
    }
    autAudit_(actor, 'INTEGRACAO_CONFIGURADA', 'INTEGRACAO', integration.id, {
      camposAtualizados: changed,
      segredoExposto: false,
      desativadaParaNovoTeste: disabledForRetest
    }, context || {});
    return autResult_({ item: autIntegrationAdminItem_(integration), disabledForRetest: disabledForRetest });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autIntegrationResponseJson_(response) {
  return autJsonParse_(String(response.getContentText() || ''), null);
}

function autIntegrationFetch_(url, options, label) {
  options = options || {};
  options.muteHttpExceptions = true;
  options.followRedirects = false;
  var response = UrlFetchApp.fetch(url, options);
  var status = Number(response.getResponseCode() || 0);
  if (status < 200 || status >= 300) {
    var error = new Error((label || 'A integração') + ' respondeu com HTTP ' + status + '.');
    error.httpStatus = status;
    throw error;
  }
  return { response: response, status: status, json: autIntegrationResponseJson_(response) };
}

function autIntegrationBase64Url_(value) {
  return Utilities.base64EncodeWebSafe(value).replace(/=+$/g, '');
}

function autIntegrationGoogleToken_(credentialText) {
  var credentials = autJsonParse_(credentialText, null);
  autAssert_(credentials && credentials.client_email && credentials.private_key,
    'O JSON Google não contém client_email e private_key.', 'INTEGRATION_CONFIG_REQUIRED');
  var tokenUrl = String(credentials.token_uri || 'https://oauth2.googleapis.com/token');
  autAssert_(/^https:\/\/[^\s]+$/i.test(tokenUrl), 'A URL de autenticação Google é inválida.', 'INTEGRATION_CONFIG_REQUIRED');
  var now = Math.floor(Date.now() / 1000);
  var header = autIntegrationBase64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim = autIntegrationBase64Url_(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: tokenUrl,
    iat: now,
    exp: now + 3600
  }));
  var unsigned = header + '.' + claim;
  var signature = Utilities.computeRsaSha256Signature(unsigned, credentials.private_key);
  var assertion = unsigned + '.' + autIntegrationBase64Url_(signature);
  var response = autIntegrationFetch_(tokenUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(assertion)
  }, 'Google OAuth');
  autAssert_(response.json && response.json.access_token, 'O Google não devolveu um token de acesso.', 'INTEGRATION_TEST_FAILED');
  return String(response.json.access_token);
}

function autIntegrationRunTest_(integration, values) {
  var result;
  if (integration.id === 'BACKEND') {
    result = autIntegrationFetch_(values.baseUrl + '/api/health?deep=1', {
      method: 'get', headers: { 'Cache-Control': 'no-store' }
    }, 'API AUTENTIKO');
    autAssert_(result.json && result.json.ok, 'A API AUTENTIKO não confirmou a própria saúde.', 'INTEGRATION_TEST_FAILED');
    var search = autIntegrationFetch_(values.baseUrl + '/api/v1/search?limit=1&q=autentiko_connection_test', {
      method: 'get', headers: { Authorization: 'Bearer ' + values.apiKey, 'Cache-Control': 'no-store' }
    }, 'API AUTENTIKO autenticada');
    autAssert_(search.json && search.json.ok, 'A chave da API AUTENTIKO não foi aceita.', 'INTEGRATION_TEST_FAILED');
    return { success: true, httpStatus: search.status, message: 'Vercel, chave privada e consulta Neon responderam corretamente.' };
  }
  if (integration.id === 'CLOUDINARY') {
    result = autIntegrationFetch_(values.apiBaseUrl + '/v1_1/' + encodeURIComponent(values.cloudName) + '/ping', {
      method: 'get', headers: { Authorization: 'Basic ' + Utilities.base64Encode(values.apiKey + ':' + values.apiSecret) }
    }, 'Cloudinary');
    autAssert_(result.json && result.json.status === 'ok', 'O Cloudinary não confirmou o ambiente.', 'INTEGRATION_TEST_FAILED');
    return { success: true, httpStatus: result.status, message: 'Cloudinary autenticado no ambiente ' + values.cloudName + '.' };
  }
  if (integration.id === 'SUPABASE') {
    result = autIntegrationFetch_(values.projectUrl + '/auth/v1/settings', {
      method: 'get', headers: { apikey: values.serviceRoleKey, Authorization: 'Bearer ' + values.serviceRoleKey }
    }, 'Supabase');
    return { success: true, httpStatus: result.status, message: 'Project URL e chave de servidor Supabase foram aceitas.' };
  }
  if (integration.id === 'GOOGLE') {
    var accessToken = autIntegrationGoogleToken_(values.serviceAccountJson);
    var headers = { Authorization: 'Bearer ' + accessToken };
    autIntegrationFetch_('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(values.spreadsheetId) + '?fields=spreadsheetId,properties.title', {
      method: 'get', headers: headers
    }, 'Google Sheets');
    result = autIntegrationFetch_('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(values.driveFolderId) + '?fields=id,name,mimeType,trashed&supportsAllDrives=true', {
      method: 'get', headers: headers
    }, 'Google Drive');
    return { success: true, httpStatus: result.status, message: 'Conta de serviço acessou a planilha e a pasta de backup.' };
  }
  if (integration.id === 'TRANSPARENCIA') {
    result = autIntegrationFetch_(values.baseUrl + '/orgaos-siafi?pagina=1', {
      method: 'get', headers: { 'chave-api-dados': values.apiKey }
    }, 'Portal da Transparência');
    return { success: true, httpStatus: result.status, message: 'Token do Portal da Transparência aceito.' };
  }
  if (integration.id === 'DATAJUD') {
    result = autIntegrationFetch_(values.baseUrl + '/api_publica_' + encodeURIComponent(values.tribunal.toLowerCase()) + '/_search', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'APIKey ' + values.apiKey },
      payload: JSON.stringify({ size: 0, query: { match_all: {} } })
    }, 'DataJud');
    return { success: true, httpStatus: result.status, message: 'Chave DataJud aceita pelo índice ' + values.tribunal.toLowerCase() + '.' };
  }
  if (integration.id === 'GEMINI') {
    result = autIntegrationFetch_(values.baseUrl + '/models/' + encodeURIComponent(values.model), {
      method: 'get', headers: { 'X-Goog-Api-Key': values.apiKey }
    }, 'Gemini');
    return { success: true, httpStatus: result.status, message: 'Gemini autenticado e modelo ' + values.model + ' disponível.' };
  }
  if (integration.id === 'OPENROUTER') {
    result = autIntegrationFetch_(values.baseUrl + '/key', {
      method: 'get', headers: { Authorization: 'Bearer ' + values.apiKey, 'HTTP-Referer': values.publicUrl }
    }, 'OpenRouter');
    return { success: true, httpStatus: result.status, message: 'Chave OpenRouter autenticada; modelo configurado: ' + values.model + '.' };
  }
  if (integration.id === 'ADOBE') {
    result = autIntegrationFetch_(values.tokenUrl, {
      method: 'post', contentType: 'application/x-www-form-urlencoded',
      payload: 'client_id=' + encodeURIComponent(values.clientId) + '&client_secret=' + encodeURIComponent(values.clientSecret)
    }, 'Adobe PDF Services');
    autAssert_(result.json && result.json.access_token, 'A Adobe não devolveu um token de acesso.', 'INTEGRATION_TEST_FAILED');
    return { success: true, httpStatus: result.status, message: 'Credenciais Adobe PDF Services autenticadas.' };
  }
  if (integration.id === 'GITHUB') {
    var githubHeaders = { Accept: 'application/vnd.github+json', 'User-Agent': 'AUTENTIKO-OK-NUVEM' };
    if (values.token) githubHeaders.Authorization = 'Bearer ' + values.token;
    result = autIntegrationFetch_(values.apiUrl + '/repos/' + values.repository, {
      method: 'get', headers: githubHeaders
    }, 'GitHub');
    return { success: true, httpStatus: result.status, message: 'Repositório GitHub localizado e acessível.' };
  }
  if (integration.id === 'BRASILAPI') {
    result = autIntegrationFetch_(values.baseUrl + '/api/cep/v2/01001000', { method: 'get' }, 'BrasilAPI');
    return { success: true, httpStatus: result.status, message: 'BrasilAPI respondeu à consulta pública de CEP.' };
  }
  autAssert_(false, 'Esta integração ainda não possui teste configurado.', 'NOT_FOUND');
}

function apiAdminTestarIntegracao(token, integrationId, payload, context) {
  var started = Date.now();
  try {
    var actor = autIntegrationRequireAdmin_(token);
    var integration = autIntegrationFind_(integrationId);
    var values = autIntegrationResolvedValues_(integration, payload || {});
    autIntegrationValidateRequired_(integration, values);
    var testResult;
    try {
      testResult = autIntegrationRunTest_(integration, values);
    } catch (testError) {
      testResult = {
        success: false,
        httpStatus: Number(testError && testError.httpStatus || 0),
        message: String(testError && testError.message || 'A integração não respondeu corretamente.').slice(0, 300)
      };
    }
    testResult.latencyMs = Date.now() - started;
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_OK'), testResult.success ? 'SIM' : 'NAO');
    properties.setProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_AT'), autNow_());
    properties.setProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_MESSAGE'), testResult.message.slice(0, 300));
    autAudit_(actor, 'INTEGRACAO_TESTADA', 'INTEGRACAO', integration.id, {
      sucesso: testResult.success,
      httpStatus: testResult.httpStatus,
      latenciaMs: testResult.latencyMs,
      segredoExposto: false
    }, context || {});
    return autResult_(testResult);
  } catch (err) { return autPublicError_(err); }
}

function apiAdminAlternarIntegracao(token, integrationId, enabled, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autIntegrationRequireAdmin_(token);
    var integration = autIntegrationFind_(integrationId);
    var shouldEnable = enabled === true;
    lock.waitLock(30000);
    var properties = PropertiesService.getScriptProperties();
    if (shouldEnable) {
      var values = autIntegrationResolvedValues_(integration, {});
      autIntegrationValidateRequired_(integration, values);
      autAssert_(properties.getProperty(autIntegrationStateKey_(integration.id, 'LAST_TEST_OK')) === 'SIM',
        'Teste a integração com sucesso antes de ativá-la.', 'INTEGRATION_TEST_REQUIRED');
    }
    properties.setProperty(autIntegrationStateKey_(integration.id, 'ENABLED'), shouldEnable ? 'SIM' : 'NAO');
    autIntegrationMirrorActivation_(integration, shouldEnable, actor.NOME);
    autAudit_(actor, shouldEnable ? 'INTEGRACAO_ATIVADA' : 'INTEGRACAO_DESATIVADA', 'INTEGRACAO', integration.id, {
      ativa: shouldEnable,
      segredoExposto: false
    }, context || {});
    return autResult_({ item: autIntegrationAdminItem_(integration) });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}
