/*
 * Catálogo materializado de pesquisa.
 *
 * A busca nunca lê as abas de autenticação, tokens ou chaves. O índice contém
 * somente metadados de negócio e é filtrado novamente pela autorização do
 * usuário antes de qualquer resultado ser devolvido.
 */
var AUT_SEARCH_INDEX_SOURCES_ = Object.freeze([
  { table: 'PROCESSOS', type: 'PROCESSO', id: 'ID_PROCESSO', process: 'ID_PROCESSO', title: ['PROTOCOLO', 'CLIENTE_NOME', 'TITULAR_NOME'], text: ['PROTOCOLO', 'TIPO_PROCESSO', 'STATUS', 'FASE', 'RESPONSAVEL', 'CLIENTE_NOME', 'CLIENTE_CPF', 'CLIENTE_EMAIL', 'CLIENTE_CONTATO', 'CLIENTE_ENDERECO', 'TITULAR_NOME', 'IMOVEL_CODIGO', 'IMOVEL_ENDERECO', 'SETOR_ATUAL', 'STATUS_TRAMITACAO', 'ETAPA_ATUAL'] },
  { table: 'PROCESSO_DADOS', type: 'DADO_PROCESSO', id: 'ID_DADO', process: 'ID_PROCESSO', title: ['SECAO', 'ROTULO', 'CAMPO'], text: ['ID_DADO', 'SECAO', 'CAMPO', 'ROTULO', 'VALOR', 'TIPO_DADO', 'VERSAO_PROCESSO', 'ATIVO'] },
  { table: 'PROCESSO_DOCUMENTOS', type: 'DOCUMENTO', id: 'ID_DOCUMENTO', process: 'ID_PROCESSO', title: ['NOME_DOCUMENTO', 'ARQUIVO_NOME'], text: ['ID_DOCUMENTO', 'PROTOCOLO', 'NOME_DOCUMENTO', 'ARQUIVO_NOME', 'MIME_TYPE', 'STATUS_CONFERENCIA', 'CATEGORIAS_JSON', 'MEDIA_STATUS', 'PREVIEW_STATUS'] },
  { table: 'PROCESSO_PARTICIPANTES', type: 'PARTICIPANTE', id: 'ID_PARTICIPANTE', process: 'ID_PROCESSO', title: ['NOME_RAZAO_SOCIAL', 'NOME_FANTASIA'], text: ['ID_PARTICIPANTE', 'TIPO_PESSOA', 'PAPEIS_JSON', 'NOME_RAZAO_SOCIAL', 'NOME_FANTASIA', 'CPF_CNPJ', 'RG_IE', 'EMAIL', 'TELEFONE', 'PROFISSAO', 'EMPRESA_TRABALHO', 'CARGO_FUNCAO', 'REPRESENTANTE_LEGAL', 'ID_CADASTRO_BASE'] },
  { table: 'PENDENCIAS', type: 'PENDENCIA', id: 'ID_PENDENCIA', process: 'ID_PROCESSO', title: ['TITULO', 'TIPO'], text: ['ID_PENDENCIA', 'TITULO', 'DESCRICAO', 'STATUS', 'RESPONSAVEL', 'PRAZO', 'TIPO', 'TIPO_ALVO', 'ID_ALVO'] },
  { table: 'ATUACOES', type: 'ATUACAO', id: 'ID_ATUACAO', process: 'ID_PROCESSO', title: ['TIPO', 'DESCRICAO'], text: ['ID_ATUACAO', 'TIPO', 'DESCRICAO', 'STATUS_ANTERIOR', 'STATUS_NOVO', 'USUARIO'] },
  { table: 'MOVIMENTACOES_PROCESSO', type: 'MOVIMENTACAO', id: 'ID_MOVIMENTACAO', process: 'ID_PROCESSO', title: ['ACAO', 'OBSERVACAO'], text: ['ID_MOVIMENTACAO', 'ACAO', 'STATUS_ANTERIOR', 'STATUS_NOVO', 'TRAMITACAO_NOVA', 'ETAPA_NOVA', 'USUARIO_ORIGEM', 'USUARIO_DESTINO', 'OBSERVACAO'] },
  { table: 'PROCESSO_CHECKLIST', type: 'CHECKLIST', id: 'ID_CHECKLIST', process: 'ID_PROCESSO', title: ['CATEGORIA', 'STATUS'], text: ['ID_CHECKLIST', 'CATEGORIA', 'STATUS', 'DECISAO', 'JUSTIFICATIVA'] },
  { table: 'PROPOSTAS', type: 'PROPOSTA', id: 'ID_PROPOSTA', process: 'ID_PROCESSO', title: ['NUMERO_PROPOSTA', 'TIPO_PROPOSTA'], text: ['ID_PROPOSTA', 'NUMERO_PROPOSTA', 'TIPO_PROPOSTA', 'STATUS', 'VALOR_INICIAL', 'VALOR_PROPOSTO', 'VALOR_NEGOCIADO', 'VALOR_ACEITO', 'OBSERVACOES'] },
  { table: 'PROPOSTA_CONDICOES', type: 'CONDICAO_PROPOSTA', id: 'ID_CONDICAO', process: '', title: ['TIPO_CONDICAO'], text: ['ID_CONDICAO', 'ID_PROPOSTA', 'TIPO_CONDICAO', 'DETALHES', 'ORDEM'] },
  { table: 'CONTRATOS', type: 'CONTRATO', id: 'ID_CONTRATO', process: 'ID_PROCESSO', title: ['NUMERO_CONTRATO', 'TITULO'], text: ['ID_CONTRATO', 'NUMERO_CONTRATO', 'TITULO', 'STATUS', 'MODELO_VERSAO'] },
  { table: 'CONTRATO_PARTES', type: 'PARTE_CONTRATO', id: 'ID_CONTRATO_PARTE', process: '', title: ['NOME_RAZAO_SOCIAL'], text: ['ID_CONTRATO_PARTE', 'ID_CONTRATO', 'NOME_RAZAO_SOCIAL', 'CPF_CNPJ', 'PAPEIS_JSON'] },
  { table: 'BASE_CLIENTES', type: 'CLIENTE', id: 'ID_CADASTRO', process: '', title: ['NOME_RAZAO_SOCIAL', 'NOME_FANTASIA'], text: ['ID_CADASTRO', 'TIPO_PESSOA', 'CPF_CNPJ', 'NOME_RAZAO_SOCIAL', 'NOME_FANTASIA', 'RG_IE', 'EMAIL', 'TELEFONE', 'TELEFONE_RECADO', 'PAPEIS_JSON', 'STATUS', 'QUALIDADE'] },
  { table: 'BASE_CLIENTES_CONFLITOS', type: 'CONFLITO_CLIENTE', id: 'ID_CONFLITO', process: 'ID_PROCESSO_ORIGEM', title: ['CAMPO', 'STATUS'], text: ['ID_CONFLITO', 'ID_CADASTRO', 'CAMPO', 'VALOR_ATUAL', 'VALOR_NOVO', 'FONTE', 'STATUS'] },
  { table: 'BASE_IMOVEIS', type: 'IMOVEL', id: 'ID_IMOVEL', process: '', title: ['CODIGO_INTERNO', 'ENDERECO'], text: ['ID_IMOVEL', 'CHAVE_IMOVEL', 'CODIGO_INTERNO', 'MATRICULA', 'INSCRICAO_IPTU', 'TIPO_IMOVEL', 'ENDERECO', 'MODALIDADE_CAPTACAO', 'STATUS_CAPTACAO', 'STATUS'] },
  { table: 'AUDITORIA', type: 'AUDITORIA', id: 'ID_AUDITORIA', process: 'ID_ENTIDADE', title: ['ACAO', 'ENTIDADE'], text: ['ID_AUDITORIA', 'SEQUENCIA', 'DATA_HORA', 'ACAO', 'ENTIDADE', 'ID_ENTIDADE', 'USUARIO', 'PERFIL_USUARIO'] }
]);

