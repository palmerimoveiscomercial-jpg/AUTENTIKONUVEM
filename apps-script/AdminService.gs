function autRoleRank_(role) {
  return {
    CORRETOR: 1,
    ASSISTENTE_ADMINISTRATIVO: 2,
    AUDITOR: 3,
    GERENTE_ADMINISTRATIVO: 4,
    GERENTE_GERAL: 5,
    ADMINISTRADOR: 6,
    DESENVOLVEDOR: 7
  }[role] || 0;
}

function autUsersAdminData_(actor) {
  return {
    users: autRows_('USUARIOS').filter(function(row) { return row.STATUS !== 'EXCLUIDO'; }).map(autUserPublic_),
    roles: AUTENTIKO.ROLES.slice(),
    statuses: AUTENTIKO.USER_STATUS.slice(),
    permissions: AUTENTIKO_PERMISSIONS,
    actorRole: actor.PERFIL
  };
}

function apiListarUsuarios(token) {
  try {
    var actor = autRequireAuth_(token, 'USUARIO_GERIR');
    return autResult_(autUsersAdminData_(actor));
  } catch (err) { return autPublicError_(err); }
}

function apiSalvarUsuario(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'USUARIO_GERIR');
    payload = payload || {};
    var role = String(payload.role || 'CORRETOR');
    var status = String(payload.status || 'ATIVO');
    autAssert_(AUTENTIKO.ROLES.indexOf(role) >= 0, 'Perfil inválido.');
    autAssert_(AUTENTIKO.USER_STATUS.indexOf(status) >= 0, 'Status inválido.');
    if (role === 'DESENVOLVEDOR') autAssert_(actor.PERFIL === 'DESENVOLVEDOR', 'Somente o desenvolvedor pode promover outro desenvolvedor.', 'FORBIDDEN');
    autAssert_(autRoleRank_(role) <= autRoleRank_(actor.PERFIL), 'Você não pode atribuir um perfil acima do seu.', 'FORBIDDEN');
    var name = String(payload.name || '').trim();
    var email = autNormalizeEmail_(payload.email);
    var username = String(payload.username || '').trim();
    autAssert_(name.length >= 3, 'Informe o nome.');
    autAssert_(name.length <= 150, 'O nome deve ter no máximo 150 caracteres.', 'FIELD_TOO_LARGE');
    autAssert_(email.length <= 254, 'O e-mail informado é muito extenso.', 'FIELD_TOO_LARGE');
    autAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'E-mail inválido.');
    autAssert_(/^[A-Za-z0-9._-]{4,40}$/.test(username), 'Usuário inválido.');
    var permissions = Array.isArray(payload.permissions) ? Array.from(new Set(payload.permissions.filter(function(permission) { return AUTENTIKO_PERMISSIONS[permission]; }))) : [];
    lock.waitLock(30000);
    var existing = payload.id ? autFind_('USUARIOS', 'ID_USUARIO', payload.id) : null;
    var duplicate = autRows_('USUARIOS').filter(function(row) {
      return row.ID_USUARIO !== (existing && existing.ID_USUARIO) && row.STATUS !== 'EXCLUIDO' &&
        (autNormalizeEmail_(row.EMAIL) === email || autNormalize_(row.USUARIO) === autNormalize_(username));
    })[0];
    autAssert_(!duplicate, 'E-mail ou usuário já cadastrado.', 'DUPLICATE_USER');
    if (existing) {
      autAssert_(existing.PERFIL !== 'DESENVOLVEDOR' || actor.PERFIL === 'DESENVOLVEDOR', 'Somente desenvolvedores podem alterar este usuário.', 'FORBIDDEN');
      autAssert_(existing.ID_USUARIO !== actor.ID_USUARIO || status === 'ATIVO', 'Você não pode bloquear o próprio acesso.');
      autUpdateRow_('USUARIOS', existing._row, {
        NOME: name, EMAIL: email, USUARIO: username, PERFIL: role, STATUS: status,
        PERMISSOES_JSON: JSON.stringify(permissions), ATUALIZADO_EM: autNow_()
      });
      autAudit_(actor, 'USUARIO_ATUALIZADO', 'USUARIO', existing.ID_USUARIO, { perfil: role, status: status, permissoes: permissions }, context);
      return autResult_({ id: existing.ID_USUARIO, updated: true });
    }
    var password = payload.password ? String(payload.password) : autTemporaryPassword_(16);
    autAssert_(password.length >= 10 && password.length <= 256, 'A senha inicial deve ter entre 10 e 256 caracteres.');
    var salt = autRandom_(24);
    var id = autUuid_();
    autAppend_('USUARIOS', {
      ID_USUARIO: id, NOME: name, EMAIL: email, USUARIO: username,
      SENHA_HASH: autPasswordHash_(password, salt), SALT: salt, PERFIL: role, STATUS: status,
      PERMISSOES_JSON: JSON.stringify(permissions), EMAIL_VERIFICADO: 'NAO', CRIADO_EM: autNow_(),
      ATUALIZADO_EM: autNow_(), ULTIMO_ACESSO: '', TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '',
      DEVE_TROCAR_SENHA: 'SIM'
    });
    autAudit_(actor, 'USUARIO_CRIADO_ADMIN', 'USUARIO', id, { perfil: role, status: status }, context);
    return autResult_({ id: id, created: true, temporaryPassword: payload.password ? '' : password });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiAcaoUsuario(token, userId, action, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'USUARIO_GERIR');
    lock.waitLock(30000);
    var user = autFind_('USUARIOS', 'ID_USUARIO', userId);
    autAssert_(user, 'Usuário não encontrado.', 'NOT_FOUND');
    autAssert_(user.ID_USUARIO !== actor.ID_USUARIO, 'Você não pode executar esta ação no próprio usuário.');
    autAssert_(user.PERFIL !== 'DESENVOLVEDOR' || actor.PERFIL === 'DESENVOLVEDOR', 'Somente desenvolvedores podem alterar este usuário.', 'FORBIDDEN');
    var nextStatus = { BLOQUEAR: 'BLOQUEADO', DESBLOQUEAR: 'ATIVO', APROVAR: 'ATIVO', EXCLUIR: 'EXCLUIDO' }[action];
    autAssert_(nextStatus, 'Ação inválida.');
    autUpdateRow_('USUARIOS', user._row, { STATUS: nextStatus, ATUALIZADO_EM: autNow_(), BLOQUEADO_ATE: '' });
    if (nextStatus === 'BLOQUEADO' || nextStatus === 'EXCLUIDO') {
      autRows_('SESSOES').filter(function(row) { return row.ID_USUARIO === userId && !row.REVOGADO_EM; }).forEach(function(row) { autUpdateRow_('SESSOES', row._row, { REVOGADO_EM: autNow_() }); });
    }
    autAudit_(actor, 'USUARIO_' + action, 'USUARIO', userId, { statusAnterior: user.STATUS, statusNovo: nextStatus }, context);
    return autResult_({ status: nextStatus });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiDefinirSenhaUsuario(token, userId, newPassword, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token);
    autAssert_(actor.PERFIL === 'DESENVOLVEDOR', 'Somente o desenvolvedor pode definir diretamente a senha de outro usuário.', 'FORBIDDEN');
    lock.waitLock(30000);
    var user = autFind_('USUARIOS', 'ID_USUARIO', userId);
    autAssert_(user, 'Usuário não encontrado.', 'NOT_FOUND');
    var password = String(newPassword || '');
    autAssert_(password.length >= 10 && password.length <= 256 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 'A senha deve ter entre 10 e 256 caracteres, letra maiúscula, minúscula e número.');
    var salt = autRandom_(24);
    autUpdateRow_('USUARIOS', user._row, { SENHA_HASH: autPasswordHash_(password, salt), SALT: salt, ATUALIZADO_EM: autNow_(), TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '', DEVE_TROCAR_SENHA: 'SIM' });
    autRows_('SESSOES').filter(function(row) { return row.ID_USUARIO === userId && !row.REVOGADO_EM; }).forEach(function(row) { autUpdateRow_('SESSOES', row._row, { REVOGADO_EM: autNow_() }); });
    autAudit_(actor, 'SENHA_USUARIO_DEFINIDA', 'USUARIO', userId, {}, context);
    return autResult_({ updated: true });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiTrocarMinhaSenha(token, currentPassword, newPassword, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token);
    lock.waitLock(30000);
    user = autFind_('USUARIOS', 'ID_USUARIO', user.ID_USUARIO);
    autAssert_(autPasswordHash_(String(currentPassword || ''), user.SALT) === String(user.SENHA_HASH), 'Senha atual incorreta.', 'INVALID_CREDENTIALS');
    var password = String(newPassword || '');
    autAssert_(password.length >= 10 && password.length <= 256 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 'A nova senha deve ter entre 10 e 256 caracteres, letra maiúscula, minúscula e número.');
    var salt = autRandom_(24);
    autUpdateRow_('USUARIOS', user._row, { SENHA_HASH: autPasswordHash_(password, salt), SALT: salt, ATUALIZADO_EM: autNow_(), DEVE_TROCAR_SENHA: 'NAO' });
    var currentHash = autHash_(token);
    autRows_('SESSOES').filter(function(row) {
      return row.ID_USUARIO === user.ID_USUARIO && !row.REVOGADO_EM && row.TOKEN_HASH !== currentHash;
    }).forEach(function(row) { autUpdateRow_('SESSOES', row._row, { REVOGADO_EM: autNow_() }); });
    autAudit_(user, 'PROPRIA_SENHA_ALTERADA', 'USUARIO', user.ID_USUARIO, {}, context);
    return autResult_({ updated: true });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiListarConfiguracoes(token) {
  try {
    var actor = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    return autResult_(autConfigsAdminData_(actor));
  } catch (err) { return autPublicError_(err); }
}

