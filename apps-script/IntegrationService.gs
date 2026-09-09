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
        { key: 'model', label: 'Modelo geral', type: 'text', required: true, property: 'AUT_INT_GEMINI_MODEL', defaultValue: 'gemini-flash-latest', minLength: 3, maxLength: 160 },
        { key: 'visionModel', label: 'Modelo rápido para documentos/imagens', type: 'text', required: true, property: 'AUT_INT_GEMINI_VISION_MODEL', defaultValue: 'gemini-3.5-flash-lite', minLength: 3, maxLength: 160 }
      ]
    },
    {
      id: 'OPENROUTER', badge: 'OR', name: 'OpenRouter',
      description: 'Provedor alternativo de IA com seleção de modelo e fallback controlado.',
      help: 'O teste consulta apenas o estado da chave; não consome uma análise de contrato.',
      fields: [
        { key: 'baseUrl', label: 'URL base da API', type: 'url', required: true, property: 'AUT_INT_OPENROUTER_URL', defaultValue: 'https://openrouter.ai/api/v1', maxLength: 1000 },
        { key: 'apiKey', label: 'OpenRouter API Key', type: 'password', secret: true, required: true, property: 'AUT_INT_OPENROUTER_API_KEY', minLength: 20, maxLength: 1000 },
        { key: 'model', label: 'Modelo geral', type: 'text', required: true, property: 'AUT_INT_OPENROUTER_MODEL', defaultValue: 'openrouter/free', minLength: 3, maxLength: 200 },
        { key: 'visionModel', label: 'Modelo preferido para documentos/imagens', type: 'text', required: true, property: 'AUT_INT_OPENROUTER_VISION_MODEL', defaultValue: 'openrouter/free', minLength: 3, maxLength: 200 },
        { key: 'visionPolicy', label: 'Política de roteamento documental', type: 'select', required: true, property: 'AUT_INT_OPENROUTER_VISION_POLICY', defaultValue: 'ZDR_FREE_ONLY', options: [
          { value: 'ZDR_FREE_ONLY', label: 'ZDR obrigatório · somente modelos gratuitos' },
          { value: 'ZDR_ANY', label: 'ZDR obrigatório · permite modelo pago compatível' },
          { value: 'ACCOUNT_POLICY', label: 'Usar política definida na conta OpenRouter' }
        ] },
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
  var text = String(response.getContentText() || '');
  var json = autJsonParse_(text, null);
  if (status < 200 || status >= 300) {
    var providerMessage = json && json.error && (json.error.message || json.error.code) || json && json.message || '';
    var message = (label || 'A integração') + ' respondeu com HTTP ' + status + '.' + (providerMessage ? ' ' + String(providerMessage).slice(0, 220) : '');
    var error = new Error(message);
    error.httpStatus = status;
    error.responseExcerpt = text.slice(0, 600);
    throw error;
  }
  return { response: response, status: status, json: json };
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
    var geminiResolved = autAiGeminiResolveVisionModel_(values, { verify: true, persist: true });
    return {
      success: true,
      httpStatus: geminiResolved.httpStatus || 200,
      message: 'Gemini autenticado; modelo documental ' + geminiResolved.model + ' disponível' + (geminiResolved.migrated ? ' (configuração migrada automaticamente).' : '.')
    };
  }
  if (integration.id === 'OPENROUTER') {
    result = autIntegrationFetch_(values.baseUrl + '/key', {
      method: 'get', headers: { Authorization: 'Bearer ' + values.apiKey, 'HTTP-Referer': values.publicUrl }
    }, 'OpenRouter');
    var candidates = autAiOpenRouterDiscoverCandidates_(values);
    return {
      success: true,
      httpStatus: result.status,
      message: 'OpenRouter autenticado. Rota documental disponível (' + autAiOpenRouterPolicy_(values) + '): ' + candidates.slice(0, 3).join(', ') + '.'
    };
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
      var testMessage = String(testError && testError.message || 'A integração não respondeu corretamente.');
      var authorizationRequired = testMessage.indexOf('script.external_request') >= 0 ||
        testMessage.indexOf('UrlFetchApp.fetch') >= 0;
      testResult = {
        success: false,
        httpStatus: Number(testError && testError.httpStatus || 0),
        authorizationRequired: authorizationRequired,
        message: (authorizationRequired
          ? 'Autorização externa pendente. No editor do Apps Script, execute AUTENTIKO_AUTORIZAR_INTEGRACOES com a conta que publicou o web app e aceite as permissões.'
          : testMessage).slice(0, 300)
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

/* ================================================================
 * LEITURA ASSISTIDA DE DOCUMENTOS DE IDENTIDADE · IA 2.9.4 ZDR RESILIENTE
 *
 * Princípios:
 * - modelo de visão dedicado e rápido, separado do modelo geral;
 * - Gemini com thinking mínimo/desligado quando suportado;
 * - OpenRouter com Structured Output + roteamento por latência;
 * - parser tolerante para JSON/tool-call e protocolo de linha de contingência;
 * - cache curto por conteúdo para reanálise instantânea;
 * - nenhum dado entra na ficha sem aprovação humana.
 * ================================================================ */
var AUT_AI_IDENTITY_CACHE_TTL_ = 900;
var AUT_AI_PROVIDER_CIRCUIT_TTL_ = 45;

function autAiProviderModel_(id) {
  var integration = autIntegrationFind_(id);
  var values = autIntegrationResolvedValues_(integration, {});
  return String(values.visionModel || values.model || '').trim();
}

function autAiProviderCircuitKey_(id) {
  return 'AUT_AI_PROVIDER_CIRCUIT_' + autNormalize_(id);
}

function autAiProviderFailure_(id, message) {
  try {
    CacheService.getScriptCache().put(autAiProviderCircuitKey_(id), String(message || 'Falha temporária').slice(0, 220), AUT_AI_PROVIDER_CIRCUIT_TTL_);
  } catch (ignore) {}
}

function autAiProviderSuccess_(id) {
  try { CacheService.getScriptCache().remove(autAiProviderCircuitKey_(id)); } catch (ignore) {}
}

function autAiProviderPublicStatus_(id) {
  var integration = autIntegrationFind_(id);
  var properties = PropertiesService.getScriptProperties();
  var values = autIntegrationResolvedValues_(integration, {});
  var required = integration.fields.filter(function(field) { return field.required; });
  var configured = required.every(function(field) { return !!String(values[field.key] || '').trim(); });
  var enabled = properties.getProperty(autIntegrationStateKey_(id, 'ENABLED')) === 'SIM';
  var lastOk = properties.getProperty(autIntegrationStateKey_(id, 'LAST_TEST_OK')) === 'SIM';
  var circuitMessage = '';
  try { circuitMessage = CacheService.getScriptCache().get(autAiProviderCircuitKey_(id)) || ''; } catch (ignore) {}
  return {
    id:id,
    name:integration.name,
    enabled:enabled,
    configured:configured,
    healthy:enabled && configured && lastOk && !circuitMessage,
    model:String(values.visionModel || values.model || ''),
    circuitOpen:!!circuitMessage,
    lastTestAt:properties.getProperty(autIntegrationStateKey_(id, 'LAST_TEST_AT')) || '',
    message:circuitMessage || properties.getProperty(autIntegrationStateKey_(id, 'LAST_TEST_MESSAGE')) || (configured ? 'Aguardando teste da integração.' : 'Configuração incompleta.')
  };
}

function autAiPublicStatus_() {
  var providers = ['GEMINI', 'OPENROUTER'].map(autAiProviderPublicStatus_);
  return {
    available:providers.some(function(provider) { return provider.healthy; }),
    providers:providers,
    strategy:'FAST_RACE_V3',
    approvalRequired:true
  };
}

function apiStatusIADocumentos(token, liveTest) {
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'PROCESSO_CRIAR') || autHasPermission_(actor, 'PROCESSO_EDITAR'), 'Você não possui permissão para usar a leitura assistida.', 'FORBIDDEN');
    if (liveTest === true) {
      ['GEMINI','OPENROUTER'].forEach(function(id) {
        try {
          var status = autAiProviderPublicStatus_(id);
          if (!status.enabled || !status.configured) return;
          var integration = autIntegrationFind_(id);
          var result = autIntegrationRunTest_(integration, autIntegrationResolvedValues_(integration, {}));
          var properties = PropertiesService.getScriptProperties();
          properties.setProperty(autIntegrationStateKey_(id, 'LAST_TEST_OK'), result.success ? 'SIM' : 'NAO');
          properties.setProperty(autIntegrationStateKey_(id, 'LAST_TEST_AT'), autNow_());
          properties.setProperty(autIntegrationStateKey_(id, 'LAST_TEST_MESSAGE'), String(result.message || '').slice(0, 300));
          if (result.success) autAiProviderSuccess_(id);
        } catch (error) {
          var props = PropertiesService.getScriptProperties();
          props.setProperty(autIntegrationStateKey_(id, 'LAST_TEST_OK'), 'NAO');
          props.setProperty(autIntegrationStateKey_(id, 'LAST_TEST_AT'), autNow_());
          props.setProperty(autIntegrationStateKey_(id, 'LAST_TEST_MESSAGE'), String(error.message || error).slice(0, 300));
        }
      });
    }
    return autResult_(autAiPublicStatus_());
  } catch (err) { return autPublicError_(err); }
}

