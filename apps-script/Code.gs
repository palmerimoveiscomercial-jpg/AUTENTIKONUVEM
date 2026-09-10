function doGet() {
  var event = arguments[0];
  if (event && event.parameter && (event.parameter.api || event.parameter.action)) {
    try { return apiJsonOutput_(apiV1Request_(event, event.parameter)); }
    catch (err) { return apiJsonOutput_({ ok: false, code: err.code || 'INTERNAL_ERROR', message: err.message || 'Não foi possível concluir a operação.' }); }
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(AUTENTIKO.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onSpreadsheetOpen(e) {
  if (!e || !e.source) {
    console.log('Menu não criado: esta função deve ser executada pelo gatilho de abertura da planilha.');
    return false;
  }
  try {
    e.source.getUi().createMenu('AUTENTIKO OK NUVEM')
      .addItem('Instalar / reparar sistema', 'menuSetupSystem')
      .addItem('Executar diagnóstico seguro', 'diagnosticarSistema')
      .addItem('Verificar auditoria', 'menuVerifyAudit')
      .addToUi();
    return true;
  } catch (err) {
    console.warn('Não foi possível criar o menu da planilha: ' + err.message);
    return false;
  }
}

function menuSetupSystem() {
  var result = setupSystem();
  var message = result.message + '\n\nE-mail do desenvolvedor: ' + result.developerEmail;
  if (result.bootstrapPassword) message += '\nSenha temporária: ' + result.bootstrapPassword;
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(AUTENTIKO.APP_NAME, message, ui.ButtonSet.OK);
  } catch (err) {
    console.log(message);
  }
  return result;
}

function menuVerifyAudit() {
  var result = autVerifyAuditRows_();
  var message = result.valid
    ? 'Auditoria íntegra. Registros verificados: ' + result.records + '.' +
      (result.legacyBranches && result.legacyBranches.length
        ? ' Foram preservadas ' + result.legacyBranches.length + ' ramificação(ões) concorrente(s) da versão legada.'
        : '')
    : 'Foram encontradas ' + result.failures.length + ' falha(s) em ' + result.records + ' registro(s).';
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(AUTENTIKO.APP_NAME, message, ui.ButtonSet.OK);
  } catch (err) {
    console.log(message);
  }
  return { ok: true, valid: result.valid, records: result.records, failures: result.failures };
}

function diagnosticarSistema() {
  try {
    var db = autDb_();
    var sheetChecks = Object.keys(AUTENTIKO_SHEETS).map(function(name) {
      var sheet = db.getSheetByName(name);
      var expected = AUTENTIKO_SHEETS[name];
      var actual = sheet ? autHeaders_(sheet) : [];
      return {
        name: name,
        exists: !!sheet,
        rows: sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0,
        missingHeaders: expected.filter(function(header) { return actual.indexOf(header) < 0; })
      };
    });
    var cacheSizes = {};
    AUTENTIKO.PROCESS_TYPES.forEach(function(type) {
      cacheSizes[type] = Utilities.newBlob(JSON.stringify(autFormSchema_(type)), 'application/json').getBytes().length;
    });
    var audit = autVerifyAuditRows_();
    var config = autConfigMap_();
    var failures = sheetChecks.filter(function(item) { return !item.exists || item.missingHeaders.length; });
    var result = {
      ok: failures.length === 0 && audit.valid,
      app: AUTENTIKO.APP_NAME,
      codeVersion: AUTENTIKO.APP_VERSION,
      installedVersion: String(config.VERSAO_SISTEMA || ''),
      sheets: sheetChecks,
      formFields: sheetChecks.filter(function(item) { return item.name === 'FORMULARIOS'; })[0].rows,
      maxFormCacheBytes: Math.max.apply(null, Object.keys(cacheSizes).map(function(key) { return cacheSizes[key]; })),
      audit: audit,
      message: failures.length
        ? 'Há abas ou cabeçalhos pendentes. Execute setupSystem().'
        : (audit.valid
          ? 'Estrutura e auditoria verificadas.' +
            (audit.legacyBranches && audit.legacyBranches.length
              ? ' Ramificações concorrentes legadas preservadas: ' + audit.legacyBranches.length + '.'
              : '')
          : 'A estrutura está completa, mas a auditoria contém falhas.')
    };
    console.log(JSON.stringify(result));
    return result;
  } catch (err) {
    var response = autPublicError_(err);
    console.log(JSON.stringify(response));
    return response;
  }
}

function apiPublicBootstrap() {
  try {
    var installed = !!autDb_().getSheetByName('CONFIGURACOES');
    return autResult_({
      installed: installed,
      config: installed ? autPublicConfig_() : { NOME_SISTEMA: AUTENTIKO.APP_NAME, VERSAO_SISTEMA: AUTENTIKO.APP_VERSION },
      version: AUTENTIKO.APP_VERSION
    });
  } catch (err) { return autPublicError_(err); }
}

function apiBootstrap(token) {
  try {
    var user = autRequireAuth_(token);
    return autResult_(autGetOperationalBootstrap_(user, { force:false }));
  } catch (err) { return autPublicError_(err); }
}

function apiAquecerCacheAutopreenchimento(token) {
  try {
    var user = autRequireAuth_(token);
    var allowed = autHasPermission_(user, 'PROCESSO_CRIAR') || autHasPermission_(user, 'PROCESSO_EDITAR');
    if (!allowed) return autResult_({ warmed: false, reason: 'PERMISSION_NOT_APPLICABLE' });
    autMasterPrimeLookupCache_();
    return autResult_({ warmed: true });
  } catch (err) { return autPublicError_(err); }
}

function apiObterFormularioProcesso(token, type) {
  try {
    autRequireAuth_(token);
    autAssert_(AUTENTIKO.PROCESS_TYPES.indexOf(type) >= 0, 'Tipo de processo inválido.');
    var fields = autFormSchema_(type);
    var lists = autLists_();
    var activeUsers = autRowsBy_('USUARIOS', 'STATUS', 'ATIVO').map(function(user) {
      return { value: user.NOME, label: user.NOME };
    }).sort(function(a, b) { return a.label.localeCompare(b.label); });
    fields.forEach(function(field) {
      if (field.options && field.options.list) field.options = lists[field.options.list] || [];
      if (field.input === 'user_select') field.options = activeUsers;
    });
    return autResult_({ type: type, fields: fields, schemaVersion: SCHEMA.version });
  } catch (err) { return autPublicError_(err); }
}

/* ================================================================
 * SNAPSHOT OPERACIONAL 2.9.1
 * Uma única leitura batch da planilha alimenta o HTML, os caches de
 * navegação e as miniaturas. Gravações continuam usando as rotinas
 * transacionais existentes e o navegador revalida o snapshot depois.
 * ================================================================ */
function autResolvedFormSchemas_() {
  var lists = autLists_();
  var activeUsers = autRowsBy_('USUARIOS', 'STATUS', 'ATIVO').map(function(user) {
    return { value:user.NOME, label:user.NOME };
  }).sort(function(a, b) { return String(a.label).localeCompare(String(b.label)); });
  var grouped = {};
  AUTENTIKO.PROCESS_TYPES.forEach(function(type) {
    grouped[type] = autFormSchema_(type).map(function(field) {
      var copy = Object.assign({}, field);
      if (copy.options && copy.options.list) copy.options = (lists[copy.options.list] || []).slice();
      else if (Array.isArray(copy.options)) copy.options = copy.options.slice();
      if (copy.input === 'user_select') copy.options = activeUsers.slice();
      return copy;
    });
  });
  return grouped;
}

function autOperationalBootstrapBase_(user) {
  return {
    user:autUserPublic_(user),
    config:autPublicConfig_(),
    processTypes:AUTENTIKO.PROCESS_TYPES.map(function(type) { return { value:type, label:autLabel_(type) }; }),
    statuses:AUTENTIKO.PROCESS_STATUS.slice(),
    phases:AUTENTIKO.PROCESS_PHASES.slice(),
    workflowStates:AUTENTIKO.WORKFLOW_STATES.slice(),
    reviewCategories:AUTENTIKO.REVIEW_CATEGORIES.map(function(value) { return { value:value, label:autLabel_(value) }; }),
    participantRoles:AUTENTIKO.PARTICIPANT_ROLES.map(function(value) { return { value:value, label:autLabel_(value) }; }),
    proposalTypes:AUTENTIKO.PROPOSAL_TYPES.map(function(value) { return { value:value, label:autLabel_(value) }; }),
    privacyNotice:String(autConfigMap_().AVISO_PRIVACIDADE_AUDITORIA || ''),
    permissionsCatalog:AUTENTIKO_PERMISSIONS,
    formSchemas:autResolvedFormSchemas_(),
    documentCatalog:autDocumentCatalog_(),
    lists:autLists_(),
    ai:typeof autAiPublicStatus_ === 'function' ? autAiPublicStatus_() : { available:false, providers:[] }
  };
}

function autBootstrapThumbnailDocuments_(visible) {
  var visibleIds = {};
  (visible || []).forEach(function(process) { visibleIds[String(process.ID_PROCESSO || '')] = true; });
  var rawRows = autRows_('PROCESSO_DOCUMENTOS').filter(function(row) {
    return visibleIds[String(row.ID_PROCESSO || '')] && !row.EXCLUIDO_EM;
  });
  var processByDocumentId = {};
  var processVersionById = {};
  (visible || []).forEach(function(process) {
    processVersionById[String(process.ID_PROCESSO || '')] = autProcessVersion_(process);
  });
  rawRows.forEach(function(row) { processByDocumentId[String(row.ID_DOCUMENTO || '')] = String(row.ID_PROCESSO || ''); });
  return autProcessDocumentsPublic_(rawRows).map(function(document) {
    var processId = processByDocumentId[String(document.id || '')] || '';
    return Object.assign({ processId:processId, processVersion:Number(processVersionById[processId] || 1) }, document);
  });
}

function autBuildOperationalBootstrap_(user, options) {
  options = options || {};
  var started = Date.now();
  var prime = options.prime || { cacheHit:false };
  var base = autOperationalBootstrapBase_(user);
  var visible = autVisibleProcesses_(user).sort(function(a, b) { return autDateMs_(b.CRIADO_EM) - autDateMs_(a.CRIADO_EM); });
  var cards = visible.map(function(process) { return Object.assign(autProcessCard_(process), { responsibleId:String(process.ID_RESPONSAVEL || '') }); });
  var details = {};
  var warnings = [];

  // O login recebe todos os cartões e todos os metadados de documentos, mas não
  // duplica a ficha completa de centenas de processos no mesmo payload. Os dados
  // brutos já estão no snapshot do servidor e são resolvidos por índice quando o
  // usuário abre um processo antigo.
  var eagerDetailsLimit = Math.max(8, Math.min(40, Number(options.eagerDetailsLimit || 24)));
  var eagerReviewLimit = Math.max(0, Math.min(eagerDetailsLimit, Number(options.eagerReviewLimit == null ? 8 : options.eagerReviewLimit)));

  visible.slice(0, eagerDetailsLimit).forEach(function(process, processIndex) {
    var id = String(process.ID_PROCESSO || '');
    if (!id) return;
    var shell = {
      process:Object.assign(autProcessCard_(process), { responsibleId:String(process.ID_RESPONSAVEL || '') }),
      workflow:autWorkflowSnapshot_(user, process, false),
      capabilities:autProcessCapabilities_(user, process),
      tabMeta:{ pending:Number(process.PENDENCIAS_QTD || 0), version:autProcessVersion_(process) }
    };
    var tabs = {};
    try {
      var registration = autProcessRegistrationTab_(user, process);
      delete registration.formFields;
      registration.tab = 'CADASTRO';
      registration.processVersion = autProcessVersion_(process);
      tabs.registration = registration;
    } catch (registrationError) {
      warnings.push({ processId:id, tab:'registration', message:String(registrationError.message || registrationError).slice(0, 180) });
    }
    try {
      var documents = autProcessDocumentsTab_(user, process);
      documents.tab = 'DOCUMENTOS';
      documents.processVersion = autProcessVersion_(process);
      tabs.documents = documents;
    } catch (documentError) {
      warnings.push({ processId:id, tab:'documents', message:String(documentError.message || documentError).slice(0, 180) });
    }
    if (processIndex < eagerReviewLimit) {
      try {
        var review = autProcessReviewTab_(user, process);
        review.tab = 'REVISAO';
        review.processVersion = autProcessVersion_(process);
        tabs.review = review;
      } catch (reviewError) {
        warnings.push({ processId:id, tab:'review', message:String(reviewError.message || reviewError).slice(0, 180) });
      }
    }
    details[id] = { shell:shell, tabs:tabs };
  });

  var thumbnails = [];
  try { thumbnails = autBootstrapThumbnailDocuments_(visible); }
  catch (thumbnailError) {
    warnings.push({ processId:'', tab:'thumbnails', message:String(thumbnailError.message || thumbnailError).slice(0, 180) });
  }

  var marker = autOperationalExternalMarker_();
  base.processes = cards;
  base.dashboard = autDashboard_(user, visible);
  base.details = details;
  base.thumbnailDocuments = thumbnails;
  base.snapshot = {
    schemaVersion:AUTENTIKO_OPERATIONAL_BATCH_VERSION_,
    marker:marker,
    builtAt:autNow_(),
    source:prime.cacheHit ? 'SHEETS_BATCH_CACHE' : 'SHEETS_BATCH',
    processCount:cards.length,
    eagerProcessCount:Object.keys(details).length,
    documentCount:thumbnails.length,
    latencyMs:Date.now() - started,
    warnings:warnings.slice(0, 40)
  };
  return base;
}

function autGetOperationalBootstrap_(user, options) {
  options = options || {};
  // O marcador inclui a revisão interna e a última alteração externa da
  // planilha. Assim, uma edição direta no Sheets nunca recebe dados antigos
  // de um snapshot que foi construído antes dela.
  var marker = autOperationalExternalMarker_();
  var key = 'AUT_APP_SNAPSHOT_291_' + autHash_([user.ID_USUARIO, marker].join('|'));
  var cache = CacheService.getScriptCache();
  var cached = !options.force && !options.bypassCache ? autLargeCacheGet_(cache, key) : null;
  if (cached && cached.user && cached.snapshot) {
    cached.user = autUserPublic_(user);
    cached.snapshot.cacheHit = true;
    cached.snapshot.marker = marker;
    return cached;
  }
  var prime = autPrimeOperationalTables_({ force:!!options.force });
  var built;
  AUTENTIKO_REQUEST_TABLES_ACTIVE_ = true;
  try {
    var buildOptions = Object.assign({}, options, { prime:prime });
    built = autBuildOperationalBootstrap_(user, buildOptions);
  } finally {
    // Não permita que o snapshot acelerador contamine chamadas posteriores no
    // mesmo runtime (salvar, autenticar, baixar ou sincronizar documentos).
    AUTENTIKO_REQUEST_TABLES_ACTIVE_ = false;
  }
  autLargeCachePut_(cache, key, built, 300);
  return built;
}

function apiSincronizarSnapshot(token, clientMarker) {
  try {
    var user = autRequireAuth_(token);
    var currentMarker = autOperationalExternalMarker_();
    if (String(clientMarker || '') === String(currentMarker)) {
      return autResult_({ changed:false, marker:currentMarker, checkedAt:autNow_() });
    }
    var bootstrap = autGetOperationalBootstrap_(user, { force:true });
    return autResult_({ changed:true, marker:bootstrap.snapshot.marker, bootstrap:bootstrap, checkedAt:autNow_() });
  } catch (err) { return autPublicError_(err); }
}