function autConfigsAdminData_(actor) {
  var configs = autRows_('CONFIGURACOES').map(function(row) {
      var sensitive = row.TIPO === 'SENSITIVE';
      var rawValue = row.VALOR instanceof Date ? Utilities.formatDate(row.VALOR, AUTENTIKO.TIMEZONE, 'yyyy-MM-dd') : row.VALOR;
      return {
        key: row.CHAVE,
        value: sensitive ? '' : rawValue,
        maskedValue: sensitive ? '••••••••' : '',
        hasValue: sensitive && String(rawValue || '').length > 0,
        group: row.GRUPO,
        type: row.TIPO,
        description: row.DESCRICAO,
        editable: autNormalize_(row.EDITAVEL) === 'SIM'
      };
  });
  return { configs: configs, actorRole: actor.PERFIL };
}

function autNormalizeConfigDate_(value) {
  var text = String(value || '').trim();
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    var br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) match = [text, br[3], br[2], br[1]];
  }
  autAssert_(match, 'Informe uma data válida.');
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  autAssert_(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day, 'Informe uma data válida.');
  return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function autNormalizeConfigValue_(config, rawValue) {
  var type = autNormalize_(config.TIPO || 'TEXT');
  var value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  if (type === 'SENSITIVE' && (value == null || value === '')) return { keepExisting: true, value: config.VALOR };
  if (type === 'BOOLEAN') {
    var normalizedBoolean = autNormalize_(value);
    autAssert_(['SIM', 'NAO', 'TRUE', 'FALSE'].indexOf(normalizedBoolean) >= 0 || typeof value === 'boolean', 'Selecione Sim ou Não.');
    value = normalizedBoolean === 'SIM' || normalizedBoolean === 'TRUE' || value === true ? 'SIM' : 'NAO';
  } else if (type === 'NUMBER') {
    autAssert_(value !== '' && isFinite(Number(value)), 'Informe um número válido.');
    value = String(Number(value));
  } else if (type === 'JSON') {
    var jsonText = typeof rawValue === 'string' ? rawValue.trim() : JSON.stringify(rawValue);
    try { JSON.parse(jsonText); } catch (err) { autAssert_(false, 'JSON inválido.'); }
    value = jsonText;
  } else if (type === 'URL') {
    value = String(value || '');
    autAssert_(!value || /^https:\/\/[^\s]+$/i.test(value), 'Informe uma URL segura iniciada por https://.');
  } else if (type === 'COLOR') {
    value = String(value || '').toUpperCase();
    autAssert_(/^#[0-9A-F]{6}$/.test(value), 'Informe uma cor no formato #RRGGBB.');
  } else if (type === 'DATE') {
    value = autNormalizeConfigDate_(value);
  } else {
    value = String(value == null ? '' : value);
  }
  if (/EMAIL/i.test(String(config.CHAVE || '')) && value) {
    autAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value)), 'Informe um e-mail válido.');
    value = autNormalizeEmail_(value);
  }
  return { keepExisting: false, value: value };
}

