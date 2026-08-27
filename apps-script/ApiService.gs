/**
 * API JSON externa do AUTENTIKO OK NUVEM.
 *
 * A API é deliberadamente server-to-server. O segredo nunca é enviado ao
 * navegador do AUTENTIKO nem armazenado em texto claro na planilha.
 * Use POST /exec?api=v1 com {apiKey, action, ...}.
 */
var AUTENTIKO_API_SCOPES = Object.freeze({
  PROCESSO_CONSULTAR: 'Consultar processos e dados vinculados',
  PROCESSO_DADOS_CONSULTAR: 'Consultar dados cadastrais completos autorizados',
  PROCESSO_EDITAR: 'Editar ficha cadastral de processos',
  CADASTRO_CONSULTAR: 'Consultar Carta de Clientes por CPF/CNPJ',
  AUDITORIA_CONSULTAR: 'Consultar auditoria de processos'
});

function autApiError_(message, code) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function apiJsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload == null ? { ok: false, code: 'EMPTY_RESPONSE' } : payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiRequestBody_(event) {
  if (!event || !event.postData || !event.postData.contents) return {};
  try { return JSON.parse(event.postData.contents) || {}; }
  catch (err) { throw autApiError_('JSON inválido.', 'INVALID_JSON'); }
}

function apiKeyValue_(event, body) {
  body = body || {};
  // Header não é exposto de forma consistente pelo evento do Apps Script;
  // body em POST é o caminho recomendado. Query é mantida apenas para GET.
  return String(body.apiKey || body.api_key || event?.parameter?.apiKey || event?.parameter?.api_key || event?.parameter?.key || '').trim();
}

function apiKeyRow_(rawKey, requiredScope) {
  var key = String(rawKey || '').trim();
  autAssert_(/^ak_live_[A-Za-z0-9_-]{32,160}$/.test(key), 'Chave de API ausente ou inválida.', 'API_KEY_INVALID');
  var hash = autHash_(key);
  var row = autRows_('API_CHAVES').filter(function(item) { return String(item.CHAVE_HASH || '') === hash; })[0];
  autAssert_(row, 'Chave de API inválida.', 'API_KEY_INVALID');
  autAssert_(String(row.STATUS || '') === 'ATIVA', 'Chave de API bloqueada ou revogada.', 'API_KEY_BLOCKED');
  autAssert_(!row.EXPIRA_EM || autDateMs_(row.EXPIRA_EM) > Date.now(), 'Chave de API expirada.', 'API_KEY_EXPIRED');
  var scopes = autJsonParse_(row.ESCOPO_JSON, []);
  autAssert_(!requiredScope || scopes.indexOf(requiredScope) >= 0, 'A chave não possui o escopo necessário.', 'API_SCOPE_FORBIDDEN');
  var owner = autFind_('USUARIOS', 'ID_USUARIO', row.CRIADO_POR_ID);
  autAssert_(owner && String(owner.STATUS) === 'ATIVO', 'O usuário proprietário da chave não está ativo.', 'API_OWNER_INACTIVE');
  var cache = CacheService.getScriptCache();
  var rateKey = 'AUT_API_RATE_' + row.ID_API;
  var rate = Number(cache.get(rateKey) || 0);
  var limit = Math.min(Math.max(Number(row.RATE_LIMIT_MIN || 60), 1), 600);
  autAssert_(rate < limit, 'Limite temporário de requisições excedido.', 'API_RATE_LIMIT');
  cache.put(rateKey, String(rate + 1), 60);
  // A última utilização é apenas informativa. Evite escrever na planilha em
  // cada chamada (o que aumentaria a latência e a contenção do documento).
  var usageKey = 'AUT_API_LAST_USE_' + row.ID_API;
  if (!cache.get(usageKey)) {
    try { autUpdateRow_('API_CHAVES', row._row, { ULTIMO_USO_EM: autNow_() }); } catch (ignore) {}
    cache.put(usageKey, '1', 60);
  }
  return { row: row, owner: owner, scopes: scopes };
}