function autAiIdentityPrompt_(processType, roles) {
  return [
    'AUTENTIKO_IDENTITY_V3',
    'TAREFA=extrair somente dados VISIVEIS de documento brasileiro (RG/CIN/CNH).',
    'TIPO_PROCESSO=' + String(processType || 'NAO_INFORMADO'),
    'PAPEIS=' + roles.join(','),
    'REGRAS:',
    '1. Cada imagem tem PAPEL explícito. Nunca misture titular e cliente.',
    '2. Não invente, complete ou deduza dados. Campo incerto = string vazia.',
    '3. CPF: exatamente 11 dígitos, somente se totalmente legível.',
    '4. Datas: YYYY-MM-DD; data incompleta/incerta = vazia.',
    '5. Preserve grafia dos nomes e acentos impressos.',
    '6. document_type somente RG, CIN, CNH ou UNKNOWN.',
    '7. confidence de 0 a 1; reduza se houver corte, reflexo ou baixa nitidez.',
    '8. Responda exclusivamente no formato solicitado; sem explicações.'
  ].join('\n');
}

function autAiIdentityJsonSchema_() {
  var fields = {
    nome:{type:'string'}, cpf:{type:'string'}, nascimento:{type:'string'}, documento:{type:'string'},
    documento_expedicao:{type:'string'}, orgao_expedidor:{type:'string'}, estado_civil:{type:'string'},
    nome_mae:{type:'string'}, nome_pai:{type:'string'}
  };
  function side() {
    return {
      type:'object', additionalProperties:false,
      properties:{
        document_type:{type:'string',enum:['RG','CIN','CNH','UNKNOWN']},
        confidence:{type:'number',minimum:0,maximum:1},
        fields:{type:'object',additionalProperties:false,properties:fields,required:Object.keys(fields)},
        warnings:{type:'array',items:{type:'string'},maxItems:8}
      },
      required:['document_type','confidence','fields','warnings']
    };
  }
  return {type:'object',additionalProperties:false,properties:{titular:side(),cliente:side()},required:['titular','cliente']};
}