var AUT_SEARCH_INDEX_VERSION_ = '1';
var AUT_SEARCH_LAST_REBUILD_KEY_ = 'AUT_SEARCH_LAST_REBUILD_V1';
var AUT_DRIVE_INDEX_LAST_REBUILD_KEY_ = 'AUT_DRIVE_INDEX_LAST_REBUILD_V1';
var AUT_SEARCH_INDEX_GUARD_ = false;

function autEnsureSearchSheets_() {
  try { autSheet_('BUSCA_INDICE'); autSheet_('DRIVE_INDICE'); return true; }
  catch (err) {
    autAssert_(err && err.code === 'SETUP_REQUIRED', err && err.message || 'Estrutura do índice indisponível.', 'SETUP_REQUIRED');
    autPrepareSheets_(autDb_());
    return true;
  }
}

function autSearchNormalize_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function autSearchTokens_(value) {
  var normalized = autSearchNormalize_(value);
  return normalized ? normalized.split(' ').filter(function(item) { return item.length >= 1; }) : [];
}

function autSearchCellText_(value, key) {
  if (value == null || value === '') return '';
  var field = String(key || '').toLowerCase();
  if (/(senha|password|token|secret|authorization|chave|salt|hash|ip_publico|dispositivo|localizacao)/.test(field)) return '';
  if (typeof value === 'object') {
    var values = [];
    Object.keys(value).forEach(function(childKey) {
      var child = autSearchCellText_(value[childKey], childKey);
      if (child) values.push(child);
    });
    return values.join(' ');
  }
  return String(value).slice(0, 1200);
}

