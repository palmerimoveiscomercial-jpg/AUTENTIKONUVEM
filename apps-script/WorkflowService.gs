var AUTENTIKO_WORKFLOW_ROLE_BY_STATE = Object.freeze({
  COM_CORRETOR: 'CORRETOR',
  DEVOLVIDO_CORRETOR: 'CORRETOR',
  AGUARDANDO_ADMINISTRATIVO: 'ASSISTENTE_ADMINISTRATIVO',
  COM_ADMINISTRATIVO: 'ASSISTENTE_ADMINISTRATIVO',
  AGUARDANDO_GERENTE: 'GERENTE_ADMINISTRATIVO',
  COM_GERENTE: 'GERENTE_ADMINISTRATIVO',
  CONTRATO_EM_PREPARACAO: 'GERENTE_ADMINISTRATIVO',
  AGUARDANDO_GERENTE_GERAL: 'GERENTE_GERAL',
  COM_GERENTE_GERAL: 'GERENTE_GERAL',
  AGUARDANDO_AUDITORIA: 'AUDITOR',
  COM_AUDITOR: 'AUDITOR'
});

function autSeedWorkflowV2_() {
  autSeedWorkflowLists_();
  autSeedDocumentCategories_();
  autSeedContractModels_();
  autMigrateWorkflowV2_();
}

function autSeedWorkflowLists_() {
  var groups = {
    CATEGORIA_REVISAO: AUTENTIKO.REVIEW_CATEGORIES,
    PAPEL_PARTICIPANTE: AUTENTIKO.PARTICIPANT_ROLES,
    TIPO_PROPOSTA: AUTENTIKO.PROPOSAL_TYPES
  };
  var existing = {};
  autRows_('LISTAS').forEach(function(row) { existing[row.TIPO + '|' + row.VALOR] = true; });
  var rows = [];
  Object.keys(groups).forEach(function(type) {
    groups[type].forEach(function(value, index) {
      if (!existing[type + '|' + value]) rows.push({ TIPO: type, VALOR: value, ORDEM: index + 1, ATIVO: 'SIM' });
    });
  });
  autAppendMany_('LISTAS', rows);
}

function autDefaultDocumentCategories_(documentTypeId) {
  var id = String(documentTypeId || '');
  if (/CONTRATO/.test(id)) return ['CONTRATOS'];
  if (/PAGAMENTO|RECIBO|BOLETO/.test(id)) return ['PAGAMENTOS'];
  if (/PROCURACAO/.test(id)) return ['PROCURACOES'];
  if (/VISTORIA/.test(id)) return ['LAUDO_VISTORIA'];
  if (/CAPTACAO|PRESTACAO/.test(id)) return ['LAUDO_CAPTACAO'];
  if (/IDENTIDADE|RG_CNH|CPF|RESIDENCIA|ENDERECO|CERTIDAO_(CASAMENTO|DIVORCIO|NASCIMENTO)|ESTADO_CIVIL/.test(id)) {
    return ['DOCUMENTOS_PESSOAIS'];
  }
  return [];
}

function autSeedDocumentCategories_() {
  autRows_('DOCUMENTOS_CATALOGO').forEach(function(row) {
    if (String(row.CATEGORIAS_JSON || '').trim()) return;
    autUpdateRow_('DOCUMENTOS_CATALOGO', row._row, {
      CATEGORIAS_JSON: autJson_(autDefaultDocumentCategories_(row.ID_DOCUMENTO_TIPO))
    });
  });
}

function autMigrateWorkflowV2_() {
  var properties = PropertiesService.getScriptProperties();
  var roleDone = properties.getProperty('AUT_V2_ROLE_MIGRATION') === '1';
  if (!roleDone) {
    autRows_('USUARIOS').forEach(function(user) {
      if (String(user.PERFIL) !== 'ADMINISTRADOR') return;
      var permissions = autUserPermissions_(user).filter(function(permission) { return permission !== '*'; });
      autUpdateRow_('USUARIOS', user._row, {
        PERFIL: 'GERENTE_ADMINISTRATIVO',
        PERMISSOES_JSON: autJson_(Array.from(new Set(permissions.concat([
          'USUARIO_GERIR', 'FORMULARIO_GERIR', 'CONFIGURACAO_GERIR',
          'CONTRATO_MODELO_GERIR', 'ADITIVO_CRIAR'
        ])))),
        ATUALIZADO_EM: autNow_()
      });
    });
    properties.setProperty('AUT_V2_ROLE_MIGRATION', '1');
  }

  autRows_('PROCESSOS').forEach(function(process) {
    var version = Number(process.VERSAO_REGISTRO || 0);
    var hasWorkflow = String(process.STATUS_TRAMITACAO || '').trim();
    var patch = {};
    if (!version) patch.VERSAO_REGISTRO = 1;
    if (!hasWorkflow) {
      var sector = autNormalize_(process.SETOR_ATUAL || 'COMERCIAL');
      if (String(process.STATUS) === 'FINALIZADO') {
        patch.STATUS = 'FINALIZADO';
        patch.FASE = 'FINALIZACAO';
        patch.STATUS_TRAMITACAO = 'CONCLUIDO';
        patch.ETAPA_ATUAL = 'FINALIZACAO';
        patch.BLOQUEADO_EM = process.FINALIZADO_EM || process.ATUALIZADO_EM || autNow_();
        patch.BLOQUEADO_POR = 'MIGRACAO_V2';
        patch.MIGRACAO_STATUS = 'LEGADO_FINALIZADO_BLOQUEADO';
      } else if (sector === 'ADMINISTRATIVO') {
        patch.STATUS = 'EM_ANALISE';
        patch.FASE = 'ADMINISTRATIVO';
        patch.STATUS_TRAMITACAO = 'COM_ADMINISTRATIVO';
        patch.ETAPA_ATUAL = 'ADMINISTRATIVO';
        patch.MIGRACAO_STATUS = 'LEGADO_SEM_ACEITES';
      } else if (sector === 'GERENTE_ADMINISTRATIVO' || sector === 'GERENCIAL') {
        patch.STATUS = 'EM_ANALISE';
        patch.FASE = 'GERENCIAL';
        patch.STATUS_TRAMITACAO = 'COM_GERENTE';
        patch.ETAPA_ATUAL = 'GERENCIAL';
        patch.MIGRACAO_STATUS = 'LEGADO_SEM_ACEITES';
      } else if (sector === 'AUDITORIA') {
        patch.STATUS = 'EM_ANALISE';
        patch.FASE = 'AUDITORIA';
        patch.STATUS_TRAMITACAO = 'COM_AUDITOR';
        patch.ETAPA_ATUAL = 'AUDITORIA';
        patch.MIGRACAO_STATUS = 'LEGADO_SEM_ACEITES';
      } else {
        patch.STATUS = 'RASCUNHO';
        patch.FASE = 'DOCUMENTACAO';
        patch.STATUS_TRAMITACAO = 'COM_CORRETOR';
        patch.ETAPA_ATUAL = 'CORRETOR';
        patch.MIGRACAO_STATUS = 'LEGADO_SEM_ACEITES';
      }
    }
    if (Object.keys(patch).length) autUpdateRow_('PROCESSOS', process._row, patch);
    var refreshed = Object.assign({}, process, patch);
    autBootstrapParticipantsFromProcess_(refreshed, null);
  });

  autRows_('PROCESSO_DOCUMENTOS').forEach(function(document) {
    var patch = {};
    if (!String(document.CATEGORIAS_JSON || '').trim()) {
      var catalog = autFind_('DOCUMENTOS_CATALOGO', 'ID_DOCUMENTO_TIPO', document.ID_DOCUMENTO_TIPO);
      patch.CATEGORIAS_JSON = catalog && catalog.CATEGORIAS_JSON
        ? catalog.CATEGORIAS_JSON
        : autJson_(autDefaultDocumentCategories_(document.ID_DOCUMENTO_TIPO));
    }
    if (!String(document.STATUS_CONFERENCIA || '').trim()) patch.STATUS_CONFERENCIA = 'PENDENTE_CONFERENCIA';
    if (!Number(document.VERSAO_REGISTRO || 0)) patch.VERSAO_REGISTRO = 1;
    if (Object.keys(patch).length) autUpdateRow_('PROCESSO_DOCUMENTOS', document._row, patch);
  });

  autRows_('PROCESSOS').filter(function(process) {
    return String(process.STATUS) === 'FINALIZADO' && !String(process.HASH_MANIFESTO || '').trim();
  }).forEach(function(process) {
    var refreshed = autFind_('PROCESSOS', 'ID_PROCESSO', process.ID_PROCESSO);
    autUpdateRow_('PROCESSOS', process._row, { HASH_MANIFESTO: autBuildProcessManifest_(refreshed) });
  });
}

