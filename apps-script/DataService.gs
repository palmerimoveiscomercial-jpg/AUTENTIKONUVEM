var AUTENTIKO_DB_INSTANCE_ = null;
var AUTENTIKO_SHEET_INSTANCES_ = {};

var AUTENTIKO_REQUEST_TABLES_ = {};
// O snapshot em memória só pode ser consultado enquanto uma resposta de
// bootstrap está sendo montada. Apps Script pode reutilizar o mesmo runtime
// em chamadas futuras; sem esta trava, gravações e downloads enxergariam
// linhas antigas que ficaram em memória depois do login.
var AUTENTIKO_REQUEST_TABLES_ACTIVE_ = false;
var AUTENTIKO_REQUEST_TABLES_IDENTITY_ = '';
var AUTENTIKO_OPERATIONAL_BATCH_VERSION_ = '2.9.1';
var AUTENTIKO_OPERATIONAL_TABLE_NAMES_ = [
  'CONFIGURACOES', 'USUARIOS', 'PROCESSOS', 'PROCESSO_DADOS', 'FORMULARIOS',
  'DOCUMENTOS_CATALOGO', 'PROCESSO_DOCUMENTOS', 'PROCESSO_PARTICIPANTES',
  'PENDENCIAS', 'ATUACOES', 'MOVIMENTACOES_PROCESSO', 'PROCESSO_CHECKLIST',
  'ACEITES_ELETRONICOS', 'PROPOSTAS', 'CONTRATOS', 'LISTAS'
];
var AUTENTIKO_OPERATIONAL_REVISION_TABLES_ = {
  PROCESSOS:true, PROCESSO_DADOS:true, FORMULARIOS:true, DOCUMENTOS_CATALOGO:true,
  PROCESSO_DOCUMENTOS:true, PROCESSO_PARTICIPANTES:true, PENDENCIAS:true, ATUACOES:true,
  MOVIMENTACOES_PROCESSO:true, PROCESSO_CHECKLIST:true, ACEITES_ELETRONICOS:true,
  PROPOSTAS:true, CONTRATOS:true, LISTAS:true
};

function autUtf8Bytes_(text) {
  return Utilities.newBlob(String(text || ''), 'text/plain').getBytes().length;
}

function autLargeCachePut_(cache, key, value, expirationSeconds) {
  try {
    var text = typeof value === 'string' ? value : JSON.stringify(value);
    var chunks = [];
    var cursor = 0;
    while (cursor < text.length) {
      var end = Math.min(cursor + 42000, text.length);
      var chunk = text.slice(cursor, end);
      while (autUtf8Bytes_(chunk) > 88000 && end > cursor + 1000) {
        end = cursor + Math.floor((end - cursor) * 0.75);
        chunk = text.slice(cursor, end);
      }
      chunks.push(chunk);
      cursor = end;
    }
    var oldManifest = autJsonParse_(cache.get(key + ':manifest'), null);
    if (oldManifest && Number(oldManifest.chunks || 0) > chunks.length) {
      var oldKeys = [];
      for (var oldIndex = chunks.length; oldIndex < Number(oldManifest.chunks || 0); oldIndex++) oldKeys.push(key + ':' + oldIndex);
      if (oldKeys.length) cache.removeAll(oldKeys);
    }
    chunks.forEach(function(chunk, index) { cache.put(key + ':' + index, chunk, expirationSeconds); });
    cache.put(key + ':manifest', JSON.stringify({ chunks:chunks.length, bytes:autUtf8Bytes_(text), at:autNow_() }), expirationSeconds);
    return true;
  } catch (error) {
    console.warn('Cache grande indisponível para ' + key + ': ' + error.message);
    return false;
  }
}

function autLargeCacheGet_(cache, key) {
  try {
    var manifest = autJsonParse_(cache.get(key + ':manifest'), null);
    if (!manifest || !Number(manifest.chunks || 0)) return null;
    var text = '';
    for (var index = 0; index < Number(manifest.chunks); index++) {
      var chunk = cache.get(key + ':' + index);
      if (chunk == null) return null;
      text += chunk;
    }
    return autJsonParse_(text, null);
  } catch (error) {
    console.warn('Não foi possível recuperar cache grande ' + key + ': ' + error.message);
    return null;
  }
}