function autSearchFieldsText_(row, fields) {
  var values = [];
  (fields || []).forEach(function(field) {
    var value = row[field];
    var text = '';
    if (/_JSON$/.test(field) && value) text = autSearchCellText_(autJsonParse_(value, value), field);
    else text = autSearchCellText_(value, field);
    if (text) values.push(text);
  });
  return values.join(' ').slice(0, 12000);
}

function autSearchSource_(table) {
  for (var i = 0; i < AUT_SEARCH_INDEX_SOURCES_.length; i++) {
    if (AUT_SEARCH_INDEX_SOURCES_[i].table === table) return AUT_SEARCH_INDEX_SOURCES_[i];
  }
  return null;
}

function autSearchProcessId_(source, row) {
  return source && source.process ? String(row[source.process] || '').trim() : '';
}

function autSearchProcessMap_() {
  var map = {};
  autRows_('PROCESSOS').forEach(function(row) {
    if (row.ID_PROCESSO) map[String(row.ID_PROCESSO)] = row;
  });
  return map;
}

function autSearchIndexId_(table, row, rowNumber) {
  var source = autSearchSource_(table);
  var id = source && row[source.id] ? row[source.id] : (table + ':' + rowNumber);
  return autHash_(table + '|' + String(id)).slice(0, 40);
}

function autSearchIndexRecord_(table, row, rowNumber, processMap) {
  var source = autSearchSource_(table);
  if (!source || !row) return null;
  processMap = processMap || (table === 'PROCESSOS' ? {} : autSearchProcessMap_());
  var processId = autSearchProcessId_(source, row);
  var process = processId ? processMap[processId] : null;
  if (!process && table === 'CONTRATO_PARTES' && row.ID_CONTRATO) {
    var contract = autFind_('CONTRATOS', 'ID_CONTRATO', row.ID_CONTRATO);
    processId = contract ? String(contract.ID_PROCESSO || '') : '';
    process = processId ? processMap[processId] : null;
  }
  if (!process && table === 'PROPOSTA_CONDICOES' && row.ID_PROPOSTA) {
    var proposal = autFind_('PROPOSTAS', 'ID_PROPOSTA', row.ID_PROPOSTA);
    processId = proposal ? String(proposal.ID_PROCESSO || '') : '';
    process = processId ? processMap[processId] : null;
  }
  var title = autSearchFieldsText_(row, source.title).slice(0, 300);
  var text = autSearchFieldsText_(row, source.text);
  var origin = {};
  source.text.forEach(function(field) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]) !== '') origin[field] = autSearchCellText_(row[field], field).slice(0, 500);
  });
  var updated = row.ATUALIZADO_EM || row.MODIFICADO_EM || row.CRIADO_EM || row.DATA_HORA || '';
  var version = row.VERSAO_REGISTRO || row.VERSAO_PROCESSO || row.REVISAO || '';
  return {
    ID_INDICE: autSearchIndexId_(table, row, rowNumber),
    TIPO_ENTIDADE: source.type,
    FONTE_TABELA: table,
    FONTE_LINHA: Number(rowNumber || row._row || 0),
    ID_ENTIDADE: String(row[source.id] || table + ':' + rowNumber),
    ID_PROCESSO: processId,
    PROTOCOLO: process ? String(process.PROTOCOLO || '') : String(row.PROTOCOLO || ''),
    TITULO: title,
    STATUS: String(row.STATUS || (process && process.STATUS) || ''),
    TEXTO_BUSCA: autSearchNormalize_([title, text, process && process.PROTOCOLO, process && process.CLIENTE_NOME].join(' ')).slice(0, 16000),
    ATUALIZADO_EM: updated,
    HASH_ORIGEM: autHash_(autJson_(origin)),
    INDEXADO_EM: autNow_(),
    VERSAO_REGISTRO: String(version || '')
  };
}

function autSearchIndexRows_() {
  if (typeof autRows_ !== 'function') return [];
  var processMap = autSearchProcessMap_();
  var out = [];
  AUT_SEARCH_INDEX_SOURCES_.forEach(function(source) {
    var rows = autRows_(source.table);
    rows.forEach(function(row) {
      var item = autSearchIndexRecord_(source.table, row, row._row, processMap);
      if (item) out.push(item);
    });
  });
  return out;
}