function autProcessVersion_(process) {
  return Math.max(Number(process && process.VERSAO_REGISTRO || 1), 1);
}

function autAssertProcessMutable_(process) {
  autAssert_(process && String(process.STATUS) !== 'FINALIZADO' && !process.BLOQUEADO_EM,
    'Este processo foi finalizado e está permanentemente bloqueado. Crie um aditivo para registrar correções.',
    'PROCESS_LOCKED');
}

function autAssertExpectedVersion_(process, expectedVersion) {
  var expected = Number(expectedVersion);
  autAssert_(expected > 0, 'A versão visualizada do processo não foi informada. Atualize a página.', 'PROCESS_VERSION_REQUIRED');
  autAssert_(expected === autProcessVersion_(process),
    'Este processo foi alterado por outro usuário. Atualize a página antes de continuar.',
    'PROCESS_VERSION_CONFLICT');
}

function autAssertCurrentResponsible_(actor, process) {
  if (autIsProcessExecutive_(actor)) return;
  autAssert_(String(process.ID_RESPONSAVEL || '') === String(actor.ID_USUARIO || ''),
    'O processo não está sob sua responsabilidade atual.', 'NOT_CURRENT_RESPONSIBLE');
}

function autAssertActorRole_(actor, roles) {
  if (autIsProcessExecutive_(actor)) return;
  autAssert_((roles || []).indexOf(String(actor.PERFIL || '')) >= 0,
    'Seu perfil não pode executar esta etapa do fluxo.', 'INVALID_WORKFLOW_ROLE');
}

function autOpenPendingRows_(processId) {
  return autRowsBy_('PENDENCIAS', 'ID_PROCESSO', processId).filter(function(row) {
    return String(row.STATUS) !== 'CONCLUIDA';
  });
}

function autMovementRows_(processId) {
  return autRowsBy_('MOVIMENTACOES_PROCESSO', 'ID_PROCESSO', processId).sort(function(a, b) {
    return Number(a.SEQUENCIA || 0) - Number(b.SEQUENCIA || 0);
  });
}

function autRegisterMovement_(actor, process, patch, action, recipient, observation, context, parentId) {
  var rows = autMovementRows_(process.ID_PROCESSO);
  var id = autUuid_();
  var ctx = autContext_(context);
  autAppend_('MOVIMENTACOES_PROCESSO', {
    ID_MOVIMENTACAO: id,
    ID_PROCESSO: process.ID_PROCESSO,
    SEQUENCIA: rows.length ? Number(rows[rows.length - 1].SEQUENCIA || 0) + 1 : 1,
    ACAO: action,
    STATUS_ANTERIOR: process.STATUS || '',
    STATUS_NOVO: patch.STATUS || process.STATUS || '',
    TRAMITACAO_ANTERIOR: process.STATUS_TRAMITACAO || '',
    TRAMITACAO_NOVA: patch.STATUS_TRAMITACAO || process.STATUS_TRAMITACAO || '',
    ETAPA_ANTERIOR: process.ETAPA_ATUAL || '',
    ETAPA_NOVA: patch.ETAPA_ATUAL || process.ETAPA_ATUAL || '',
    ID_USUARIO_ORIGEM: actor.ID_USUARIO || '',
    USUARIO_ORIGEM: actor.NOME || '',
    PERFIL_ORIGEM: actor.PERFIL || '',
    ID_USUARIO_DESTINO: recipient && recipient.ID_USUARIO || '',
    USUARIO_DESTINO: recipient && recipient.NOME || '',
    PERFIL_DESTINO: recipient && recipient.PERFIL || '',
    OBSERVACAO: String(observation || '').slice(0, 5000),
    ID_MOVIMENTACAO_PAI: parentId || '',
    ID_REQUISICAO: ctx.requestId,
    CRIADO_EM: autNow_()
  });
  return id;
}

function autMoveProcess_(actor, process, patch, action, recipient, observation, context, parentId) {
  var now = autNow_();
  var nextVersion = autProcessVersion_(process) + 1;
  var update = Object.assign({
    ATUALIZADO_EM: now,
    VERSAO_REGISTRO: nextVersion,
    AGUARDANDO_DESDE: now
  }, patch || {});
  if (recipient) {
    update.ID_ULTIMO_REMETENTE = actor.ID_USUARIO;
    update.ULTIMO_REMETENTE = actor.NOME;
    update.ID_ULTIMO_DESTINATARIO = recipient.ID_USUARIO;
    update.ULTIMO_DESTINATARIO = recipient.NOME;
    update.ID_RESPONSAVEL = recipient.ID_USUARIO;
    update.RESPONSAVEL = recipient.NOME;
    update.ENCAMINHADO_EM = now;
    update.ENCAMINHADO_POR = actor.NOME;
  }
  autUpdateRow_('PROCESSOS', process._row, update);
  var movementId = autRegisterMovement_(actor, process, update, action, recipient, observation, context, parentId);
  autAppend_('ATUACOES', {
    ID_ATUACAO: autUuid_(),
    ID_PROCESSO: process.ID_PROCESSO,
    TIPO: autLabel_(action),
    DESCRICAO: String(observation || autLabel_(action)),
    STATUS_ANTERIOR: process.STATUS,
    STATUS_NOVO: update.STATUS || process.STATUS,
    USUARIO: actor.NOME,
    CRIADO_EM: now
  });
  autAudit_(actor, action, 'PROCESSO', process.ID_PROCESSO, {
    movimento: movementId,
    versaoAnterior: autProcessVersion_(process),
    versaoNova: nextVersion,
    statusAnterior: process.STATUS,
    statusNovo: update.STATUS || process.STATUS,
    tramitacaoAnterior: process.STATUS_TRAMITACAO || '',
    tramitacaoNova: update.STATUS_TRAMITACAO || process.STATUS_TRAMITACAO || '',
    destinatarioId: recipient && recipient.ID_USUARIO || '',
    destinatario: recipient && recipient.NOME || '',
    observacao: observation || ''
  }, context);
  return { version: nextVersion, movementId: movementId, patch: update };
}

function autCreateAcceptance_(actor, process, payload, context) {
  payload = payload || {};
  var sheet = autSheet_('ACEITES_ELETRONICOS');
  var lastRow = sheet.getLastRow();
  var previousHash = '';
  var sequence = 1;
  if (lastRow >= 2) {
    var last = autRowAt_('ACEITES_ELETRONICOS', lastRow);
    previousHash = String(last.HASH_ACEITE || '');
    sequence = Number(last.SEQUENCIA || 0) + 1;
  }
  var ctx = autContext_(context);
  var id = autUuid_();
  var at = autNow_();
  var material = [
    previousHash, sequence, id, process.ID_PROCESSO, payload.scopeType, payload.scopeId,
    payload.scopeVersion, payload.contentHash, payload.category, payload.decision,
    payload.text, actor.ID_USUARIO, actor.NOME, actor.PERFIL, actor._sessionId,
    at, ctx.timezone, ctx.ipPublico, autJson_(ctx.dispositivo), autJson_(ctx.localizacao),
    ctx.requestId, autProcessVersion_(process)
  ].join('|');
  var hash = autHash_(material);
  autAppend_('ACEITES_ELETRONICOS', {
    ID_ACEITE: id,
    SEQUENCIA: sequence,
    ID_PROCESSO: process.ID_PROCESSO,
    TIPO_ESCOPO: payload.scopeType || '',
    ID_ESCOPO: payload.scopeId || '',
    VERSAO_ESCOPO: payload.scopeVersion || '',
    HASH_CONTEUDO: payload.contentHash || '',
    CATEGORIA: payload.category || '',
    DECISAO: payload.decision || 'OK',
    TEXTO_ACEITE: payload.text || '',
    ID_USUARIO: actor.ID_USUARIO,
    USUARIO: actor.NOME,
    PERFIL: actor.PERFIL,
    ID_SESSAO: actor._sessionId || '',
    DATA_HORA: at,
    TIMEZONE: ctx.timezone,
    IP_PUBLICO: ctx.ipPublico,
    DISPOSITIVO_JSON: autJson_(ctx.dispositivo),
    LOCALIZACAO_JSON: autJson_(ctx.localizacao),
    ID_REQUISICAO: ctx.requestId,
    VERSAO_PROCESSO: autProcessVersion_(process),
    HASH_ANTERIOR: previousHash,
    HASH_ACEITE: hash,
    INVALIDADO_EM: '',
    MOTIVO_INVALIDACAO: ''
  });
  autAudit_(actor, 'ACEITE_ELETRONICO_REGISTRADO', 'PROCESSO', process.ID_PROCESSO, {
    idAceite: id,
    tipoEscopo: payload.scopeType || '',
    idEscopo: payload.scopeId || '',
    categoria: payload.category || '',
    decisao: payload.decision || 'OK',
    hashConteudo: payload.contentHash || '',
    hashAceite: hash
  }, context);
  return { id: id, hash: hash, at: at };
}