function apiFindProcesses_(owner, protocol, document) {
  var normalizedProtocol = String(protocol || '').trim();
  var digits = autDigits_(document || '');
  return autVisibleProcesses_(owner).filter(function(row) {
    if (normalizedProtocol && String(row.PROTOCOLO) !== normalizedProtocol) return false;
    if (digits) {
      var summary = autJsonParse_(row.DADOS_JSON, {});
      var candidates = [row.CLIENTE_CPF, summary.cliente_cpf, summary.titular_cpf].map(autDigits_);
      if (!candidates.some(function(value) { return value && value === digits; })) return false;
    }
    return true;
  });
}

function apiIdentifier_(body) {
  body = body || {};
  return {
    protocol: body.protocol || body.protocolo || body.numeroProtocolo || body.processProtocol || '',
    document: body.cpf || body.cnpj || body.document || body.documento || body.cpfCnpj || body.cpf_cnpj || ''
  };
}

function apiPublicProcess_(row, includeData) {
  var result = { process: autProcessCard_(row) };
  if (includeData) result.data = autProcessDataMap_(row);
  return result;
}

function apiInternalSession_(owner, callback) {
  var raw = 'api-session-' + autUuid_();
  var session = autAppend_('SESSOES', {
    ID_SESSAO: autUuid_(), ID_USUARIO: owner.ID_USUARIO, TOKEN_HASH: autHash_(raw),
    CRIADO_EM: autNow_(), EXPIRA_EM: new Date(Date.now() + 60000).toISOString(), REVOGADO_EM: '',
    DISPOSITIVO_JSON: autJson_({ origem: 'API_JSON' }), LOCALIZACAO_JSON: ''
  });
  try { return callback(raw); }
  finally { try { autUpdateRow_('SESSOES', session._row, { REVOGADO_EM: autNow_() }); } catch (ignore) {} }
}