function autSearchWriteObjects_(name, objects) {
  if (!objects || !objects.length) return;
  var sheet = autSheet_(name);
  var headers = autHeaders_(sheet);
  var values = objects.map(function(obj) { return headers.map(function(header) { return autSafeCell_(obj[header]); }); });
  var start = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(start, 1, values.length, headers.length).setValues(values);
}

function autSearchClearIndex_(name) {
  var sheet = autSheet_(name);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), AUTENTIKO_SHEETS[name].length)).clearContent();
}

function autSearchRebuildIndex_(options) {
  options = options || {};
  return autWithScriptLock_(function() {
    autEnsureSearchSheets_();
    AUT_SEARCH_INDEX_GUARD_ = true;
    try {
      autSearchClearIndex_('BUSCA_INDICE');
      var rows = autSearchIndexRows_();
      var chunkSize = 500;
      for (var i = 0; i < rows.length; i += chunkSize) autSearchWriteObjects_('BUSCA_INDICE', rows.slice(i, i + chunkSize));
      var stamp = autNow_();
      PropertiesService.getScriptProperties().setProperty(AUT_SEARCH_LAST_REBUILD_KEY_, JSON.stringify({ at: stamp, rows: rows.length, version: AUT_SEARCH_INDEX_VERSION_ }));
      CacheService.getScriptCache().remove('AUT_SEARCH_INDEX_ROWS');
      return { rebuilt: true, rows: rows.length, at: stamp, version: AUT_SEARCH_INDEX_VERSION_ };
    } finally { AUT_SEARCH_INDEX_GUARD_ = false; }
  });
}

function autSearchIncremental_(table, rowNumber) {
  if (AUT_SEARCH_INDEX_GUARD_ || !autSearchSource_(table)) return;
  try {
    var row = autRowAt_(table, rowNumber);
    if (!row) return;
    var record = autSearchIndexRecord_(table, row, rowNumber);
    if (!record) return;
    var existing = autFind_('BUSCA_INDICE', 'ID_INDICE', record.ID_INDICE);
    if (existing) autUpdateRow_('BUSCA_INDICE', existing._row, record);
    else autAppend_('BUSCA_INDICE', record);
    CacheService.getScriptCache().remove('AUT_SEARCH_INDEX_ROWS');
  } catch (err) { console.warn('Atualização incremental do índice ignorada: ' + err.message); }
}

function autSearchRemoveIncremental_(table, rowNumbers) {
  if (AUT_SEARCH_INDEX_GUARD_ || !autSearchSource_(table)) return;
  try {
    var source = autSearchSource_(table);
    var ids = (rowNumbers || []).map(function(value) {
      if (value && typeof value === 'object' && value.id) return autHash_(table + '|' + String(value.id)).slice(0, 40);
      return autSearchIndexId_(table, { _row: value }, value);
    });
    if (!ids.length) return;
    var rows = autRows_('BUSCA_INDICE').filter(function(row) { return ids.indexOf(String(row.ID_INDICE)) >= 0; });
    if (rows.length) autDeleteRowNumbers_('BUSCA_INDICE', rows.map(function(row) { return row._row; }));
    CacheService.getScriptCache().remove('AUT_SEARCH_INDEX_ROWS');
  } catch (err) { console.warn('Remoção incremental do índice ignorada: ' + err.message); }
}

function autSearchCachedRows_() {
  autEnsureSearchSheets_();
  var cache = CacheService.getScriptCache();
  var cached = cache.get('AUT_SEARCH_INDEX_ROWS');
  if (cached) return autJsonParse_(cached, []);
  var rows = autRows_('BUSCA_INDICE');
  autCachePut_(cache, 'AUT_SEARCH_INDEX_ROWS', rows, 30);
  return rows;
}

function autSearchCursor_(payload) {
  return Utilities.base64EncodeWebSafe(autJson_(payload)).replace(/=+$/g, '');
}

function autSearchReadCursor_(cursor, queryHash) {
  if (!cursor) return { offset: 0 };
  try {
    var decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(String(cursor))).getDataAsString();
    var value = autJsonParse_(decoded, null);
    autAssert_(value && value.v === 1 && value.q === queryHash && Number(value.o) >= 0, 'Cursor de pesquisa inválido ou expirado.', 'INVALID_CURSOR');
    return { offset: Number(value.o) };
  } catch (err) {
    if (err && err.code === 'INVALID_CURSOR') throw err;
    throw autApiError_('Cursor de pesquisa inválido ou expirado.', 'INVALID_CURSOR');
  }
}

