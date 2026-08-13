var AUTENTIKO_DB_INSTANCE_ = null;
var AUTENTIKO_SHEET_INSTANCES_ = {};

function autDb_() {
  if (!AUTENTIKO_DB_INSTANCE_) {
    AUTENTIKO_DB_INSTANCE_ = SpreadsheetApp.openById(AUTENTIKO.SPREADSHEET_ID);
  }
  return AUTENTIKO_DB_INSTANCE_;
}

function autCachePut_(cache, key, value, expirationSeconds) {
  var text = typeof value === 'string' ? value : JSON.stringify(value);
  var bytes = Utilities.newBlob(text, 'text/plain').getBytes().length;
  if (bytes > 95000) {
    console.warn('Cache ignorado por exceder o limite seguro: ' + key + ' (' + bytes + ' bytes)');
    return false;
  }
  cache.put(key, text, expirationSeconds);
  return true;
}

function autClaimRequest_(user, action, context) {
  var requestId = String(context && context.requestId || '').trim();
  if (!requestId) return '';
  autAssert_(/^[A-Za-z0-9._:-]{8,128}$/.test(requestId), 'Identificador de requisição inválido.', 'INVALID_REQUEST_ID');
  var key = 'AUT_REQUEST_' + autHash_(String(user.ID_USUARIO) + '|' + String(action) + '|' + requestId);
  autAssert_(!CacheService.getScriptCache().get(key), 'Esta ação já foi processada.', 'DUPLICATE_REQUEST');
  return key;
}

function autCommitRequest_(key) {
  if (key) CacheService.getScriptCache().put(key, '1', 600);
}

function autWithScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  var ownsLock = !lock.hasLock();
  if (ownsLock) lock.waitLock(30000);
  try { return callback(); }
  finally { if (ownsLock) lock.releaseLock(); }
}

function autSheet_(name) {
  var sheet = AUTENTIKO_SHEET_INSTANCES_[name];
  if (!sheet) {
    sheet = autDb_().getSheetByName(name);
    if (sheet) AUTENTIKO_SHEET_INSTANCES_[name] = sheet;
  }
  autAssert_(sheet, 'A estrutura do sistema não está instalada: ' + name, 'SETUP_REQUIRED');
  return sheet;
}

function autHeaders_(sheet) {
  var cacheKey = 'AUT_HEADERS_' + sheet.getSheetId();
  var cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) return autJsonParse_(cached, []);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) { return String(v).trim(); });
  autCachePut_(CacheService.getScriptCache(), cacheKey, headers, 300);
  return headers;
}

function autRowAt_(name, rowNumber) {
  var sheet = autSheet_(name);
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) return null;
  var headers = autHeaders_(sheet);
  var values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var obj = { _row: rowNumber };
  headers.forEach(function(header, col) { obj[header] = values[col]; });
  return obj;
}

function autRows_(name) {
  var sheet = autSheet_(name);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = autHeaders_(sheet);
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row, index) {
    var obj = { _row: index + 2 };
    headers.forEach(function(header, col) { obj[header] = row[col]; });
    return obj;
  });
}

function autRowsBy_(name, key, value) {
  var sheet = autSheet_(name);
  var headers = autHeaders_(sheet);
  var column = headers.indexOf(key);
  var lastRow = sheet.getLastRow();
  if (column < 0 || lastRow < 2) return [];
  var target = String(value == null ? '' : value);
  if (!target || target.length > 1000) return [];
  var matches = sheet.getRange(2, column + 1, lastRow - 1, 1)
    .createTextFinder(target)
    .matchEntireCell(true)
    .matchCase(false)
    .useRegularExpression(false)
    .findAll();
  if (!matches.length) return [];
  var lastColumnLetter = sheet.getRange(1, headers.length).getA1Notation().replace(/\d/g, '');
  var ranges = sheet.getRangeList(matches.map(function(match) {
    return 'A' + match.getRow() + ':' + lastColumnLetter + match.getRow();
  })).getRanges();
  return ranges.map(function(range) {
    var row = range.getValues()[0];
    var obj = { _row: range.getRow() };
    headers.forEach(function(header, col) { obj[header] = row[col]; });
    return obj;
  });
}

function autFind_(name, key, value) {
  var sheet = autSheet_(name);
  var headers = autHeaders_(sheet);
  var column = headers.indexOf(key);
  if (column < 0 || sheet.getLastRow() < 2) return null;
  var target = String(value == null ? '' : value);
  if (!target || target.length > 1000) return null;
  var match = sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(target)
    .matchEntireCell(true)
    .matchCase(false)
    .useRegularExpression(false)
    .findNext();
  return match ? autRowAt_(name, match.getRow()) : null;
}