function autInvalidateProcessApprovals_(processId, reason, context) {
  var now = autNow_();
  autRowsBy_('PROCESSO_CHECKLIST', 'ID_PROCESSO', processId).forEach(function(row) {
    if (!row.INVALIDADO_EM && String(row.STATUS) === 'VALIDO') {
      autUpdateRow_('PROCESSO_CHECKLIST', row._row, {
        STATUS: 'INVALIDADO',
        INVALIDADO_EM: now,
        MOTIVO_INVALIDACAO: String(reason || 'Conteúdo do processo alterado').slice(0, 1000)
      });
    }
  });
  autRowsBy_('ACEITES_ELETRONICOS', 'ID_PROCESSO', processId).forEach(function(row) {
    if (!row.INVALIDADO_EM && ['CATEGORIA', 'PROCESSO', 'PROPOSTA', 'CONTRATO'].indexOf(String(row.TIPO_ESCOPO)) >= 0) {
      autUpdateRow_('ACEITES_ELETRONICOS', row._row, {
        INVALIDADO_EM: now,
        MOTIVO_INVALIDACAO: String(reason || 'Conteúdo do processo alterado').slice(0, 1000)
      });
    }
  });
}

function autWorkflowRecipient_(userId, expectedRole) {
  var user = autFind_('USUARIOS', 'ID_USUARIO', String(userId || ''));
  autAssert_(user && String(user.STATUS) === 'ATIVO', 'O destinatário selecionado não está ativo.', 'RECIPIENT_UNAVAILABLE');
  autAssert_(String(user.PERFIL) === String(expectedRole), 'O destinatário não pertence ao perfil exigido para esta etapa.', 'INVALID_RECIPIENT_ROLE');
  return user;
}

function autWorkflowUsersByRole_(role) {
  return autRows_('USUARIOS').filter(function(user) {
    return String(user.STATUS) === 'ATIVO' && String(user.PERFIL) === String(role);
  }).map(function(user) {
    return { id: user.ID_USUARIO, name: user.NOME, email: user.EMAIL, role: user.PERFIL };
  }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
}

function apiListarDestinatariosFluxo(token, processId, role) {
  try {
    var actor = autRequireAuth_(token);
    autRequireProcess_(actor, processId);
    autAssert_(['ASSISTENTE_ADMINISTRATIVO', 'GERENTE_ADMINISTRATIVO', 'GERENTE_GERAL', 'AUDITOR'].indexOf(String(role)) >= 0, 'Perfil de destino inválido.');
    return autResult_({ role: role, users: autWorkflowUsersByRole_(role) });
  } catch (err) { return autPublicError_(err); }
}

function apiEnviarAdministrativo(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PROCESSO_ENCAMINHAR');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['CORRETOR']);
    autAssert_(['COM_CORRETOR', 'DEVOLVIDO_CORRETOR'].indexOf(String(process.STATUS_TRAMITACAO || 'COM_CORRETOR')) >= 0,
      'O processo não está disponível para envio ao Administrativo.', 'INVALID_TRANSITION');
    var missing = autRequiredDocumentStatus_(process).filter(function(item) { return item.required && !item.uploaded; });
    var missingGroups = autRequiredDocumentGroups_(process).filter(function(item) { return item.required && !item.uploaded; });
    autAssert_(!missing.length && !missingGroups.length, 'Conclua os requisitos documentais obrigatórios antes do envio.', 'MISSING_DOCUMENTS');
    var participantReadiness = autParticipantCompleteness_(process.ID_PROCESSO);
    autAssert_(participantReadiness.ready, 'Complete os dados obrigatórios das partes antes do envio: ' +
      participantReadiness.errors.join('; '), 'PARTICIPANTS_INCOMPLETE');
    autAssert_(!autOpenPendingRows_(process.ID_PROCESSO).length,
      'Conclua todas as pendências antes de encaminhar o processo.', 'OPEN_PENDING');
    var recipient = autWorkflowRecipient_(payload.userId, 'ASSISTENTE_ADMINISTRATIVO');
    var requestKey = autClaimRequest_(actor, 'ENVIAR_ADMINISTRATIVO|' + process.ID_PROCESSO, context);
    var brokerAcceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'PROCESSO', scopeId: process.ID_PROCESSO,
      scopeVersion: autProcessVersion_(process), contentHash: autBuildAdministrativeHash_(process.ID_PROCESSO), decision: 'OK',
      text: 'Declaro que concluí a ficha cadastral, anexei os documentos exigidos e autorizo o início da análise administrativa.'
    }, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'PENDENTE', FASE: 'ADMINISTRATIVO', STATUS_TRAMITACAO: 'AGUARDANDO_ADMINISTRATIVO',
      ETAPA_ATUAL: 'ADMINISTRATIVO', SETOR_ATUAL: 'ADMINISTRATIVO', ANALISE_INICIADA_EM: ''
    }, 'PROCESSO_ENVIADO_ADMINISTRATIVO', recipient, payload.observation || 'Cadastro e documentos enviados para análise administrativa.', context);
    autCommitRequest_(requestKey);
    return autResult_({ sent: true, acceptanceId: brokerAcceptance.id, version: result.version, responsible: recipient.NOME });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiIniciarAnaliseAdministrativa(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_ADMINISTRATIVA');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['ASSISTENTE_ADMINISTRATIVO']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'AGUARDANDO_ADMINISTRATIVO', 'Esta análise administrativa já foi iniciada ou não está disponível.', 'INVALID_TRANSITION');
    var requestKey = autClaimRequest_(actor, 'INICIAR_ADMINISTRATIVO|' + process.ID_PROCESSO, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'EM_ANALISE', FASE: 'ADMINISTRATIVO', STATUS_TRAMITACAO: 'COM_ADMINISTRATIVO',
      ETAPA_ATUAL: 'ADMINISTRATIVO', ANALISE_INICIADA_EM: autNow_()
    }, 'ANALISE_ADMINISTRATIVA_INICIADA', actor, payload.observation || 'Análise administrativa iniciada.', context);
    autCommitRequest_(requestKey);
    return autResult_({ started: true, version: result.version });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autDocumentForReview_(actor, process, documentId) {
  var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
  autAssert_(document && String(document.ID_PROCESSO) === String(process.ID_PROCESSO) && !document.EXCLUIDO_EM,
    'Documento não encontrado neste processo.', 'NOT_FOUND');
  autAssert_(String(document.STATUS_CONFERENCIA || '') !== 'SUBSTITUIDO', 'Esta versão do documento foi substituída.', 'DOCUMENT_SUPERSEDED');
  autAssert_(autIsDocumentStored_(document),
    'O envio deste documento ainda não foi concluído.', 'DOCUMENT_UPLOAD_PENDING');
  return document;
}