function apiSalvarConfiguracao(token, key, value, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    var safeKey = String(key || '').trim();
    autAssert_(safeKey.length > 0 && safeKey.length <= 120, 'Configuração inválida.');
    lock.waitLock(30000);
    var config = autFind_('CONFIGURACOES', 'CHAVE', safeKey);
    autAssert_(config, 'Configuração não encontrada.', 'NOT_FOUND');
    autAssert_(autNormalize_(config.EDITAVEL) === 'SIM', 'Esta configuração não pode ser editada.');
    if (safeKey === 'MODO_MANUTENCAO') autAssert_(actor.PERFIL === 'DESENVOLVEDOR', 'Somente o desenvolvedor pode alterar o modo de manutenção.', 'FORBIDDEN');
    var normalized = autNormalizeConfigValue_(config, value);
    if (normalized.keepExisting) return autResult_({ updated: false, keptExisting: true });
    var serializedValue = typeof normalized.value === 'string' ? normalized.value : JSON.stringify(normalized.value == null ? '' : normalized.value);
    var maxLength = config.TIPO === 'JSON' ? 45000 : 5000;
    autAssert_(Utilities.newBlob(serializedValue, 'text/plain').getBytes().length <= maxLength, 'O valor da configuração ultrapassa o limite permitido.', 'PAYLOAD_TOO_LARGE');
    autUpdateRow_('CONFIGURACOES', config._row, { VALOR: normalized.value, ATUALIZADO_EM: autNow_(), ATUALIZADO_POR: actor.NOME });
    autInvalidateCaches_();
    autAudit_(actor, 'CONFIGURACAO_ALTERADA', 'CONFIGURACAO', safeKey, { tipo: config.TIPO }, context);
    return autResult_({ updated: true });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiListarCatalogoDocumentos(token) {
  try {
    autRequireAuth_(token, 'FORMULARIO_GERIR');
    return autResult_(autDocumentsAdminData_());
  } catch (err) { return autPublicError_(err); }
}

function autDocumentsAdminData_() {
  return { documents: autRows_('DOCUMENTOS_CATALOGO').map(function(row) {
      var processTypes = autJsonParse_(row.TIPOS_PROCESSO_JSON, []);
      var requiredProcessTypes = autJsonParse_(row.TIPOS_OBRIGATORIOS_JSON, []);
      if (!requiredProcessTypes.length && autNormalize_(row.OBRIGATORIO) === 'SIM' && !String(row.TIPOS_OBRIGATORIOS_JSON || '').trim()) {
        requiredProcessTypes = processTypes.slice();
      }
      return {
        id: row.ID_DOCUMENTO_TIPO, name: row.NOME_DOCUMENTO, processTypes: processTypes,
        requiredProcessTypes: requiredProcessTypes, required: requiredProcessTypes.length > 0,
        categories: autJsonParse_(row.CATEGORIAS_JSON, []),
        active: autNormalize_(row.ATIVO) !== 'NAO',
        order: Number(row.ORDEM || 0), mimeTypes: row.MIME_ACEITOS, maxMb: Number(row.TAMANHO_MAX_MB || AUTENTIKO.MAX_UPLOAD_MB)
      };
  }).sort(function(a, b) {
    return a.order - b.order || String(a.name || '').localeCompare(String(b.name || ''));
  }) };
}

function apiSalvarTipoDocumento(token, payload, context) {
  try {
    var actor = autRequireAuth_(token, 'FORMULARIO_GERIR');
    payload = payload || {};
    var id = String(payload.id || 'DOC_' + autNormalize_(payload.name).replace(/[^A-Z0-9]+/g, '_') + '_' + autHash_(autUuid_()).slice(0, 8).toUpperCase());
    var documentName = String(payload.name || '').trim();
    var processTypes = Array.isArray(payload.processTypes) ? payload.processTypes : AUTENTIKO.PROCESS_TYPES;
    var requiredProcessTypes = Array.isArray(payload.requiredProcessTypes) ? payload.requiredProcessTypes : (payload.required ? processTypes.slice() : []);
    var categories = Array.isArray(payload.categories) ? Array.from(new Set(payload.categories.map(String))) : [];
    var mimeTypes = String(payload.mimeTypes || 'application/pdf,image/jpeg,image/png');
    autAssert_(documentName.length >= 3, 'Informe o nome do documento.');
    autAssert_(documentName.length <= 200, 'O nome do documento deve ter no máximo 200 caracteres.', 'FIELD_TOO_LARGE');
    autAssert_(id.length <= 150, 'O identificador do documento é muito extenso.', 'FIELD_TOO_LARGE');
    autAssert_(processTypes.every(function(type) { return AUTENTIKO.PROCESS_TYPES.indexOf(type) >= 0; }), 'Há um tipo de processo inválido.');
    autAssert_(requiredProcessTypes.every(function(type) { return processTypes.indexOf(type) >= 0; }), 'Um documento só pode ser obrigatório quando estiver disponível para o tipo de processo.');
    autAssert_(categories.every(function(category) { return AUTENTIKO.REVIEW_CATEGORIES.indexOf(category) >= 0; }), 'Há uma categoria gerencial inválida.');
    autAssert_(mimeTypes.length <= 500, 'A lista de formatos permitidos é muito extensa.', 'FIELD_TOO_LARGE');
    var catalogMaximumMb = mimeTypes.toLowerCase().indexOf('application/pdf') >= 0 ? 100 : 25;
    var row = {
      ID_DOCUMENTO_TIPO: id, NOME_DOCUMENTO: documentName,
      TIPOS_PROCESSO_JSON: JSON.stringify(processTypes),
      TIPOS_OBRIGATORIOS_JSON: JSON.stringify(requiredProcessTypes),
      CATEGORIAS_JSON: JSON.stringify(categories),
      OBRIGATORIO: requiredProcessTypes.length ? 'SIM' : 'NAO', ATIVO: payload.active === false ? 'NAO' : 'SIM',
      ORDEM: Number(payload.order || 999), MIME_ACEITOS: mimeTypes,
      TAMANHO_MAX_MB: Math.min(Math.max(Number(payload.maxMb || AUTENTIKO.MAX_UPLOAD_MB), 1), catalogMaximumMb),
      CRIADO_EM: autNow_()
    };
    autUpsert_('DOCUMENTOS_CATALOGO', 'ID_DOCUMENTO_TIPO', row);
    autInvalidateCaches_();
    autAudit_(actor, 'TIPO_DOCUMENTO_SALVO', 'DOCUMENTO_TIPO', id, {
      nome: row.NOME_DOCUMENTO,
      tiposDisponiveis: processTypes,
      tiposObrigatorios: requiredProcessTypes,
      categorias: categories
    }, context);
    return autResult_({ id: id });
  } catch (err) { return autPublicError_(err); }
}

function apiSalvarCampoFormulario(token, payload, context) {
  try {
    var actor = autRequireAuth_(token, 'FORMULARIO_GERIR');
    payload = payload || {};
    autAssert_(AUTENTIKO.PROCESS_TYPES.indexOf(payload.processType) >= 0, 'Tipo de processo inválido.');
    var fieldName = String(payload.name || '').trim();
    var fieldLabel = String(payload.label || '').trim();
    var fieldSection = String(payload.section || 'Outros dados').trim();
    var allowedInputs = ['text', 'textarea', 'select', 'date', 'email', 'number', 'currency', 'cpf', 'cep', 'tel'];
    var options = Array.isArray(payload.options) ? payload.options.map(function(item) { return String(item).trim(); }).filter(Boolean) : [];
    var conditionJson = payload.condition ? JSON.stringify(payload.condition) : '';
    autAssert_(fieldName && fieldLabel, 'Informe nome e rótulo do campo.');
    autAssert_(/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(fieldName), 'O nome técnico do campo é inválido.');
    autAssert_(fieldLabel.length <= 200 && fieldSection.length <= 120, 'Rótulo ou seção muito extenso.', 'FIELD_TOO_LARGE');
    autAssert_(allowedInputs.indexOf(payload.input || 'text') >= 0, 'Formato de campo inválido.');
    autAssert_(options.length <= 100 && options.every(function(item) { return item.length <= 200; }), 'As opções do campo ultrapassam o limite permitido.', 'PAYLOAD_TOO_LARGE');
    autAssert_(Utilities.newBlob(JSON.stringify(options), 'application/json').getBytes().length <= 10000, 'As opções do campo ultrapassam o limite permitido.', 'PAYLOAD_TOO_LARGE');
    autAssert_(Utilities.newBlob(conditionJson, 'application/json').getBytes().length <= 2000, 'A condição do campo ultrapassa o limite permitido.', 'PAYLOAD_TOO_LARGE');
    var id = payload.id || payload.processType + '.' + fieldName;
    autAssert_(String(id).length <= 180, 'O identificador do campo é muito extenso.', 'FIELD_TOO_LARGE');
    autUpsert_('FORMULARIOS', 'ID_CAMPO', {
      ID_CAMPO: id, TIPO_PROCESSO: payload.processType, SECAO: fieldSection,
      CAMPO: fieldName, ROTULO: fieldLabel, TIPO_CAMPO: payload.input || 'text',
      OPCOES_JSON: JSON.stringify(options), OBRIGATORIO: payload.required ? 'SIM' : 'NAO',
      ORDEM: Number(payload.order || 999), ATIVO: payload.active === false ? 'NAO' : 'SIM',
      CONDICAO_JSON: conditionJson
    });
    autInvalidateCaches_();
    autAudit_(actor, 'CAMPO_FORMULARIO_SALVO', 'CAMPO_FORMULARIO', id, { tipoProcesso: payload.processType }, context);
    return autResult_({ id: id });
  } catch (err) { return autPublicError_(err); }
}

function autAdminHealthData_(actor, includeRemote) {
  autAssert_(autHasPermission_(actor, 'CONFIGURACAO_GERIR') || actor.PERFIL === 'DESENVOLVEDOR',
    'Você não possui acesso ao diagnóstico administrativo.', 'FORBIDDEN');
  var configs = autConfigMap_();
  var audit = autVerifyAuditRows_();
  var auditRows = autRows_('AUDITORIA').sort(function(a, b) { return Number(a.SEQUENCIA || 0) - Number(b.SEQUENCIA || 0); });
  var lastAudit = auditRows.length ? auditRows[auditRows.length - 1] : {};
  var documents = autRows_('PROCESSO_DOCUMENTOS').filter(function(row) { return !row.EXCLUIDO_EM; });
  var totalBytes = documents.reduce(function(total, row) { return total + Number(row.TAMANHO_BYTES || 0); }, 0);
  var mediaReady = documents.filter(function(row) { return row.MEDIA_STATUS === 'READY'; }).length;
  var mediaPending = documents.filter(function(row) {
    return row.MEDIA_STATUS && row.MEDIA_STATUS !== 'READY' && row.MEDIA_STATUS !== 'DRIVE_ONLY';
  }).length;
  var scriptProperties = PropertiesService.getScriptProperties();
  var baseUrl = String(configs.MEDIA_API_BASE_URL || '').replace(/\/+$/, '');
  var cloudEnabled = mediaCloudEnabled_();
  var remote = { checked: false, healthy: false, status: 0, latencyMs: 0, message: 'Teste remoto não solicitado.' };
  if (includeRemote && baseUrl) {
    var started = Date.now();
    remote.checked = true;
    try {
      var response = UrlFetchApp.fetch(baseUrl + '/api/health', {
        method: 'get', muteHttpExceptions: true, followRedirects: false,
        headers: { 'Cache-Control': 'no-cache', 'X-Autentiko-Health': '1' }
      });
      remote.status = response.getResponseCode();
      remote.healthy = remote.status >= 200 && remote.status < 300;
      remote.message = remote.healthy ? 'API documental respondeu corretamente.' : 'API respondeu com HTTP ' + remote.status + '.';
    } catch (err) {
      remote.message = 'API documental indisponível: ' + String(err && err.message || err).slice(0, 180);
    }
    remote.latencyMs = Date.now() - started;
  }
  var installed = autFind_('CONFIGURACOES', 'CHAVE', 'VERSAO_SISTEMA');
  return {
    checkedAt: autNow_(), appVersion: AUTENTIKO.APP_VERSION,
    installedVersion: installed ? String(installed.VALOR || '') : '',
    versionConsistent: !!installed && String(installed.VALOR || '') === AUTENTIKO.APP_VERSION,
    developerFullAccess: actor.PERFIL === 'DESENVOLVEDOR' && autHasPermission_(actor, 'CONFIGURACAO_GERIR') && autHasPermission_(actor, 'AUDITORIA_VER'),
    immutableRules: {
      finalizedProcess: true, auditApplicationAppendOnly: true,
      developerMayAdministrate: actor.PERFIL === 'DESENVOLVEDOR',
      developerMayEraseAudit: false
    },
    audit: {
      valid: audit.valid, linear: audit.linear, records: audit.records,
      failures: audit.failures.length, lastSequence: Number(lastAudit.SEQUENCIA || 0),
      rootHash: String(lastAudit.HASH_ATUAL || ''),
      externalAnchorEnabled: autNormalize_(configs.AUDIT_ANCHOR_ENABLED) === 'SIM'
    },
    media: {
      enabled: cloudEnabled, provider: String(configs.MEDIA_PROVIDER || 'SUPABASE_EDGE'),
      apiUrlConfigured: !!baseUrl,
      signingSecretConfigured: String(scriptProperties.getProperty('AUT_MEDIA_SIGNING_SECRET') || '').length >= 32,
      documents: documents.length, ready: mediaReady, pending: mediaPending,
      bytes: totalBytes, megabytes: Math.round(totalBytes / 1048576 * 100) / 100,
      remote: remote
    },
    users: {
      total: autRows_('USUARIOS').filter(function(row) { return row.STATUS !== 'EXCLUIDO'; }).length,
      active: autRows_('USUARIOS').filter(function(row) { return row.STATUS === 'ATIVO'; }).length
    }
  };
}

function apiAdminSaudeSistema(token, includeRemote) {
  try {
    var actor = autRequireAuth_(token);
    return autResult_(autAdminHealthData_(actor, includeRemote === true));
  } catch (err) { return autPublicError_(err); }
}

function apiAdminSalvarSegredoMidia(token, signingSecret, context) {
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'CONFIGURACAO_GERIR') || actor.PERFIL === 'DESENVOLVEDOR',
      'Você não possui permissão para configurar a nuvem documental.', 'FORBIDDEN');
    var secret = String(signingSecret || '').trim();
    autAssert_(secret.length >= 64 && secret.length <= 256,
      'A chave de assinatura deve possuir entre 64 e 256 caracteres.', 'INVALID_MEDIA_SIGNING_SECRET');
    autAssert_(/^[A-Za-z0-9_-]+$/.test(secret),
      'A chave de assinatura contém caracteres inválidos.', 'INVALID_MEDIA_SIGNING_SECRET');
    PropertiesService.getScriptProperties().setProperty('AUT_MEDIA_SIGNING_SECRET', secret);
    autAudit_(actor, 'SEGREDO_MIDIA_ATUALIZADO', 'CONFIGURACAO', 'AUT_MEDIA_SIGNING_SECRET', {
      configured: true,
      length: secret.length,
      valueExposed: false
    }, context || {});
    return autResult_({ configured: true });
  } catch (err) { return autPublicError_(err); }
}