function autFindNormalized_(name, key, value) {
  var normalized = autNormalize_(value);
  var rows = autRows_(name);
  for (var i = 0; i < rows.length; i++) {
    if (autNormalize_(rows[i][key]) === normalized) return rows[i];
  }
  return null;
}

function autAppend_(name, obj) {
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var headers = autHeaders_(sheet);
    var row = headers.map(function(header) { return autSafeCell_(obj[header]); });
    var rowNumber = Math.max(sheet.getLastRow(), 1) + 1;
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    return rowNumber;
  });
}

function autAppendMany_(name, objects) {
  if (!objects || !objects.length) return;
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var headers = autHeaders_(sheet);
    var values = objects.map(function(obj) {
      return headers.map(function(header) { return autSafeCell_(obj[header]); });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  });
}

function autUpdateRow_(name, rowNumber, patch) {
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var headers = autHeaders_(sheet);
    var range = sheet.getRange(rowNumber, 1, 1, headers.length);
    var row = range.getValues()[0];
    headers.forEach(function(header, index) {
      if (Object.prototype.hasOwnProperty.call(patch, header)) row[index] = autSafeCell_(patch[header]);
    });
    range.setValues([row]);
  });
}

function autPatchRows_(name, rowNumbers, patch) {
  if (!rowNumbers || !rowNumbers.length || !patch) return;
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var headers = autHeaders_(sheet);
    var numbers = Array.from(new Set(rowNumbers.map(Number).filter(function(value) {
      return isFinite(value) && value >= 2 && value <= sheet.getLastRow();
    }))).sort(function(a, b) { return a - b; });
    if (!numbers.length) return;
    var groups = [];
    var start = numbers[0];
    var end = start;
    for (var index = 1; index < numbers.length; index++) {
      if (numbers[index] === end + 1) end = numbers[index];
      else {
        groups.push({ start: start, count: end - start + 1 });
        start = end = numbers[index];
      }
    }
    groups.push({ start: start, count: end - start + 1 });
    groups.forEach(function(group) {
      var range = sheet.getRange(group.start, 1, group.count, headers.length);
      var values = range.getValues();
      values.forEach(function(row) {
        headers.forEach(function(header, column) {
          if (Object.prototype.hasOwnProperty.call(patch, header)) row[column] = autSafeCell_(patch[header]);
        });
      });
      range.setValues(values);
    });
  });
}

function autUpsert_(name, key, obj) {
  return autWithScriptLock_(function() {
    var found = autFind_(name, key, obj[key]);
    if (found) {
      autUpdateRow_(name, found._row, obj);
      return found._row;
    }
    return autAppend_(name, obj);
  });
}

function autDeleteRowsBy_(name, key, value) {
  var rows = autRowsBy_(name, key, value);
  autDeleteRowNumbers_(name, rows.map(function(row) { return row._row; }));
}

function autDeleteRowNumbers_(name, rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) return;
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var numbers = rowNumbers.slice().sort(function(a, b) { return a - b; });
    var groups = [];
    var start = numbers[0];
    var end = start;
    for (var i = 1; i < numbers.length; i++) {
      if (numbers[i] === end + 1) end = numbers[i];
      else { groups.push({ start: start, count: end - start + 1 }); start = end = numbers[i]; }
    }
    groups.push({ start: start, count: end - start + 1 });
    groups.sort(function(a, b) { return b.start - a.start; }).forEach(function(group) { sheet.deleteRows(group.start, group.count); });
  });
}

function autConfigMap_() {
  var cached = CacheService.getScriptCache().get('AUT_CONFIG_MAP');
  if (cached) return autJsonParse_(cached, {});
  var map = {};
  autRows_('CONFIGURACOES').forEach(function(row) {
    var value = row.VALOR;
    if (row.TIPO === 'BOOLEAN') value = autNormalize_(value) === 'TRUE' || autNormalize_(value) === 'SIM';
    if (row.TIPO === 'NUMBER') value = Number(value || 0);
    if (row.TIPO === 'JSON') value = autJsonParse_(value, {});
    map[row.CHAVE] = value;
  });
  autCachePut_(CacheService.getScriptCache(), 'AUT_CONFIG_MAP', map, AUTENTIKO.CACHE_SECONDS);
  return map;
}