function apiConferirDocumento(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'DOCUMENTO_CONFERIR');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['ASSISTENTE_ADMINISTRATIVO', 'GERENTE_ADMINISTRATIVO', 'GERENTE_GERAL', 'AUDITOR']);
    var document = autDocumentForReview_(actor, process, payload.documentId);
    var requestKey = autClaimRequest_(actor, 'CONFERIR_DOCUMENTO|' + document.ID_DOCUMENTO, context);
    var text = 'Declaro que visualizei e conferi o documento ' + document.ARQUIVO_NOME +
      ', versão ' + Number(document.VERSAO || 1) + ', identificado pelo hash ' + document.HASH_SHA256 + '.';
    var acceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'DOCUMENTO',
      scopeId: document.ID_DOCUMENTO,
      scopeVersion: document.VERSAO || 1,
      contentHash: document.HASH_SHA256,
      decision: 'OK',
      text: text
    }, context);
    autUpdateRow_('PROCESSO_DOCUMENTOS', document._row, {
      STATUS_CONFERENCIA: 'CONFERIDO',
      CONFERIDO_EM: acceptance.at,
      CONFERIDO_POR_ID: actor.ID_USUARIO,
      CONFERIDO_POR: actor.NOME,
      PENDENCIADO_EM: '',
      PENDENCIADO_POR: '',
      MOTIVO_PENDENCIA: '',
      VERSAO_REGISTRO: Number(document.VERSAO_REGISTRO || 1) + 1
    });
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autCommitRequest_(requestKey);
    return autResult_({ checked: true, acceptanceId: acceptance.id, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiConferirDocumentosValidos(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'DOCUMENTO_CONFERIR');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['ASSISTENTE_ADMINISTRATIVO']);
    var documents = autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return autIsDocumentStored_(row) && String(row.STATUS_CONFERENCIA || 'PENDENTE_CONFERENCIA') === 'PENDENTE_CONFERENCIA';
    });
    autAssert_(documents.length > 0, 'Não há documentos pendentes de conferência.');
    var requestKey = autClaimRequest_(actor, 'CONFERIR_DOCUMENTOS|' + process.ID_PROCESSO, context);
    var accepted = [];
    documents.forEach(function(document) {
      var acceptance = autCreateAcceptance_(actor, process, {
        scopeType: 'DOCUMENTO', scopeId: document.ID_DOCUMENTO, scopeVersion: document.VERSAO || 1,
        contentHash: document.HASH_SHA256, decision: 'OK',
        text: 'Declaro que visualizei e conferi o documento ' + document.ARQUIVO_NOME +
          ', versão ' + Number(document.VERSAO || 1) + ', hash ' + document.HASH_SHA256 + '.'
      }, context);
      autUpdateRow_('PROCESSO_DOCUMENTOS', document._row, {
        STATUS_CONFERENCIA: 'CONFERIDO', CONFERIDO_EM: acceptance.at,
        CONFERIDO_POR_ID: actor.ID_USUARIO, CONFERIDO_POR: actor.NOME,
        PENDENCIADO_EM: '', PENDENCIADO_POR: '', MOTIVO_PENDENCIA: '',
        VERSAO_REGISTRO: Number(document.VERSAO_REGISTRO || 1) + 1
      });
      accepted.push(acceptance.id);
    });
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autCommitRequest_(requestKey);
    return autResult_({ checked: accepted.length, acceptanceIds: accepted, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autReturnRecipient_(process, actor) {
  var responsibleId = process.ID_RESPONSAVEL || actor.ID_USUARIO;
  var movements = autMovementRows_(process.ID_PROCESSO).filter(function(row) {
    return String(row.ID_USUARIO_DESTINO || '') === String(responsibleId || '') && row.ID_USUARIO_ORIGEM;
  });
  var latest = movements.length ? movements[movements.length - 1] : null;
  var id = latest && latest.ID_USUARIO_ORIGEM || process.ID_ULTIMO_REMETENTE || process.ID_CRIADOR;
  var user = autFind_('USUARIOS', 'ID_USUARIO', id);
  if (!user || String(user.STATUS) !== 'ATIVO') user = autFind_('USUARIOS', 'ID_USUARIO', process.ID_CRIADOR);
  autAssert_(user && String(user.STATUS) === 'ATIVO', 'Não foi encontrado um remetente ativo para receber a devolução.', 'RETURN_RECIPIENT_UNAVAILABLE');
  return user;
}

function apiPendenciarFluxo(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PENDENCIA_GERIR');
    payload = payload || {};
    var description = String(payload.description || '').trim();
    autAssert_(description.length >= 10, 'Descreva a pendência com pelo menos 10 caracteres.');
    autAssert_(description.length <= 5000, 'A descrição deve ter no máximo 5.000 caracteres.', 'FIELD_TOO_LARGE');
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['ASSISTENTE_ADMINISTRATIVO', 'GERENTE_ADMINISTRATIVO', 'GERENTE_GERAL', 'AUDITOR']);
    var targetType = String(payload.targetType || 'PROCESSO').toUpperCase();
    var targetId = '';
    if (targetType === 'DOCUMENTO') {
      var document = autDocumentForReview_(actor, process, payload.documentId);
      targetId = document.ID_DOCUMENTO;
      autUpdateRow_('PROCESSO_DOCUMENTOS', document._row, {
        STATUS_CONFERENCIA: 'PENDENCIADO', PENDENCIADO_EM: autNow_(),
        PENDENCIADO_POR: actor.NOME, MOTIVO_PENDENCIA: description,
        VERSAO_REGISTRO: Number(document.VERSAO_REGISTRO || 1) + 1
      });
    } else {
      targetType = 'PROCESSO';
    }
    var recipient = autReturnRecipient_(process, actor);
    var nextState = recipient.PERFIL === 'CORRETOR'
      ? { status: targetType === 'DOCUMENTO' ? 'PENDENTE_DOCUMENTO' : 'PENDENTE_PROCESSO', flow: 'DEVOLVIDO_CORRETOR', phase: 'DOCUMENTACAO', stage: 'CORRETOR', sector: 'COMERCIAL' }
      : recipient.PERFIL === 'ASSISTENTE_ADMINISTRATIVO'
        ? { status: 'PENDENTE_PROCESSO', flow: 'COM_ADMINISTRATIVO', phase: 'ADMINISTRATIVO', stage: 'ADMINISTRATIVO', sector: 'ADMINISTRATIVO' }
        : recipient.PERFIL === 'GERENTE_ADMINISTRATIVO'
          ? { status: 'PENDENTE_PROCESSO', flow: 'COM_GERENTE', phase: 'GERENCIAL', stage: 'GERENCIAL', sector: 'GERENTE_ADMINISTRATIVO' }
          : { status: 'PENDENTE_PROCESSO', flow: 'COM_GERENTE_GERAL', phase: 'GERENTE_GERAL', stage: 'GERENTE_GERAL', sector: 'GERENTE_GERAL' };
    var requestKey = autClaimRequest_(actor, 'PENDENCIAR_FLUXO|' + process.ID_PROCESSO + '|' + targetId, context);
    var pendingId = autUuid_();
    autAppend_('PENDENCIAS', {
      ID_PENDENCIA: pendingId, ID_PROCESSO: process.ID_PROCESSO,
      TITULO: String(payload.title || (targetType === 'DOCUMENTO' ? 'Pendência documental' : 'Pendência no processo')).slice(0, 200),
      DESCRICAO: description, STATUS: 'ABERTA', RESPONSAVEL: recipient.NOME,
      PRAZO: payload.dueDate || '', CRIADO_POR: actor.NOME, CRIADO_EM: autNow_(), CONCLUIDO_EM: '',
      TIPO: targetType === 'DOCUMENTO' ? 'PENDENCIA_DOCUMENTAL' : 'PENDENCIA_PROCESSO',
      TIPO_ALVO: targetType, ID_ALVO: targetId,
      ID_USUARIO_RETORNO: recipient.ID_USUARIO, USUARIO_RETORNO: recipient.NOME,
      CRIADO_POR_ID: actor.ID_USUARIO, CONCLUIDO_POR: '', MOTIVO_CONCLUSAO: '',
      VERSAO_PROCESSO: autProcessVersion_(process)
    });
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Pendência aberta: ' + description, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: nextState.status, FASE: nextState.phase, STATUS_TRAMITACAO: nextState.flow,
      ETAPA_ATUAL: nextState.stage, SETOR_ATUAL: nextState.sector,
      PENDENCIAS_QTD: Number(process.PENDENCIAS_QTD || 0) + 1
    }, 'PROCESSO_DEVOLVIDO_COM_PENDENCIA', recipient, description, context);
    autCommitRequest_(requestKey);
    return autResult_({ pendingId: pendingId, returnedTo: recipient.NOME, version: result.version });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autAdministrativeReadiness_(process) {
  var documentRows = autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
    return !row.EXCLUIDO_EM && String(row.STATUS_CONFERENCIA || '') !== 'SUBSTITUIDO';
  });
  var missing = autRequiredDocumentStatus_(process, documentRows).filter(function(item) { return item.required && !item.uploaded; });
  var missingGroups = autRequiredDocumentGroups_(process, documentRows).filter(function(item) { return item.required && !item.uploaded; });
  var unchecked = documentRows.filter(function(row) { return String(row.STATUS_CONFERENCIA || 'PENDENTE_CONFERENCIA') !== 'CONFERIDO'; });
  var participants = autParticipantCompleteness_(process.ID_PROCESSO);
  var pending = autOpenPendingRows_(process.ID_PROCESSO);
  return {
    ready: !missing.length && !missingGroups.length && !unchecked.length && participants.ready && !pending.length,
    missing: missing.map(function(item) { return item.name; }),
    missingGroups: missingGroups.map(function(item) { return item.name; }),
    unchecked: unchecked.map(function(row) { return row.ARQUIVO_NOME; }),
    participantErrors: participants.errors,
    openPending: pending.length
  };
}