function autAiIdentityGeminiSchema_() {
  var lower = autAiIdentityJsonSchema_();
  function convert(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(convert);
    var out = {};
    Object.keys(node).forEach(function(key) {
      if (key === 'additionalProperties' || key === 'maxItems') return;
      var value = node[key];
      if (key === 'type' && typeof value === 'string') out[key] = value.toUpperCase();
      else out[key] = convert(value);
    });
    return out;
  }
  return convert(lower);
}

function autAiNormalizeDate_(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var iso = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  var br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  var y, m, d;
  if (iso) { y=Number(iso[1]); m=Number(iso[2]); d=Number(iso[3]); }
  else if (br) { d=Number(br[1]); m=Number(br[2]); y=Number(br[3]); }
  else return '';
  var date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return String(y).padStart(4,'0') + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

function autAiStripJsonText_(text) {
  text = String(text || '').replace(/^\uFEFF/, '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  var first = text.indexOf('{');
  var last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

function autAiParseJsonLoose_(text) {
  var stripped = autAiStripJsonText_(text);
  if (!stripped) return null;
  var parsed = autJsonParse_(stripped, null);
  if (parsed && typeof parsed === 'object') return parsed;
  var repaired = stripped
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');
  parsed = autJsonParse_(repaired, null);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function autAiIdentityEmptyRaw_() {
  function side() {
    return {document_type:'UNKNOWN',confidence:0,fields:{nome:'',cpf:'',nascimento:'',documento:'',documento_expedicao:'',orgao_expedidor:'',estado_civil:'',nome_mae:'',nome_pai:''},warnings:[]};
  }
  return {titular:side(),cliente:side()};
}

function autAiParseLineProtocol_(text) {
  text = String(text || '');
  if (text.indexOf('AUTENTIKO_LINE_V3') < 0 && !/(?:^|\n)[TC]_[A-Z_]+\s*=/.test(text)) return null;
  var raw = autAiIdentityEmptyRaw_();
  var fieldMap = {
    NOME:'nome', CPF:'cpf', NASCIMENTO:'nascimento', DOCUMENTO:'documento', EXPEDICAO:'documento_expedicao',
    ORGAO:'orgao_expedidor', ESTADO_CIVIL:'estado_civil', MAE:'nome_mae', PAI:'nome_pai'
  };
  text.split(/\r?\n/).forEach(function(line) {
    var match = line.match(/^\s*([TC])_([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match) return;
    var side = match[1] === 'T' ? raw.titular : raw.cliente;
    var key = match[2];
    var value = match[3] || '';
    if (key === 'TYPE') side.document_type = value;
    else if (key === 'CONFIDENCE') side.confidence = Number(String(value).replace(',','.')) || 0;
    else if (key === 'WARNING') { if (value) side.warnings.push(value); }
    else if (fieldMap[key]) side.fields[fieldMap[key]] = value;
  });
  return raw;
}

function autAiNormalizeIdentitySide_(side) {
  side = side && typeof side === 'object' ? side : {};
  var source = side.fields && typeof side.fields === 'object' ? side.fields : side;
  var allowed = ['nome','cpf','nascimento','documento','documento_expedicao','orgao_expedidor','estado_civil','nome_mae','nome_pai'];
  var fields = {};
  var warnings = Array.isArray(side.warnings) ? side.warnings.map(function(value) { return String(value).slice(0, 180); }).slice(0, 12) : [];
  allowed.forEach(function(key) { fields[key] = String(source[key] == null ? '' : source[key]).trim(); });

  var rawCpf = autDigits_(fields.cpf);
  if (rawCpf) {
    if (rawCpf.length === 11 && autCpfValido_(rawCpf)) fields.cpf = rawCpf;
    else { fields.cpf = ''; warnings.push('CPF_INVALIDO_OU_INCOMPLETO'); }
  }
  ['nascimento','documento_expedicao'].forEach(function(key) {
    if (!fields[key]) return;
    var normalized = autAiNormalizeDate_(fields[key]);
    if (!normalized) warnings.push((key === 'nascimento' ? 'DATA_NASCIMENTO' : 'DATA_EXPEDICAO') + '_INVALIDA_OU_INCOMPLETA');
    fields[key] = normalized;
  });

  var documentType = autNormalize_(side.document_type || side.documentType || side.tipo_documento || 'UNKNOWN');
  if (['RG','CIN','CNH'].indexOf(documentType) < 0) documentType = 'UNKNOWN';
  var confidence = Math.max(0, Math.min(1, Number(side.confidence || 0)));
  if (confidence < 0.55) warnings.push('BAIXA_CONFIANCA_REVISE_DOCUMENTO');

  var fieldConfidence = {};
  allowed.forEach(function(key) { fieldConfidence[key] = fields[key] ? confidence : 0; });
  warnings = warnings.filter(function(value, index, list) { return value && list.indexOf(value) === index; }).slice(0, 16);
  return {documentType:documentType,confidence:confidence,fields:fields,fieldConfidence:fieldConfidence,warnings:warnings};
}

function autAiNormalizeIdentityResult_(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var result = {
    titular:autAiNormalizeIdentitySide_(raw.titular),
    cliente:autAiNormalizeIdentitySide_(raw.cliente),
    crossWarnings:[]
  };
  var t = result.titular.fields;
  var c = result.cliente.fields;
  if (t.cpf && c.cpf && t.cpf === c.cpf) result.crossWarnings.push('CPF_IGUAL_NOS_DOIS_PAPEIS_REVISE_OS_ARQUIVOS');
  if (t.documento && c.documento && autNormalize_(t.documento) === autNormalize_(c.documento)) result.crossWarnings.push('NUMERO_DOCUMENTO_IGUAL_NOS_DOIS_PAPEIS');
  if (result.crossWarnings.length) {
    result.titular.warnings = result.titular.warnings.concat(result.crossWarnings).slice(0, 16);
    result.cliente.warnings = result.cliente.warnings.concat(result.crossWarnings).slice(0, 16);
  }
  return result;
}

function autAiGeminiCanonicalModel_(model) {
  return String(model || '').trim().replace(/^models\//i, '');
}

function autAiGeminiModelCandidates_(values) {
  var configured = autAiGeminiCanonicalModel_(values && (values.visionModel || values.model) || '');
  var candidates = [];
  function add(model) {
    model = autAiGeminiCanonicalModel_(model);
    if (model && candidates.indexOf(model) < 0) candidates.push(model);
  }

  // As contas/projetos novos deixaram de receber acesso aos 2.5 Flash-Lite.
  // Para essas configurações antigas, migramos diretamente para o modelo de
  // baixa latência indicado para extração documental.
  if (!configured || /^gemini-2\.5-(?:flash|flash-lite)/i.test(configured)) {
    add('gemini-3.5-flash-lite');
    add('gemini-3.1-flash-lite');
    add('gemini-3.5-flash');
    add('gemini-3.6-flash');
    add(configured);
  } else {
    add(configured);
    add('gemini-3.5-flash-lite');
    add('gemini-3.1-flash-lite');
    add('gemini-3.5-flash');
    add('gemini-3.6-flash');
  }
  return candidates;
}

function autAiGeminiUnavailableModelError_(error) {
  var message = String(error && error.message || error || '');
  var status = Number(error && error.httpStatus || 0);
  return status === 404 || /model.*(?:not found|no longer available|not available|unsupported)|models\/.*404/i.test(message);
}

function autAiGeminiPersistVisionModel_(model) {
  model = autAiGeminiCanonicalModel_(model);
  if (!model) return;
  try {
    PropertiesService.getScriptProperties().setProperty('AUT_INT_GEMINI_VISION_MODEL', model);
  } catch (ignore) {}
}

function autAiGeminiResolveVisionModel_(values, options) {
  values = values || {};
  options = options || {};
  var configured = autAiGeminiCanonicalModel_(values.visionModel || values.model);
  var candidates = autAiGeminiModelCandidates_(values);
  autAssert_(candidates.length, 'Nenhum modelo Gemini foi configurado para leitura documental.', 'AI_GEMINI_MODEL_REQUIRED');

  // No caminho quente não fazemos uma chamada extra ao catálogo. A migração
  // conhecida 2.5 -> 3.5 ocorre localmente e a validação real acontece na
  // própria generateContent. O teste administrativo pode verificar o modelo.
  if (!options.verify) {
    var hot = candidates[0];
    var migratedHot = !!configured && hot !== configured;
    if (migratedHot && options.persist !== false) autAiGeminiPersistVisionModel_(hot);
    return {model:hot,migrated:migratedHot,httpStatus:0};
  }

  var lastError = null;
  for (var i = 0; i < candidates.length; i++) {
    var model = candidates[i];
    try {
      var result = autIntegrationFetch_(String(values.baseUrl || '').replace(/\/+$/, '') + '/models/' + encodeURIComponent(model), {
        method:'get', headers:{'X-Goog-Api-Key':values.apiKey}
      }, 'Gemini');
      var migrated = !!configured && model !== configured;
      if (options.persist !== false && (migrated || !configured)) autAiGeminiPersistVisionModel_(model);
      return {model:model,migrated:migrated,httpStatus:result.status};
    } catch (error) {
      lastError = error;
      if (!autAiGeminiUnavailableModelError_(error)) throw error;
    }
  }
  throw lastError || new Error('Nenhum modelo Gemini documental compatível está disponível para esta chave.');
}

function autAiGeminiThinkingConfig_(model) {
  model = autAiGeminiCanonicalModel_(model).toLowerCase();
  if (/^gemini-3/.test(model)) return {thinkingLevel:'minimal'};
  if (/^gemini-2\.5-/.test(model)) return {thinkingBudget:0};
  return null;
}

function autAiGeminiGenerationConfig_(model) {
  var config = {
    responseMimeType:'application/json',
    responseSchema:autAiIdentityGeminiSchema_(),
    maxOutputTokens:900
  };
  var thinking = autAiGeminiThinkingConfig_(model);
  if (thinking) config.thinkingConfig = thinking;
  // Gemini 3.x descontinuou temperature/topP/topK; não os enviamos. Isso reduz
  // incompatibilidades e mantém a extração determinística via instruções + schema.
  return config;
}

function autAiGeminiRequest_(values, model, documents, processType) {
  var parts = [{text:autAiIdentityPrompt_(processType, documents.map(function(document) { return document.role; }))}];
  documents.forEach(function(document, index) {
    parts.push({text:'ARQUIVO_' + (index + 1) + '_PAPEL=' + String(document.role).toUpperCase()});
    parts.push({inlineData:{mimeType:document.mimeType,data:document.base64}});
  });
  return autIntegrationFetch_(String(values.baseUrl || '').replace(/\/+$/, '') + '/models/' + encodeURIComponent(model) + ':generateContent', {
    method:'post',contentType:'application/json',headers:{'X-Goog-Api-Key':values.apiKey},
    payload:JSON.stringify({contents:[{role:'user',parts:parts}],generationConfig:autAiGeminiGenerationConfig_(model)})
  }, 'Gemini');
}

function autAiGeminiParseResult_(result, model) {
  var candidate = result.json && result.json.candidates && result.json.candidates[0];
  var responseParts = candidate && candidate.content && candidate.content.parts || [];
  var text = responseParts.map(function(part) { return part.text || ''; }).join('\n');
  var parsed = autAiParseJsonLoose_(text);
  autAssert_(parsed, 'O Gemini respondeu sem dados estruturados utilizáveis.', 'AI_INVALID_RESPONSE');
  autAiProviderSuccess_('GEMINI');
  return {provider:'GEMINI',model:model,httpStatus:result.status,analysis:autAiNormalizeIdentityResult_(parsed)};
}

function autAiGeminiIdentity_(documents, processType) {
  var integration = autIntegrationFind_('GEMINI');
  var values = autIntegrationResolvedValues_(integration, {});
  var configured = autAiGeminiCanonicalModel_(values.visionModel || values.model);
  var candidates = autAiGeminiModelCandidates_(values);
  var maxAttempts = Math.min(2, candidates.length); // evita cascata lenta de modelos.
  var lastError = null;

  for (var i = 0; i < maxAttempts; i++) {
    var model = candidates[i];
    try {
      var result = autAiGeminiRequest_(values, model, documents, processType);
      var output = autAiGeminiParseResult_(result, model);
      if (model !== configured) autAiGeminiPersistVisionModel_(model);
      return output;
    } catch (error) {
      lastError = error;
      var retryableModel = autAiGeminiUnavailableModelError_(error) || String(error && error.code || '') === 'AI_INVALID_RESPONSE';
      if (!retryableModel || i + 1 >= maxAttempts) break;
    }
  }
  throw lastError || new Error('O Gemini não conseguiu analisar o documento.');
}

function autAiOpenRouterMessagePayload_(json) {
  var choice = json && json.choices && json.choices[0] || {};
  var message = choice.message || {};
  if (message.parsed && typeof message.parsed === 'object') return message.parsed;
  var toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (var i = 0; i < toolCalls.length; i++) {
    var args = toolCalls[i] && toolCalls[i].function && toolCalls[i].function.arguments;
    if (args && typeof args === 'object') return args;
    var parsedArgs = autAiParseJsonLoose_(args);
    if (parsedArgs) return parsedArgs;
  }
  var content = message.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) return content;
  if (Array.isArray(content)) {
    content = content.map(function(item) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.text || item.content || item.output_text || '';
      return '';
    }).join('\n');
  }
  if (typeof content !== 'string') content = String(choice.text || '');
  return autAiParseJsonLoose_(content) || autAiParseLineProtocol_(content);
}

function autAiOpenRouterLinePrompt_(processType, roles) {
  return autAiIdentityPrompt_(processType, roles) + '\n' + [
    'FORMATO_CONTINGENCIA=AUTENTIKO_LINE_V3',
    'Se JSON estruturado não estiver disponível, retorne SOMENTE estas linhas, sem markdown:',
    'AUTENTIKO_LINE_V3',
    'T_TYPE=RG|CIN|CNH|UNKNOWN', 'T_CONFIDENCE=0.0', 'T_NOME=', 'T_CPF=', 'T_NASCIMENTO=', 'T_DOCUMENTO=', 'T_EXPEDICAO=', 'T_ORGAO=', 'T_ESTADO_CIVIL=', 'T_MAE=', 'T_PAI=',
    'C_TYPE=RG|CIN|CNH|UNKNOWN', 'C_CONFIDENCE=0.0', 'C_NOME=', 'C_CPF=', 'C_NASCIMENTO=', 'C_DOCUMENTO=', 'C_EXPEDICAO=', 'C_ORGAO=', 'C_ESTADO_CIVIL=', 'C_MAE=', 'C_PAI=',
    'END_AUTENTIKO'
  ].join('\n');
}

function autAiOpenRouterContent_(documents, prompt) {
  var content = [{type:'text',text:prompt}];
  documents.forEach(function(document, index) {
    content.push({type:'text',text:'ARQUIVO_' + (index + 1) + '_PAPEL=' + String(document.role).toUpperCase()});
    content.push({type:'image_url',image_url:{url:'data:' + document.mimeType + ';base64,' + document.base64}});
  });
  return content;
}

function autAiOpenRouterModelIsFree_(model) {
  model = model || {};
  var id = String(model.id || '');
  if (/:free$/i.test(id)) return true;
  var pricing = model.pricing || {};
  var prompt = Number(pricing.prompt || 0);
  var completion = Number(pricing.completion || 0);
  var request = Number(pricing.request || 0);
  var image = Number(pricing.image || 0);
  return prompt === 0 && completion === 0 && request === 0 && image === 0;
}

function autAiOpenRouterPolicy_(values) {
  var policy = autNormalize_(values && values.visionPolicy || 'ZDR_FREE_ONLY');
  if (['ZDR_FREE_ONLY','ZDR_ANY','ACCOUNT_POLICY'].indexOf(policy) < 0) policy = 'ZDR_FREE_ONLY';
  return policy;
}

function autAiOpenRouterDiscoveryKey_(values) {
  return 'AUT_AI_OR_MODELS_V4_' + autHash_([
    autAiOpenRouterPolicy_(values),
    String(values && values.visionModel || values && values.model || ''),
    String(values && values.baseUrl || '')
  ].join('|'));
}

function autAiOpenRouterDiscoverCandidates_(values) {
  values = values || {};
  var policy = autAiOpenRouterPolicy_(values);
  var preferred = String(values.visionModel || values.model || '').trim();
  autAssert_(preferred, 'Defina o modelo de visão do OpenRouter.', 'AI_OPENROUTER_MODEL_REQUIRED');

  // ACCOUNT_POLICY preserva integralmente as regras da conta OpenRouter. Para um
  // modelo explícito não fazemos troca silenciosa; para o roteador livre deixamos
  // o próprio OpenRouter selecionar o modelo conforme os parâmetros enviados.
  if (policy === 'ACCOUNT_POLICY') return [preferred];

  var cache = CacheService.getScriptCache();
  var cacheKey = autAiOpenRouterDiscoveryKey_(values);
  var cached = autJsonParse_(cache.get(cacheKey), null);
  if (cached && Array.isArray(cached.models) && cached.models.length) return cached.models.slice();

  var url = String(values.baseUrl || '').replace(/\/+$/, '') +
    '/models?input_modalities=image&supported_parameters=structured_outputs&zdr=true&sort=latency-low-to-high';
  var result = autIntegrationFetch_(url, {
    method:'get',
    headers:{Authorization:'Bearer ' + values.apiKey,'HTTP-Referer':values.publicUrl,'X-Title':'AUTENTIKO OK NUVEM'},
    muteHttpExceptions:true
  }, 'OpenRouter · catálogo ZDR');
  var models = result.json && Array.isArray(result.json.data) ? result.json.data : [];

  // Caso o administrador tenha escolhido um modelo explícito, só o aceitamos se
  // o catálogo atual confirmar imagem + structured output + pelo menos um endpoint ZDR.
  if (preferred !== 'openrouter/free' && preferred !== 'openrouter/auto') {
    var exact = models.filter(function(model) { return String(model.id || '') === preferred; });
    if (policy === 'ZDR_FREE_ONLY') exact = exact.filter(autAiOpenRouterModelIsFree_);
    autAssert_(exact.length,
      policy === 'ZDR_FREE_ONLY'
        ? 'O modelo OpenRouter configurado não possui rota gratuita compatível com imagem, JSON estruturado e ZDR. Use openrouter/free ou escolha outro modelo ZDR gratuito.'
        : 'O modelo OpenRouter configurado não possui endpoint compatível com imagem, JSON estruturado e ZDR.',
      'AI_OPENROUTER_MODEL_NOT_ZDR_COMPATIBLE');
    return [preferred];
  }

  var compatible = models.filter(function(model) {
    if (!model || !model.id) return false;
    if (policy === 'ZDR_FREE_ONLY' && !autAiOpenRouterModelIsFree_(model)) return false;
    return true;
  });
  var selected = compatible.slice(0, 3).map(function(model) { return String(model.id); });
  autAssert_(selected.length,
    policy === 'ZDR_FREE_ONLY'
      ? 'Sua conta exige ZDR e, neste momento, o OpenRouter não oferece modelo gratuito elegível com visão + structured outputs. O AUTENTIKO manteve a proteção dos documentos e usará o Gemini quando disponível.'
      : 'Nenhum modelo OpenRouter elegível com visão + structured outputs + ZDR está disponível neste momento.',
    policy === 'ZDR_FREE_ONLY' ? 'AI_OPENROUTER_ZDR_NO_FREE_MODEL' : 'AI_OPENROUTER_ZDR_NO_MODEL');
  try { autCachePut_(cache, cacheKey, {models:selected,at:autNow_()}, 300); } catch (ignore) {}
  return selected;
}

function autAiOpenRouterGuardrailError_(error) {
  var message = String(error && error.message || error || '');
  return /ZDR|zero data retention|guardrail|data policy|data_collection|0 endpoints|no allowed providers|no endpoints/i.test(message);
}

function autAiOpenRouterFriendlyError_(error, model) {
  var message = String(error && error.message || error || 'Falha desconhecida.');
  if (autAiOpenRouterGuardrailError_(error)) {
    var blocked = new Error(
      'OpenRouter bloqueou o modelo ' + String(model || '') + ' pela política de privacidade/ZDR da conta ou do endpoint. ' +
      'O AUTENTIKO não reduz essa proteção automaticamente. Configure um modelo de visão com endpoint ZDR compatível ou altere conscientemente a política no painel do OpenRouter.'
    );
    blocked.code = 'AI_OPENROUTER_ZDR_BLOCKED';
    blocked.httpStatus = Number(error && error.httpStatus || 404);
    return blocked;
  }
  var generic = new Error(message);
  generic.code = error && error.code || 'AI_OPENROUTER_FAILED';
  generic.httpStatus = Number(error && error.httpStatus || 0);
  return generic;
}

function autAiOpenRouterRequest_(values, model, documents, processType) {
  var roles = documents.map(function(document) { return document.role; });
  var policy = autAiOpenRouterPolicy_(values);
  var provider = {sort:'latency',allow_fallbacks:true,require_parameters:true};
  if (policy !== 'ACCOUNT_POLICY') {
    provider.data_collection = 'deny';
    provider.zdr = true;
  }
  var payload = {
    model:model,
    temperature:0,
    top_p:0.05,
    max_tokens:900,
    stream:false,
    provider:provider,
    response_format:{type:'json_schema',json_schema:{name:'autentiko_identity_v4',strict:true,schema:autAiIdentityJsonSchema_()}},
    plugins:[{id:'response-healing'}],
    messages:[
      {role:'system',content:'Extração documental determinística do AUTENTIKO. Não invente dados. Retorne somente o objeto definido pelo JSON Schema.'},
      {role:'user',content:autAiOpenRouterContent_(documents, autAiIdentityPrompt_(processType, roles))}
    ]
  };
  return autIntegrationFetch_(values.baseUrl + '/chat/completions', {
    method:'post',contentType:'application/json',
    headers:{
      Authorization:'Bearer ' + values.apiKey,
      'HTTP-Referer':values.publicUrl,
      'X-Title':'AUTENTIKO OK NUVEM',
      'X-OpenRouter-Metadata':'enabled'
    },
    payload:JSON.stringify(payload)
  }, 'OpenRouter');
}

function autAiOpenRouterIdentity_(documents, processType) {
  var integration = autIntegrationFind_('OPENROUTER');
  var values = autIntegrationResolvedValues_(integration, {});
  var candidates = autAiOpenRouterDiscoverCandidates_(values);
  var started = Date.now();
  var failures = [];

  for (var index = 0; index < candidates.length; index++) {
    var model = candidates[index];
    try {
      var result = autAiOpenRouterRequest_(values, model, documents, processType);
      var structured = autAiOpenRouterMessagePayload_(result.json);
      if (!structured) {
        var invalid = new Error('O modelo respondeu, mas não devolveu o objeto documental exigido pelo schema.');
        invalid.code = 'AI_INVALID_RESPONSE';
        throw invalid;
      }
      autAiProviderSuccess_('OPENROUTER');
      return {
        provider:'OPENROUTER',
        model:(result.json && result.json.model) || model,
        httpStatus:result.status,
        analysis:autAiNormalizeIdentityResult_(structured)
      };
    } catch (rawError) {
      var error = autAiOpenRouterFriendlyError_(rawError, model);
      failures.push({model:model,code:error.code || '',message:String(error.message || error).slice(0,240)});
      // Evita transformar uma leitura simples em uma espera longa. Só tenta outro
      // candidato quando a falha ocorreu cedo e ainda estamos dentro da janela rápida.
      if (Date.now() - started > 18000) break;
    }
  }

  var summary = failures.map(function(item) {
    return item.model + ': ' + item.message;
  }).join(' | ');
  var finalError = new Error(summary || 'O OpenRouter não encontrou uma rota documental compatível.');
  finalError.code = failures.some(function(item) { return item.code === 'AI_OPENROUTER_ZDR_BLOCKED'; })
    ? 'AI_OPENROUTER_ZDR_BLOCKED'
    : 'AI_OPENROUTER_FAILED';
  throw finalError;
}

function autAiValidatedIdentityRequest_(payload) {
  payload = payload || {};
  var processType = String(payload.processType || '').trim();
  autAssert_(!processType || AUTENTIKO.PROCESS_TYPES.indexOf(processType) >= 0, 'Tipo de processo inválido.', 'INVALID_PROCESS_TYPE');
  var documents = (Array.isArray(payload.documents) ? payload.documents : []).map(function(document) {
    var role = String(document.role || '').toLowerCase();
    var mimeType = String(document.mimeType || '').toLowerCase();
    var base64 = String(document.base64 || '').replace(/^data:[^;]+;base64,/, '');
    autAssert_(role === 'titular' || role === 'cliente', 'Papel do documento inválido.', 'INVALID_DOCUMENT_ROLE');
    autAssert_(['image/jpeg','image/png','image/webp'].indexOf(mimeType) >= 0, 'Converta o documento para imagem JPEG, PNG ou WEBP.', 'INVALID_FILE_TYPE');
    autAssert_(base64.length > 200 && base64.length <= 2600000, 'O documento ultrapassa o tamanho otimizado para leitura rápida por IA.', 'FILE_TOO_LARGE');
    return {role:role,mimeType:mimeType,base64:base64};
  });
  autAssert_(documents.length >= 1 && documents.length <= 2, 'Envie um ou dois documentos de identidade.', 'DOCUMENT_REQUIRED');
  autAssert_(documents.map(function(item) { return item.base64.length; }).reduce(function(total, value) { return total + value; }, 0) <= 4800000,
    'Os documentos juntos ultrapassam o tamanho otimizado para análise rápida.', 'FILE_TOO_LARGE');
  return {processType:processType,documents:documents};
}

function autAiIdentityFingerprint_(request) {
  var parts = [String(request.processType || '')];
  (request.documents || []).forEach(function(document) {
    parts.push(document.role + ':' + document.mimeType + ':' + autHash_(document.base64));
  });
  return autHash_(parts.join('|'));
}

function autAiIdentityCacheGet_(request) {
  try {
    var value = CacheService.getScriptCache().get('AUT_AI_ID_V3_' + autAiIdentityFingerprint_(request));
    return autJsonParse_(value, null);
  } catch (ignore) { return null; }
}

function autAiIdentityCachePut_(request, output) {
  try {
    autCachePut_(CacheService.getScriptCache(), 'AUT_AI_ID_V3_' + autAiIdentityFingerprint_(request), {
      provider:output.provider,model:output.model,analysis:output.analysis,cachedAt:autNow_()
    }, AUT_AI_IDENTITY_CACHE_TTL_);
  } catch (ignore) {}
}

function autAiRunIdentityProvider_(providerId, documents, processType) {
  providerId = autNormalize_(providerId);
  autAssert_(['GEMINI','OPENROUTER'].indexOf(providerId) >= 0, 'Provedor de IA inválido.', 'AI_PROVIDER_UNAVAILABLE');
  try {
    return providerId === 'GEMINI' ? autAiGeminiIdentity_(documents, processType) : autAiOpenRouterIdentity_(documents, processType);
  } catch (error) {
    autAiProviderFailure_(providerId, String(error && error.message || error));
    throw error;
  }
}

function autAiAuditIdentityOnce_(actor, processType, output, documents, context, latencyMs) {
  var correlation = String(context && (context.aiRequestId || context.requestId) || '').trim();
  if (!correlation) correlation = autUuid_();
  var key = 'AUT_AI_ACCEPTED_' + autHash_(String(actor.ID_USUARIO) + '|' + correlation);
  return autWithScriptLock_(function() {
    var cache = CacheService.getScriptCache();
    if (cache.get(key)) return false;
    cache.put(key, '1', 300);
    autAudit_(actor, 'IA_DOCUMENTO_IDENTIDADE_ANALISADO', 'PROCESSO_RASCUNHO', processType || 'SEM_TIPO', {
      provider:output.provider,model:output.model,documentos:documents.map(function(document) { return document.role; }),
      latenciaMs:Number(latencyMs || 0),persistido:false,revisaoHumanaObrigatoria:true,correlacao:correlation
    }, context || {});
    return true;
  });
}

function apiAnalisarDocumentosIdentidadeProvedor(token, payload, providerId, context) {
  var started = Date.now();
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'PROCESSO_CRIAR') || autHasPermission_(actor, 'PROCESSO_EDITAR'), 'Você não possui permissão para usar a leitura assistida.', 'FORBIDDEN');
    var request = autAiValidatedIdentityRequest_(payload);
    var cached = autAiIdentityCacheGet_(request);
    if (cached && cached.analysis) {
      return autResult_({success:true,provider:cached.provider,model:cached.model,analysis:cached.analysis,latencyMs:Date.now()-started,cached:true,approvalRequired:true,message:'Leitura recuperada do cache seguro.'});
    }
    providerId = autNormalize_(providerId);
    autAssert_(['GEMINI','OPENROUTER'].indexOf(providerId) >= 0, 'Provedor de IA inválido.', 'AI_PROVIDER_UNAVAILABLE');
    var status = autAiProviderPublicStatus_(providerId);
    if (!status.healthy) return autResult_({success:false,provider:providerId,latencyMs:Date.now()-started,message:status.message || 'Este provedor de IA não está disponível agora.'});
    var output;
    try { output = autAiRunIdentityProvider_(providerId, request.documents, request.processType); }
    catch (providerError) {
      return autResult_({success:false,provider:providerId,latencyMs:Date.now()-started,code:providerError && providerError.code || 'AI_PROVIDER_FAILED',message:String(providerError && providerError.message || providerError || 'A IA não conseguiu analisar o documento.').slice(0,360)});
    }
    autAiIdentityCachePut_(request, output);
    var latency = Date.now() - started;
    autAiAuditIdentityOnce_(actor, request.processType, output, request.documents, context, latency);
    return autResult_({success:true,provider:output.provider,model:output.model,analysis:output.analysis,latencyMs:latency,cached:false,approvalRequired:true,message:'Leitura concluída. Revise os campos antes de aprovar o preenchimento.'});
  } catch (err) { return autPublicError_(err); }
}

function apiAnalisarDocumentosIdentidade(token, payload, context) {
  var started = Date.now();
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'PROCESSO_CRIAR') || autHasPermission_(actor, 'PROCESSO_EDITAR'), 'Você não possui permissão para usar a leitura assistida.', 'FORBIDDEN');
    var request = autAiValidatedIdentityRequest_(payload);
    var cached = autAiIdentityCacheGet_(request);
    if (cached && cached.analysis) return autResult_({success:true,provider:cached.provider,model:cached.model,analysis:cached.analysis,latencyMs:Date.now()-started,cached:true,approvalRequired:true});
    var statuses = autAiPublicStatus_();
    var preferred = statuses.providers.filter(function(provider) { return provider.healthy; }).sort(function(a,b) {
      if (a.id === 'OPENROUTER') return -1;
      if (b.id === 'OPENROUTER') return 1;
      return 0;
    })[0];
    if (!preferred) return autResult_({success:false,available:false,providers:statuses.providers,latencyMs:Date.now()-started,message:'Nenhuma IA de documentos está ativa e testada. O cadastro manual continua disponível.'});
    var output;
    try { output = autAiRunIdentityProvider_(preferred.id, request.documents, request.processType); }
    catch (providerError) { return autResult_({success:false,available:true,provider:preferred.id,providers:statuses.providers,latencyMs:Date.now()-started,message:String(providerError && providerError.message || providerError).slice(0,360)}); }
    autAiIdentityCachePut_(request, output);
    var latency = Date.now() - started;
    autAiAuditIdentityOnce_(actor, request.processType, output, request.documents, context, latency);
    return autResult_({success:true,provider:output.provider,model:output.model,analysis:output.analysis,providers:statuses.providers,latencyMs:latency,cached:false,approvalRequired:true,message:'Leitura concluída. Revise os campos antes de aprovar o preenchimento.'});
  } catch (err) { return autPublicError_(err); }
}