function autInvalidateCaches_() {
  var cache = CacheService.getScriptCache();
  var keys = ['AUT_CONFIG_MAP', 'AUT_FORM_SCHEMAS', 'AUT_DOCUMENT_CATALOG', 'AUT_LISTAS'];
  AUTENTIKO.PROCESS_TYPES.forEach(function(type) { keys.push('AUT_FORM_SCHEMA_' + type); });
  try {
    Object.keys(AUTENTIKO_SHEETS).forEach(function(name) {
      var sheet = autDb_().getSheetByName(name);
      if (sheet) keys.push('AUT_HEADERS_' + sheet.getSheetId());
    });
  } catch (err) { console.warn('Não foi possível invalidar todos os cabeçalhos: ' + err.message); }
  cache.removeAll(keys);
  AUTENTIKO_DB_INSTANCE_ = null;
  AUTENTIKO_SHEET_INSTANCES_ = {};
}

function autPublicConfig_() {
  var all = autConfigMap_();
  var out = {};
  AUTENTIKO_PUBLIC_CONFIG_KEYS.forEach(function(key) { out[key] = all[key] == null ? '' : all[key]; });
  return out;
}

function autFormSchema_(type) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'AUT_FORM_SCHEMA_' + type;
  var cached = cache.get(cacheKey);
  if (cached) return autJsonParse_(cached, []);
  var fields = autRows_('FORMULARIOS').filter(function(row) {
    return String(row.TIPO_PROCESSO) === String(type) && autNormalize_(row.ATIVO) !== 'NAO';
  }).map(function(row) {
    return {
      id: row.ID_CAMPO,
      section: row.SECAO,
      name: row.CAMPO,
      label: row.ROTULO,
      input: row.TIPO_CAMPO || 'text',
      options: autJsonParse_(row.OPCOES_JSON, []),
      required: autNormalize_(row.OBRIGATORIO) === 'SIM',
      order: Number(row.ORDEM || 0),
      condition: autJsonParse_(row.CONDICAO_JSON, null)
    };
  });
  fields.sort(function(a, b) { return a.order - b.order; });
  autCachePut_(cache, cacheKey, fields, AUTENTIKO.CACHE_SECONDS);
  return fields;
}

function autFormSchemas_() {
  var grouped = {};
  AUTENTIKO.PROCESS_TYPES.forEach(function(type) { grouped[type] = autFormSchema_(type); });
  return grouped;
}

function autDocumentCatalog_() {
  var cached = CacheService.getScriptCache().get('AUT_DOCUMENT_CATALOG');
  if (cached) return autJsonParse_(cached, []);
  var list = autRows_('DOCUMENTOS_CATALOGO').filter(function(row) { return autNormalize_(row.ATIVO) !== 'NAO'; }).map(function(row) {
    var processTypes = autJsonParse_(row.TIPOS_PROCESSO_JSON, []);
    var requiredProcessTypes = autJsonParse_(row.TIPOS_OBRIGATORIOS_JSON, []);
    if (!requiredProcessTypes.length && autNormalize_(row.OBRIGATORIO) === 'SIM' && !String(row.TIPOS_OBRIGATORIOS_JSON || '').trim()) {
      requiredProcessTypes = processTypes.slice();
    }
    return {
      id: row.ID_DOCUMENTO_TIPO,
      name: row.NOME_DOCUMENTO,
      processTypes: processTypes,
      requiredProcessTypes: requiredProcessTypes,
      categories: autJsonParse_(row.CATEGORIAS_JSON, []),
      order: Number(row.ORDEM || 0),
      mimeTypes: String(row.MIME_ACEITOS || ''),
      maxMb: Number(row.TAMANHO_MAX_MB || AUTENTIKO.MAX_UPLOAD_MB)
    };
  }).sort(function(a, b) { return a.order - b.order; });
  autCachePut_(CacheService.getScriptCache(), 'AUT_DOCUMENT_CATALOG', list, AUTENTIKO.CACHE_SECONDS);
  return list;
}

function autLists_() {
  var cached = CacheService.getScriptCache().get('AUT_LISTAS');
  if (cached) return autJsonParse_(cached, {});
  var map = {};
  autRows_('LISTAS').filter(function(row) { return autNormalize_(row.ATIVO) !== 'NAO'; }).forEach(function(row) {
    if (!map[row.TIPO]) map[row.TIPO] = [];
    map[row.TIPO].push({ value: row.VALOR, order: Number(row.ORDEM || 0) });
  });
  Object.keys(map).forEach(function(key) {
    map[key] = map[key].sort(function(a, b) { return a.order - b.order; }).map(function(item) { return item.value; });
  });
  autCachePut_(CacheService.getScriptCache(), 'AUT_LISTAS', map, AUTENTIKO.CACHE_SECONDS);
  return map;
}