function autOperationalRevision_() {
  return PropertiesService.getScriptProperties().getProperty('AUT_OPERATIONAL_REVISION') || '0';
}

function autTouchOperationalRevision_(name) {
  if (!AUTENTIKO_OPERATIONAL_REVISION_TABLES_[String(name || '')]) return autOperationalRevision_();
  var revision = String(Date.now()) + '-' + autRandom_(6);
  PropertiesService.getScriptProperties().setProperty('AUT_OPERATIONAL_REVISION', revision);
  return revision;
}

function autOperationalExternalMarker_() {
  var modified = '';
  var cache = CacheService.getScriptCache();
  var markerKey = 'AUT_OPERATIONAL_DRIVE_MARKER';
  try { modified = cache.get(markerKey) || ''; } catch (ignoreCacheRead) {}
  if (!modified) {
    try {
      modified = String(DriveApp.getFileById(AUTENTIKO.SPREADSHEET_ID).getLastUpdated().getTime());
      cache.put(markerKey, modified, 20);
    } catch (ignore) { modified = 'drive-unavailable'; }
  }
  return [AUTENTIKO_OPERATIONAL_BATCH_VERSION_, autOperationalRevision_(), modified].join('|');
}

function autRequestTable_(name) {
  if (!AUTENTIKO_REQUEST_TABLES_ACTIVE_) return null;
  return AUTENTIKO_REQUEST_TABLES_[String(name || '')] || null;
}

function autSetRequestTable_(name, headers, values) {
  headers = (headers || []).map(function(value) { return String(value || '').trim(); });
  var rows = (values || []).map(function(row, index) {
    var obj = { _row:index + 2 };
    headers.forEach(function(header, col) { if (header) obj[header] = row[col] == null ? '' : row[col]; });
    return obj;
  });
  AUTENTIKO_REQUEST_TABLES_[name] = { name:name, headers:headers, rows:rows, indexes:{} };
  return AUTENTIKO_REQUEST_TABLES_[name];
}

function autRequestTableIndex_(table, key) {
  if (!table || !key) return {};
  table.indexes = table.indexes || {};
  if (!table.indexes[key]) {
    var index = {};
    (table.rows || []).forEach(function(row) {
      var normalized = autNormalize_(row[key]);
      if (!index[normalized]) index[normalized] = [];
      index[normalized].push(row);
    });
    table.indexes[key] = index;
  }
  return table.indexes[key];
}

function autRequestTablePatchRow_(name, rowNumber, patch) {
  var table = autRequestTable_(name);
  if (!table) return;
  var row = table.rows.filter(function(item) { return Number(item._row) === Number(rowNumber); })[0];
  if (!row) return;
  Object.keys(patch || {}).forEach(function(key) {
    if (table.headers.indexOf(key) >= 0) row[key] = autSafeCell_(patch[key]);
  });
  table.indexes = {};
}

function autRequestTableAppend_(name, rowNumber, obj) {
  var table = autRequestTable_(name);
  if (!table) return;
  var row = { _row:Number(rowNumber) };
  table.headers.forEach(function(header) { row[header] = autSafeCell_(obj[header]); });
  table.rows.push(row);
  table.indexes = {};
}

function autRequestTableInvalidate_(name) {
  delete AUTENTIKO_REQUEST_TABLES_[String(name || '')];
}

function autOperationalTransportCell_(value) {
  if (value == null) return '';
  if (value instanceof Date) return Utilities.formatDate(value, AUTENTIKO.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'object') {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (ignore) { return String(value); }
  }
  return String(value);
}

