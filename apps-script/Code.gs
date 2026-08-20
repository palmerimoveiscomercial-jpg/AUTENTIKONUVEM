function doGet() {
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
    if (autHasPermission_(user, 'PROCESSO_CRIAR') || autHasPermission_(user, 'PROCESSO_EDITAR')) {
      try { autMasterPrimeLookupCache_(); }
      catch (lookupWarmError) { console.warn('Pré-aquecimento do autopreenchimento ignorado: ' + lookupWarmError.message); }
    }
    return autResult_({
      user: autUserPublic_(user),
      config: autPublicConfig_(),
      processTypes: AUTENTIKO.PROCESS_TYPES.map(function(type) { return { value: type, label: autLabel_(type) }; }),
      statuses: AUTENTIKO.PROCESS_STATUS.slice(),
      phases: AUTENTIKO.PROCESS_PHASES.slice(),
      workflowStates: AUTENTIKO.WORKFLOW_STATES.slice(),
      reviewCategories: AUTENTIKO.REVIEW_CATEGORIES.map(function(value) { return { value: value, label: autLabel_(value) }; }),
      participantRoles: AUTENTIKO.PARTICIPANT_ROLES.map(function(value) { return { value: value, label: autLabel_(value) }; }),
      proposalTypes: AUTENTIKO.PROPOSAL_TYPES.map(function(value) { return { value: value, label: autLabel_(value) }; }),
      privacyNotice: String(autConfigMap_().AVISO_PRIVACIDADE_AUDITORIA || ''),
      permissionsCatalog: AUTENTIKO_PERMISSIONS,
      formSchemas: {},
      documentCatalog: autDocumentCatalog_()
    });
  } catch (err) { return autPublicError_(err); }
}

function apiObterFormularioProcesso(token, type) {
  try {
    autRequireAuth_(token);
    autAssert_(AUTENTIKO.PROCESS_TYPES.indexOf(type) >= 0, 'Tipo de processo inválido.');
    var fields = autFormSchema_(type);
    var lists = autLists_();
    fields.forEach(function(field) {
      if (field.options && field.options.list) field.options = lists[field.options.list] || [];
    });
    return autResult_({ type: type, fields: fields });
  } catch (err) { return autPublicError_(err); }
}