function autSearchIndexPermission_(actor, item) {
  var type = String(item.TIPO_ENTIDADE || '');
  var processId = String(item.ID_PROCESSO || '');
  if (type === 'CLIENTE' || type === 'CONFLITO_CLIENTE') {
    if (!autHasPermission_(actor, 'BASE_CLIENTES_VER')) return false;
  } else if (type === 'IMOVEL') {
    if (!autHasPermission_(actor, 'BASE_IMOVEIS_VER')) return false;
  } else if (type === 'AUDITORIA') {
    if (!autHasPermission_(actor, 'AUDITORIA_VER')) return false;
  } else if (!autHasPermission_(actor, 'PROCESSO_VER_TODOS') && !autCanSeeProcess_(actor, processId ? { ID_RESPONSAVEL: '', RESPONSAVEL: '' } : null)) {
    // A verificação real abaixo usa a linha do processo; este caminho apenas
    // impede itens sem vínculo de processo de aparecerem para perfis comuns.
    if (!processId) return false;
  }
  if (processId) {
    var process = autFind_('PROCESSOS', 'ID_PROCESSO', processId);
    if (!process || process.EXCLUIDO_EM) return false;
    if (!autHasPermission_(actor, 'PROCESSO_VER_TODOS') && !autCanSeeProcess_(actor, process)) return false;
  }
  return true;
}

function autSearchPublicItem_(item) {
  return {
    id: item.ID_ENTIDADE,
    entityType: item.TIPO_ENTIDADE,
    sourceTable: item.FONTE_TABELA,
    sourceRow: Number(item.FONTE_LINHA || 0),
    processId: item.ID_PROCESSO || '',
    protocol: item.PROTOCOLO || '',
    title: item.TITULO || '',
    status: item.STATUS || '',
    updatedAt: item.ATUALIZADO_EM || '',
    originHash: item.HASH_ORIGEM || '',
    version: item.VERSAO_REGISTRO || ''
  };
}

function autSearchQuery_(actor, filters) {
  filters = filters || {};
  var search = autSearchNormalize_(filters.search || filters.query || '');
  var types = filters.entityTypes || filters.types || filters.entityType || [];
  if (!Array.isArray(types)) types = String(types || '').split(',');
  types = types.map(function(value) { return String(value || '').trim().toUpperCase(); }).filter(Boolean);
  var status = autSearchNormalize_(filters.status || '');
  var processId = String(filters.processId || '').trim();
  var queryShape = { search: search, types: types, status: status, processId: processId, sort: String(filters.sort || 'updated_desc') };
  var queryHash = autHash_(autJson_(queryShape));
  var cursor = autSearchReadCursor_(filters.cursor, queryHash);
  var terms = autSearchTokens_(search);
  var rows = autSearchCachedRows_().filter(function(item) {
    if (types.length && types.indexOf(String(item.TIPO_ENTIDADE || '').toUpperCase()) < 0) return false;
    if (status && autSearchNormalize_(item.STATUS) !== status) return false;
    if (processId && String(item.ID_PROCESSO || '') !== processId) return false;
    if (terms.length && !terms.every(function(term) { return autSearchNormalize_(item.TEXTO_BUSCA).indexOf(term) >= 0; })) return false;
    return autSearchIndexPermission_(actor, item);
  });
  rows.sort(function(a, b) {
    var dateDiff = autDateMs_(b.ATUALIZADO_EM) - autDateMs_(a.ATUALIZADO_EM);
    return dateDiff || String(a.ID_INDICE).localeCompare(String(b.ID_INDICE));
  });
  var limit = Math.min(Math.max(Number(filters.limit || filters.pageSize || 50), 1), 100);
  var offset = Number(filters.offset);
  if (!isFinite(offset) || offset < 0) offset = cursor.offset;
  offset = Math.floor(offset);
  var page = rows.slice(offset, offset + limit);
  var nextOffset = offset + page.length;
  var hasMore = nextOffset < rows.length;
  return {
    items: page.map(autSearchPublicItem_), total: rows.length, limit: limit, offset: offset,
    hasMore: hasMore,
    nextCursor: hasMore ? autSearchCursor_({ v: 1, o: nextOffset, q: queryHash }) : '',
    query: queryShape, indexVersion: AUT_SEARCH_INDEX_VERSION_
  };
}