function autOperationalSpreadsheetFallback_(names) {
  var db = autDb_();
  var tables = {};
  (names || []).forEach(function(name) {
    var sheet = db.getSheetByName(name);
    if (!sheet) { tables[name] = { headers:[], values:[] }; return; }
    var rows = Math.max(sheet.getLastRow(), 1);
    var cols = Math.max(sheet.getLastColumn(), 1);
    var raw = sheet.getRange(1, 1, rows, cols).getValues();
    var values = raw.map(function(row) { return row.map(autOperationalTransportCell_); });
    tables[name] = { headers:values.length ? values[0] : [], values:values.slice(1) };
  });
  return tables;
}

function autOperationalBatchGet_(names) {
  names = (names || AUTENTIKO_OPERATIONAL_TABLE_NAMES_).filter(function(name, index, list) {
    return name && list.indexOf(name) === index;
  });
  try {
    var query = names.map(function(name) { return 'ranges=' + encodeURIComponent(name); }).join('&');
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(AUTENTIKO.SPREADSHEET_ID) +
      '/values:batchGet?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&' + query;
    var response = UrlFetchApp.fetch(url, {
      method:'get',
      headers:{ Authorization:'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions:true
    });
    var status = Number(response.getResponseCode() || 0);
    if (status < 200 || status >= 300) {
      console.warn('Sheets batchGet retornou HTTP ' + status + '. O login seguirá pelo fallback SpreadsheetApp.');
      return autOperationalSpreadsheetFallback_(names);
    }
    var payload = autJsonParse_(response.getContentText(), {});
    var tables = {};
    (payload.valueRanges || []).forEach(function(range, index) {
      var name = names[index];
      var values = Array.isArray(range.values) ? range.values : [];
      var headers = values.length ? values[0] : [];
      tables[name] = { headers:headers, values:values.slice(1) };
    });
    names.forEach(function(name) { if (!tables[name]) tables[name] = { headers:[], values:[] }; });
    return tables;
  } catch (error) {
    // UrlFetchApp pode lançar exceção antes de haver resposta HTTP quando uma
    // autorização nova ainda não foi concedida. Isso jamais deve bloquear o login.
    console.warn('Sheets batchGet indisponível: ' + String(error && error.message || error) + '. Usando SpreadsheetApp.');
    return autOperationalSpreadsheetFallback_(names);
  }
}

function autPrimeOperationalTables_(options) {
  options = options || {};
  // A identidade acompanha também alterações feitas diretamente no Sheets.
  // O acesso ao Drive que compõe esse marcador fica amortizado por 20 s.
  var marker = autOperationalExternalMarker_();
  var cacheIdentity = marker;
  if (!options.force && AUTENTIKO_REQUEST_TABLES_IDENTITY_ === cacheIdentity &&
      Object.keys(AUTENTIKO_REQUEST_TABLES_).length >= AUTENTIKO_OPERATIONAL_TABLE_NAMES_.length) {
    return { marker:marker, cacheHit:true, tables:Object.keys(AUTENTIKO_REQUEST_TABLES_) };
  }
  // O cache não gira a cada minuto. Ele só muda quando a revisão operacional
  // ou a planilha muda, ou quando uma sincronização forçada for solicitada.
  var cacheKey = 'AUT_OP_TABLES_' + AUTENTIKO_OPERATIONAL_BATCH_VERSION_.replace(/\W/g, '') + '_' + autHash_(cacheIdentity);
  var cache = CacheService.getScriptCache();
  var packed = !options.force ? autLargeCacheGet_(cache, cacheKey) : null;
  var cacheHit = !!packed;
  if (!packed) {
    packed = autOperationalBatchGet_(AUTENTIKO_OPERATIONAL_TABLE_NAMES_);
    autLargeCachePut_(cache, cacheKey, packed, 600);
  }
  AUTENTIKO_REQUEST_TABLES_ = {};
  AUTENTIKO_OPERATIONAL_TABLE_NAMES_.forEach(function(name) {
    var table = packed[name] || { headers:[], values:[] };
    autSetRequestTable_(name, table.headers || [], table.values || []);
  });
  AUTENTIKO_REQUEST_TABLES_IDENTITY_ = cacheIdentity;
  return { marker:marker, cacheHit:cacheHit, tables:Object.keys(AUTENTIKO_REQUEST_TABLES_) };
}

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
  var requestTable = autRequestTable_(sheet && sheet.getName ? sheet.getName() : '');
  if (requestTable && requestTable.headers && requestTable.headers.length) return requestTable.headers.slice();
  var cacheKey = 'AUT_HEADERS_' + sheet.getSheetId();
  var cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) return autJsonParse_(cached, []);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) { return String(v).trim(); });
  autCachePut_(CacheService.getScriptCache(), cacheKey, headers, 300);
  return headers;
}