function apiV1Request_(event, body) {
  body = body || {};
  var action = String(body.action || event?.parameter?.action || 'health').toLowerCase();
  if (action === 'health') return { ok: true, data: { service: AUTENTIKO.APP_NAME, version: AUTENTIKO.APP_VERSION, time: autNow_() } };
  var scope = action === 'editar_processo' ? 'PROCESSO_EDITAR' :
    (action === 'consultar_cadastro' ? 'CADASTRO_CONSULTAR' :
      (action === 'consultar_auditoria' ? 'AUDITORIA_CONSULTAR' : 'PROCESSO_CONSULTAR'));
  var auth = apiKeyRow_(apiKeyValue_(event, body), scope);
  var context = { requestId: String(body.requestId || body.request_id || '') };
  if (action === 'consultar_processo' || action === 'validar_processo') {
    var identifier = apiIdentifier_(body);
    autAssert_(identifier.protocol || identifier.document, 'Informe protocolo ou CPF/CNPJ.', 'IDENTIFIER_REQUIRED');
    var rows = apiFindProcesses_(auth.owner, identifier.protocol, identifier.document);
    if (action === 'validar_processo') return { ok: true, data: { valid: rows.length === 1, matches: rows.length, protocols: rows.slice(0, 20).map(function(row) { return row.PROTOCOLO; }) } };
    autAssert_(rows.length, 'Processo não encontrado.', 'NOT_FOUND');
    var includeData = auth.scopes.indexOf('PROCESSO_DADOS_CONSULTAR') >= 0;
    return { ok: true, data: { items: rows.slice(0, 20).map(function(row) { return apiPublicProcess_(row, includeData); }), total: rows.length } };
  }
  if (action === 'consultar_cadastro') {
    var document = apiIdentifier_(body).document;
    var digits = autMasterCanonicalDocument_('', document);
    autAssert_(autCpfValido_(digits) || autValidateCnpj_(digits), 'CPF/CNPJ inválido.', 'INVALID_DOCUMENT');
    var type = autCpfValido_(digits) ? 'PF' : 'PJ';
    var clients = autMasterRowsByDocument_(digits, type).filter(autMasterActiveClient_);
    return { ok: true, data: { found: clients.length === 1, items: clients.slice(0, 10).map(function(row) { return autMasterClientPublic_(row, true); }) } };
  }
  if (action === 'consultar_auditoria') {
    var auditIdentifier = apiIdentifier_(body);
    autAssert_(auditIdentifier.protocol || body.processId, 'Informe processId ou protocolo.', 'IDENTIFIER_REQUIRED');
    var auditRows = apiFindProcesses_(auth.owner, auditIdentifier.protocol, '');
    if (body.processId) auditRows = auditRows.filter(function(row) { return String(row.ID_PROCESSO) === String(body.processId); });
    autAssert_(auditRows.length === 1, 'Processo não encontrado ou ambíguo.', 'NOT_FOUND');
    var auditProcess = auditRows[0];
    var auditItems = autRowsBy_('AUDITORIA', 'ID_ENTIDADE', auditProcess.ID_PROCESSO)
      .sort(function(a, b) { return Number(a.SEQUENCIA || 0) - Number(b.SEQUENCIA || 0); })
      .slice(-200)
      .map(function(row) {
        return { sequence: Number(row.SEQUENCIA || 0), at: row.DATA_HORA, action: row.ACAO,
          user: row.NOME_USUARIO, statusFrom: row.STATUS_ANTERIOR, statusTo: row.STATUS_NOVO,
          details: autJsonParse_(row.DETALHES_JSON || row.DETALHES, {}), hash: row.HASH_ATUAL || '' };
      });
    return { ok: true, data: { protocol: auditProcess.PROTOCOLO, processId: auditProcess.ID_PROCESSO, items: auditItems } };
  }
  if (action === 'editar_processo') {
    var editIdentifier = apiIdentifier_(body);
    autAssert_(editIdentifier.protocol || body.processId, 'Informe processId ou protocolo.', 'IDENTIFIER_REQUIRED');
    autAssert_(context.requestId && /^[A-Za-z0-9:_-]{8,120}$/.test(context.requestId), 'requestId obrigatório para edição.', 'REQUEST_ID_REQUIRED');
    autAssert_(body.expectedVersion !== undefined && body.expectedVersion !== null, 'expectedVersion obrigatório para edição.', 'PROCESS_VERSION_REQUIRED');
    var editRows = apiFindProcesses_(auth.owner, editIdentifier.protocol, '');
    if (body.processId) editRows = editRows.filter(function(row) { return String(row.ID_PROCESSO) === String(body.processId); });
    autAssert_(editRows.length === 1, 'Processo não encontrado ou ambíguo.', 'NOT_FOUND');
    var result = apiInternalSession_(auth.owner, function(internalToken) {
      return apiAtualizarProcesso(internalToken, editRows[0].ID_PROCESSO, body.data || {}, {
        expectedVersion: Number(body.expectedVersion), requestId: context.requestId, origem: 'API_JSON'
      });
    });
    autAssert_(result && result.ok, result && result.message || 'Não foi possível editar o processo.', result && result.code || 'API_EDIT_FAILED');
    return { ok: true, data: result.data };
  }
  throw autApiError_('Ação de API não reconhecida.', 'API_ACTION_INVALID');
}

function doPost(e) {
  try { return apiJsonOutput_(apiV1Request_(e || {}, apiRequestBody_(e || {}))); }
  catch (err) { return apiJsonOutput_({ ok: false, code: err.code || 'INTERNAL_ERROR', message: err.message || 'Não foi possível concluir a operação.' }); }
}