function apiPesquisarIndice(token, filters) {
  try {
    var actor = autRequireAuth_(token);
    if (typeof dataCloudEnabled_ === 'function' && dataCloudEnabled_() &&
        (autHasPermission_(actor, 'PROCESSO_VER_TODOS') || ['DESENVOLVEDOR', 'ADMINISTRADOR'].indexOf(actor.PERFIL) >= 0) &&
        (!filters || filters.useCloud !== false)) {
      var cloudResult = apiPesquisarNeon(token, filters || {});
      if (cloudResult && cloudResult.ok) return cloudResult;
      console.warn('Busca Neon indisponível; usando índice local: ' + String(cloudResult && cloudResult.code || 'erro'));
    }
    return autResult_(autSearchQuery_(actor, filters || {}));
  } catch (err) { return autPublicError_(err); }
}

function autSearchIndexReady_() {
  return !!PropertiesService.getScriptProperties().getProperty(AUT_SEARCH_LAST_REBUILD_KEY_);
}

function autSearchMasterPage_(actor, entityType, filters) {
  filters = filters || {};
  var page = Math.max(Number(filters.page || 1), 1);
  var pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 10), 100);
  var result = autSearchQuery_(actor, {
    search: filters.search || '', entityTypes: [entityType],
    limit: pageSize, offset: (page - 1) * pageSize
  });
  var tableName = entityType === 'CLIENTE' ? 'BASE_CLIENTES' : 'BASE_IMOVEIS';
  var idField = entityType === 'CLIENTE' ? 'ID_CADASTRO' : 'ID_IMOVEL';
  var rows = result.items.map(function(item) { return autFind_(tableName, idField, item.id); }).filter(function(row) {
    return entityType === 'CLIENTE' ? autMasterActiveClient_(row) : !!row && String(row.STATUS || '') !== 'EXCLUIDO';
  });
  return { rows: rows, page: page, pageSize: pageSize, total: result.total };
}

function apiMapearBaseDados(token) {
  try {
    var actor = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    autEnsureSearchSheets_();
    var db = autDb_();
    var indexRows = autRows_('BUSCA_INDICE');
    var byTable = {};
    indexRows.forEach(function(row) { byTable[row.FONTE_TABELA] = (byTable[row.FONTE_TABELA] || 0) + 1; });
    var sheets = Object.keys(AUTENTIKO_SHEETS).map(function(name) {
      var sheet = db.getSheetByName(name);
      var source = autSearchSource_(name);
      return { name: name, exists: !!sheet, rows: sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0, columns: AUTENTIKO_SHEETS[name].length, indexedRows: byTable[name] || 0, searchable: !!source, fields: source ? source.text.slice() : [] };
    });
    var last = autJsonParse_(PropertiesService.getScriptProperties().getProperty(AUT_SEARCH_LAST_REBUILD_KEY_), {});
    return autResult_({ generatedAt: autNow_(), sheets: sheets, index: { rows: indexRows.length, lastRebuild: last, version: AUT_SEARCH_INDEX_VERSION_ }, drive: autDriveIndexStatus_(), requestedBy: actor.ID_USUARIO });
  } catch (err) { return autPublicError_(err); }
}

function apiReconstruirIndiceBusca(token) {
  try {
    autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    return autResult_(autSearchRebuildIndex_());
  } catch (err) { return autPublicError_(err); }
}

function autSearchSourceByType_(entityType) {
  var type = String(entityType || '').trim().toUpperCase();
  for (var i = 0; i < AUT_SEARCH_INDEX_SOURCES_.length; i++) {
    if (AUT_SEARCH_INDEX_SOURCES_[i].type === type) return AUT_SEARCH_INDEX_SOURCES_[i];
  }
  return null;
}

function autSearchCompareSide_(actor, reference) {
  reference = reference || {};
  var source = autSearchSource_(reference.sourceTable) || autSearchSourceByType_(reference.entityType);
  autAssert_(source, 'Tipo de registro não pode ser comparado.', 'VALIDATION_ERROR');
  var id = String(reference.id || reference.idEntity || reference.ID_ENTIDADE || '').trim();
  autAssert_(id, 'Informe o ID dos dois registros.', 'VALIDATION_ERROR');
  var row = autFind_(source.table, source.id, id);
  autAssert_(row, 'Registro não encontrado: ' + id, 'NOT_FOUND');
  var processMap = autSearchProcessMap_();
  var indexItem = autSearchIndexRecord_(source.table, row, row._row, processMap);
  autAssert_(autSearchIndexPermission_(actor, indexItem), 'Você não pode comparar este registro.', 'FORBIDDEN');
  return { source: source, row: row, index: indexItem };
}

function autSearchComparableValue_(row, field) {
  var value = row[field];
  if (/_JSON$/.test(field)) {
    var parsed = autJsonParse_(value, value);
    return autSearchCellText_(parsed, field).slice(0, 2000);
  }
  return autSearchCellText_(value, field).slice(0, 2000);
}

