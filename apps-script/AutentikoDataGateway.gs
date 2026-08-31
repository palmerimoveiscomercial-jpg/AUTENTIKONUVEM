/**
 * Data Gateway do Apps Script.
 *
 * O navegador nunca recebe segredos. Enquanto a API operacional não estiver
 * habilitada, o sistema mantém a gravação legada na planilha. A migração é
 * paginada, idempotente e retomável para caber no limite de execução do GAS.
 */
var AUT_MIGRATION_CHECKPOINT_KEY_ = 'AUT_DATABASE_MIGRATION_CHECKPOINT_V1';
var AUT_MIGRATION_BATCH_DEFAULT_ = 200;
var AUT_MIGRATION_TABLES_ = Object.freeze([
  'CONFIGURACOES', 'USUARIOS', 'BASE_CLIENTES', 'BASE_CLIENTES_CONFLITOS',
  'BASE_IMOVEIS', 'FORMULARIOS', 'DOCUMENTOS_CATALOGO', 'LISTAS', 'PROCESSOS',
  'PROCESSO_PARTICIPANTES', 'PROCESSO_DADOS', 'PROCESSO_DOCUMENTOS',
  'ACEITES_ELETRONICOS', 'PROCESSO_CHECKLIST', 'PENDENCIAS', 'ATUACOES',
  'MOVIMENTACOES_PROCESSO', 'PROPOSTAS', 'PROPOSTA_CONDICOES', 'MODELOS_CONTRATO',
  'CLAUSULAS_CONTRATO', 'CONTRATOS', 'CONTRATO_PARTES', 'AUDITORIA',
  'BUSCA_INDICE', 'DRIVE_INDICE'
]);

function autGatewayFlags_() {
  var config = autConfigMap_();
  return {
    primaryDataSource: autNormalize_(config.PRIMARY_DATA_SOURCE || 'SHEETS'),
    remoteBackendEnabled: autNormalize_(config.REMOTE_BACKEND_ENABLED) === 'SIM',
    neonReadEnabled: autNormalize_(config.NEON_READ_ENABLED) === 'SIM',
    neonWriteEnabled: autNormalize_(config.NEON_WRITE_ENABLED) === 'SIM',
    sheetsBackupEnabled: autNormalize_(config.SHEETS_BACKUP_ENABLED || 'SIM') !== 'NAO',
    driveBackupEnabled: autNormalize_(config.DRIVE_BACKUP_ENABLED || 'SIM') !== 'NAO',
    cloudinaryEnabled: autNormalize_(config.CLOUDINARY_ENABLED) === 'SIM',
    cloudinaryCloudName: String(config.CLOUDINARY_CLOUD_NAME || 'llbdih6f'),
    cloudinaryFolderMode: String(config.CLOUDINARY_FOLDER_MODE || 'DYNAMIC_FOLDERS')
  };
}

function autGatewayPost_(path, payload) {
  var body = JSON.stringify(payload || {});
  var timestamp = String(Math.floor(Date.now() / 1000));
  var signature = dataCloudHex_(Utilities.computeHmacSha256Signature(
    timestamp + '.' + body,
    dataCloudSecret_('AUT_DATA_SYNC_SECRET'),
    Utilities.Charset.UTF_8
  ));
  var response = UrlFetchApp.fetch(dataCloudBaseUrl_() + path, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    muteHttpExceptions: true,
    followRedirects: false,
    headers: {
      'X-Autentiko-Timestamp': timestamp,
      'X-Autentiko-Signature': signature,
      'Cache-Control': 'no-store'
    }
  });
  return dataCloudParseResponse_(response);
}

function autMigrationNewCheckpoint_() {
  return {
    schemaVersion: SCHEMA.version,
    migrationId: 'mig-' + autUuid_(),
    tableIndex: 0,
    rowOffset: 0,
    rowsSent: 0,
    batchesSent: 0,
    startedAt: autNow_(),
    updatedAt: autNow_(),
    complete: false,
    lastError: ''
  };
}

function autMigrationCheckpoint_() {
  var raw = PropertiesService.getScriptProperties().getProperty(AUT_MIGRATION_CHECKPOINT_KEY_);
  var parsed = autJsonParse_(raw, null);
  if (!parsed || parsed.schemaVersion !== SCHEMA.version) return autMigrationNewCheckpoint_();
  return parsed;
}

function autMigrationSaveCheckpoint_(checkpoint) {
  checkpoint.updatedAt = autNow_();
  PropertiesService.getScriptProperties().setProperty(AUT_MIGRATION_CHECKPOINT_KEY_, JSON.stringify(checkpoint));
  return checkpoint;
}

function autMigrationTablePage_(table, rowOffset, limit) {
  var sheet = autDb_().getSheetByName(table);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    return { table: table, records: [], totalRows: 0, nextOffset: null };
  }
  var headers = autHeaders_(sheet);
  var totalRows = Math.max(sheet.getLastRow() - 1, 0);
  var count = Math.min(Math.max(Number(limit || AUT_MIGRATION_BATCH_DEFAULT_), 1), Math.max(totalRows - rowOffset, 0));
  if (!count) return { table: table, records: [], totalRows: totalRows, nextOffset: null };
  var values = sheet.getRange(rowOffset + 2, 1, count, headers.length).getValues();
  var records = values.map(function(row, index) {
    var raw = {};
    headers.forEach(function(header, column) {
      var value = row[column];
      raw[header] = value instanceof Date ? value.toISOString() : value;
    });
    return {
      sourceRow: rowOffset + index + 2,
      raw: raw,
      canonical: SCHEMA.normalizeRecord(raw, 'NUVEM', table)
    };
  });
  return {
    table: table,
    records: records,
    totalRows: totalRows,
    nextOffset: rowOffset + count < totalRows ? rowOffset + count : null
  };
}