function apiAprovarAdministrativo(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_ADMINISTRATIVA');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['ASSISTENTE_ADMINISTRATIVO']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'COM_ADMINISTRATIVO', 'O processo não está em análise administrativa.', 'INVALID_TRANSITION');
    var readiness = autAdministrativeReadiness_(process);
    autAssert_(readiness.ready, 'A aprovação administrativa está bloqueada: ' +
      [].concat(readiness.missing, readiness.missingGroups, readiness.unchecked, readiness.participantErrors).join('; ') +
      (readiness.openPending ? '; existem pendências abertas' : ''), 'ADMIN_REVIEW_INCOMPLETE');
    var recipient = autWorkflowRecipient_(payload.userId, 'GERENTE_ADMINISTRATIVO');
    var requestKey = autClaimRequest_(actor, 'APROVAR_ADMINISTRATIVO|' + process.ID_PROCESSO, context);
    var contentHash = autBuildAdministrativeHash_(process.ID_PROCESSO);
    var acceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'PROCESSO', scopeId: process.ID_PROCESSO,
      scopeVersion: autProcessVersion_(process), contentHash: contentHash, decision: 'OK',
      text: 'Declaro que conferi a ficha, os participantes e os documentos do processo e aprovo a etapa administrativa.'
    }, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'APROVADO_ADMINISTRATIVO', FASE: 'GERENCIAL', STATUS_TRAMITACAO: 'AGUARDANDO_GERENTE',
      ETAPA_ATUAL: 'GERENCIAL', SETOR_ATUAL: 'GERENTE_ADMINISTRATIVO', ANALISE_INICIADA_EM: ''
    }, 'PROCESSO_APROVADO_ADMINISTRATIVO', recipient, payload.observation || 'Etapa administrativa aprovada.', context);
    autCommitRequest_(requestKey);
    return autResult_({ approved: true, acceptanceId: acceptance.id, version: result.version, responsible: recipient.NOME });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiIniciarAnaliseGerencial(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_GERENCIAL');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_ADMINISTRATIVO']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'AGUARDANDO_GERENTE', 'Esta análise gerencial já foi iniciada ou não está disponível.', 'INVALID_TRANSITION');
    var requestKey = autClaimRequest_(actor, 'INICIAR_GERENCIAL|' + process.ID_PROCESSO, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'EM_ANALISE', FASE: 'GERENCIAL', STATUS_TRAMITACAO: 'COM_GERENTE',
      ETAPA_ATUAL: 'GERENCIAL', ANALISE_INICIADA_EM: autNow_()
    }, 'ANALISE_GERENCIAL_INICIADA', actor, payload.observation || 'Análise gerencial iniciada.', context);
    autCommitRequest_(requestKey);
    return autResult_({ started: true, version: result.version });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autDocumentCategories_(document) {
  var categories = autJsonParse_(document.CATEGORIAS_JSON, []);
  if (Array.isArray(categories) && categories.length) return categories;
  var catalog = autFind_('DOCUMENTOS_CATALOGO', 'ID_DOCUMENTO_TIPO', document.ID_DOCUMENTO_TIPO);
  return catalog ? autJsonParse_(catalog.CATEGORIAS_JSON, []) : [];
}

function autCategoryReadiness_(process, category) {
  var documents = autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
    return !row.EXCLUIDO_EM && String(row.STATUS_CONFERENCIA || '') !== 'SUBSTITUIDO' &&
      autDocumentCategories_(row).indexOf(category) >= 0;
  });
  var unchecked = documents.filter(function(row) { return String(row.STATUS_CONFERENCIA) !== 'CONFERIDO'; });
  var content = documents.map(function(row) { return [row.ID_DOCUMENTO, row.VERSAO, row.HASH_SHA256, row.STATUS_CONFERENCIA]; });
  var applicable = documents.length > 0;
  var blockers = unchecked.map(function(row) { return 'Documento não conferido: ' + row.ARQUIVO_NOME; });
  if (category === 'NEGOCIACOES') {
    var proposal = autAcceptedProposal_(process.ID_PROCESSO);
    applicable = !!proposal;
    if (proposal) {
      var evidence = proposal.ID_DOCUMENTO_EVIDENCIA
        ? autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', proposal.ID_DOCUMENTO_EVIDENCIA)
        : null;
      if (!evidence || evidence.EXCLUIDO_EM || String(evidence.STATUS_CONFERENCIA) !== 'CONFERIDO') {
        blockers.push('A evidência de aceite da proposta não está anexada e conferida.');
      }
      content.push(['PROPOSTA', proposal.ID_PROPOSTA, proposal.REVISAO, proposal.HASH_SNAPSHOT]);
    }
  }
  if (category === 'CONTRATOS') {
    var contracts = autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return !row.SUBSTITUIDO_EM && row.ARQUIVO_ASSINADO_ID;
    });
    applicable = contracts.length > 0;
    if (contracts.length) {
      var contract = contracts[contracts.length - 1];
      var model = autFind_('MODELOS_CONTRATO', 'ID_MODELO', contract.ID_MODELO);
      if (!model || String(model.STATUS_JURIDICO) !== 'APROVADO_JURIDICO') blockers.push('O modelo contratual ainda não possui aprovação jurídica.');
      if (!contract.HASH_ASSINADO) blockers.push('O contrato assinado não possui hash registrado.');
      content.push(['CONTRATO', contract.ID_CONTRATO, contract.REVISAO, contract.HASH_ASSINADO]);
    }
  }
  return {
    category: category,
    label: autLabel_(category),
    applicable: applicable,
    items: content.length,
    readyForOk: applicable && blockers.length === 0,
    blockers: blockers,
    contentHash: autHash_(autJson_(content))
  };
}