function apiAdminBootstrap(token, section) {
  try {
    var actor = autRequireAuth_(token);
    var data = {};
    var requested = autNormalize_(section || '');
    var loadAll = !requested;
    data.availableTabs = [];
    if (autHasPermission_(actor, 'USUARIO_GERIR')) data.availableTabs.push('users');
    if (autHasPermission_(actor, 'FORMULARIO_GERIR')) data.availableTabs = data.availableTabs.concat(['documents', 'fields']);
    if (autHasPermission_(actor, 'CONTRATO_MODELO_GERIR')) data.availableTabs.push('models');
    if (autHasPermission_(actor, 'CONFIGURACAO_GERIR')) data.availableTabs = data.availableTabs.concat(['settings', 'security']);
    if (autHasPermission_(actor, 'API_CHAVE_GERIR')) data.availableTabs.push('api');
    if ((loadAll || requested === 'USERS') && autHasPermission_(actor, 'USUARIO_GERIR')) data.users = autUsersAdminData_(actor);
    if ((loadAll || requested === 'DOCUMENTS' || requested === 'FIELDS') && autHasPermission_(actor, 'FORMULARIO_GERIR')) {
      if (loadAll || requested === 'DOCUMENTS') data.documents = autDocumentsAdminData_();
      if (loadAll || requested === 'FIELDS') {
        data.forms = autRows_('FORMULARIOS').map(function(row) {
          return { id: row.ID_CAMPO, processType: row.TIPO_PROCESSO, section: row.SECAO, name: row.CAMPO, label: row.ROTULO, input: row.TIPO_CAMPO, options: autJsonParse_(row.OPCOES_JSON, []), required: autNormalize_(row.OBRIGATORIO) === 'SIM', order: Number(row.ORDEM || 0), active: autNormalize_(row.ATIVO) !== 'NAO' };
        });
      }
    }
    if ((loadAll || requested === 'SETTINGS') && autHasPermission_(actor, 'CONFIGURACAO_GERIR')) data.configs = autConfigsAdminData_(actor);
    if ((loadAll || requested === 'SECURITY') && autHasPermission_(actor, 'CONFIGURACAO_GERIR')) data.security = autAdminHealthData_(actor, false);
    if ((loadAll || requested === 'API') && autHasPermission_(actor, 'API_CHAVE_GERIR')) data.api = {
      scopes: AUTENTIKO_API_SCOPES,
      items: autRows_('API_CHAVES').map(function(row) { return { id: row.ID_API, name: row.NOME, prefix: row.PREFIXO, scopes: autJsonParse_(row.ESCOPO_JSON, []), status: row.STATUS, createdAt: row.CRIADO_EM, createdBy: row.CRIADO_POR, lastUsedAt: row.ULTIMO_USO_EM, expiresAt: row.EXPIRA_EM, description: row.DESCRICAO }; })
    };
    if ((loadAll || requested === 'MODELS') && autHasPermission_(actor, 'CONTRATO_MODELO_GERIR')) {
      data.contractModels = autRows_('MODELOS_CONTRATO').map(function(row) {
        var modelVersion = Number(row.VERSAO || 1);
        return {
          id: row.ID_MODELO, proposalType: row.TIPO_PROPOSTA, name: row.NOME_MODELO,
          title: row.TITULO_CONTRATO, version: modelVersion,
          legalStatus: row.STATUS_JURIDICO, watermark: row.MARCA_DAGUA,
          active: String(row.ATIVO) !== 'NAO',
          clauses: autRowsBy_('CLAUSULAS_CONTRATO', 'ID_MODELO', row.ID_MODELO).filter(function(clause) {
            return String(clause.ATIVO) !== 'NAO' && Number(clause.VERSAO || 1) === modelVersion;
          }).map(function(clause) {
            return { id: clause.ID_CLAUSULA, order: Number(clause.ORDEM || 0), title: clause.TITULO, text: clause.TEXTO };
          }).sort(function(a, b) { return a.order - b.order; })
        };
      });
    }
    data.loadedSection = requested ? requested.toLowerCase() : 'all';
    data.workflowCatalog = {
      categories: AUTENTIKO.REVIEW_CATEGORIES.map(function(value) { return { value: value, label: autLabel_(value) }; }),
      participantRoles: AUTENTIKO.PARTICIPANT_ROLES.map(function(value) { return { value: value, label: autLabel_(value) }; }),
      proposalTypes: AUTENTIKO.PROPOSAL_TYPES.map(function(value) { return { value: value, label: autLabel_(value) }; })
    };
    return autResult_(data);
  } catch (err) { return autPublicError_(err); }
}