function autMigrationRunBatch_(actor, options, context) {
  options = options || {};
  var flags = autGatewayFlags_();
  autAssert_(flags.remoteBackendEnabled, 'Ative REMOTE_BACKEND_ENABLED somente depois de configurar e testar a API.', 'REMOTE_BACKEND_DISABLED');
  autAssert_(flags.neonWriteEnabled, 'Ative NEON_WRITE_ENABLED somente depois de aplicar o schema do backend.', 'NEON_WRITE_DISABLED');
  var limit = Math.min(Math.max(Number(options.limit || AUT_MIGRATION_BATCH_DEFAULT_), 1), 400);
  var checkpoint = autMigrationCheckpoint_();
  if (checkpoint.complete) return checkpoint;

  while (checkpoint.tableIndex < AUT_MIGRATION_TABLES_.length) {
    var table = AUT_MIGRATION_TABLES_[checkpoint.tableIndex];
    var page = autMigrationTablePage_(table, Number(checkpoint.rowOffset || 0), limit);
    if (!page.records.length) {
      checkpoint.tableIndex += 1;
      checkpoint.rowOffset = 0;
      autMigrationSaveCheckpoint_(checkpoint);
      continue;
    }
    try {
      var result = autGatewayPost_('/api/v1/migrations/sheets', {
        schemaVersion: SCHEMA.version,
        migrationId: checkpoint.migrationId,
        batchId: [checkpoint.migrationId, table, checkpoint.rowOffset].join(':'),
        tenantId: 'PALMER',
        sourceSystem: 'AUTENTIKO_OK_NUVEM',
        sourceSpreadsheetId: AUTENTIKO.SPREADSHEET_ID,
        sourceTable: table,
        records: page.records
      });
      checkpoint.rowsSent += page.records.length;
      checkpoint.batchesSent += 1;
      checkpoint.lastTable = table;
      checkpoint.lastResult = result.data || {};
      checkpoint.lastError = '';
      if (page.nextOffset == null) {
        checkpoint.tableIndex += 1;
        checkpoint.rowOffset = 0;
      } else {
        checkpoint.rowOffset = page.nextOffset;
      }
      if (checkpoint.tableIndex >= AUT_MIGRATION_TABLES_.length) {
        checkpoint.complete = true;
        checkpoint.completedAt = autNow_();
      }
      autMigrationSaveCheckpoint_(checkpoint);
      if (actor) autAudit_(actor, 'DATABASE_MIGRATION_BATCH', 'CONFIGURACAO', checkpoint.migrationId, {
        table: table,
        records: page.records.length,
        rowsSent: checkpoint.rowsSent,
        complete: checkpoint.complete
      }, context || {});
      return checkpoint;
    } catch (err) {
      checkpoint.lastError = String(err && err.message || err).slice(0, 500);
      autMigrationSaveCheckpoint_(checkpoint);
      throw err;
    }
  }
  checkpoint.complete = true;
  checkpoint.completedAt = autNow_();
  return autMigrationSaveCheckpoint_(checkpoint);
}

function autMigrationActorFromEditor_() {
  var email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  autAssert_(email, 'Não foi possível identificar a conta que executa o Apps Script.', 'EDITOR_ACCOUNT_REQUIRED');
  var actor = autRowsBy_('USUARIOS', 'EMAIL', email).filter(function(row) { return autNormalize_(row.STATUS) === 'ATIVO'; })[0];
  autAssert_(actor && ['DESENVOLVEDOR', 'ADMINISTRADOR'].indexOf(autNormalize_(actor.PERFIL)) >= 0,
    'A migração deve ser executada por um desenvolvedor ou administrador ativo.', 'FORBIDDEN');
  return actor;
}

function apiMigrarBaseCompletaParaDatabase(token, options, context) {
  try {
    var actor = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    autAssert_(['DESENVOLVEDOR', 'ADMINISTRADOR'].indexOf(autNormalize_(actor.PERFIL)) >= 0,
      'A migração integral exige perfil de desenvolvedor ou administrador.', 'FORBIDDEN');
    return autResult_({ migration: autMigrationRunBatch_(actor, options, context) });
  } catch (err) { return autPublicError_(err); }
}

function apiStatusMigracaoDatabase(token) {
  try {
    var actor = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    return autResult_({ migration: autMigrationCheckpoint_(), gateway: autGatewayFlags_(), actor: actor.EMAIL });
  } catch (err) { return autPublicError_(err); }
}

/** Execute esta função no editor do Apps Script depois de habilitar/testar a API. */
function AUTENTIKO_MIGRAR_BASE_PARA_DATABASE() {
  var actor = autMigrationActorFromEditor_();
  var started = Date.now();
  var checkpoint;
  do {
    checkpoint = autMigrationRunBatch_(actor, { limit: AUT_MIGRATION_BATCH_DEFAULT_ }, { source: 'SCRIPT_EDITOR' });
  } while (!checkpoint.complete && Date.now() - started < 240000);
  console.log(JSON.stringify(checkpoint, null, 2));
  return checkpoint;
}

function AUTENTIKO_STATUS_MIGRACAO_DATABASE() {
  var actor = autMigrationActorFromEditor_();
  var status = { actor: actor.EMAIL, gateway: autGatewayFlags_(), migration: autMigrationCheckpoint_() };
  console.log(JSON.stringify(status, null, 2));
  return status;
}

/** Remove apenas o cursor; não apaga dados na planilha, Neon ou Supabase. */
function AUTENTIKO_REINICIAR_CURSOR_MIGRACAO() {
  autMigrationActorFromEditor_();
  PropertiesService.getScriptProperties().deleteProperty(AUT_MIGRATION_CHECKPOINT_KEY_);
  return autMigrationCheckpoint_();
}