function autLatestChecklist_(processId, category) {
  var rows = autRowsBy_('PROCESSO_CHECKLIST', 'ID_PROCESSO', processId).filter(function(row) {
    return String(row.CATEGORIA) === String(category) && !row.INVALIDADO_EM && String(row.STATUS) === 'VALIDO';
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function autSaveCategoryDecision_(actor, process, category, decision, justification, context) {
  var readiness = autCategoryReadiness_(process, category);
  autAssert_(decision === 'OK' || decision === 'NAO_SE_APLICA', 'Decisão gerencial inválida.');
  if (decision === 'OK') autAssert_(readiness.readyForOk, readiness.blockers.join(' ') || 'A categoria não possui itens aplicáveis para receber OK.', 'CATEGORY_INCOMPLETE');
  if (decision === 'NAO_SE_APLICA') {
    autAssert_(!readiness.applicable, 'Esta categoria possui itens aplicáveis e não pode ser marcada como Não se aplica.', 'CATEGORY_APPLICABLE');
    autAssert_(String(justification || '').trim().length >= 5, 'Informe a justificativa para Não se aplica.');
  }
  var existing = autLatestChecklist_(process.ID_PROCESSO, category);
  if (existing) {
    autUpdateRow_('PROCESSO_CHECKLIST', existing._row, {
      STATUS: 'INVALIDADO', INVALIDADO_EM: autNow_(), MOTIVO_INVALIDACAO: 'Nova decisão gerencial registrada.'
    });
  }
  var text = decision === 'OK'
    ? 'Declaro que li, conferi e aprovo todos os itens aplicáveis da categoria ' + autLabel_(category) + '.'
    : 'Declaro que a categoria ' + autLabel_(category) + ' não se aplica a este processo. Justificativa: ' + justification;
  var acceptance = autCreateAcceptance_(actor, process, {
    scopeType: 'CATEGORIA', scopeId: category, scopeVersion: autProcessVersion_(process),
    contentHash: readiness.contentHash, category: category, decision: decision, text: text
  }, context);
  autAppend_('PROCESSO_CHECKLIST', {
    ID_CHECKLIST: autUuid_(), ID_PROCESSO: process.ID_PROCESSO, CATEGORIA: category,
    STATUS: 'VALIDO', DECISAO: decision, JUSTIFICATIVA: justification || '',
    HASH_CONJUNTO: readiness.contentHash, VERSAO_PROCESSO: autProcessVersion_(process),
    ID_ACEITE: acceptance.id, DECIDIDO_EM: acceptance.at, DECIDIDO_POR_ID: actor.ID_USUARIO,
    DECIDIDO_POR: actor.NOME, INVALIDADO_EM: '', MOTIVO_INVALIDACAO: ''
  });
  if (category === 'CONTRATOS' && decision === 'OK') {
    var signedContracts = autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return !row.SUBSTITUIDO_EM && row.ARQUIVO_ASSINADO_ID;
    });
    if (signedContracts.length) {
      var signed = signedContracts[signedContracts.length - 1];
      autUpdateRow_('CONTRATOS', signed._row, {
        STATUS: 'APROVADO',
        CONFERIDO_EM: acceptance.at,
        CONFERIDO_POR_ID: actor.ID_USUARIO,
        CONFERIDO_POR: actor.NOME
      });
    }
  }
  return acceptance;
}

function apiDecidirCategoriaGerencial(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_GERENCIAL');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_ADMINISTRATIVO']);
    autAssert_(['COM_GERENTE', 'CONTRATO_EM_PREPARACAO'].indexOf(String(process.STATUS_TRAMITACAO)) >= 0,
      'O processo não está em análise gerencial.', 'INVALID_TRANSITION');
    var category = String(payload.category || '');
    autAssert_(AUTENTIKO.REVIEW_CATEGORIES.indexOf(category) >= 0, 'Categoria inválida.');
    var requestKey = autClaimRequest_(actor, 'DECIDIR_CATEGORIA|' + process.ID_PROCESSO + '|' + category, context);
    var acceptance = autSaveCategoryDecision_(actor, process, category, String(payload.decision || 'OK'), payload.justification || '', context);
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autCommitRequest_(requestKey);
    return autResult_({ decided: true, acceptanceId: acceptance.id, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiAprovarTodasCategorias(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_GERENCIAL');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_ADMINISTRATIVO']);
    var readiness = AUTENTIKO.REVIEW_CATEGORIES.map(function(category) { return autCategoryReadiness_(process, category); });
    var blocked = readiness.filter(function(item) { return !item.readyForOk; });
    autAssert_(!blocked.length, 'Não é possível aprovar tudo: ' + blocked.map(function(item) {
      return item.label + ' — ' + (item.blockers.join(' ') || 'sem itens aplicáveis');
    }).join('; '), 'CATEGORY_INCOMPLETE');
    var requestKey = autClaimRequest_(actor, 'APROVAR_TODAS_CATEGORIAS|' + process.ID_PROCESSO, context);
    var ids = AUTENTIKO.REVIEW_CATEGORIES.map(function(category) {
      return autSaveCategoryDecision_(actor, process, category, 'OK', '', context).id;
    });
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autCommitRequest_(requestKey);
    return autResult_({ approved: ids.length, acceptanceIds: ids, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiEnviarGerenteGeral(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_GERENCIAL');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_ADMINISTRATIVO']);
    autAssert_(['COM_GERENTE', 'CONTRATO_EM_PREPARACAO'].indexOf(String(process.STATUS_TRAMITACAO)) >= 0,
      'O processo não está pronto para a Gerência Geral.', 'INVALID_TRANSITION');
    var administrative = autAdministrativeReadiness_(process);
    autAssert_(administrative.ready, 'A validação administrativa precisa estar completa antes da Gerência Geral.', 'ADMIN_REVIEW_INCOMPLETE');
    var missing = AUTENTIKO.REVIEW_CATEGORIES.filter(function(category) { return !autLatestChecklist_(process.ID_PROCESSO, category); });
    autAssert_(!missing.length, 'Registre uma decisão para todas as categorias: ' + missing.map(autLabel_).join(', '), 'MANAGER_CHECKLIST_INCOMPLETE');
    autAssert_(!autOpenPendingRows_(process.ID_PROCESSO).length, 'Conclua todas as pendências antes de avançar.', 'OPEN_PENDING');
    var recipient = autWorkflowRecipient_(payload.userId, 'GERENTE_GERAL');
    var requestKey = autClaimRequest_(actor, 'ENVIAR_GERENTE_GERAL|' + process.ID_PROCESSO, context);
    var acceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'PROCESSO', scopeId: process.ID_PROCESSO, scopeVersion: autProcessVersion_(process),
      contentHash: autBuildAdministrativeHash_(process.ID_PROCESSO), decision: 'OK',
      text: 'Declaro concluída a revisão do Gerente Administrativo e encaminho o processo à Gerência Geral.'
    }, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'APROVADO_GERENCIAL', FASE: 'GERENTE_GERAL', STATUS_TRAMITACAO: 'AGUARDANDO_GERENTE_GERAL',
      ETAPA_ATUAL: 'GERENTE_GERAL', SETOR_ATUAL: 'GERENTE_GERAL', ANALISE_INICIADA_EM: ''
    }, 'PROCESSO_ENVIADO_GERENTE_GERAL', recipient, payload.observation || 'Revisão administrativa gerencial concluída.', context);
    autCommitRequest_(requestKey);
    return autResult_({ sent: true, acceptanceId: acceptance.id, version: result.version, responsible: recipient.NOME });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiIniciarAnaliseGerenteGeral(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_GERAL');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_GERAL']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'AGUARDANDO_GERENTE_GERAL',
      'Esta análise da Gerência Geral já foi iniciada ou não está disponível.', 'INVALID_TRANSITION');
    var requestKey = autClaimRequest_(actor, 'INICIAR_GERENTE_GERAL|' + process.ID_PROCESSO, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'EM_ANALISE', FASE: 'GERENTE_GERAL', STATUS_TRAMITACAO: 'COM_GERENTE_GERAL',
      ETAPA_ATUAL: 'GERENTE_GERAL', SETOR_ATUAL: 'GERENTE_GERAL', ANALISE_INICIADA_EM: autNow_()
    }, 'ANALISE_GERENTE_GERAL_INICIADA', actor, payload.observation || 'Análise da Gerência Geral iniciada.', context);
    autCommitRequest_(requestKey);
    return autResult_({ started: true, version: result.version });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiEnviarAuditoria(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'APROVACAO_GERAL');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_GERAL']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'COM_GERENTE_GERAL',
      'O processo não está em análise da Gerência Geral.', 'INVALID_TRANSITION');
    var administrative = autAdministrativeReadiness_(process);
    autAssert_(administrative.ready,
      'O processo mudou após a análise administrativa. Revise os dados, participantes, documentos e pendências antes de enviar à Auditoria.',
      'ADMIN_REVIEW_INCOMPLETE');
    var missing = AUTENTIKO.REVIEW_CATEGORIES.filter(function(category) { return !autLatestChecklist_(process.ID_PROCESSO, category); });
    autAssert_(!missing.length, 'Registre uma decisão para todas as categorias antes de enviar à Auditoria: ' +
      missing.map(autLabel_).join(', '), 'MANAGER_CHECKLIST_INCOMPLETE');
    autAssert_(!autOpenPendingRows_(process.ID_PROCESSO).length, 'Conclua todas as pendências antes de enviar à Auditoria.', 'OPEN_PENDING');
    var recipient = autWorkflowRecipient_(payload.userId, 'AUDITOR');
    var requestKey = autClaimRequest_(actor, 'ENVIAR_AUDITORIA|' + process.ID_PROCESSO, context);
    var contentHash = autHash_(autJson_(AUTENTIKO.REVIEW_CATEGORIES.map(function(category) {
      var row = autLatestChecklist_(process.ID_PROCESSO, category);
      return [category, row.DECISAO, row.HASH_CONJUNTO, row.ID_ACEITE];
    })));
    var acceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'PROCESSO', scopeId: process.ID_PROCESSO, scopeVersion: autProcessVersion_(process),
      contentHash: contentHash, decision: 'OK',
      text: 'Declaro concluída a revisão da Gerência Geral e encaminho o processo para auditoria final.'
    }, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'APROVADO_GERENTE_GERAL', FASE: 'AUDITORIA', STATUS_TRAMITACAO: 'AGUARDANDO_AUDITORIA',
      ETAPA_ATUAL: 'AUDITORIA', SETOR_ATUAL: 'AUDITORIA', ANALISE_INICIADA_EM: ''
    }, 'PROCESSO_ENVIADO_AUDITORIA', recipient, payload.observation || 'Revisão da Gerência Geral concluída.', context);
    autCommitRequest_(requestKey);
    return autResult_({ sent: true, acceptanceId: acceptance.id, version: result.version, responsible: recipient.NOME });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiIniciarAuditoria(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'AUDITORIA_FINALIZAR');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['AUDITOR']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'AGUARDANDO_AUDITORIA', 'Esta auditoria já foi iniciada ou não está disponível.', 'INVALID_TRANSITION');
    var requestKey = autClaimRequest_(actor, 'INICIAR_AUDITORIA|' + process.ID_PROCESSO, context);
    var result = autMoveProcess_(actor, process, {
      STATUS: 'EM_ANALISE', FASE: 'AUDITORIA', STATUS_TRAMITACAO: 'COM_AUDITOR',
      ETAPA_ATUAL: 'AUDITORIA', ANALISE_INICIADA_EM: autNow_()
    }, 'AUDITORIA_PROCESSO_INICIADA', actor, payload.observation || 'Auditoria final iniciada.', context);
    autCommitRequest_(requestKey);
    return autResult_({ started: true, version: result.version });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autBuildAdministrativeHash_(processId) {
  var process = autFind_('PROCESSOS', 'ID_PROCESSO', processId);
  var data = autRowsBy_('PROCESSO_DADOS', 'ID_PROCESSO', processId).map(function(row) {
    return [row.SECAO, row.CAMPO, row.VALOR];
  }).sort();
  var participants = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', processId).filter(function(row) {
    return String(row.ATIVO) !== 'NAO';
  }).map(function(row) {
    return [row.ID_PARTICIPANTE, row.VERSAO_REGISTRO, row.CPF_CNPJ, row.PAPEIS_JSON, row.DADOS_JSON];
  }).sort();
  var documents = autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', processId).filter(function(row) {
    return !row.EXCLUIDO_EM && String(row.STATUS_CONFERENCIA) !== 'SUBSTITUIDO';
  }).map(function(row) {
    return [row.ID_DOCUMENTO, row.VERSAO, row.HASH_SHA256, row.STATUS_CONFERENCIA];
  }).sort();
  return autHash_(autJson_({
    process: [process.ID_PROCESSO, process.PROTOCOLO, process.TIPO_PROCESSO],
    data: data, participants: participants, documents: documents
  }));
}

