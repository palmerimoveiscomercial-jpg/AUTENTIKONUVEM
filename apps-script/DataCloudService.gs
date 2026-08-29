/*
 * Ponte segura Apps Script -> Vercel -> Neon.
 *
 * DATABASE_URL e credenciais do Postgres nunca entram no Apps Script. A
 * sincronização usa HMAC e a consulta usa uma chave server-to-server guardada
 * em Script Properties; nenhum segredo é devolvido ao navegador.
 */
var AUT_DATA_CURSOR_VERSION_ = 1;
var AUT_DATA_STAGES_ = Object.freeze(['INDEX', 'DRIVE', 'CONTEXT']);

function dataCloudEnabled_() {
  return autNormalize_(autConfigMap_().DATA_CLOUD_ENABLED) === 'SIM';
}

function dataCloudBaseUrl_() {
  var value = String(autConfigMap_().DATA_API_BASE_URL || '').trim().replace(/\/+$/, '');
  autAssert_(value && /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(value),
    'A URL da API Vercel/Neon não foi configurada corretamente.', 'DATA_CLOUD_CONFIG_REQUIRED');
  return value;
}

function dataCloudSecret_(name) {
  var value = String(PropertiesService.getScriptProperties().getProperty(name) || '');
  autAssert_(value.length >= 32, 'Os segredos da API Vercel/Neon ainda não foram configurados.', 'DATA_CLOUD_CONFIG_REQUIRED');
  return value;
}

