/**
 * API JSON externa do AUTENTIKO OK NUVEM.
 *
 * A API é deliberadamente server-to-server. O segredo nunca é enviado ao
 * navegador do AUTENTIKO nem armazenado em texto claro na planilha.
 * Use POST /exec?api=v1 com {apiKey, action, ...}.
 */
var AUTENTIKO_API_SCOPES = Object.freeze({
  AUTH_BRIDGE: 'Validar login e sessão para módulos oficiais AUTENTIKO',
  PROCESSO_CONSULTAR: 'Consultar processos e dados vinculados',
  PROCESSO_DADOS_CONSULTAR: 'Consultar dados cadastrais completos autorizados',
  CONTRATO_CONTEXTO_CONSULTAR: 'Consultar contexto contratual completo autorizado',
  BUSCA_INDICE_CONSULTAR: 'Consultar o catálogo materializado de pesquisa',
  DRIVE_INDICE_CONSULTAR: 'Consultar o índice de metadados do Drive',
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

function autEnsureApiKeysSheet_() {
  try { return autSheet_('API_CHAVES'); }
  catch (err) {
    autAssert_(err && err.code === 'SETUP_REQUIRED', err && err.message || 'Estrutura da API indisponível.', 'SETUP_REQUIRED');
    // Compatibilidade com instalações anteriores à API: cria somente a
    // estrutura ausente de forma idempotente, preservando todas as abas.
    autPrepareSheets_(autDb_());
    return autSheet_('API_CHAVES');
  }
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
  autEnsureApiKeysSheet_();
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

function apiRequireSuccessfulResult_(result) {
  autAssert_(result && result.ok, result && result.message || 'A operação AUTENTIKO não foi concluída.',
    result && result.code || 'INTERNAL_ERROR');
  return result.data;
}

function apiBridgeSessionPublic_(rawToken) {
  var actor = autRequireAuth_(rawToken);
  var session = autFind_('SESSOES', 'TOKEN_HASH', autHash_(String(rawToken || '')));
  return {
    token: String(rawToken || ''),
    expiresAt: session && session.EXPIRA_EM || '',
    user: autUserPublic_(actor)
  };
}

function apiContractContext_(actor, process) {
  var documentRows = autProcessDocumentRows_(process.ID_PROCESSO);
  var acceptedProposal = autAcceptedProposal_(process.ID_PROCESSO);
  var contractModel = acceptedProposal ? autContractModelForProposal_(acceptedProposal) : null;
  var propertyRow = process.ID_IMOVEL_BASE ? autFind_('BASE_IMOVEIS', 'ID_IMOVEL', process.ID_IMOVEL_BASE) : null;
  var clientRow = process.ID_CLIENTE_BASE ? autFind_('BASE_CLIENTES', 'ID_CADASTRO', process.ID_CLIENTE_BASE) : null;
  var publicDocuments = autProcessDocumentsPublic_(documentRows);
  var rawDocumentsById = {};
  documentRows.forEach(function(row) { rawDocumentsById[String(row.ID_DOCUMENTO)] = row; });
  publicDocuments.forEach(function(item) {
    var raw = rawDocumentsById[String(item.id)] || {};
    item.driveFileId = raw.ARQUIVO_ID || '';
  });
  return {
    schemaVersion: '1.0.0',
    generatedAt: autNow_(),
    process: autProcessCard_(process),
    data: autProcessDataMap_(process),
    participants: autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO)
      .filter(function(row) { return String(row.ATIVO) !== 'NAO'; })
      .map(autParticipantPublic_)
      .sort(function(a, b) { return a.order - b.order || String(a.name).localeCompare(String(b.name)); }),
    documents: publicDocuments,
    proposal: acceptedProposal ? autProposalPublic_(acceptedProposal) : null,
    contractModel: contractModel ? {
      id: contractModel.ID_MODELO,
      code: contractModel.CODIGO_MODELO || contractModel.ID_MODELO,
      type: contractModel.TIPO_PROPOSTA,
      name: contractModel.NOME_MODELO,
      title: contractModel.TITULO_CONTRATO,
      version: Number(contractModel.VERSAO || 1),
      legalStatus: contractModel.STATUS_JURIDICO,
      watermark: contractModel.MARCA_DAGUA,
      clauses: autRowsBy_('CLAUSULAS_CONTRATO', 'ID_MODELO', contractModel.ID_MODELO).filter(function(clause) {
        return String(clause.ATIVO) === 'SIM' && Number(clause.VERSAO || 1) === Number(contractModel.VERSAO || 1);
      }).map(function(clause) {
        return {
          id: clause.ID_CLAUSULA, order: Number(clause.ORDEM || 0),
          title: clause.TITULO, text: clause.TEXTO,
          legalStatus: clause.STATUS_JURIDICO, version: Number(clause.VERSAO || 1)
        };
      }).sort(function(a, b) { return a.order - b.order; })
    } : null,
    property: propertyRow ? autMasterPropertyPublic_(propertyRow, true) : null,
    client: clientRow ? autMasterClientPublic_(clientRow, true) : null,
    existingContracts: autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO)
      .map(autContractPublic_)
      .sort(function(a, b) { return Number(b.revision || 0) - Number(a.revision || 0); }),
    company: autPublicConfig_(),
    source: {
      app: AUTENTIKO.APP_NAME,
      version: AUTENTIKO.APP_VERSION,
      processVersion: autProcessVersion_(process),
      requestedBy: actor.ID_USUARIO
    }
  };
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
  var scope = 'PROCESSO_CONSULTAR';
  if (['auth_login', 'auth_validate_session', 'auth_logout'].indexOf(action) >= 0) scope = 'AUTH_BRIDGE';
  else if (action === 'search_index' || action === 'compare_index') scope = 'BUSCA_INDICE_CONSULTAR';
  else if (action === 'search_drive_index') scope = 'DRIVE_INDICE_CONSULTAR';
  else if (action === 'map_database' || action === 'rebuild_search_index' || action === 'rebuild_drive_index') scope = 'CONFIGURACAO_GERIR';
  else if (action === 'consultar_contrato_contexto') scope = 'CONTRATO_CONTEXTO_CONSULTAR';
  else if (action === 'editar_processo') scope = 'PROCESSO_EDITAR';
  else if (action === 'consultar_cadastro') scope = 'CADASTRO_CONSULTAR';
  else if (action === 'consultar_auditoria') scope = 'AUDITORIA_CONSULTAR';
  var auth = apiKeyRow_(apiKeyValue_(event, body), scope);
  var context = { requestId: String(body.requestId || body.request_id || '') };
  if (action === 'auth_login') {
    var loginPayload = {
      login: String(body.login || '').trim(),
      password: String(body.password || ''),
      context: { origem: 'AUTENTIKO_API_BRIDGE', requestId: context.requestId }
    };
    autAssert_(loginPayload.login.length <= 254 && loginPayload.password.length <= 256,
      'Credenciais inválidas.', 'INVALID_CREDENTIALS');
    return { ok: true, data: apiRequireSuccessfulResult_(apiLogin(loginPayload)) };
  }
  if (action === 'auth_validate_session') {
    return { ok: true, data: apiBridgeSessionPublic_(body.sessionToken || body.session_token || body.token) };
  }
  if (action === 'auth_logout') {
    var logoutToken = String(body.sessionToken || body.session_token || body.token || '');
    apiRequireSuccessfulResult_(apiLogout(logoutToken, { origem: 'AUTENTIKO_API_BRIDGE', requestId: context.requestId }));
    return { ok: true, data: { loggedOut: true } };
  }
  if (action === 'search_index') {
    var searchActor = autRequireAuth_(body.sessionToken || body.session_token || body.token);
    return apiRequireSuccessfulResult_(apiPesquisarIndice(body.sessionToken || body.session_token || body.token, body.filters || body));
  }
  if (action === 'compare_index') {
    var compareToken = body.sessionToken || body.session_token || body.token;
    autRequireAuth_(compareToken);
    return apiRequireSuccessfulResult_(apiCompararRegistrosIndice(compareToken, body.payload || body));
  }
  if (action === 'search_drive_index') {
    var driveSearchToken = body.sessionToken || body.session_token || body.token;
    autRequireAuth_(driveSearchToken, 'DOCUMENTO_BAIXAR');
    return apiRequireSuccessfulResult_(apiPesquisarDriveIndice(driveSearchToken, body.filters || body));
  }
  if (action === 'map_database') {
    var mapToken = body.sessionToken || body.session_token || body.token;
    autRequireAuth_(mapToken, 'CONFIGURACAO_GERIR');
    return apiRequireSuccessfulResult_(apiMapearBaseDados(mapToken));
  }
  if (action === 'rebuild_search_index') {
    var rebuildToken = body.sessionToken || body.session_token || body.token;
    autRequireAuth_(rebuildToken, 'CONFIGURACAO_GERIR');
    return apiRequireSuccessfulResult_(apiReconstruirIndiceBusca(rebuildToken));
  }
  if (action === 'rebuild_drive_index') {
    var rebuildDriveToken = body.sessionToken || body.session_token || body.token;
    autRequireAuth_(rebuildDriveToken, 'CONFIGURACAO_GERIR');
    return apiRequireSuccessfulResult_(apiReconstruirIndiceDrive(rebuildDriveToken, body.options || body));
  }
  if (action === 'consultar_contrato_contexto') {
    var actor = autRequireAuth_(body.sessionToken || body.session_token || body.token);
    autAssert_(autHasPermission_(actor, 'PROPOSTA_GERIR') || autHasPermission_(actor, 'CONTRATO_EMITIR') ||
      ['ADMINISTRADOR', 'DESENVOLVEDOR', 'GERENTE_ADMINISTRATIVO', 'GERENTE_GERAL'].indexOf(String(actor.PERFIL || '')) >= 0,
      'Você não tem permissão para consultar o contexto contratual.', 'FORBIDDEN');
    var contractIdentifier = apiIdentifier_(body);
    autAssert_(contractIdentifier.protocol || body.processId, 'Informe processId ou protocolo.', 'IDENTIFIER_REQUIRED');
    var contractRows = apiFindProcesses_(actor, contractIdentifier.protocol, '');
    if (body.processId) contractRows = contractRows.filter(function(row) { return String(row.ID_PROCESSO) === String(body.processId); });
    autAssert_(contractRows.length === 1, 'Processo não encontrado ou ambíguo.', 'NOT_FOUND');
    var contractProcess = autRequireProcess_(actor, contractRows[0].ID_PROCESSO);
    var contractContext = apiContractContext_(actor, contractProcess);
    autAudit_(actor, 'CONTEXTO_CONTRATUAL_CONSULTADO', 'PROCESSO', contractProcess.ID_PROCESSO,
      { protocolo: contractProcess.PROTOCOLO, origem: 'AUTENTIKO_OK_DOC' }, context);
    return { ok: true, data: contractContext };
  }
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
    autEnsureApiKeysSheet_();
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
    var randomPart = '';
    while (randomPart.length < 48) randomPart += autRandom_(64).replace(/[^A-Za-z0-9_-]/g, '');
    var raw = 'ak_live_' + randomPart.slice(0, 48);
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
    autEnsureApiKeysSheet_();
    return autResult_({ scopes:AUTENTIKO_API_SCOPES, items:autRows_('API_CHAVES').map(function(row) { return { id:row.ID_API, name:row.NOME, prefix:row.PREFIXO, scopes:autJsonParse_(row.ESCOPO_JSON, []), status:row.STATUS, createdAt:row.CRIADO_EM, createdBy:row.CRIADO_POR, lastUsedAt:row.ULTIMO_USO_EM, expiresAt:row.EXPIRA_EM, description:row.DESCRICAO }; }) });
  } catch (err) { return autPublicError_(err); }
}

function apiAlterarStatusChaveIntegracao(token, id, status, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'API_CHAVE_GERIR');
    autEnsureApiKeysSheet_();
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