function autBuildProcessManifest_(process) {
  var processId = process.ID_PROCESSO;
  var stableProcess = [
    process.ID_PROCESSO, process.PROTOCOLO, process.TIPO_PROCESSO, process.STATUS,
    process.STATUS_TRAMITACAO, process.ETAPA_ATUAL, process.VERSAO_REGISTRO,
    process.ID_CRIADOR, process.CRIADO_EM, process.FINALIZADO_EM,
    process.ID_PROCESSO_ORIGEM, process.TIPO_VINCULO
  ];
  function rows(name, mapper) {
    return autRowsBy_(name, 'ID_PROCESSO', processId).map(mapper).sort(function(a, b) {
      return autJson_(a).localeCompare(autJson_(b));
    });
  }
  var manifest = {
    process: stableProcess,
    data: rows('PROCESSO_DADOS', function(row) { return [row.SECAO, row.CAMPO, row.VALOR, row.ATUALIZADO_EM]; }),
    participants: rows('PROCESSO_PARTICIPANTES', function(row) {
      return [row.ID_PARTICIPANTE, row.TIPO_PESSOA, row.PAPEIS_JSON, row.CPF_CNPJ, row.DADOS_JSON, row.VERSAO_REGISTRO, row.ATIVO];
    }),
    documents: rows('PROCESSO_DOCUMENTOS', function(row) {
      return [row.ID_DOCUMENTO, row.ID_DOCUMENTO_TIPO, row.ARQUIVO_ID, row.HASH_SHA256, row.VERSAO, row.STATUS_CONFERENCIA, row.EXCLUIDO_EM];
    }),
    proposals: rows('PROPOSTAS', function(row) {
      return [row.ID_PROPOSTA, row.REVISAO, row.STATUS, row.HASH_SNAPSHOT, row.ID_DOCUMENTO_EVIDENCIA];
    }),
    contracts: rows('CONTRATOS', function(row) {
      return [row.ID_CONTRATO, row.REVISAO, row.STATUS, row.HASH_HTML, row.HASH_PDF, row.HASH_ASSINADO];
    }),
    movements: rows('MOVIMENTACOES_PROCESSO', function(row) {
      return [row.ID_MOVIMENTACAO, row.SEQUENCIA, row.ACAO, row.ID_USUARIO_ORIGEM, row.ID_USUARIO_DESTINO, row.CRIADO_EM];
    }),
    acceptances: rows('ACEITES_ELETRONICOS', function(row) {
      return [row.ID_ACEITE, row.SEQUENCIA, row.TIPO_ESCOPO, row.ID_ESCOPO, row.HASH_ACEITE, row.INVALIDADO_EM];
    })
  };
  return autHash_(autJson_(manifest));
}