function dataCloudHex_(bytes) {
  return (bytes || []).map(function(value) {
    return ('0' + ((Number(value) + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function dataCloudParseResponse_(response) {
  var status = Number(response.getResponseCode() || 0);
  var text = String(response.getContentText() || '');
  var contentType = String(response.getHeaders()['Content-Type'] || response.getHeaders()['content-type'] || '');
  autAssert_(contentType.toLowerCase().indexOf('application/json') >= 0,
    'A API Vercel devolveu conteúdo não JSON. Verifique a URL configurada.', 'DATA_CLOUD_INVALID_RESPONSE');
  var parsed = autJsonParse_(text, null);
  autAssert_(parsed && typeof parsed === 'object', 'A API Vercel devolveu JSON inválido.', 'DATA_CLOUD_INVALID_RESPONSE');
  autAssert_(status >= 200 && status < 300 && parsed.ok,
    parsed.message || ('A API Vercel respondeu com HTTP ' + status + '.'), parsed.code || 'DATA_CLOUD_REQUEST_FAILED');
  return parsed;
}

function dataCloudSyncRequest_(payload) {
  var body = JSON.stringify(payload);
  var timestamp = String(Math.floor(Date.now() / 1000));
  var signature = dataCloudHex_(Utilities.computeHmacSha256Signature(
    timestamp + '.' + body,
    dataCloudSecret_('AUT_DATA_SYNC_SECRET'),
    Utilities.Charset.UTF_8
  ));
  var response = UrlFetchApp.fetch(dataCloudBaseUrl_() + '/api/v1/sync/nuvem', {
    method: 'post', contentType: 'application/json', payload: body,
    muteHttpExceptions: true, followRedirects: false,
    headers: {
      'X-Autentiko-Timestamp': timestamp,
      'X-Autentiko-Signature': signature,
      'Cache-Control': 'no-store'
    }
  });
  return dataCloudParseResponse_(response);
}

function dataCloudApiGet_(path, query) {
  var values = [];
  Object.keys(query || {}).forEach(function(key) {
    var value = query[key];
    if (value === '' || value == null) return;
    values.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  });
  var response = UrlFetchApp.fetch(dataCloudBaseUrl_() + path + (values.length ? '?' + values.join('&') : ''), {
    method: 'get', muteHttpExceptions: true, followRedirects: false,
    headers: {
      'Authorization': 'Bearer ' + dataCloudSecret_('AUT_DATA_API_KEY'),
      'Cache-Control': 'no-store'
    }
  });
  return dataCloudParseResponse_(response);
}

function dataCloudCursor_(value) {
  return Utilities.base64EncodeWebSafe(JSON.stringify(value)).replace(/=+$/g, '');
}

function dataCloudReadCursor_(raw) {
  if (!raw) return { v: AUT_DATA_CURSOR_VERSION_, stage: 'INDEX', offset: 0 };
  try {
    var value = autJsonParse_(Utilities.newBlob(Utilities.base64DecodeWebSafe(String(raw))).getDataAsString('UTF-8'), null);
    autAssert_(value && value.v === AUT_DATA_CURSOR_VERSION_ && AUT_DATA_STAGES_.indexOf(value.stage) >= 0 && Number(value.offset) >= 0,
      'Cursor da sincronização inválido.', 'INVALID_CURSOR');
    return { v: AUT_DATA_CURSOR_VERSION_, stage: value.stage, offset: Math.floor(Number(value.offset)) };
  } catch (err) {
    if (err && err.code === 'INVALID_CURSOR') throw err;
    throw autApiError_('Cursor da sincronização inválido.', 'INVALID_CURSOR');
  }
}

function dataCloudSearchRecord_(row) {
  return {
    tenantId: 'PALMER', sourceType: String(row.TIPO_ENTIDADE || 'REGISTRO').toUpperCase(),
    sourceId: String(row.ID_ENTIDADE || row.ID_INDICE || ''), protocol: String(row.PROTOCOLO || ''),
    document: '', title: String(row.TITULO || ''), status: String(row.STATUS || ''),
    updatedAt: dataCloudIso_(row.ATUALIZADO_EM || row.INDEXADO_EM),
    payload: {
      processId: String(row.ID_PROCESSO || ''), sourceTable: String(row.FONTE_TABELA || ''),
      sourceRow: Number(row.FONTE_LINHA || 0), originHash: String(row.HASH_ORIGEM || ''),
      version: String(row.VERSAO_REGISTRO || ''), searchText: String(row.TEXTO_BUSCA || '').slice(0, 16000)
    }
  };
}

function dataCloudDriveRecord_(row) {
  return {
    tenantId: 'PALMER', sourceType: 'DRIVE_FILE', sourceId: String(row.ID_ARQUIVO || ''),
    protocol: String(row.PROTOCOLO || ''), document: '', title: String(row.NOME_ARQUIVO || ''),
    status: String(row.STATUS || 'ATIVO'),
    updatedAt: dataCloudIso_(row.MODIFICADO_EM || row.ATUALIZADO_EM || row.INDEXADO_EM),
    payload: {
      processId: String(row.ID_PROCESSO || ''), mimeType: String(row.MIME_TYPE || ''),
      sizeBytes: Number(row.TAMANHO_BYTES || 0), driveFileId: String(row.ID_ARQUIVO || ''),
      folderId: String(row.PASTA_ID || ''), url: String(row.URL || ''),
      searchText: String(row.TEXTO_BUSCA || '').slice(0, 4000)
    }
  };
}

function dataCloudContextRecord_(actor, process) {
  var context = apiContractContext_(actor, process);
  return {
    tenantId: 'PALMER', sourceType: 'PROCESS_CONTEXT', sourceId: String(process.ID_PROCESSO),
    protocol: String(process.PROTOCOLO || ''), document: String(process.CLIENTE_CPF || ''),
    title: [process.PROTOCOLO, process.CLIENTE_NOME, process.IMOVEL_ENDERECO].filter(Boolean).join(' — ').slice(0, 500),
    status: String(process.STATUS || ''),
    updatedAt: dataCloudIso_(process.ATUALIZADO_EM || process.CRIADO_EM),
    payload: context
  };
}

function dataCloudIso_(value) {
  var date = value instanceof Date ? value : new Date(value || Date.now());
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function dataCloudSyncPage_(actor, cursor, limit) {
  var stage = cursor.stage;
  var source;
  var mapper;
  if (stage === 'INDEX') {
    source = autRows_('BUSCA_INDICE');
    mapper = dataCloudSearchRecord_;
  } else if (stage === 'DRIVE') {
    source = autRows_('DRIVE_INDICE');
    mapper = dataCloudDriveRecord_;
  } else {
    source = autRows_('PROCESSOS').filter(function(row) { return !row.EXCLUIDO_EM; });
    mapper = function(row) { return dataCloudContextRecord_(actor, row); };
  }
  var page = source.slice(cursor.offset, cursor.offset + limit).map(mapper);
  var next = null;
  if (cursor.offset + page.length < source.length) {
    next = { v: AUT_DATA_CURSOR_VERSION_, stage: stage, offset: cursor.offset + page.length };
  } else {
    var position = AUT_DATA_STAGES_.indexOf(stage);
    if (position < AUT_DATA_STAGES_.length - 1) next = { v: AUT_DATA_CURSOR_VERSION_, stage: AUT_DATA_STAGES_[position + 1], offset: 0 };
  }
  return { records: page, next: next, stage: stage, totalInStage: source.length };
}

function apiSincronizarNeon(token, options, context) {
  try {
    var actor = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    autAssert_(dataCloudEnabled_(), 'A nuvem de dados ainda está desativada.', 'FEATURE_DISABLED');
    autAssert_(autHasPermission_(actor, 'PROCESSO_VER_TODOS') || ['DESENVOLVEDOR', 'ADMINISTRADOR'].indexOf(actor.PERFIL) >= 0,
      'A sincronização integral exige acesso global aos processos.', 'FORBIDDEN');
    options = options || {};
    var configuredLimit = Number(autConfigMap_().DATA_SYNC_BATCH_SIZE || 250);
    var limit = Math.min(Math.max(Number(options.limit || configuredLimit), 1), 400);
    var cursor = dataCloudReadCursor_(options.cursor);
    var page = dataCloudSyncPage_(actor, cursor, limit);
    if (!page.records.length && page.next) {
      page = dataCloudSyncPage_(actor, page.next, limit);
    }
    if (!page.records.length) return autResult_({ synchronized: 0, complete: true, nextCursor: '' });
    var requestId = 'sync-' + autUuid_();
    var result = dataCloudSyncRequest_({
      schemaVersion: '1.0.0', requestId: requestId, source: 'ADMIN_REBUILD', records: page.records
    });
    PropertiesService.getScriptProperties().setProperty('AUT_DATA_LAST_SYNC', JSON.stringify({
      at: autNow_(), requestId: requestId, stage: page.stage,
      synchronized: result.data && result.data.synchronized || 0
    }));
    autAudit_(actor, 'NEON_SINCRONIZADO', 'CONFIGURACAO', 'DATA_CLOUD', {
      requestId: requestId, stage: page.stage, records: page.records.length,
      complete: !page.next
    }, context || {});
    return autResult_({
      requestId: requestId, stage: page.stage, received: page.records.length,
      synchronized: Number(result.data && result.data.synchronized || 0),
      complete: !page.next, nextCursor: page.next ? dataCloudCursor_(page.next) : '',
      totalInStage: page.totalInStage
    });
  } catch (err) { return autPublicError_(err); }
}

function apiPesquisarNeon(token, filters) {
  try {
    var actor = autRequireAuth_(token);
    autAssert_(dataCloudEnabled_(), 'A nuvem de dados ainda está desativada.', 'FEATURE_DISABLED');
    autAssert_(autHasPermission_(actor, 'PROCESSO_VER_TODOS') || ['DESENVOLVEDOR', 'ADMINISTRADOR'].indexOf(actor.PERFIL) >= 0,
      'A busca global em nuvem exige acesso global aos processos.', 'FORBIDDEN');
    filters = filters || {};
    var requestedTypes = filters.entityTypes || filters.types || filters.entityType || filters.type || '';
    if (Array.isArray(requestedTypes)) requestedTypes = requestedTypes.length === 1 ? requestedTypes[0] : '';
    var result = dataCloudApiGet_('/api/v1/search', {
      q: filters.search || filters.query || '', type: requestedTypes,
      status: filters.status || '', protocol: filters.protocol || '', document: filters.document || '',
      cursor: filters.cursor || '', limit: Math.min(Math.max(Number(filters.limit || 50), 1), 100)
    });
    var data = result.data || {};
    data.items = (data.items || []).map(function(item) {
      return {
        id: item.sourceId, entityType: item.sourceType,
        sourceTable: item.payload && item.payload.sourceTable || '',
        sourceRow: item.payload && Number(item.payload.sourceRow || 0) || 0,
        processId: item.payload && item.payload.processId || '',
        protocol: item.protocol || '', title: item.title || '', status: item.status || '',
        updatedAt: item.updatedAt || '', originHash: item.payload && item.payload.originHash || '',
        version: item.payload && item.payload.version || ''
      };
    });
    data.total = Number(data.total || data.items.length);
    data.offset = 0;
    return autResult_(data);
  } catch (err) { return autPublicError_(err); }
}

function apiDiagnosticarNeon(token) {
  try {
    autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    var started = Date.now();
    var response = UrlFetchApp.fetch(dataCloudBaseUrl_() + '/api/health?deep=1', {
      method: 'get', muteHttpExceptions: true, followRedirects: false,
      headers: { 'Cache-Control': 'no-store' }
    });
    var parsed = dataCloudParseResponse_(response);
    return autResult_({ healthy: !!(parsed.data && parsed.data.dataCloud && parsed.data.dataCloud.healthy), latencyMs: Date.now() - started, response: parsed.data });
  } catch (err) { return autPublicError_(err); }
}

function apiAdminSalvarSegredosDados(token, payload, context) {
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'CONFIGURACAO_GERIR') || actor.PERFIL === 'DESENVOLVEDOR',
      'Você não possui permissão para configurar a nuvem de dados.', 'FORBIDDEN');
    payload = payload || {};
    var apiKey = String(payload.apiKey || '').trim();
    var syncSecret = String(payload.syncSecret || '').trim();
    autAssert_((!apiKey || apiKey.length >= 32) && (!syncSecret || syncSecret.length >= 32),
      'Cada segredo informado deve possuir no mínimo 32 caracteres.', 'INVALID_DATA_CLOUD_SECRET');
    autAssert_(apiKey || syncSecret, 'Informe ao menos um segredo para atualizar.', 'INVALID_DATA_CLOUD_SECRET');
    var values = {};
    if (apiKey) values.AUT_DATA_API_KEY = apiKey;
    if (syncSecret) values.AUT_DATA_SYNC_SECRET = syncSecret;
    PropertiesService.getScriptProperties().setProperties(values, false);
    autAudit_(actor, 'SEGREDOS_NEON_ATUALIZADOS', 'CONFIGURACAO', 'DATA_CLOUD', {
      apiKeyUpdated: !!apiKey, syncSecretUpdated: !!syncSecret, valueExposed: false
    }, context || {});
    return autResult_({ configured: true, apiKeyUpdated: !!apiKey, syncSecretUpdated: !!syncSecret });
  } catch (err) { return autPublicError_(err); }
}

function dataCloudStatus_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    enabled: dataCloudEnabled_(),
    apiUrlConfigured: !!String(autConfigMap_().DATA_API_BASE_URL || '').trim(),
    apiKeyConfigured: String(properties.getProperty('AUT_DATA_API_KEY') || '').length >= 32,
    syncSecretConfigured: String(properties.getProperty('AUT_DATA_SYNC_SECRET') || '').length >= 32,
    lastSync: autJsonParse_(properties.getProperty('AUT_DATA_LAST_SYNC'), null)
  };
}
