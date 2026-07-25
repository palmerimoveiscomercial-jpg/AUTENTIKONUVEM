function autAudit_(actor, action, entity, entityId, details, context) {
  var lock = LockService.getScriptLock();
  var ownsLock = !lock.hasLock();
  if (ownsLock) lock.waitLock(10000);
  try {
    var sheet = autSheet_('AUDITORIA');
    var lastRow = sheet.getLastRow();
    var sequence = 1;
    var previousHash = '';
    if (lastRow >= 2) {
      var headers = autHeaders_(sheet);
      var sequenceIndex = headers.indexOf('SEQUENCIA');
      var hashIndex = headers.indexOf('HASH_ATUAL');
      if (sequenceIndex >= 0) sequence = Number(sheet.getRange(lastRow, sequenceIndex + 1).getValue() || 0) + 1;
      if (hashIndex >= 0) previousHash = String(sheet.getRange(lastRow, hashIndex + 1).getValue() || '');
    }
    var ctx = autContext_(context);
    var id = autUuid_();
    var timestamp = autNow_();
    var userId = actor && actor.ID_USUARIO ? actor.ID_USUARIO : '';
    var userName = actor && (actor.NOME || actor.USUARIO || actor.EMAIL) ? (actor.NOME || actor.USUARIO || actor.EMAIL) : 'SISTEMA';
    var userRole = actor && actor.PERFIL ? actor.PERFIL : 'SISTEMA';
    var sessionId = actor && actor._sessionId ? actor._sessionId : '';
    var detailJson = autJson_(autCleanObject_(details || {}));
    var deviceJson = autJson_(ctx.dispositivo);
    var locationJson = autJson_(ctx.localizacao);
    var material = [
      previousHash, sequence, timestamp, userId, userName, userRole, sessionId,
      action, entity, entityId, detailJson, deviceJson, locationJson,
      ctx.ipPublico, ctx.timezone, ctx.requestId
    ].join('|');
    var currentHash = autHash_(material);
    autAppend_('AUDITORIA', {
      ID_AUDITORIA: id,
      SEQUENCIA: sequence,
      DATA_HORA: timestamp,
      ID_USUARIO: userId,
      USUARIO: userName,
      ACAO: action,
      ENTIDADE: entity,
      ID_ENTIDADE: entityId || '',
      DETALHES_JSON: detailJson,
      DISPOSITIVO_JSON: deviceJson,
      LOCALIZACAO_JSON: locationJson,
      HASH_ANTERIOR: previousHash,
      HASH_ATUAL: currentHash,
      ID_SESSAO: sessionId,
      IP_PUBLICO: ctx.ipPublico,
      TIMEZONE: ctx.timezone,
      REQUEST_ID: ctx.requestId,
      PERFIL_USUARIO: userRole,
      VERSAO_HASH: '2'
    });
    SpreadsheetApp.flush();
    return currentHash;
  } finally {
    if (ownsLock) lock.releaseLock();
  }
}

function autAuditForEntity_(entity, entityId) {
  return autRowsBy_('AUDITORIA', 'ID_ENTIDADE', entityId)
    .filter(function(row) { return String(row.ENTIDADE) === String(entity) && String(row.ID_ENTIDADE) === String(entityId); })
    .map(function(row) {
      return {
        id: row.ID_AUDITORIA,
        sequence: Number(row.SEQUENCIA || 0),
        at: row.DATA_HORA,
        user: row.USUARIO,
        action: row.ACAO,
        details: autJsonParse_(row.DETALHES_JSON, {}),
        device: autJsonParse_(row.DISPOSITIVO_JSON, {}),
        location: autJsonParse_(row.LOCALIZACAO_JSON, {}),
        sessionId: row.ID_SESSAO || '',
        ipPublic: row.IP_PUBLICO || '',
        timezone: row.TIMEZONE || '',
        requestId: row.REQUEST_ID || '',
        role: row.PERFIL_USUARIO || '',
        hash: row.HASH_ATUAL
      };
    })
    .sort(function(a, b) { return b.sequence - a.sequence; });
}

function autVerifyAuditRows_() {
  var rows = autRows_('AUDITORIA').sort(function(a, b) { return Number(a.SEQUENCIA) - Number(b.SEQUENCIA); });
  var previous = '';
  var previousSequence = 0;
  var knownHashes = { '': true };
  var failures = [];
  var legacyBranches = [];
  rows.forEach(function(row) {
    var storedPrevious = String(row.HASH_ANTERIOR || '');
    var version = String(row.VERSAO_HASH || '');
    var material = String(row.VERSAO_HASH || '') === '2'
      ? [
          storedPrevious, row.SEQUENCIA, row.DATA_HORA, row.ID_USUARIO, row.USUARIO,
          row.PERFIL_USUARIO, row.ID_SESSAO, row.ACAO, row.ENTIDADE, row.ID_ENTIDADE,
          row.DETALHES_JSON, row.DISPOSITIVO_JSON, row.LOCALIZACAO_JSON,
          row.IP_PUBLICO, row.TIMEZONE, row.REQUEST_ID
        ].join('|')
      : [storedPrevious, row.SEQUENCIA, row.DATA_HORA, row.ID_USUARIO, row.USUARIO, row.ACAO, row.ENTIDADE, row.ID_ENTIDADE, row.DETALHES_JSON].join('|');
    var expected = autHash_(material);
    var contentValid = String(row.HASH_ATUAL || '') === expected;
    var previousExists = !!knownHashes[storedPrevious];
    var linear = storedPrevious === previous && Number(row.SEQUENCIA) === previousSequence + 1;
    if (!contentValid || !previousExists || (version === '2' && !linear)) {
      failures.push({
        sequence: row.SEQUENCIA,
        id: row.ID_AUDITORIA,
        reason: !contentValid ? 'HASH_CONTEUDO_INVALIDO' : (!previousExists ? 'HASH_ANTERIOR_ORFAO' : 'CADEIA_V2_NAO_LINEAR')
      });
    } else if (version !== '2' && !linear) {
      legacyBranches.push({ sequence: row.SEQUENCIA, id: row.ID_AUDITORIA });
    }
    previous = String(row.HASH_ATUAL || '');
    previousSequence = Number(row.SEQUENCIA || 0);
    knownHashes[previous] = true;
  });
  return {
    valid: failures.length === 0,
    linear: failures.length === 0 && legacyBranches.length === 0,
    records: rows.length,
    failures: failures,
    legacyBranches: legacyBranches
  };
}

function apiVerificarIntegridadeAuditoria(token) {
  try {
    var actor = autRequireAuth_(token, 'AUDITORIA_VER');
    var result = autVerifyAuditRows_();
    autAudit_(actor, 'AUDITORIA_VERIFICADA', 'SISTEMA', AUTENTIKO.APP_NAME, { registros: result.records, falhas: result.failures.length }, {});
    return autResult_(result);
  } catch (err) { return autPublicError_(err); }
}