function apiCompararRegistrosIndice(token, payload) {
  try {
    var actor = autRequireAuth_(token);
    payload = payload || {};
    var left = autSearchCompareSide_(actor, payload.left || payload.a);
    var right = autSearchCompareSide_(actor, payload.right || payload.b);
    var defaultFields = Array.from(new Set((left.source.text || []).concat(right.source.text || [])));
    var requested = Array.isArray(payload.fields) ? payload.fields.map(String) : defaultFields;
    var fields = requested.filter(function(field) { return defaultFields.indexOf(field) >= 0; }).slice(0, 80);
    var differences = [];
    fields.forEach(function(field) {
      var leftValue = autSearchComparableValue_(left.row, field);
      var rightValue = autSearchComparableValue_(right.row, field);
      if (leftValue !== rightValue) differences.push({ field: field, left: leftValue, right: rightValue });
    });
    return autResult_({
      equal: differences.length === 0,
      generatedAt: autNow_(), fieldsCompared: fields.length, differences: differences,
      left: { id: left.index.ID_ENTIDADE, entityType: left.index.TIPO_ENTIDADE, sourceTable: left.source.table, originHash: left.index.HASH_ORIGEM },
      right: { id: right.index.ID_ENTIDADE, entityType: right.index.TIPO_ENTIDADE, sourceTable: right.source.table, originHash: right.index.HASH_ORIGEM }
    });
  } catch (err) { return autPublicError_(err); }
}

function autDriveIndexStatus_() {
  try { autEnsureSearchSheets_(); } catch (ignore) {}
  var last = autJsonParse_(PropertiesService.getScriptProperties().getProperty(AUT_DRIVE_INDEX_LAST_REBUILD_KEY_), {});
  var configured = String(PropertiesService.getScriptProperties().getProperty('AUT_DOCUMENTS_FOLDER_ID') || '').trim();
  var count = 0;
  try { count = autRows_('DRIVE_INDICE').length; } catch (ignore) {}
  return { configured: !!configured, folderId: configured, rows: count, lastRebuild: last };
}

function autDriveIndexRoots_() {
  var ids = [];
  try { ids = autFolderHistoryIds_('AUT_DOCUMENTS_FOLDER_ID'); } catch (ignore) {}
  var current = String(PropertiesService.getScriptProperties().getProperty('AUT_DOCUMENTS_FOLDER_ID') || '').trim();
  if (current && ids.indexOf(current) < 0) ids.unshift(current);
  return ids;
}

function autDriveIndexRecord_(file, folderId, pathParts, processMap, now) {
  var name = String(file.getName() || '');
  var pathText = (pathParts || []).join(' / ');
  var protocol = (pathParts || []).filter(function(part) { return processMap[part]; })[0] || '';
  var process = protocol ? processMap[protocol] : null;
  return {
    ID_ARQUIVO: String(file.getId()), ID_PROCESSO: process ? String(process.ID_PROCESSO) : '', PROTOCOLO: protocol,
    PASTA_ID: String(folderId || ''), NOME_ARQUIVO: name, MIME_TYPE: String(file.getMimeType() || ''),
    TAMANHO_BYTES: Number(file.getSize ? file.getSize() : 0), MODIFICADO_EM: file.getLastUpdated ? file.getLastUpdated() : '',
    URL: String(file.getUrl ? file.getUrl() : ''), TEXTO_BUSCA: autSearchNormalize_([name, pathText, protocol].join(' ')).slice(0, 4000),
    ATUALIZADO_EM: file.getLastUpdated ? file.getLastUpdated() : '', INDEXADO_EM: now, STATUS: 'ATIVO',
    PARENT_IDS_JSON: autJson_(pathParts || [])
  };
}