function apiFinalizarAuditoria(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'AUDITORIA_FINALIZAR');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['AUDITOR']);
    autAssert_(String(process.STATUS_TRAMITACAO) === 'COM_AUDITOR', 'O processo não está em auditoria final.', 'INVALID_TRANSITION');
    autAssert_(!autOpenPendingRows_(process.ID_PROCESSO).length, 'Conclua todas as pendências antes da finalização.', 'OPEN_PENDING');
    var administrative = autAdministrativeReadiness_(process);
    autAssert_(administrative.ready,
      'A finalização está bloqueada: existem dados, participantes ou documentos sem validação.',
      'FINAL_REVIEW_INCOMPLETE');
    var missing = AUTENTIKO.REVIEW_CATEGORIES.filter(function(category) { return !autLatestChecklist_(process.ID_PROCESSO, category); });
    autAssert_(!missing.length, 'O checklist gerencial está incompleto.', 'MANAGER_CHECKLIST_INCOMPLETE');
    var requestKey = autClaimRequest_(actor, 'FINALIZAR_AUDITORIA|' + process.ID_PROCESSO, context);
    var acceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'PROCESSO', scopeId: process.ID_PROCESSO, scopeVersion: autProcessVersion_(process),
      contentHash: autBuildAdministrativeHash_(process.ID_PROCESSO), decision: 'OK',
      text: 'Declaro que revisei a integridade do processo, dos documentos, das aprovações e das pendências e autorizo sua finalização imutável.'
    }, context);
    var now = autNow_();
    var result = autMoveProcess_(actor, process, {
      STATUS: 'FINALIZADO', FASE: 'FINALIZACAO', STATUS_TRAMITACAO: 'CONCLUIDO',
      ETAPA_ATUAL: 'FINALIZACAO', SETOR_ATUAL: 'AUDITORIA',
      FINALIZADO_EM: now, BLOQUEADO_EM: now, BLOQUEADO_POR: actor.NOME
    }, 'PROCESSO_FINALIZADO_AUDITORIA', actor, payload.observation || 'Auditoria concluída. Processo finalizado e bloqueado.', context);
    autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return !row.EXCLUIDO_EM;
    }).forEach(function(row) { autUpdateRow_('PROCESSO_DOCUMENTOS', row._row, { BLOQUEADO_EM: now }); });
    autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return !row.SUBSTITUIDO_EM;
    }).forEach(function(row) {
      autUpdateRow_('CONTRATOS', row._row, { STATUS: 'FINALIZADO' });
    });
    var finalized = autFind_('PROCESSOS', 'ID_PROCESSO', process.ID_PROCESSO);
    var manifestHash = autBuildProcessManifest_(finalized);
    autUpdateRow_('PROCESSOS', finalized._row, { HASH_MANIFESTO: manifestHash });
    autAudit_(actor, 'MANIFESTO_FINAL_GERADO', 'PROCESSO', process.ID_PROCESSO, {
      hashManifesto: manifestHash, aceiteFinal: acceptance.id
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({ finalized: true, acceptanceId: acceptance.id, manifestHash: manifestHash, version: result.version });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiVerificarIntegridadeProcesso(token, processId) {
  try {
    var actor = autRequireAuth_(token, 'AUDITORIA_VER');
    var process = autRequireProcess_(actor, processId);
    var calculated = autBuildProcessManifest_(process);
    var valid = !!process.HASH_MANIFESTO && String(process.HASH_MANIFESTO) === String(calculated);
    return autResult_({
      finalized: String(process.STATUS) === 'FINALIZADO',
      valid: valid,
      storedHash: process.HASH_MANIFESTO || '',
      calculatedHash: calculated
    });
  } catch (err) { return autPublicError_(err); }
}

function apiCriarAditivo(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'ADITIVO_CRIAR');
    payload = payload || {};
    var reason = String(payload.reason || '').trim();
    autAssert_(reason.length >= 10, 'Informe o motivo do aditivo com pelo menos 10 caracteres.');
    lock.waitLock(30000);
    var original = autRequireProcess_(actor, payload.processId);
    autAssert_(String(original.STATUS) === 'FINALIZADO' && original.BLOQUEADO_EM, 'Aditivos somente podem ser criados para processos finalizados.', 'INVALID_TRANSITION');
    var requestKey = autClaimRequest_(actor, 'CRIAR_ADITIVO|' + original.ID_PROCESSO, context);
    var existing = autRows_('PROCESSOS').filter(function(row) {
      return String(row.ID_PROCESSO_ORIGEM) === String(original.ID_PROCESSO) && String(row.TIPO_VINCULO) === 'ADITIVO';
    });
    var id = autUuid_();
    var now = autNow_();
    var protocol = String(original.PROTOCOLO) + '-AD' + String(existing.length + 1).padStart(2, '0');
    autAppend_('PROCESSOS', {
      ID_PROCESSO: id, PROTOCOLO: protocol, TIPO_PROCESSO: original.TIPO_PROCESSO,
      STATUS: 'RASCUNHO', FASE: 'DOCUMENTACAO', ID_RESPONSAVEL: actor.ID_USUARIO,
      RESPONSAVEL: actor.NOME, ID_CRIADOR: actor.ID_USUARIO, CRIADOR: actor.NOME,
      CLIENTE_NOME: original.CLIENTE_NOME, CLIENTE_CPF: original.CLIENTE_CPF,
      CLIENTE_RG: original.CLIENTE_RG, CLIENTE_EMAIL: original.CLIENTE_EMAIL,
      CLIENTE_CONTATO: original.CLIENTE_CONTATO, CLIENTE_ENDERECO: original.CLIENTE_ENDERECO,
      TITULAR_NOME: original.TITULAR_NOME, IMOVEL_CODIGO: original.IMOVEL_CODIGO,
      IMOVEL_ENDERECO: original.IMOVEL_ENDERECO, DADOS_JSON: original.DADOS_JSON,
      PENDENCIAS_QTD: 0, RESERVADO_POR: '', RESERVADO_ATE: '', CRIADO_EM: now,
      ATUALIZADO_EM: now, FINALIZADO_EM: '', EXCLUIDO_EM: '', SETOR_ATUAL: 'COMERCIAL',
      ENCAMINHADO_EM: '', ENCAMINHADO_POR: '', STATUS_TRAMITACAO: 'COM_CORRETOR',
      ETAPA_ATUAL: 'CORRETOR', VERSAO_REGISTRO: 1, ID_ULTIMO_REMETENTE: '',
      ULTIMO_REMETENTE: '', ID_ULTIMO_DESTINATARIO: '', ULTIMO_DESTINATARIO: '',
      AGUARDANDO_DESDE: now, ANALISE_INICIADA_EM: '', BLOQUEADO_EM: '', BLOQUEADO_POR: '',
      HASH_MANIFESTO: '', ID_PROCESSO_ORIGEM: original.ID_PROCESSO, TIPO_VINCULO: 'ADITIVO',
      MIGRACAO_STATUS: ''
    });
    var dataRows = autRowsBy_('PROCESSO_DADOS', 'ID_PROCESSO', original.ID_PROCESSO).map(function(row) {
      return {
        ID_DADO: autUuid_(), ID_PROCESSO: id, SECAO: row.SECAO, CAMPO: row.CAMPO,
        ROTULO: row.ROTULO, VALOR: row.VALOR, TIPO_DADO: row.TIPO_DADO, ATUALIZADO_EM: now
      };
    });
    autAppendMany_('PROCESSO_DADOS', dataRows);
    var newProcess = autFind_('PROCESSOS', 'ID_PROCESSO', id);
    autBootstrapParticipantsFromProcess_(newProcess, actor);
    autAppend_('ATUACOES', {
      ID_ATUACAO: autUuid_(), ID_PROCESSO: id, TIPO: 'Aditivo criado',
      DESCRICAO: reason, STATUS_ANTERIOR: '', STATUS_NOVO: 'RASCUNHO',
      USUARIO: actor.NOME, CRIADO_EM: now
    });
    autAudit_(actor, 'ADITIVO_CRIADO', 'PROCESSO', id, {
      processoOriginalId: original.ID_PROCESSO, protocoloOriginal: original.PROTOCOLO,
      protocoloAditivo: protocol, motivo: reason
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({ id: id, protocol: protocol, originalId: original.ID_PROCESSO });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autWorkflowSnapshot_(actor, process, includeDetails) {
  var isResponsible = String(process.ID_RESPONSAVEL || '') === String(actor.ID_USUARIO || '');
  var executive = autIsProcessExecutive_(actor);
  var canControl = isResponsible || executive;
  var actorRole = String(actor.PERFIL || '');
  var state = String(process.STATUS_TRAMITACAO || 'COM_CORRETOR');
  function actsAs(roles) { return executive || roles.indexOf(actorRole) >= 0; }
  var categories = includeDetails === false ? [] : AUTENTIKO.REVIEW_CATEGORIES.map(function(category) {
    var readiness = autCategoryReadiness_(process, category);
    var decision = autLatestChecklist_(process.ID_PROCESSO, category);
    readiness.decision = decision ? {
      value: decision.DECISAO, justification: decision.JUSTIFICATIVA,
      at: decision.DECIDIDO_EM, by: decision.DECIDIDO_POR, acceptanceId: decision.ID_ACEITE
    } : null;
    return readiness;
  });
  var actions = {
    sendAdministrative: canControl && actsAs(['CORRETOR']) && ['COM_CORRETOR', 'DEVOLVIDO_CORRETOR'].indexOf(state) >= 0,
    startAdministrative: canControl && actsAs(['ASSISTENTE_ADMINISTRATIVO']) && state === 'AGUARDANDO_ADMINISTRATIVO',
    reviewDocuments: canControl && autHasPermission_(actor, 'DOCUMENTO_CONFERIR') && state !== 'CONCLUIDO',
    approveAdministrative: canControl && actsAs(['ASSISTENTE_ADMINISTRATIVO']) && state === 'COM_ADMINISTRATIVO',
    startManager: canControl && actsAs(['GERENTE_ADMINISTRATIVO']) && state === 'AGUARDANDO_GERENTE',
    decideCategories: canControl && actsAs(['GERENTE_ADMINISTRATIVO']) && ['COM_GERENTE', 'CONTRATO_EM_PREPARACAO'].indexOf(state) >= 0,
    sendGeneralManager: canControl && actsAs(['GERENTE_ADMINISTRATIVO']) && ['COM_GERENTE', 'CONTRATO_EM_PREPARACAO'].indexOf(state) >= 0,
    startGeneralManager: canControl && actsAs(['GERENTE_GERAL']) && state === 'AGUARDANDO_GERENTE_GERAL',
    sendAudit: canControl && actsAs(['GERENTE_GERAL']) && state === 'COM_GERENTE_GERAL',
    startAudit: canControl && actsAs(['AUDITOR']) && state === 'AGUARDANDO_AUDITORIA',
    finalizeAudit: canControl && actsAs(['AUDITOR']) && state === 'COM_AUDITOR',
    pend: canControl && actsAs(['ASSISTENTE_ADMINISTRATIVO', 'GERENTE_ADMINISTRATIVO', 'GERENTE_GERAL', 'AUDITOR']) && state !== 'CONCLUIDO',
    createAddendum: String(process.STATUS) === 'FINALIZADO' && autHasPermission_(actor, 'ADITIVO_CRIAR')
  };
  var movementRows = autMovementRows_(process.ID_PROCESSO);
  var latestMovement = movementRows.length ? movementRows[movementRows.length - 1] : null;
  var wasReturned = !!(latestMovement && /DEVOLVIDO|PENDENCIA/.test(String(latestMovement.ACAO || '')));
  var requiredRole = AUTENTIKO_WORKFLOW_ROLE_BY_STATE[state] || '';
  var routing = {
    symbol: state === 'CONCLUIDO' ? '■' : wasReturned ? '↩' : isResponsible ? '●' : executive ? '◎' : '→',
    tone: state === 'CONCLUIDO' ? 'locked' : wasReturned ? 'returned' : isResponsible ? 'assigned' : 'oversight',
    isResponsible: isResponsible,
    executiveView: executive && !isResponsible,
    responsibleId: process.ID_RESPONSAVEL || '',
    responsibleName: process.RESPONSAVEL || '',
    requiredRole: requiredRole,
    requiredRoleLabel: autLabel_(requiredRole),
    lastSender: process.ULTIMO_REMETENTE || '',
    lastRecipient: process.ULTIMO_DESTINATARIO || '',
    waitingSince: process.AGUARDANDO_DESDE || '',
    message: state === 'CONCLUIDO'
      ? 'Processo finalizado e protegido contra alterações.'
      : wasReturned && isResponsible
        ? 'Processo devolvido para você com pendência. Revise o motivo e faça a correção.'
        : isResponsible
          ? 'Este processo está com você e aguarda sua ação.'
          : executive
            ? 'Visão gerencial: o responsável atual é ' + (process.RESPONSAVEL || 'não informado') + '.'
            : 'Processo atribuído a ' + (process.RESPONSAVEL || 'responsável não informado') + '.'
  };
  return {
    status: process.STATUS,
    state: state,
    stage: process.ETAPA_ATUAL || '',
    version: autProcessVersion_(process),
    locked: String(process.STATUS) === 'FINALIZADO' || !!process.BLOQUEADO_EM,
    lockedAt: process.BLOQUEADO_EM || '',
    lockedBy: process.BLOQUEADO_POR || '',
    manifestHash: process.HASH_MANIFESTO || '',
    migrationStatus: process.MIGRACAO_STATUS || '',
    categories: categories,
    routing: routing,
    actions: actions,
    recipients: {
      administrative: actions.sendAdministrative ? autWorkflowUsersByRole_('ASSISTENTE_ADMINISTRATIVO') : [],
      manager: actions.approveAdministrative ? autWorkflowUsersByRole_('GERENTE_ADMINISTRATIVO') : [],
      generalManager: actions.sendGeneralManager ? autWorkflowUsersByRole_('GERENTE_GERAL') : [],
      auditor: actions.sendAudit ? autWorkflowUsersByRole_('AUDITOR') : []
    }
  };
}