function apiCriarChaveIntegracao(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'API_CHAVE_GERIR');
    context = context || {};
    var requestKey = autClaimRequest_(actor, 'API_CHAVE_CRIAR', context);
    payload = payload || {};
    var name = String(payload.name || '').trim();
    autAssert_(name.length >= 3 && name.length <= 120, 'Informe um nome de integração válido.', 'VALIDATION_ERROR');
    var scopes = Array.from(new Set((Array.isArray(payload.scopes) ? payload.scopes : []).filter(function(scope) { return AUTENTIKO_API_SCOPES[scope]; })));
    autAssert_(scopes.length, 'Escolha ao menos um escopo.', 'VALIDATION_ERROR');
    if (payload.expiresAt) {
      var expiry = new Date(payload.expiresAt);
      autAssert_(!isNaN(expiry.getTime()) && expiry.getTime() > Date.now(), 'A expiração deve ser uma data futura válida.', 'VALIDATION_ERROR');
    }
    lock.waitLock(30000);
    var raw = 'ak_live_' + autRandom_(64).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    var id = autUuid_();
    autAppend_('API_CHAVES', { ID_API:id, NOME:name, PREFIXO:raw.slice(0, 16), CHAVE_HASH:autHash_(raw), ESCOPO_JSON:JSON.stringify(scopes), STATUS:'ATIVA', CRIADO_EM:autNow_(), CRIADO_POR_ID:actor.ID_USUARIO, CRIADO_POR:actor.NOME, ULTIMO_USO_EM:'', EXPIRA_EM:payload.expiresAt || '', REVOGADO_EM:'', RATE_LIMIT_MIN:Math.min(Math.max(Number(payload.rateLimit || 60), 1), 600), DESCRICAO:String(payload.description || '').slice(0, 500) });
    autAudit_(actor, 'API_CHAVE_CRIADA', 'API', id, { nome:name, escopos:scopes }, context);
    autCommitRequest_(requestKey);
    return autResult_({ id:id, key:raw, prefix:raw.slice(0, 16), scopes:scopes, warning:'Copie esta chave agora. Por segurança, ela não será exibida novamente.' });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiListarChavesIntegracao(token) {
  try {
    var actor = autRequireAuth_(token, 'API_CHAVE_GERIR');
    return autResult_({ scopes:AUTENTIKO_API_SCOPES, items:autRows_('API_CHAVES').map(function(row) { return { id:row.ID_API, name:row.NOME, prefix:row.PREFIXO, scopes:autJsonParse_(row.ESCOPO_JSON, []), status:row.STATUS, createdAt:row.CRIADO_EM, createdBy:row.CRIADO_POR, lastUsedAt:row.ULTIMO_USO_EM, expiresAt:row.EXPIRA_EM, description:row.DESCRICAO }; }) });
  } catch (err) { return autPublicError_(err); }
}

function apiAlterarStatusChaveIntegracao(token, id, status, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'API_CHAVE_GERIR');
    context = context || {};
    var requestKey = autClaimRequest_(actor, 'API_CHAVE_STATUS|' + String(id), context);
    autAssert_(['ATIVA', 'BLOQUEADA', 'REVOGADA'].indexOf(String(status)) >= 0, 'Status inválido.', 'VALIDATION_ERROR');
    lock.waitLock(30000);
    var row = autFind_('API_CHAVES', 'ID_API', id);
    autAssert_(row, 'Chave não encontrada.', 'NOT_FOUND');
    autAssert_(String(row.STATUS || '') !== 'REVOGADA' || String(status) === 'REVOGADA', 'Uma chave revogada não pode ser reativada.', 'API_KEY_REVOKED');
    autUpdateRow_('API_CHAVES', row._row, { STATUS:String(status), REVOGADO_EM:String(status) === 'REVOGADA' ? autNow_() : row.REVOGADO_EM });
    autAudit_(actor, 'API_CHAVE_STATUS_ALTERADO', 'API', id, { status:String(status) }, context);
    autCommitRequest_(requestKey);
    return autResult_({ id:id, status:String(status) });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}