function autDriveIndexRebuild_(options) {
  options = options || {};
  return autWithScriptLock_(function() {
    autEnsureSearchSheets_();
    var roots = autDriveIndexRoots_();
    autAssert_(roots.length, 'A pasta documental do Drive ainda não foi configurada.', 'DRIVE_INDEX_NOT_CONFIGURED');
    var maxFiles = Math.min(Math.max(Number(options.maxFiles || 5000), 1), 10000);
    var processMap = {};
    autRows_('PROCESSOS').forEach(function(row) { if (row.PROTOCOLO) processMap[String(row.PROTOCOLO)] = row; });
    var records = [], seen = {}, truncated = false, now = autNow_();
    function walk(folder, pathParts) {
      if (records.length >= maxFiles) { truncated = true; return; }
      var files = folder.getFiles();
      while (files.hasNext()) {
        if (records.length >= maxFiles) { truncated = true; return; }
        var file = files.next();
        var id = String(file.getId());
        if (!seen[id]) { seen[id] = true; records.push(autDriveIndexRecord_(file, folder.getId(), pathParts, processMap, now)); }
      }
      var folders = folder.getFolders();
      while (folders.hasNext()) {
        if (records.length >= maxFiles) { truncated = true; return; }
        var child = folders.next();
        walk(child, (pathParts || []).concat([String(child.getName() || '')]));
      }
    }
    roots.forEach(function(rootId) {
      if (records.length >= maxFiles) return;
      try { walk(DriveApp.getFolderById(rootId), []); } catch (err) { console.warn('Pasta Drive ignorada no índice: ' + err.message); }
    });
    autSearchClearIndex_('DRIVE_INDICE');
    for (var i = 0; i < records.length; i += 500) autSearchWriteObjects_('DRIVE_INDICE', records.slice(i, i + 500));
    var stamp = autNow_();
    PropertiesService.getScriptProperties().setProperty(AUT_DRIVE_INDEX_LAST_REBUILD_KEY_, JSON.stringify({ at: stamp, rows: records.length, truncated: truncated, maxFiles: maxFiles }));
    CacheService.getScriptCache().remove('AUT_DRIVE_INDEX_ROWS');
    return { rebuilt: true, rows: records.length, truncated: truncated, maxFiles: maxFiles, at: stamp };
  });
}

function autDriveIndexRows_() {
  var cached = CacheService.getScriptCache().get('AUT_DRIVE_INDEX_ROWS');
  if (cached) return autJsonParse_(cached, []);
  var rows = autRows_('DRIVE_INDICE');
  autCachePut_(CacheService.getScriptCache(), 'AUT_DRIVE_INDEX_ROWS', rows, 30);
  return rows;
}

function apiPesquisarDriveIndice(token, filters) {
  try {
    var actor = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var roots = autDriveIndexRoots_();
    autAssert_(roots.length, 'A pasta documental do Drive ainda não foi configurada.', 'DRIVE_INDEX_NOT_CONFIGURED');
    filters = filters || {};
    var search = autSearchNormalize_(filters.search || filters.query || '');
    var terms = autSearchTokens_(search);
    var queryHash = autHash_(autJson_({ search: search, processId: String(filters.processId || '') }));
    var cursor = autSearchReadCursor_(filters.cursor, queryHash);
    var processId = String(filters.processId || '');
    var rows = autDriveIndexRows_().filter(function(row) {
      if (processId && String(row.ID_PROCESSO || '') !== processId) return false;
      if (terms.length && !terms.every(function(term) { return autSearchNormalize_(row.TEXTO_BUSCA).indexOf(term) >= 0; })) return false;
      if (row.ID_PROCESSO) {
        var process = autFind_('PROCESSOS', 'ID_PROCESSO', row.ID_PROCESSO);
        if (!process || (!autHasPermission_(actor, 'PROCESSO_VER_TODOS') && !autCanSeeProcess_(actor, process))) return false;
      } else if (!autHasPermission_(actor, 'PROCESSO_VER_TODOS')) return false;
      return true;
    }).sort(function(a, b) { return autDateMs_(b.MODIFICADO_EM) - autDateMs_(a.MODIFICADO_EM) || String(a.ID_ARQUIVO).localeCompare(String(b.ID_ARQUIVO)); });
    var limit = Math.min(Math.max(Number(filters.limit || filters.pageSize || 50), 1), 100);
    var offset = Number(filters.offset); if (!isFinite(offset) || offset < 0) offset = cursor.offset; offset = Math.floor(offset);
    var page = rows.slice(offset, offset + limit), nextOffset = offset + page.length;
    return autResult_({ items: page.map(function(row) { return { id: row.ID_ARQUIVO, processId: row.ID_PROCESSO || '', protocol: row.PROTOCOLO || '', name: row.NOME_ARQUIVO, mimeType: row.MIME_TYPE, size: Number(row.TAMANHO_BYTES || 0), modifiedAt: row.MODIFICADO_EM || '', url: row.URL || '', folderId: row.PASTA_ID || '' }; }), total: rows.length, limit: limit, offset: offset, hasMore: nextOffset < rows.length, nextCursor: nextOffset < rows.length ? autSearchCursor_({ v: 1, o: nextOffset, q: queryHash }) : '', index: autDriveIndexStatus_() });
  } catch (err) { return autPublicError_(err); }
}

function apiReconstruirIndiceDrive(token, options) {
  try { autRequireAuth_(token, 'CONFIGURACAO_GERIR'); return autResult_(autDriveIndexRebuild_(options || {})); }
  catch (err) { return autPublicError_(err); }
}