function autRowAt_(name, rowNumber) {
  var requestTable = autRequestTable_(name);
  if (requestTable) {
    var cachedRow = requestTable.rows.filter(function(item) { return Number(item._row) === Number(rowNumber); })[0];
    return cachedRow ? Object.assign({}, cachedRow) : null;
  }
  var sheet = autSheet_(name);
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) return null;
  var headers = autHeaders_(sheet);
  var values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var obj = { _row: rowNumber };
  headers.forEach(function(header, col) { obj[header] = values[col]; });
  return obj;
}

function autRows_(name) {
  var requestTable = autRequestTable_(name);
  if (requestTable) return requestTable.rows.map(function(row) { return Object.assign({}, row); });
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
  var requestTable = autRequestTable_(name);
  if (requestTable) {
    var normalizedTarget = autNormalize_(value);
    var index = autRequestTableIndex_(requestTable, key);
    return (index[normalizedTarget] || []).map(function(row) { return Object.assign({}, row); });
  }
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
  var requestTable = autRequestTable_(name);
  if (requestTable) {
    var normalizedTarget = autNormalize_(value);
    var index = autRequestTableIndex_(requestTable, key);
    var cachedRow = (index[normalizedTarget] || [])[0];
    return cachedRow ? Object.assign({}, cachedRow) : null;
  }
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
    if (name === 'BASE_CLIENTES' && typeof autMasterInvalidateLookupCache_ === 'function') {
      autMasterInvalidateLookupCache_(obj.TIPO_PESSOA, obj.CPF_CNPJ);
    }
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    autRequestTableAppend_(name, rowNumber, obj);
    autTouchOperationalRevision_(name);
    if (typeof autSearchIncremental_ === 'function') autSearchIncremental_(name, rowNumber);
    return rowNumber;
  });
}

function autAppendMany_(name, objects, options) {
  if (!objects || !objects.length) return;
  options = options || {};
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var headers = autHeaders_(sheet);
    var values = objects.map(function(obj) {
      return headers.map(function(header) { return autSafeCell_(obj[header]); });
    });
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
    var rowNumbers = values.map(function(unused, index) { return startRow + index; });
    objects.forEach(function(obj, index) { autRequestTableAppend_(name, startRow + index, obj); });
    autTouchOperationalRevision_(name);
    if (!options.skipSearch && typeof autSearchIncremental_ === 'function') {
      if (typeof autSearchIncrementalBatch_ === 'function') autSearchIncrementalBatch_(name, rowNumbers);
      else rowNumbers.forEach(function(rowNumber) { autSearchIncremental_(name, rowNumber); });
    }
    return rowNumbers;
  });
}

function autUpdateRow_(name, rowNumber, patch) {
  return autWithScriptLock_(function() {
    var sheet = autSheet_(name);
    var headers = autHeaders_(sheet);
    var range = sheet.getRange(rowNumber, 1, 1, headers.length);
    // Nunca regrave uma linha a partir do snapshot. Outro usuário pode ter
    // alterado colunas dessa linha depois que o snapshot foi produzido.
    var row = range.getValues()[0];
    if (name === 'BASE_CLIENTES' && typeof autMasterInvalidateLookupCache_ === 'function') {
      autMasterInvalidateLookupCache_(row[headers.indexOf('TIPO_PESSOA')], row[headers.indexOf('CPF_CNPJ')]);
      autMasterInvalidateLookupCache_(patch.TIPO_PESSOA || row[headers.indexOf('TIPO_PESSOA')], patch.CPF_CNPJ || row[headers.indexOf('CPF_CNPJ')]);
    }
    headers.forEach(function(header, index) {
      if (Object.prototype.hasOwnProperty.call(patch, header)) row[index] = autSafeCell_(patch[header]);
    });
    range.setValues([row]);
    autRequestTablePatchRow_(name, rowNumber, patch);
    autTouchOperationalRevision_(name);
    if (typeof autSearchIncremental_ === 'function') autSearchIncremental_(name, rowNumber);
  });
}

function autPatchRows_(name, rowNumbers, patch, options) {
  if (!rowNumbers || !rowNumbers.length || !patch) return;
  options = options || {};
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
        if (name === 'BASE_CLIENTES' && typeof autMasterInvalidateLookupCache_ === 'function') {
          autMasterInvalidateLookupCache_(row[headers.indexOf('TIPO_PESSOA')], row[headers.indexOf('CPF_CNPJ')]);
        }
        headers.forEach(function(header, column) {
          if (Object.prototype.hasOwnProperty.call(patch, header)) row[column] = autSafeCell_(patch[header]);
        });
      });
      range.setValues(values);
    });
    numbers.forEach(function(rowNumber) { autRequestTablePatchRow_(name, rowNumber, patch); });
    autTouchOperationalRevision_(name);
    if (!options.skipSearch && typeof autSearchIncremental_ === 'function') {
      if (typeof autSearchIncrementalBatch_ === 'function') autSearchIncrementalBatch_(name, numbers);
      else numbers.forEach(function(rowNumber) { autSearchIncremental_(name, rowNumber); });
    }
    return numbers;
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
    var indexedRows = [];
    if (typeof autSearchSource_ === 'function' && autSearchSource_(name)) {
      numbers.forEach(function(rowNumber) {
        var sourceRow = autRowAt_(name, rowNumber);
        if (sourceRow) indexedRows.push({ rowNumber: rowNumber, id: sourceRow[autSearchSource_(name).id] });
      });
    }
    var groups = [];
    var start = numbers[0];
    var end = start;
    for (var i = 1; i < numbers.length; i++) {
      if (numbers[i] === end + 1) end = numbers[i];
      else { groups.push({ start: start, count: end - start + 1 }); start = end = numbers[i]; }
    }
    groups.push({ start: start, count: end - start + 1 });
    groups.sort(function(a, b) { return b.start - a.start; }).forEach(function(group) { sheet.deleteRows(group.start, group.count); });
    autRequestTableInvalidate_(name);
    autTouchOperationalRevision_(name);
    if (typeof autSearchRemoveIncremental_ === 'function' && indexedRows.length) autSearchRemoveIncremental_(name, indexedRows);
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
  AUTENTIKO_REQUEST_TABLES_ = {};
  AUTENTIKO_REQUEST_TABLES_ACTIVE_ = false;
  AUTENTIKO_REQUEST_TABLES_IDENTITY_ = '';
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
  var fields = autRowsBy_('FORMULARIOS', 'TIPO_PROCESSO', type).filter(function(row) {
    return autNormalize_(row.ATIVO) !== 'NAO';
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
      condition: autJsonParse_(row.CONDICAO_JSON, null),
      indexCode: row.CODIGO_INDICE || SCHEMA.fieldCode(type, row.CAMPO),
      source: {
        system: row.FONTE_SISTEMA || 'AUTENTIKO_OK_NUVEM',
        sheet: row.FONTE_ABA || 'PROCESSO_DADOS',
        column: row.FONTE_COLUNA || row.CAMPO
      },
      aliases: autJsonParse_(row.ALIASES_JSON, []),
      schemaVersion: row.SCHEMA_VERSION || SCHEMA.version,
      supportsNotInformed: autNormalize_(row.OBRIGATORIO) !== 'SIM'
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
