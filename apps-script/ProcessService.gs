function autCanSeeProcess_(user, process) {
  if (autHasPermission_(user, 'PROCESSO_VER_TODOS')) return true;
  return String(process.ID_CRIADOR) === String(user.ID_USUARIO) || String(process.ID_RESPONSAVEL) === String(user.ID_USUARIO) || autNormalize_(process.RESPONSAVEL) === autNormalize_(user.NOME);
}

function autRequireProcess_(user, processId) {
  var process = autFind_('PROCESSOS', 'ID_PROCESSO', processId);
  autAssert_(process && !process.EXCLUIDO_EM, 'Processo não encontrado.', 'NOT_FOUND');
  autAssert_(autCanSeeProcess_(user, process), 'Você não pode acessar este processo.', 'FORBIDDEN');
  return process;
}

function autIsProcessAdministrator_(user) {
  return ['ADMINISTRADOR', 'DESENVOLVEDOR'].indexOf(String(user && user.PERFIL || '')) >= 0 &&
    autHasPermission_(user, 'PROCESSO_EDITAR');
}

function autIsCurrentProcessResponsible_(user, process) {
  return String(process && process.ID_RESPONSAVEL || '') === String(user && user.ID_USUARIO || '');
}

function autCanActOnProcess_(user, process, permission) {
  if (!process || String(process.STATUS) === 'FINALIZADO' || process.BLOQUEADO_EM) return false;
  if (!autHasPermission_(user, permission)) return false;
  return autIsCurrentProcessResponsible_(user, process) || autIsProcessAdministrator_(user);
}

function autCanEditProcessRegistration_(user, process) {
  if (!process || String(process.STATUS) === 'FINALIZADO' || process.BLOQUEADO_EM) return false;
  if (autIsProcessAdministrator_(user)) return true;
  return autIsCurrentProcessResponsible_(user, process) &&
    ['COM_CORRETOR', 'DEVOLVIDO_CORRETOR'].indexOf(String(process.STATUS_TRAMITACAO || 'COM_CORRETOR')) >= 0;
}

function autCanManageProcessDocuments_(user, process) {
  return autCanActOnProcess_(user, process, 'DOCUMENTO_ENVIAR');
}

function autProcessCard_(row) {
  return {
    id: row.ID_PROCESSO,
    protocol: String(row.PROTOCOLO),
    type: row.TIPO_PROCESSO,
    typeLabel: autLabel_(row.TIPO_PROCESSO),
    status: row.STATUS,
    phase: row.FASE,
    workflowStatus: row.STATUS_TRAMITACAO || 'COM_CORRETOR',
    currentStage: row.ETAPA_ATUAL || 'CORRETOR',
    version: autProcessVersion_(row),
    locked: String(row.STATUS) === 'FINALIZADO' || !!row.BLOQUEADO_EM,
    lockedAt: row.BLOQUEADO_EM || '',
    manifestHash: row.HASH_MANIFESTO || '',
    responsible: row.RESPONSAVEL,
    sector: row.SETOR_ATUAL || 'COMERCIAL',
    forwardedAt: row.ENCAMINHADO_EM,
    forwardedBy: row.ENCAMINHADO_POR,
    creator: row.CRIADOR,
    clientName: row.CLIENTE_NOME,
    clientCpf: autFormatCpf_(row.CLIENTE_CPF),
    clientRg: row.CLIENTE_RG,
    clientEmail: row.CLIENTE_EMAIL,
    clientContact: row.CLIENTE_CONTATO,
    clientAddress: row.CLIENTE_ENDERECO,
    propertyCode: row.IMOVEL_CODIGO,
    propertyAddress: row.IMOVEL_ENDERECO,
    pendingCount: Number(row.PENDENCIAS_QTD || 0),
    reservedBy: row.RESERVADO_POR,
    reservedUntil: row.RESERVADO_ATE,
    createdAt: row.CRIADO_EM,
    updatedAt: row.ATUALIZADO_EM,
    finalizedAt: row.FINALIZADO_EM
  };
}

function autProcessDataMap_(process) {
  var data = autJsonParse_(process.DADOS_JSON, {});
  autRowsBy_('PROCESSO_DADOS', 'ID_PROCESSO', process.ID_PROCESSO).forEach(function(row) {
    var value = row.VALOR;
    if (String(row.TIPO_DADO) === 'checkbox' || /^[\[{]/.test(String(value || '').trim())) {
      value = autJsonParse_(String(value || ''), value);
    }
    data[row.CAMPO] = value;
  });
  return data;
}

function autProcessSummaryJson_(data) {
  var keys = [
    'cliente_nome', 'cliente_cpf', 'cliente_email', 'cliente_contato',
    'titular_nome', 'imovel_codigo', 'imovel_endereco', 'imovel_localidade',
    'valor_aluguel_mensal', 'valor_aluguel', 'valor_negociado',
    'aceite_renda_insuficiente', 'aceite_renda_token', 'aceite_renda_em', 'aceite_renda_por'
  ];
  var summary = {};
  keys.forEach(function(key) {
    if (data[key] !== undefined && data[key] !== null && String(data[key]) !== '') summary[key] = data[key];
  });
  return autJson_(summary);
}

function autVisibleProcesses_(user) {
  return autRows_('PROCESSOS').filter(function(row) { return !row.EXCLUIDO_EM && autCanSeeProcess_(user, row); });
}

function autDashboard_(user, visibleRows) {
  var rows = visibleRows || autVisibleProcesses_(user);
  var counts = { total: rows.length, pending: 0, approved: 0, finalized: 0, mine: 0, analysis: 0, rejected: 0 };
  rows.forEach(function(row) {
    if (['PENDENTE', 'PENDENTE_DOCUMENTO', 'PENDENTE_PROCESSO'].indexOf(String(row.STATUS)) >= 0) counts.pending++;
    if (['APROVADO', 'APROVADO_ADMINISTRATIVO', 'APROVADO_GERENCIAL'].indexOf(String(row.STATUS)) >= 0) counts.approved++;
    if (row.STATUS === 'FINALIZADO') counts.finalized++;
    if (row.STATUS === 'EM_ANALISE') counts.analysis++;
    if (['REPROVADO', 'RECUSADO'].indexOf(String(row.STATUS)) >= 0) counts.rejected++;
    if (String(row.ID_RESPONSAVEL) === String(user.ID_USUARIO) || String(row.ID_CRIADOR) === String(user.ID_USUARIO)) counts.mine++;
  });
  return counts;
}

function apiListarProcessos(token, filters) {
  try {
    var user = autRequireAuth_(token);
    filters = filters || {};
    var search = autNormalize_(filters.search || '');
    var visibleRows = autVisibleProcesses_(user);
    var rows = visibleRows.filter(function(row) {
      if (filters.status && row.STATUS !== filters.status) return false;
      if (filters.type && row.TIPO_PROCESSO !== filters.type) return false;
      if (filters.phase && row.FASE !== filters.phase) return false;
      if (filters.mine && String(row.ID_RESPONSAVEL) !== String(user.ID_USUARIO) && String(row.ID_CRIADOR) !== String(user.ID_USUARIO)) return false;
      if (search) {
        var haystack = autNormalize_([row.PROTOCOLO, row.CLIENTE_NOME, row.CLIENTE_CPF, row.CLIENTE_EMAIL, row.RESPONSAVEL, row.IMOVEL_ENDERECO].join(' '));
        if (haystack.indexOf(search) < 0) return false;
      }
      return true;
    }).sort(function(a, b) { return autDateMs_(b.CRIADO_EM) - autDateMs_(a.CRIADO_EM); });
    var page = Math.max(Number(filters.page || 1), 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 1), 100);
    var start = (page - 1) * pageSize;
    return autResult_({
      items: rows.slice(start, start + pageSize).map(autProcessCard_),
      page: page,
      pageSize: pageSize,
      total: rows.length,
      pages: Math.ceil(rows.length / pageSize) || 1,
      dashboard: autDashboard_(user, visibleRows)
    });
  } catch (err) { return autPublicError_(err); }
}

function autGenerateProtocol_() {
  for (var attempt = 0; attempt < 50; attempt++) {
    var prefix = Utilities.formatDate(new Date(), AUTENTIKO.TIMEZONE, 'yyMMdd');
    var suffix = autRandomDigits_(4);
    var protocol = prefix + suffix;
    if (!autFind_('PROCESSOS', 'PROTOCOLO', protocol)) return protocol;
  }
  throw new Error('Não foi possível gerar um protocolo único. Tente novamente.');
}

function autSchemaFor_(type) {
  var schema = autFormSchema_(type);
  autAssert_(schema.length, 'Tipo de processo sem formulário configurado.', 'FORM_NOT_CONFIGURED');
  return schema;
}

function autFieldVisible_(field, data) {
  if (!field.condition || !field.condition.field) return true;
  return String(data[field.condition.field] || '') === String(field.condition.equals || '');
}

function autIncomeEvaluation_(type, data) {
  var applicable = AUTENTIKO.RENTAL_INCOME_TYPES.indexOf(String(type || '')) >= 0;
  var income = autCurrencyNumber_(data && data.cliente_renda);
  var rent = autCurrencyNumber_(data && (data.valor_aluguel_mensal || data.valor_aluguel || data.valor_negociado));
  var requiredIncome = rent * 3;
  return {
    applicable: applicable,
    income: income,
    rent: rent,
    requiredIncome: requiredIncome,
    adequate: !applicable || (income > 0 && rent > 0 && income >= requiredIncome),
    accepted: autNormalize_(data && data.aceite_renda_insuficiente) === 'SIM'
  };
}

function autApplyIncomeAcceptance_(type, data, user, timestamp) {
  var evaluation = autIncomeEvaluation_(type, data);
  if (!evaluation.applicable || evaluation.adequate) {
    delete data.aceite_renda_insuficiente;
    delete data.aceite_renda_token;
    delete data.aceite_renda_em;
    delete data.aceite_renda_por;
    return evaluation;
  }
  autAssert_(evaluation.accepted, 'Confirme que está ciente de que a renda do inquilino não comporta três vezes o valor do aluguel.', 'INCOME_ACCEPTANCE_REQUIRED');
  var existingToken = String(data.aceite_renda_token || '');
  data.aceite_renda_insuficiente = 'SIM';
  data.aceite_renda_token = /^ACE-[A-Z0-9-]{12,80}$/.test(existingToken)
    ? existingToken
    : 'ACE-' + Utilities.formatDate(new Date(), AUTENTIKO.TIMEZONE, 'yyyyMMddHHmmss') + '-' + autRandomDigits_(6);
  data.aceite_renda_em = data.aceite_renda_em || timestamp;
  data.aceite_renda_por = data.aceite_renda_por || user.NOME;
  evaluation.token = data.aceite_renda_token;
  evaluation.acceptedAt = data.aceite_renda_em;
  return evaluation;
}

function autValidateProcessData_(type, data) {
  var schema = autSchemaFor_(type);
  var payloadBytes = Utilities.newBlob(JSON.stringify(data || {}), 'application/json').getBytes().length;
  autAssert_(payloadBytes <= 45000, 'Os dados do formulário ultrapassam o limite permitido.', 'PAYLOAD_TOO_LARGE');
  var lists = autLists_();
  schema.forEach(function(field) {
    if (field.required && autFieldVisible_(field, data)) {
      var value = data[field.name];
      autAssert_(value !== undefined && value !== null && String(value).trim() !== '', 'Preencha o campo: ' + field.label, 'REQUIRED_FIELD');
    }
    if (data[field.name] != null) {
      autAssert_(String(data[field.name]).length <= 5000, 'O campo excede o tamanho permitido: ' + field.label, 'FIELD_TOO_LARGE');
    }
    if (field.input === 'cpf' && data[field.name]) autAssert_(autCpfValido_(data[field.name]), 'CPF inválido no campo: ' + field.label, 'INVALID_CPF');
    if (field.input === 'email' && data[field.name]) autAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data[field.name])), 'E-mail inválido no campo: ' + field.label, 'INVALID_EMAIL');
    if (field.input === 'select' && data[field.name]) {
      var allowed = field.options && field.options.list ? (lists[field.options.list] || []) : (Array.isArray(field.options) ? field.options : []);
      if (allowed.length) autAssert_(allowed.indexOf(data[field.name]) >= 0, 'Opção inválida no campo: ' + field.label, 'INVALID_OPTION');
    }
  });
  var income = autIncomeEvaluation_(type, data);
  if (income.applicable) {
    autAssert_(income.rent > 0, 'Informe o valor mensal do aluguel.', 'REQUIRED_FIELD');
    autAssert_(income.income > 0, 'Informe a renda mensal comprovada do cliente.', 'REQUIRED_FIELD');
    autAssert_(income.adequate || income.accepted, 'A renda é inferior a três vezes o aluguel. Registre o aceite eletrônico para prosseguir.', 'INCOME_ACCEPTANCE_REQUIRED');
  }
  return schema;
}

function autAddressFromData_(data, prefix) {
  var parts = [data[prefix + '_rua'], data[prefix + '_numero'], data[prefix + '_bairro'], data[prefix + '_complemento'], data[prefix + '_cidade'], data[prefix + '_cep']];
  return parts.filter(function(value) { return value != null && String(value).trim(); }).join(', ');
}

function apiCriarProcesso(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token, 'PROCESSO_CRIAR');
    payload = payload || {};
    var type = String(payload.type || '');
    autAssert_(AUTENTIKO.PROCESS_TYPES.indexOf(type) >= 0, 'Tipo de processo inválido.');
    var data = autCleanObject_(payload.data || {});
    var schema = autValidateProcessData_(type, data);
    lock.waitLock(30000);
    var requestKey = autClaimRequest_(user, 'PROCESSO_CRIAR', context);
    var id = autUuid_();
    var protocol = autGenerateProtocol_();
    var now = autNow_();
    var incomeEvaluation = autApplyIncomeAcceptance_(type, data, user, now);
    var process = {
      ID_PROCESSO: id,
      PROTOCOLO: protocol,
      TIPO_PROCESSO: type,
      STATUS: 'RASCUNHO',
      FASE: 'CADASTRO',
      ID_RESPONSAVEL: user.ID_USUARIO,
      RESPONSAVEL: data.responsavel_processo || user.NOME,
      ID_CRIADOR: user.ID_USUARIO,
      CRIADOR: user.NOME,
      CLIENTE_NOME: data.cliente_nome || '',
      CLIENTE_CPF: autDigits_(data.cliente_cpf),
      CLIENTE_RG: data.cliente_documento || '',
      CLIENTE_EMAIL: autNormalizeEmail_(data.cliente_email),
      CLIENTE_CONTATO: data.cliente_contato || '',
      CLIENTE_ENDERECO: autAddressFromData_(data, 'cliente'),
      TITULAR_NOME: data.titular_nome || '',
      IMOVEL_CODIGO: data.imovel_codigo || '',
      IMOVEL_ENDERECO: data.imovel_endereco || data.imovel_localidade || '',
      DADOS_JSON: autProcessSummaryJson_(data),
      PENDENCIAS_QTD: 0,
      RESERVADO_POR: '',
      RESERVADO_ATE: '',
      CRIADO_EM: now,
      ATUALIZADO_EM: now,
      FINALIZADO_EM: '',
      EXCLUIDO_EM: '',
      SETOR_ATUAL: 'COMERCIAL',
      ENCAMINHADO_EM: '',
      ENCAMINHADO_POR: '',
      STATUS_TRAMITACAO: 'COM_CORRETOR',
      ETAPA_ATUAL: 'CORRETOR',
      VERSAO_REGISTRO: 1,
      ID_ULTIMO_REMETENTE: '',
      ULTIMO_REMETENTE: '',
      ID_ULTIMO_DESTINATARIO: '',
      ULTIMO_DESTINATARIO: '',
      AGUARDANDO_DESDE: now,
      ANALISE_INICIADA_EM: '',
      BLOQUEADO_EM: '',
      BLOQUEADO_POR: '',
      HASH_MANIFESTO: '',
      ID_PROCESSO_ORIGEM: '',
      TIPO_VINCULO: '',
      MIGRACAO_STATUS: 'NATIVO_V2'
    };
    autAppend_('PROCESSOS', process);
    var virtualRows = schema.filter(function(field) { return Object.prototype.hasOwnProperty.call(data, field.name); }).map(function(field) {
      var value = data[field.name];
      return {
        ID_DADO: autUuid_(), ID_PROCESSO: id, SECAO: field.section, CAMPO: field.name,
        ROTULO: field.label, VALOR: Array.isArray(value) ? JSON.stringify(value) : value,
        TIPO_DADO: field.input, ATUALIZADO_EM: now
      };
    });
    autAppendMany_('PROCESSO_DADOS', virtualRows);
    autAppend_('ATUACOES', {
      ID_ATUACAO: autUuid_(), ID_PROCESSO: id, TIPO: 'Criação', DESCRICAO: 'Processo criado',
      STATUS_ANTERIOR: '', STATUS_NOVO: 'RASCUNHO', USUARIO: user.NOME, CRIADO_EM: now
    });
    if (incomeEvaluation.applicable && !incomeEvaluation.adequate) {
      autAppend_('ATUACOES', {
        ID_ATUACAO: autUuid_(), ID_PROCESSO: id, TIPO: 'Aceite eletrônico de renda',
        DESCRICAO: 'Usuário confirmou ciência de renda inferior a três vezes o valor do aluguel. Token: ' + incomeEvaluation.token,
        STATUS_ANTERIOR: '', STATUS_NOVO: 'RASCUNHO', USUARIO: user.NOME, CRIADO_EM: now
      });
    }
    autBootstrapParticipantsFromProcess_(autFind_('PROCESSOS', 'ID_PROCESSO', id), user);
    autAudit_(user, 'PROCESSO_CRIADO', 'PROCESSO', id, { protocolo: protocol, tipo: type }, context);
    if (incomeEvaluation.applicable && !incomeEvaluation.adequate) {
      autAudit_(user, 'ACEITE_RENDA_INSUFICIENTE', 'PROCESSO', id, {
        token: incomeEvaluation.token,
        rendaInformada: incomeEvaluation.income,
        aluguelInformado: incomeEvaluation.rent,
        rendaMinima: incomeEvaluation.requiredIncome
      }, context);
    }
    autCommitRequest_(requestKey);
    return autResult_({ process: autProcessCard_(process), incomeEvaluation: incomeEvaluation });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiAtualizarProcesso(token, processId, data, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token);
    lock.waitLock(30000);
    var process = autRequireProcess_(user, processId);
    autAssertProcessMutable_(process);
    var requestKey = autClaimRequest_(user, 'PROCESSO_ATUALIZAR|' + processId, context);
    autAssertExpectedVersion_(process, context && context.expectedVersion);
    autAssert_(autCanEditProcessRegistration_(user, process), 'Você não pode editar este processo.', 'FORBIDDEN');
    data = autCleanObject_(data || {});
    var schema = autValidateProcessData_(process.TIPO_PROCESSO, data);
    var now = autNow_();
    var incomeEvaluation = autApplyIncomeAcceptance_(process.TIPO_PROCESSO, data, user, now);
    autUpdateRow_('PROCESSOS', process._row, {
      RESPONSAVEL: data.responsavel_processo || process.RESPONSAVEL,
      CLIENTE_NOME: data.cliente_nome || '', CLIENTE_CPF: autDigits_(data.cliente_cpf),
      CLIENTE_RG: data.cliente_documento || '', CLIENTE_EMAIL: autNormalizeEmail_(data.cliente_email),
      CLIENTE_CONTATO: data.cliente_contato || '', CLIENTE_ENDERECO: autAddressFromData_(data, 'cliente'),
      TITULAR_NOME: data.titular_nome || '', IMOVEL_CODIGO: data.imovel_codigo || '',
      IMOVEL_ENDERECO: data.imovel_endereco || data.imovel_localidade || '',
      DADOS_JSON: autProcessSummaryJson_(data),
      ATUALIZADO_EM: now,
      VERSAO_REGISTRO: autProcessVersion_(process) + 1
    });
    autDeleteRowsBy_('PROCESSO_DADOS', 'ID_PROCESSO', processId);
    autAppendMany_('PROCESSO_DADOS', schema.filter(function(field) { return Object.prototype.hasOwnProperty.call(data, field.name); }).map(function(field) {
      var value = data[field.name];
      return { ID_DADO: autUuid_(), ID_PROCESSO: processId, SECAO: field.section, CAMPO: field.name, ROTULO: field.label, VALOR: Array.isArray(value) || (value && typeof value === 'object') ? autJson_(value) : value, TIPO_DADO: field.input, ATUALIZADO_EM: now };
    }));
    autInvalidateProcessApprovals_(processId, 'Ficha cadastral alterada', context);
    autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', processId).filter(function(row) {
      return autJsonParse_(row.DADOS_JSON, {}).origem === 'FICHA_CADASTRAL';
    }).forEach(function(row) {
      autUpdateRow_('PROCESSO_PARTICIPANTES', row._row, { ATIVO: 'NAO', ATUALIZADO_EM: now, ATUALIZADO_POR: user.NOME });
    });
    autBootstrapParticipantsFromProcess_(autFind_('PROCESSOS', 'ID_PROCESSO', processId), user);
    autAudit_(user, 'PROCESSO_ATUALIZADO', 'PROCESSO', processId, { protocolo: process.PROTOCOLO }, context);
    if (incomeEvaluation.applicable && !incomeEvaluation.adequate) {
      autAudit_(user, 'ACEITE_RENDA_INSUFICIENTE', 'PROCESSO', processId, {
        token: incomeEvaluation.token,
        rendaInformada: incomeEvaluation.income,
        aluguelInformado: incomeEvaluation.rent,
        rendaMinima: incomeEvaluation.requiredIncome
      }, context);
    }
    autCommitRequest_(requestKey);
    return autResult_({ updated: true, version: autProcessVersion_(process) + 1, incomeEvaluation: incomeEvaluation });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autRequiredDocumentStatus_(process, uploadedRows) {
  var catalog = autDocumentCatalog_().filter(function(doc) {
    return !doc.processTypes.length || doc.processTypes.indexOf(process.TIPO_PROCESSO) >= 0;
  });
  var uploaded = uploadedRows || autRows_('PROCESSO_DOCUMENTOS').filter(function(row) { return row.ID_PROCESSO === process.ID_PROCESSO && !row.EXCLUIDO_EM; });
  return catalog.map(function(doc) {
    var files = uploaded.filter(function(row) { return row.ID_DOCUMENTO_TIPO === doc.id; });
    return {
      id: doc.id,
      name: doc.name,
      required: (doc.requiredProcessTypes || (doc.required ? doc.processTypes : [])).indexOf(process.TIPO_PROCESSO) >= 0,
      uploaded: files.length > 0,
      files: files.length,
      maxMb: doc.maxMb,
      mimeTypes: doc.mimeTypes,
      multiple: true,
      requirementGroup: AUTENTIKO.RENTAL_INCOME_TYPES.indexOf(process.TIPO_PROCESSO) >= 0 && AUTENTIKO.INCOME_PROOF_DOCUMENT_IDS.indexOf(doc.id) >= 0 ? 'COMPROVACAO_RENDA' : ''
    };
  });
}

function autRequiredDocumentGroups_(process, uploadedRows) {
  if (AUTENTIKO.RENTAL_INCOME_TYPES.indexOf(process.TIPO_PROCESSO) < 0) return [];
  var uploaded = uploadedRows || autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) { return !row.EXCLUIDO_EM; });
  var files = uploaded.filter(function(row) {
    return AUTENTIKO.INCOME_PROOF_DOCUMENT_IDS.indexOf(String(row.ID_DOCUMENTO_TIPO)) >= 0;
  });
  return [{
    id: 'COMPROVACAO_RENDA',
    name: 'Comprovação de renda',
    description: 'Envie pelo menos um: extrato bancário, contracheque/holerite, DECORE, extrato do INSS, extrato do FGTS, declaração de Imposto de Renda ou declaração assinada pelo contador.',
    required: true,
    uploaded: files.length > 0,
    files: files.length,
    documentTypeIds: AUTENTIKO.INCOME_PROOF_DOCUMENT_IDS.slice()
  }];
}

function autProcessDocumentRows_(processId) {
  return autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', processId).filter(function(row) {
    return !row.EXCLUIDO_EM;
  });
}

function autProcessDocumentsPublic_(documentRows) {
  return (documentRows || []).map(function(row) {
    return {
      id: row.ID_DOCUMENTO, typeId: row.ID_DOCUMENTO_TIPO, name: row.NOME_DOCUMENTO,
      fileName: row.ARQUIVO_NOME, mimeType: row.MIME_TYPE, size: Number(row.TAMANHO_BYTES || 0),
      hash: row.HASH_SHA256, version: Number(row.VERSAO || 1), uploadedBy: row.ENVIADO_POR, createdAt: row.CRIADO_EM,
      categories: autJsonParse_(row.CATEGORIAS_JSON, []),
      reviewStatus: row.STATUS_CONFERENCIA || 'PENDENTE_CONFERENCIA',
      reviewedAt: row.CONFERIDO_EM || '', reviewedBy: row.CONFERIDO_POR || '',
      pendingReason: row.MOTIVO_PENDENCIA || '', replacedBy: row.SUBSTITUIDO_POR || '',
      recordVersion: Number(row.VERSAO_REGISTRO || 1), lockedAt: row.BLOQUEADO_EM || '',
      mediaStatus: row.MEDIA_STATUS || 'DRIVE_ONLY',
      mediaVersion: Number(row.MEDIA_VERSAO || row.VERSAO || 1),
      thumbnailStatus: row.THUMBNAIL_STATUS || '',
      previewStatus: row.PREVIEW_STATUS || '',
      driveSupabaseSync: row.SYNC_DRIVE_SUPABASE || 'PENDENTE',
      mediaUpdatedAt: row.MEDIA_ATUALIZADO_EM || '',
      mediaErrorCode: row.MEDIA_ERRO_CODIGO || ''
    };
  }).sort(function(a, b) {
    var timeOrder = autDateMs_(b.createdAt) - autDateMs_(a.createdAt);
    if (timeOrder) return timeOrder;
    var versionOrder = Number(b.version || 0) - Number(a.version || 0);
    if (versionOrder) return versionOrder;
    return String(a.fileName || '').localeCompare(String(b.fileName || ''));
  });
}

function autProcessPendingPublic_(processId) {
  return autRowsBy_('PENDENCIAS', 'ID_PROCESSO', processId).map(function(row) {
    return {
      id: row.ID_PENDENCIA, title: row.TITULO, description: row.DESCRICAO,
      status: row.STATUS, responsible: row.RESPONSAVEL, dueDate: row.PRAZO,
      createdBy: row.CRIADO_POR, createdAt: row.CRIADO_EM,
      completedAt: row.CONCLUIDO_EM, completedBy: row.CONCLUIDO_POR || ''
    };
  }).sort(function(a, b) { return autDateMs_(b.createdAt) - autDateMs_(a.createdAt); });
}

function autProcessActivitiesPublic_(processId) {
  return autRowsBy_('ATUACOES', 'ID_PROCESSO', processId).map(function(row) {
    return {
      id: row.ID_ATUACAO, type: row.TIPO, description: row.DESCRICAO,
      fromStatus: row.STATUS_ANTERIOR, toStatus: row.STATUS_NOVO,
      user: row.USUARIO, createdAt: row.CRIADO_EM
    };
  }).sort(function(a, b) { return autDateMs_(b.createdAt) - autDateMs_(a.createdAt); });
}

function autProcessMovementsPublic_(processId) {
  return autMovementRows_(processId).map(function(row) {
    return {
      id: row.ID_MOVIMENTACAO, sequence: Number(row.SEQUENCIA || 0), action: row.ACAO,
      fromStatus: row.STATUS_ANTERIOR, toStatus: row.STATUS_NOVO,
      fromState: row.TRAMITACAO_ANTERIOR, toState: row.TRAMITACAO_NOVA,
      fromStage: row.ETAPA_ANTERIOR, toStage: row.ETAPA_NOVA,
      origin: row.USUARIO_ORIGEM, destination: row.USUARIO_DESTINO,
      observation: row.OBSERVACAO, createdAt: row.CRIADO_EM
    };
  }).reverse();
}

function autProcessCapabilities_(user, process) {
  var mutable = String(process.STATUS) !== 'FINALIZADO' && !process.BLOQUEADO_EM;
  var canAct = autIsCurrentProcessResponsible_(user, process) || autIsProcessAdministrator_(user);
  return {
    edit: autCanEditProcessRegistration_(user, process),
    analyze: autHasPermission_(user, 'PROCESSO_ANALISAR'),
    upload: autCanManageProcessDocuments_(user, process),
    download: autHasPermission_(user, 'DOCUMENTO_BAIXAR'),
    pending: autHasPermission_(user, 'PENDENCIA_GERIR') && mutable && canAct,
    activity: autHasPermission_(user, 'ATUACAO_CRIAR') && mutable && canAct,
    forward: autHasPermission_(user, 'PROCESSO_ENCAMINHAR') && mutable && canAct,
    checkDocument: autHasPermission_(user, 'DOCUMENTO_CONFERIR') && mutable && canAct,
    manageProposal: autHasPermission_(user, 'PROPOSTA_GERIR') && mutable && canAct,
    acceptProposal: autHasPermission_(user, 'PROPOSTA_ACEITAR') && mutable && canAct,
    issueContract: autHasPermission_(user, 'CONTRATO_EMITIR') && mutable && canAct,
    createAddendum: autHasPermission_(user, 'ADITIVO_CRIAR') && String(process.STATUS) === 'FINALIZADO',
    deleteProcess: autHasPermission_(user, 'PROCESSO_EXCLUIR') && mutable
  };
}

function autProcessRegistrationTab_(user, process) {
  return {
    data: autProcessDataMap_(process),
    formFields: autFormSchema_(process.TIPO_PROCESSO),
    commercial: {
      participants: autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO)
        .filter(function(row) { return String(row.ATIVO) !== 'NAO'; })
        .map(autParticipantPublic_)
        .sort(function(a, b) { return a.order - b.order || a.name.localeCompare(b.name); }),
      participantCompleteness: autParticipantCompleteness_(process.ID_PROCESSO)
    }
  };
}

function autProcessDocumentsTab_(user, process) {
  var documentRows = autProcessDocumentRows_(process.ID_PROCESSO);
  return {
    requiredDocuments: autRequiredDocumentStatus_(process, documentRows),
    documentGroups: autRequiredDocumentGroups_(process, documentRows),
    documents: autProcessDocumentsPublic_(documentRows)
  };
}

function autProcessReviewTab_(user, process) {
  var workflow = autWorkflowSnapshot_(user, process);
  var administrative = autAdministrativeReadiness_(process);
  var openPending = autOpenPendingRows_(process.ID_PROCESSO).length;
  return {
    pending: autProcessPendingPublic_(process.ID_PROCESSO),
    activities: autProcessActivitiesPublic_(process.ID_PROCESSO),
    workflow: workflow,
    commercial: autCommercialSnapshot_(user, process),
    movements: autProcessMovementsPublic_(process.ID_PROCESSO),
    reviewReadiness: {
      administrative: administrative,
      managerReady: workflow.categories.length === AUTENTIKO.REVIEW_CATEGORIES.length &&
        workflow.categories.every(function(item) { return !!item.decision; }),
      managerPending: workflow.categories.filter(function(item) { return !item.decision; }).map(function(item) { return item.label; }),
      openPending: openPending
    }
  };
}

function autProcessAuditTab_(user, process) {
  var canAudit = autHasPermission_(user, 'AUDITORIA_VER') ||
    String(process.ID_CRIADOR) === String(user.ID_USUARIO);
  return { audit: canAudit ? autAuditForEntity_('PROCESSO', process.ID_PROCESSO) : [] };
}

function apiAbrirProcesso(token, processId) {
  try {
    var user = autRequireAuth_(token);
    var process = autRequireProcess_(user, processId);
    return autResult_({
      process: autProcessCard_(process),
      workflow: autWorkflowSnapshot_(user, process, false),
      capabilities: autProcessCapabilities_(user, process),
      tabMeta: {
        pending: Number(process.PENDENCIAS_QTD || 0),
        version: autProcessVersion_(process)
      }
    });
  } catch (err) { return autPublicError_(err); }
}

function apiCarregarAbaProcesso(token, processId, tab) {
  try {
    var user = autRequireAuth_(token);
    var process = autRequireProcess_(user, processId);
    var key = String(tab || '').toUpperCase();
    key = {
      REGISTRATION: 'CADASTRO',
      DOCUMENTS: 'DOCUMENTOS',
      REVIEW: 'REVISAO',
      AUDIT: 'AUDITORIA'
    }[key] || key;
    var data;
    if (key === 'CADASTRO') data = autProcessRegistrationTab_(user, process);
    else if (key === 'DOCUMENTOS') data = autProcessDocumentsTab_(user, process);
    else if (key === 'REVISAO') data = autProcessReviewTab_(user, process);
    else if (key === 'AUDITORIA') data = autProcessAuditTab_(user, process);
    else autAssert_(false, 'Aba de processo inválida.', 'INVALID_PROCESS_TAB');
    data.processVersion = autProcessVersion_(process);
    data.tab = key;
    return autResult_(data);
  } catch (err) { return autPublicError_(err); }
}

function apiDetalharProcesso(token, processId) {
  try {
    var user = autRequireAuth_(token);
    var process = autRequireProcess_(user, processId);
    var registration = autProcessRegistrationTab_(user, process);
    var documents = autProcessDocumentsTab_(user, process);
    var review = autProcessReviewTab_(user, process);
    var audit = autProcessAuditTab_(user, process);
    return autResult_({
      process: autProcessCard_(process),
      data: registration.data,
      requiredDocuments: documents.requiredDocuments,
      documentGroups: documents.documentGroups,
      documents: documents.documents,
      pending: review.pending,
      activities: review.activities,
      audit: audit.audit,
      workflow: review.workflow,
      commercial: review.commercial,
      movements: review.movements,
      reviewReadiness: review.reviewReadiness,
      capabilities: autProcessCapabilities_(user, process)
    });
  } catch (err) { return autPublicError_(err); }
}

function autForwardSector_(sector) {
  var normalized = autNormalize_(sector);
  var sectors = {
    ADMINISTRATIVO: {
      value: 'ADMINISTRATIVO',
      label: 'Administrativo',
      role: 'ASSISTENTE_ADMINISTRATIVO'
    },
    GERENTE_ADMINISTRATIVO: {
      value: 'GERENTE_ADMINISTRATIVO',
      label: 'Gerente administrativo',
      role: 'GERENTE_ADMINISTRATIVO'
    }
  };
  return sectors[normalized] || null;
}

function autForwardUsers_(sector) {
  return autRows_('USUARIOS').filter(function(row) {
    return row.STATUS === 'ATIVO' && row.PERFIL === sector.role;
  }).map(function(row) {
    return {
      id: row.ID_USUARIO,
      name: row.NOME,
      email: row.EMAIL,
      role: row.PERFIL
    };
  }).sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function apiListarDestinatariosProcesso(token, processId) {
  try {
    var actor = autRequireAuth_(token, 'PROCESSO_ENCAMINHAR');
    var process = autRequireProcess_(actor, processId);
    var sectors = ['ADMINISTRATIVO', 'GERENTE_ADMINISTRATIVO'].map(function(key) {
      var sector = autForwardSector_(key);
      return {
        value: sector.value,
        label: sector.label,
        users: autForwardUsers_(sector)
      };
    });
    return autResult_({
      processId: process.ID_PROCESSO,
      protocol: String(process.PROTOCOLO),
      currentResponsible: process.RESPONSAVEL || '',
      currentSector: process.SETOR_ATUAL || 'COMERCIAL',
      sectors: sectors
    });
  } catch (err) { return autPublicError_(err); }
}

function apiEncaminharProcesso(token, processId, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PROCESSO_ENCAMINHAR');
    payload = payload || {};
    var sector = autForwardSector_(payload.sector);
    autAssert_(sector, 'Selecione um setor de destino válido.');
    var observation = String(payload.observation || '').trim();
    autAssert_(observation.length <= 2000, 'A observação deve ter no máximo 2.000 caracteres.', 'FIELD_TOO_LARGE');
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, processId);
    autAssertProcessMutable_(process);
    autAssert_(autCanActOnProcess_(actor, process, 'PROCESSO_ENCAMINHAR'),
      'O processo não está sob sua responsabilidade atual.', 'NOT_CURRENT_RESPONSIBLE');
    var requestKey = autClaimRequest_(actor, 'PROCESSO_ENCAMINHAR_LEGADO|' + processId, context);
    autAssertExpectedVersion_(process, payload.expectedVersion || context && context.expectedVersion);
    autAssert_(!process.STATUS_TRAMITACAO,
      'Este processo já utiliza o fluxo AUTENTIKO 2.0. Use a ação específica da etapa atual.',
      'CONTROLLED_WORKFLOW_REQUIRED');
    var recipient = autFind_('USUARIOS', 'ID_USUARIO', String(payload.userId || ''));
    autAssert_(recipient && recipient.STATUS === 'ATIVO', 'O responsável selecionado não está disponível.', 'NOT_FOUND');
    autAssert_(recipient.PERFIL === sector.role, 'O responsável não pertence ao setor selecionado.');
    autAssert_(String(recipient.ID_USUARIO) !== String(process.ID_RESPONSAVEL) || String(process.SETOR_ATUAL) !== sector.value, 'O processo já está atribuído a esse responsável.');
    var processSheet = autSheet_('PROCESSOS');
    CacheService.getScriptCache().remove('AUT_HEADERS_' + processSheet.getSheetId());
    var headers = autHeaders_(processSheet);
    autAssert_(['SETOR_ATUAL', 'ENCAMINHADO_EM', 'ENCAMINHADO_POR'].every(function(header) {
      return headers.indexOf(header) >= 0;
    }), 'A estrutura de encaminhamento ainda não foi instalada. Execute a auditoria do sistema.', 'SETUP_REQUIRED');
    var now = autNow_();
    autUpdateRow_('PROCESSOS', process._row, {
      ID_RESPONSAVEL: recipient.ID_USUARIO,
      RESPONSAVEL: recipient.NOME,
      SETOR_ATUAL: sector.value,
      ENCAMINHADO_EM: now,
      ENCAMINHADO_POR: actor.NOME,
      ATUALIZADO_EM: now
    });
    var description = 'Processo encaminhado para ' + sector.label + ': ' + recipient.NOME;
    if (observation) description += '. Observação: ' + observation;
    autAppend_('ATUACOES', {
      ID_ATUACAO: autUuid_(), ID_PROCESSO: processId, TIPO: 'Encaminhamento',
      DESCRICAO: description, STATUS_ANTERIOR: process.STATUS, STATUS_NOVO: process.STATUS,
      USUARIO: actor.NOME, CRIADO_EM: now
    });
    autAudit_(actor, 'PROCESSO_ENCAMINHADO', 'PROCESSO', processId, {
      protocolo: process.PROTOCOLO,
      setorAnterior: process.SETOR_ATUAL || 'COMERCIAL',
      setorNovo: sector.value,
      idResponsavelAnterior: process.ID_RESPONSAVEL || '',
      idResponsavelNovo: recipient.ID_USUARIO,
      responsavelNovo: recipient.NOME,
      observacao: observation
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({
      forwarded: true,
      sector: sector.value,
      sectorLabel: sector.label,
      responsible: { id: recipient.ID_USUARIO, name: recipient.NOME, email: recipient.EMAIL },
      forwardedAt: now
    });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autAllowedStatus_(user, process, nextStatus) {
  if (String(process.STATUS) === String(nextStatus)) return false;
  if (user.PERFIL === 'DESENVOLVEDOR') return true;
  if (!autHasPermission_(user, 'PROCESSO_ANALISAR')) {
    return nextStatus === 'EM_ANALISE' && String(process.ID_CRIADOR) === String(user.ID_USUARIO) && ['PENDENTE', 'REPROVADO'].indexOf(process.STATUS) >= 0;
  }
  var flow = {
    PENDENTE: ['EM_ANALISE'],
    EM_ANALISE: ['APROVADO', 'REPROVADO', 'PENDENTE'],
    APROVADO: ['FINALIZADO', 'EM_ANALISE'],
    REPROVADO: ['PENDENTE', 'EM_ANALISE'],
    FINALIZADO: ['EM_ANALISE']
  };
  return (flow[process.STATUS] || []).indexOf(nextStatus) >= 0;
}

function apiAtualizarStatusProcesso(token, processId, nextStatus, observation, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token);
    lock.waitLock(30000);
    var process = autRequireProcess_(user, processId);
    autAssertProcessMutable_(process);
    autAssert_(!process.STATUS_TRAMITACAO,
      'A alteração livre de status foi desativada. Use a ação específica do fluxo hierárquico.',
      'CONTROLLED_WORKFLOW_REQUIRED');
    var requestKey = autClaimRequest_(user, 'STATUS_LEGADO|' + processId, context);
    autAssertExpectedVersion_(process, context && context.expectedVersion);
    autAssert_(AUTENTIKO.PROCESS_STATUS.indexOf(nextStatus) >= 0 && nextStatus !== 'EXCLUIDO', 'Status inválido.');
    autAssert_(String(observation || '').length <= 2000, 'A observação deve ter no máximo 2.000 caracteres.', 'FIELD_TOO_LARGE');
    autAssert_(autAllowedStatus_(user, process, nextStatus), 'Transição de status não permitida.', 'INVALID_TRANSITION');
    if (nextStatus === 'EM_ANALISE') {
      var missing = autRequiredDocumentStatus_(process).filter(function(doc) { return doc.required && !doc.uploaded; });
      autAssert_(!missing.length, 'Envie os documentos obrigatórios antes de encaminhar: ' + missing.map(function(doc) { return doc.name; }).join(', '), 'MISSING_DOCUMENTS');
      var missingGroups = autRequiredDocumentGroups_(process).filter(function(group) { return group.required && !group.uploaded; });
      autAssert_(!missingGroups.length, 'Envie ao menos um documento do grupo obrigatório: ' + missingGroups.map(function(group) { return group.name; }).join(', '), 'MISSING_DOCUMENTS');
    }
    var now = autNow_();
    var phaseMap = { PENDENTE: 'DOCUMENTACAO', EM_ANALISE: 'ANALISE', APROVADO: 'APROVACAO', REPROVADO: 'DOCUMENTACAO', FINALIZADO: 'FINALIZACAO' };
    autUpdateRow_('PROCESSOS', process._row, {
      STATUS: nextStatus, FASE: phaseMap[nextStatus] || process.FASE, ATUALIZADO_EM: now,
      FINALIZADO_EM: nextStatus === 'FINALIZADO' ? now : process.FINALIZADO_EM,
      VERSAO_REGISTRO: autProcessVersion_(process) + 1
    });
    autAppend_('ATUACOES', {
      ID_ATUACAO: autUuid_(), ID_PROCESSO: processId, TIPO: 'Alteração de status',
      DESCRICAO: String(observation || 'Status alterado'), STATUS_ANTERIOR: process.STATUS,
      STATUS_NOVO: nextStatus, USUARIO: user.NOME, CRIADO_EM: now
    });
    autAudit_(user, 'STATUS_PROCESSO_ALTERADO', 'PROCESSO', processId, { anterior: process.STATUS, novo: nextStatus, observacao: observation || '' }, context);
    autCommitRequest_(requestKey);
    return autResult_({ status: nextStatus, phase: phaseMap[nextStatus], version: autProcessVersion_(process) + 1 });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiAdicionarAtuacao(token, processId, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token, 'ATUACAO_CRIAR');
    payload = payload || {};
    autAssert_(String(payload.description || '').trim().length >= 3, 'Informe a descrição da atuação.');
    autAssert_(String(payload.description || '').length <= 5000, 'A descrição deve ter no máximo 5.000 caracteres.', 'FIELD_TOO_LARGE');
    autAssert_(String(payload.type || '').length <= 100, 'O tipo da atuação é muito extenso.', 'FIELD_TOO_LARGE');
    lock.waitLock(30000);
    var process = autRequireProcess_(user, processId);
    autAssertProcessMutable_(process);
    autAssert_(autCanActOnProcess_(user, process, 'ATUACAO_CRIAR'),
      'O processo não está sob sua responsabilidade atual.', 'NOT_CURRENT_RESPONSIBLE');
    var requestKey = autClaimRequest_(user, 'ATUACAO_CRIAR|' + processId, context);
    autAssertExpectedVersion_(process, payload.expectedVersion || context && context.expectedVersion);
    var id = autUuid_();
    autAppend_('ATUACOES', {
      ID_ATUACAO: id, ID_PROCESSO: processId, TIPO: payload.type || 'Observação',
      DESCRICAO: String(payload.description).trim(), STATUS_ANTERIOR: '', STATUS_NOVO: '',
      USUARIO: user.NOME, CRIADO_EM: autNow_()
    });
    autUpdateRow_('PROCESSOS', process._row, {
      VERSAO_REGISTRO: autProcessVersion_(process) + 1,
      ATUALIZADO_EM: autNow_()
    });
    autCommitRequest_(requestKey);
    autAudit_(user, 'ATUACAO_REGISTRADA', 'PROCESSO', processId, { idAtuacao: id, tipo: payload.type || 'Observação' }, context);
    return autResult_({ id: id, version: autProcessVersion_(process) + 1 });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiCriarPendencia(token, processId, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token, 'PENDENCIA_GERIR');
    payload = payload || {};
    autAssert_(String(payload.title || '').trim().length >= 3, 'Informe o título da pendência.');
    autAssert_(String(payload.title || '').length <= 200, 'O título deve ter no máximo 200 caracteres.', 'FIELD_TOO_LARGE');
    autAssert_(String(payload.description || '').length <= 5000, 'A descrição deve ter no máximo 5.000 caracteres.', 'FIELD_TOO_LARGE');
    autAssert_(String(payload.responsible || '').length <= 200, 'O responsável informado é muito extenso.', 'FIELD_TOO_LARGE');
    autAssert_(String(payload.dueDate || '').length <= 50, 'O prazo informado é inválido.', 'FIELD_TOO_LARGE');
    lock.waitLock(30000);
    var process = autRequireProcess_(user, processId);
    autAssertProcessMutable_(process);
    autAssert_(autCanActOnProcess_(user, process, 'PENDENCIA_GERIR'),
      'O processo não está sob sua responsabilidade atual.', 'NOT_CURRENT_RESPONSIBLE');
    var requestKey = autClaimRequest_(user, 'PENDENCIA_CRIAR|' + processId, context);
    autAssertExpectedVersion_(process, payload.expectedVersion || context && context.expectedVersion);
    var id = autUuid_();
    autAppend_('PENDENCIAS', {
      ID_PENDENCIA: id, ID_PROCESSO: processId, TITULO: String(payload.title).trim(),
      DESCRICAO: String(payload.description || '').trim(), STATUS: 'ABERTA',
      RESPONSAVEL: payload.responsible || process.RESPONSAVEL, PRAZO: payload.dueDate || '',
      CRIADO_POR: user.NOME, CRIADO_EM: autNow_(), CONCLUIDO_EM: ''
    });
    autUpdateRow_('PROCESSOS', process._row, {
      PENDENCIAS_QTD: Number(process.PENDENCIAS_QTD || 0) + 1,
      ATUALIZADO_EM: autNow_(),
      VERSAO_REGISTRO: autProcessVersion_(process) + 1
    });
    autAudit_(user, 'PENDENCIA_CRIADA', 'PROCESSO', processId, { idPendencia: id, titulo: payload.title }, context);
    autCommitRequest_(requestKey);
    return autResult_({ id: id, version: autProcessVersion_(process) + 1 });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiConcluirPendencia(token, pendingId, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token, 'PENDENCIA_GERIR');
    lock.waitLock(30000);
    var pending = autFind_('PENDENCIAS', 'ID_PENDENCIA', pendingId);
    autAssert_(pending, 'Pendência não encontrada.', 'NOT_FOUND');
    var process = autRequireProcess_(user, pending.ID_PROCESSO);
    autAssertProcessMutable_(process);
    autAssert_(autCanActOnProcess_(user, process, 'PENDENCIA_GERIR'),
      'O processo não está sob sua responsabilidade atual.', 'NOT_CURRENT_RESPONSIBLE');
    var requestKey = autClaimRequest_(user, 'PENDENCIA_CONCLUIR|' + process.ID_PROCESSO + '|' + pendingId, context);
    autAssertExpectedVersion_(process, context && context.expectedVersion);
    var acceptance = null;
    if (pending.STATUS !== 'CONCLUIDA') {
      acceptance = autCreateAcceptance_(user, process, {
        scopeType: 'PENDENCIA',
        scopeId: pending.ID_PENDENCIA,
        scopeVersion: pending.VERSAO_PROCESSO || autProcessVersion_(process),
        contentHash: autHash_([
          pending.ID_PENDENCIA, pending.TITULO, pending.DESCRICAO,
          pending.TIPO_ALVO, pending.ID_ALVO, pending.CRIADO_EM
        ].join('|')),
        decision: 'OK',
        text: 'Declaro que analisei a pendência ' + pending.TITULO +
          ' e confirmo que a correção foi concluída com sucesso.'
      }, context);
      autUpdateRow_('PENDENCIAS', pending._row, {
        STATUS: 'CONCLUIDA',
        CONCLUIDO_EM: acceptance.at,
        CONCLUIDO_POR: user.NOME,
        MOTIVO_CONCLUSAO: 'Correção analisada e confirmada com aceite eletrônico.'
      });
      autUpdateRow_('PROCESSOS', process._row, {
        PENDENCIAS_QTD: Math.max(Number(process.PENDENCIAS_QTD || 0) - 1, 0),
        ATUALIZADO_EM: autNow_(),
        VERSAO_REGISTRO: autProcessVersion_(process) + 1
      });
    }
    autAudit_(user, 'PENDENCIA_CONCLUIDA', 'PROCESSO', process.ID_PROCESSO, { idPendencia: pendingId }, context);
    autCommitRequest_(requestKey);
    return autResult_({
      completed: true,
      acceptanceId: acceptance && acceptance.id || '',
      version: pending.STATUS !== 'CONCLUIDA' ? autProcessVersion_(process) + 1 : autProcessVersion_(process)
    });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiReservarProcesso(token, processId, minutes, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token, 'PROCESSO_RESERVAR');
    lock.waitLock(30000);
    var process = autRequireProcess_(user, processId);
    autAssertProcessMutable_(process);
    var requestKey = autClaimRequest_(user, 'PROCESSO_RESERVAR|' + processId, context);
    autAssertExpectedVersion_(process, context && context.expectedVersion);
    var until = new Date(Date.now() + Math.min(Math.max(Number(minutes || 30), 5), 240) * 60 * 1000).toISOString();
    autUpdateRow_('PROCESSOS', process._row, {
      RESERVADO_POR: user.NOME, RESERVADO_ATE: until, ATUALIZADO_EM: autNow_(),
      VERSAO_REGISTRO: autProcessVersion_(process) + 1
    });
    autAudit_(user, 'PROCESSO_RESERVADO', 'PROCESSO', processId, { ate: until }, context);
    autCommitRequest_(requestKey);
    return autResult_({ reservedBy: user.NOME, reservedUntil: until, version: autProcessVersion_(process) + 1 });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiExcluirProcesso(token, processId, reason, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token, 'PROCESSO_EXCLUIR');
    lock.waitLock(30000);
    var process = autRequireProcess_(user, processId);
    autAssertProcessMutable_(process);
    var requestKey = autClaimRequest_(user, 'PROCESSO_EXCLUIR|' + processId, context);
    autAssertExpectedVersion_(process, context && context.expectedVersion);
    autAssert_(String(reason || '').trim().length >= 5, 'Informe o motivo da exclusão.');
    autAssert_(String(reason || '').length <= 2000, 'O motivo deve ter no máximo 2.000 caracteres.', 'FIELD_TOO_LARGE');
    autUpdateRow_('PROCESSOS', process._row, {
      STATUS: 'EXCLUIDO', EXCLUIDO_EM: autNow_(), ATUALIZADO_EM: autNow_(),
      VERSAO_REGISTRO: autProcessVersion_(process) + 1
    });
    autAudit_(user, 'PROCESSO_EXCLUIDO_LOGICAMENTE', 'PROCESSO', processId, { protocolo: process.PROTOCOLO, motivo: reason }, context);
    autCommitRequest_(requestKey);
    return autResult_({ deleted: true, version: autProcessVersion_(process) + 1 });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autProcessFolder_(protocol) {
  var properties = PropertiesService.getScriptProperties();
  var propertyKey = 'AUT_PROCESS_FOLDER_' + autHash_(String(protocol)).slice(0, 24);
  var storedId = properties.getProperty(propertyKey);
  if (storedId) {
    try { return DriveApp.getFolderById(storedId); }
    catch (err) { properties.deleteProperty(propertyKey); }
  }
  var root = autEnsureRootFolder_();
  var folders = root.getFoldersByName(String(protocol));
  var folder = folders.hasNext() ? folders.next() : root.createFolder(String(protocol));
  properties.setProperty(propertyKey, folder.getId());
  return folder;
}

function pdfDoc_previewEnabled_() {
  var configured = autConfigMap_().PDF_PREVIEW_ENABLED;
  return configured === true || autNormalize_(configured) === 'SIM' || autNormalize_(configured) === 'TRUE';
}

function pdfDoc_maxSizeMb_() {
  var configured = Number(autConfigMap_().MAX_PDF_SIZE_MB || AUTENTIKO.MAX_UPLOAD_MB);
  if (!isFinite(configured) || configured <= 0) configured = AUTENTIKO.MAX_UPLOAD_MB;
  return Math.max(1, Math.min(configured, AUTENTIKO.MAX_UPLOAD_MB));
}

function pdfDoc_sanitizeName_(value, fallback) {
  var original = String(value || fallback || 'documento');
  var pdfExtension = /\.pdf$/i.test(original);
  var name = original
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  if (pdfExtension) {
    var baseName = name.replace(/\.pdf$/i, '').replace(/\.+$/g, '').trim().slice(0, 146);
    return (baseName || 'documento') + '.pdf';
  }
  return name.slice(0, 150) || String(fallback || 'documento').slice(0, 150);
}

function pdfDoc_assertPdfName_(name) {
  var value = String(name || '').trim();
  autAssert_(value && value.length <= 200, 'O nome do PDF é inválido.', 'INVALID_FILE');
  autAssert_(/\.pdf$/i.test(value), 'O arquivo deve possuir a extensão .pdf.', 'INVALID_FILE');
  autAssert_(!/[\u0000-\u001f\u007f]/.test(value), 'O nome do PDF contém caracteres inválidos.', 'INVALID_FILE');
}

function pdfDoc_findDuplicate_(processId, hash, ignoredDocumentId) {
  if (!hash) return null;
  return autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', processId).filter(function(row) {
    return !row.EXCLUIDO_EM &&
      String(row.ID_DOCUMENTO || '') !== String(ignoredDocumentId || '') &&
      String(row.HASH_SHA256 || '').toLowerCase() === String(hash).toLowerCase();
  })[0] || null;
}

function pdfDoc_audit_(user, action, processId, details, context) {
  autAudit_(user, action, 'PROCESSO', processId || '', autCleanObject_(details || {}), context);
}

function pdfDoc_isPdfAttempt_(payload, blob) {
  var name = String(payload && payload.fileName || blob && blob.getName && blob.getName() || '');
  var mimeType = String(payload && payload.mimeType || blob && blob.getContentType && blob.getContentType() || '').toLowerCase();
  return mimeType === 'application/pdf' || /\.pdf$/i.test(name);
}

function pdfDoc_tryAuditFailure_(token, action, payload, err, context) {
  try {
    payload = payload || {};
    var document = payload.documentId ? autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', payload.documentId) : null;
    if (document && String(document.MIME_TYPE || '').toLowerCase() !== 'application/pdf') return;
    if (!document && !pdfDoc_isPdfAttempt_(payload, payload.blob) &&
        !(payload.documentId && action === 'PDF_ACESSO_NEGADO')) return;
    var user = autRequireAuth_(token);
    var processId = String(payload.processId || document && document.ID_PROCESSO || '');
    var deniedCodes = ['FORBIDDEN', 'NOT_CURRENT_RESPONSIBLE', 'AUTH_REQUIRED', 'SESSION_EXPIRED', 'USER_INACTIVE'];
    var finalAction = deniedCodes.indexOf(String(err && err.code || '')) >= 0 ? 'PDF_ACESSO_NEGADO' : action;
    pdfDoc_audit_(user, finalAction, processId, {
      idDocumento: String(payload.documentId || ''),
      nome: pdfDoc_sanitizeName_(payload.fileName || document && document.ARQUIVO_NOME || 'documento.pdf', 'documento.pdf'),
      tamanho: Number(payload.size || document && document.TAMANHO_BYTES || 0),
      resultado: 'FALHA',
      codigo: String(err && err.code || 'INTERNAL_ERROR'),
      mensagem: String(err && err.message || 'Operação não concluída.').slice(0, 300),
      origem: String(payload.origin || 'WEB_APP')
    }, context);
  } catch (ignoreAuditFailure) {
    console.warn('Não foi possível registrar a falha de PDF sem alterar o erro original: ' + ignoreAuditFailure.message);
  }
}

function pdfDoc_publicError_(err, operation) {
  if (err && err.code) return autPublicError_(err);
  console.error(err && err.stack ? err.stack : err);
  var messages = {
    UPLOAD: 'Não foi possível enviar o documento. Tente novamente.',
    PREVIEW: 'O navegador não conseguiu carregar a pré-visualização.',
    DOWNLOAD: 'Não foi possível baixar o documento. Tente novamente.',
    REMOVE: 'Não foi possível remover o documento. Tente novamente.'
  };
  return {
    ok: false,
    code: 'PDF_OPERATION_FAILED',
    message: messages[String(operation || '').toUpperCase()] || 'Não foi possível concluir a operação com o documento.'
  };
}

function pdfDoc_assertPreviewEnabled_(mimeType) {
  if (String(mimeType || '').toLowerCase() === 'application/pdf') {
    autAssert_(pdfDoc_previewEnabled_(),
      'A pré-visualização de PDF está temporariamente desativada. Use o download do documento.',
      'PREVIEW_DISABLED');
  }
}

function autStoreDocument_(token, payload, blob, context) {
  var lock = LockService.getScriptLock();
  var file = null;
  var committed = false;
  var requestKey = '';
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_ENVIAR');
    payload = payload || {};
    var processSnapshot = autRequireProcess_(user, payload.processId);
    autAssertProcessMutable_(processSnapshot);
    autAssert_(autCanManageProcessDocuments_(user, processSnapshot),
      'O processo não está sob sua responsabilidade atual para receber documentos.', 'NOT_CURRENT_RESPONSIBLE');
    var expectedUploadVersion = Number(payload.expectedVersion || context && context.expectedVersion);
    autAssert_(expectedUploadVersion > 0, 'A versão visualizada do processo não foi informada. Atualize a página.', 'PROCESS_VERSION_REQUIRED');
    autAssert_(expectedUploadVersion <= autProcessVersion_(processSnapshot),
      'A versão informada do processo é inválida. Atualize a página.', 'PROCESS_VERSION_CONFLICT');
    var catalog = autDocumentCatalog_().filter(function(doc) { return doc.id === payload.typeId; })[0];
    autAssert_(catalog, 'Tipo de documento inválido.');
    autAssert_(!catalog.processTypes.length || catalog.processTypes.indexOf(processSnapshot.TIPO_PROCESSO) >= 0, 'Documento não aplicável a este processo.');
    autAssert_(blob && typeof blob.getBytes === 'function', 'Arquivo não informado.');
    var mimeType = String(blob.getContentType() || payload.mimeType || 'application/octet-stream').toLowerCase();
    var allowed = String(catalog.mimeTypes || '').split(',').map(function(v) { return v.trim().toLowerCase(); }).filter(Boolean);
    if (allowed.some(function(value) { return value.indexOf('image/') === 0; })) {
      ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].forEach(function(value) {
        if (allowed.indexOf(value) < 0) allowed.push(value);
      });
    }
    autAssert_(!allowed.length || allowed.indexOf(mimeType) >= 0, 'Formato de arquivo não permitido.');
    var originalName = String(payload.fileName || blob.getName() || catalog.name);
    if (mimeType === 'application/pdf') pdfDoc_assertPdfName_(originalName);
    var bytes = blob.getBytes();
    autAssert_(bytes.length > 0, 'O arquivo selecionado está vazio.', 'INVALID_FILE');
    var effectiveMaxMb = mimeType === 'application/pdf'
      ? Math.min(Number(catalog.maxMb || AUTENTIKO.MAX_UPLOAD_MB), pdfDoc_maxSizeMb_())
      : Math.min(Number(catalog.maxMb || AUTENTIKO.MAX_UPLOAD_MB), AUTENTIKO.MAX_UPLOAD_MB);
    var maxBytes = effectiveMaxMb * 1024 * 1024;
    autAssert_(bytes.length <= maxBytes, 'Arquivo maior que o limite de ' + Math.round(maxBytes / 1024 / 1024) + ' MB.');
    if (mimeType === 'application/pdf') autAssert_(autHasPdfSignature_(bytes), 'O arquivo informado não é um PDF válido.', 'INVALID_FILE');
    var safeName = pdfDoc_sanitizeName_(originalName, mimeType === 'application/pdf' ? 'documento.pdf' : catalog.name);
    var hash = autHashBytes_(bytes);
    if (mimeType === 'application/pdf') {
      autAssert_(!pdfDoc_findDuplicate_(processSnapshot.ID_PROCESSO, hash, payload.replacesDocumentId),
        'Este PDF já está anexado ao processo.', 'DUPLICATE_DOCUMENT');
      pdfDoc_audit_(user, 'PDF_SELECIONADO', processSnapshot.ID_PROCESSO, {
        nome: safeName, tamanho: bytes.length, tipo: catalog.id, resultado: 'VALIDADO', origem: 'WEB_APP'
      }, context);
      pdfDoc_audit_(user, 'PDF_UPLOAD_INICIADO', processSnapshot.ID_PROCESSO, {
        nome: safeName, tamanho: bytes.length, tipo: catalog.id, hash: hash, resultado: 'INICIADO', origem: 'WEB_APP'
      }, context);
    }
    var folder = autWithScriptLock_(function() { return autProcessFolder_(processSnapshot.PROTOCOLO); });
    file = folder.createFile(blob.setName(safeName).setContentType(mimeType));
    lock.waitLock(30000);
    var process = autRequireProcess_(user, payload.processId);
    autAssertProcessMutable_(process);
    autAssert_(autCanManageProcessDocuments_(user, process),
      'O processo foi encaminhado para outro responsável durante o envio.', 'NOT_CURRENT_RESPONSIBLE');
    autAssert_(expectedUploadVersion <= autProcessVersion_(process),
      'A versão informada do processo é inválida. Atualize a página.', 'PROCESS_VERSION_CONFLICT');
    autAssert_(String(process.PROTOCOLO) === String(processSnapshot.PROTOCOLO), 'O processo foi alterado durante o envio. Tente novamente.', 'PROCESS_CHANGED');
    requestKey = autClaimRequest_(user, 'DOCUMENTO_ENVIAR|' + process.ID_PROCESSO, context);
    var existing = autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) { return row.ID_DOCUMENTO_TIPO === catalog.id && !row.EXCLUIDO_EM; });
    if (mimeType === 'application/pdf') {
      autAssert_(!pdfDoc_findDuplicate_(process.ID_PROCESSO, hash, payload.replacesDocumentId),
        'Este PDF já está anexado ao processo.', 'DUPLICATE_DOCUMENT');
    }
    var id = autUuid_();
    var now = autNow_();
    var replacement = payload.replacesDocumentId
      ? autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', payload.replacesDocumentId)
      : null;
    autAssert_(!replacement || String(replacement.ID_PROCESSO) === String(process.ID_PROCESSO),
      'O documento substituído não pertence a este processo.', 'INVALID_DOCUMENT_REPLACEMENT');
    autAppend_('PROCESSO_DOCUMENTOS', {
      ID_DOCUMENTO: id, ID_PROCESSO: process.ID_PROCESSO, PROTOCOLO: process.PROTOCOLO,
      ID_DOCUMENTO_TIPO: catalog.id, NOME_DOCUMENTO: catalog.name, ARQUIVO_ID: file.getId(),
      ARQUIVO_NOME: safeName, MIME_TYPE: mimeType, TAMANHO_BYTES: bytes.length,
      HASH_SHA256: hash, VERSAO: existing.length + 1,
      OBRIGATORIO: (catalog.requiredProcessTypes || (catalog.required ? catalog.processTypes : [])).indexOf(process.TIPO_PROCESSO) >= 0 ? 'SIM' : 'NAO',
      ENVIADO_POR: user.NOME, DISPOSITIVO_JSON: autJson_(autContext_(context).dispositivo),
      LOCALIZACAO_JSON: autJson_(autContext_(context).localizacao), CRIADO_EM: now, EXCLUIDO_EM: '',
      CATEGORIAS_JSON: autJson_(catalog.categories || []),
      STATUS_CONFERENCIA: 'PENDENTE_CONFERENCIA', CONFERIDO_EM: '', CONFERIDO_POR_ID: '',
      CONFERIDO_POR: '', PENDENCIADO_EM: '', PENDENCIADO_POR: '', MOTIVO_PENDENCIA: '',
      SUBSTITUIDO_POR: '', VERSAO_REGISTRO: 1, BLOQUEADO_EM: '',
      MEDIA_STATUS: 'DRIVE_ONLY', MEDIA_VERSAO: existing.length + 1,
      THUMBNAIL_STATUS: 'DRIVE_ONLY', PREVIEW_STATUS: 'DRIVE_ONLY',
      SYNC_DRIVE_SUPABASE: 'PENDENTE', MEDIA_ATUALIZADO_EM: now, MEDIA_ERRO_CODIGO: ''
    });
    if (replacement && !replacement.EXCLUIDO_EM) {
      autUpdateRow_('PROCESSO_DOCUMENTOS', replacement._row, {
        STATUS_CONFERENCIA: 'SUBSTITUIDO',
        SUBSTITUIDO_POR: id,
        VERSAO_REGISTRO: Number(replacement.VERSAO_REGISTRO || 1) + 1
      });
    }
    committed = true;
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, {
      ATUALIZADO_EM: now,
      FASE: process.FASE === 'CADASTRO' ? 'DOCUMENTACAO' : process.FASE,
      VERSAO_REGISTRO: nextVersion
    });
    autInvalidateProcessApprovals_(process.ID_PROCESSO,
      replacement ? 'Documento conferido substituído' : 'Novo documento anexado ao processo', context);
    autAudit_(user, 'DOCUMENTO_ENVIADO', 'PROCESSO', process.ID_PROCESSO, { idDocumento: id, tipo: catalog.id, nome: safeName, hash: hash }, context);
    if (mimeType === 'application/pdf') {
      pdfDoc_audit_(user, 'PDF_UPLOAD_CONCLUIDO', process.ID_PROCESSO, {
        idDocumento: id, nome: safeName, tamanho: bytes.length, tipo: catalog.id,
        hash: hash, versao: existing.length + 1, resultado: 'SUCESSO', origem: 'WEB_APP'
      }, context);
    }
    autCommitRequest_(requestKey);
    return { id: id, fileName: safeName, version: existing.length + 1, processVersion: nextVersion };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
    if (file && !committed) {
      try { file.setTrashed(true); }
      catch (cleanupError) { console.error('Falha ao remover arquivo de upload incompleto: ' + cleanupError.message); }
    }
  }
}

function apiUploadDocumentoForm(formPayload) {
  var context = {};
  try {
    formPayload = formPayload || {};
    var contextText = String(formPayload.contextJson || '');
    autAssert_(contextText.length <= 5000, 'O contexto do envio ultrapassa o limite permitido.', 'PAYLOAD_TOO_LARGE');
    context = autJsonParse_(contextText, {});
    return autResult_(autStoreDocument_(String(formPayload.token || ''), {
      processId: String(formPayload.processId || ''),
      typeId: String(formPayload.typeId || ''),
      fileName: formPayload.file && formPayload.file.getName ? formPayload.file.getName() : '',
      expectedVersion: Number(formPayload.expectedVersion || 0),
      replacesDocumentId: String(formPayload.replacesDocumentId || '')
    }, formPayload.file, context));
  } catch (err) {
    pdfDoc_tryAuditFailure_(String(formPayload && formPayload.token || ''), 'PDF_UPLOAD_FALHOU', {
      processId: String(formPayload && formPayload.processId || ''),
      fileName: formPayload && formPayload.file && formPayload.file.getName ? formPayload.file.getName() : '',
      size: 0,
      blob: formPayload && formPayload.file
    }, err, context);
    return pdfDoc_publicError_(err, 'UPLOAD');
  }
}

function apiUploadDocumento(token, payload, context) {
  try {
    payload = payload || {};
    var raw = String(payload.base64 || '').replace(/^data:[^;]+;base64,/, '');
    autAssert_(raw, 'Arquivo não informado.');
    var maxEncodedLength = Math.ceil(AUTENTIKO.MAX_UPLOAD_MB * 1024 * 1024 * 4 / 3) + 16;
    autAssert_(raw.length <= maxEncodedLength, 'O arquivo ultrapassa o limite máximo permitido.', 'PAYLOAD_TOO_LARGE');
    var blob = Utilities.newBlob(Utilities.base64Decode(raw), payload.mimeType || 'application/octet-stream', payload.fileName || 'arquivo');
    return autResult_(autStoreDocument_(token, payload, blob, context));
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_UPLOAD_FALHOU', payload, err, context);
    return pdfDoc_publicError_(err, 'UPLOAD');
  }
}

var AUT_DOCUMENT_CHUNK_BYTES = 384 * 1024;
var AUT_DOCUMENT_PREVIEW_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/avif'];

function autResolveStoredDocumentFile_(document) {
  var fileId = String(document && document.ARQUIVO_ID || '').trim();
  var primaryError = null;
  if (fileId) {
    try {
      var directFile = DriveApp.getFileById(fileId);
      if (!directFile.isTrashed()) return directFile;
      primaryError = new Error('O arquivo está na lixeira do Google Drive.');
    } catch (err) { primaryError = err; }
  }

  // Repara referências antigas ou substituídas procurando o mesmo arquivo na
  // pasta do protocolo. O hash impede associar um homônimo incorreto.
  try {
    var rootId = PropertiesService.getScriptProperties().getProperty('AUT_DOCUMENTS_FOLDER_ID');
    autAssert_(rootId, 'A pasta principal de documentos não está configurada.', 'DOCUMENT_FILE_UNAVAILABLE');
    var root = DriveApp.getFolderById(rootId);
    var folders = root.getFoldersByName(String(document.PROTOCOLO || ''));
    while (folders.hasNext()) {
      var matches = folders.next().getFilesByName(String(document.ARQUIVO_NOME || ''));
      while (matches.hasNext()) {
        var candidate = matches.next();
        if (candidate.isTrashed()) continue;
        if (!document.HASH_SHA256 || autHashBytes_(candidate.getBlob().getBytes()) === document.HASH_SHA256) {
          return candidate;
        }
      }
    }
  } catch (fallbackError) {
    console.warn('Falha na recuperação alternativa do documento ' + String(document.ID_DOCUMENTO || '') + ': ' + fallbackError.message);
  }

  var detail = primaryError && primaryError.message ? ' Detalhe: ' + primaryError.message : '';
  autAssert_(false,
    'O documento está registrado, mas o arquivo não está acessível na conta do Google Drive usada pela implantação.' +
    ' Compartilhe a pasta de documentos com a conta proprietária do Apps Script e tente novamente.' + detail,
    'DOCUMENT_FILE_UNAVAILABLE');
}

function autStoredDocumentBlob_(document) {
  var file = autResolveStoredDocumentFile_(document);
  var blob = file.getBlob();
  autAssert_(blob && typeof blob.getBytes === 'function', 'O arquivo do documento não pôde ser lido.', 'DOCUMENT_FILE_UNAVAILABLE');
  return { file: file, blob: blob };
}

function apiBaixarDocumento(token, documentId, context) {
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    autRequireProcess_(user, document.ID_PROCESSO);
    var blob = autStoredDocumentBlob_(document).blob;
    autAudit_(user, 'DOCUMENTO_BAIXADO', 'PROCESSO', document.ID_PROCESSO, { idDocumento: documentId }, context);
    if (String(document.MIME_TYPE || '').toLowerCase() === 'application/pdf') {
      pdfDoc_audit_(user, 'PDF_DOWNLOAD_REALIZADO', document.ID_PROCESSO, {
        idDocumento: documentId, nome: document.ARQUIVO_NOME,
        tamanho: Number(document.TAMANHO_BYTES || 0), resultado: 'SUCESSO', origem: 'WEB_APP'
      }, context);
    }
    return autResult_({ fileName: document.ARQUIVO_NOME, mimeType: document.MIME_TYPE, base64: Utilities.base64Encode(blob.getBytes()) });
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'DOWNLOAD' }, err, context);
    return pdfDoc_publicError_(err, 'DOWNLOAD');
  }
}

function apiMiniaturaDocumento(token, documentId, context) {
  var document = null;
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    autRequireProcess_(user, document.ID_PROCESSO);
    pdfDoc_assertPreviewEnabled_(document.MIME_TYPE);

    var cache = CacheService.getScriptCache();
    var cacheKey = 'AUT_THUMB_' + String(document.ID_DOCUMENTO) + '_' + String(document.VERSAO || 1);
    var cached = cache.get(cacheKey);
    if (cached) {
      try { return autResult_(JSON.parse(cached)); } catch (ignoreCachedThumbnail) {}
    }

    if (!document.ARQUIVO_ID && document.MEDIA_STATUS === 'READY') {
      return autResult_({
        available: false,
        fileName: document.ARQUIVO_NOME,
        sourceMimeType: String(document.MIME_TYPE || '').toLowerCase(),
        size: Number(document.TAMANHO_BYTES || 0),
        fallbackAllowed: true,
        errorCode: 'CLOUD_THUMBNAIL_REQUIRED',
        message: 'A miniatura está disponível na nuvem documental e será carregada diretamente pelo navegador.'
      });
    }

    var file = autResolveStoredDocumentFile_(document);
    var sourceMimeType = String(document.MIME_TYPE || (typeof file.getMimeType === 'function' ? file.getMimeType() : '') || '').toLowerCase();
    var thumbnail = null;
    try { thumbnail = file.getThumbnail(); } catch (ignoreThumbnailError) {}

    // O Drive pode demorar alguns segundos para gerar a miniatura de um arquivo
    // recém-enviado. Imagens pequenas continuam visualizáveis sem transferir
    // arquivos grandes para todos os cartões da galeria.
    if (!thumbnail && sourceMimeType.indexOf('image/') === 0 && Number(document.TAMANHO_BYTES || 0) <= 512 * 1024) {
      thumbnail = file.getBlob();
    }

    if (!thumbnail) {
      return autResult_({
        available: false,
        fileName: document.ARQUIVO_NOME,
        sourceMimeType: sourceMimeType,
        size: Number(document.TAMANHO_BYTES || 0),
        errorCode: 'THUMBNAIL_NOT_READY',
        message: 'O Google Drive ainda não gerou uma miniatura. Use “Gerar miniatura” para criar a prévia no navegador.'
      });
    }

    var bytes = thumbnail.getBytes();
    // CacheService aceita no máximo 100 KB por item. O envelope JSON e o Base64
    // aumentam o tamanho, portanto nenhuma miniatura acima de 90 KB atravessa
    // o Apps Script. O navegador cria uma versão local de até 80 KB sem alterar
    // o documento original.
    if (bytes.length > 90 * 1024) {
      return autResult_({
        available: false,
        fileName: document.ARQUIVO_NOME,
        sourceMimeType: sourceMimeType,
        thumbnailMimeType: String(thumbnail.getContentType() || 'image/jpeg').toLowerCase(),
        thumbnailSize: bytes.length,
        size: Number(document.TAMANHO_BYTES || 0),
        fallbackAllowed: true,
        errorCode: 'THUMBNAIL_TOO_LARGE',
        message: 'A miniatura do Drive é grande demais. O navegador criará uma prévia local segura.'
      });
    }
    var result = {
      available: true,
      fileName: document.ARQUIVO_NOME,
      sourceMimeType: sourceMimeType,
      mimeType: String(thumbnail.getContentType() || 'image/jpeg').toLowerCase(),
      size: bytes.length,
      base64: Utilities.base64Encode(bytes)
    };
    var serialized = JSON.stringify(result);
    if (serialized.length < 90 * 1024) {
      try { cache.put(cacheKey, serialized, 21600); } catch (ignoreCacheLimit) {}
    }
    return autResult_(result);
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'THUMBNAIL' }, err, context);
    if (err && err.code === 'DOCUMENT_FILE_UNAVAILABLE') {
      var deploymentAccount = '';
      try { deploymentAccount = Session.getEffectiveUser().getEmail(); } catch (ignoreEffectiveUser) {}
      return autResult_({
        available: false,
        fileName: document && document.ARQUIVO_NOME || '',
        sourceMimeType: String(document && document.MIME_TYPE || '').toLowerCase(),
        size: Number(document && document.TAMANHO_BYTES || 0),
        errorCode: 'DOCUMENT_FILE_UNAVAILABLE',
        message: 'O arquivo não está compartilhado com a conta que publicou esta versão do AUTENTIKO.',
        deploymentAccount: deploymentAccount
      });
    }
    return pdfDoc_publicError_(err, 'PREVIEW');
  }
}

function apiVisualizarDocumento(token, documentId, context) {
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    autRequireProcess_(user, document.ID_PROCESSO);
    pdfDoc_assertPreviewEnabled_(document.MIME_TYPE);
    var blob = autStoredDocumentBlob_(document).blob;
    var mimeType = String(document.MIME_TYPE || blob.getContentType() || '').toLowerCase();
    pdfDoc_assertPreviewEnabled_(mimeType);
    autAssert_(AUT_DOCUMENT_PREVIEW_MIME_TYPES.indexOf(mimeType) >= 0, 'Este formato não possui pré-visualização segura.', 'PREVIEW_UNAVAILABLE');
    var bytes = blob.getBytes();
    if (mimeType === 'application/pdf') autAssert_(autHasPdfSignature_(bytes), 'O PDF está corrompido ou possui formato inválido.', 'PREVIEW_UNAVAILABLE');
    autAssert_(bytes.length <= AUTENTIKO.MAX_UPLOAD_MB * 1024 * 1024, 'O documento ultrapassa o limite de pré-visualização.', 'PREVIEW_TOO_LARGE');
    autAudit_(user, 'DOCUMENTO_VISUALIZADO', 'PROCESSO', document.ID_PROCESSO, {
      idDocumento: documentId,
      nome: document.ARQUIVO_NOME,
      mimeType: mimeType
    }, context);
    if (mimeType === 'application/pdf') {
      pdfDoc_audit_(user, 'PDF_VISUALIZADO', document.ID_PROCESSO, {
        idDocumento: documentId, nome: document.ARQUIVO_NOME,
        tamanho: bytes.length, resultado: 'SUCESSO', origem: 'TRANSFERENCIA_LEGADA'
      }, context);
    }
    return autResult_({
      fileName: document.ARQUIVO_NOME,
      mimeType: mimeType,
      size: bytes.length,
      base64: Utilities.base64Encode(bytes)
    });
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'PREVIEW_LEGACY' }, err, context);
    return pdfDoc_publicError_(err, 'PREVIEW');
  }
}

function apiPrepararDocumento(token, documentId, context) {
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    autRequireProcess_(user, document.ID_PROCESSO);
    pdfDoc_assertPreviewEnabled_(document.MIME_TYPE);
    var stored = autStoredDocumentBlob_(document);
    var bytes = stored.blob.getBytes();
    var mimeType = String(document.MIME_TYPE || stored.blob.getContentType() || '').toLowerCase();
    pdfDoc_assertPreviewEnabled_(mimeType);
    autAssert_(AUT_DOCUMENT_PREVIEW_MIME_TYPES.indexOf(mimeType) >= 0,
      'Este formato não possui pré-visualização segura.', 'PREVIEW_UNAVAILABLE');
    if (mimeType === 'application/pdf') {
      autAssert_(autHasPdfSignature_(bytes), 'O PDF está corrompido ou possui formato inválido.', 'PREVIEW_UNAVAILABLE');
    }
    autAssert_(bytes.length > 0, 'O arquivo está vazio ou indisponível.', 'DOCUMENT_FILE_UNAVAILABLE');
    autAssert_(bytes.length <= AUTENTIKO.MAX_UPLOAD_MB * 1024 * 1024,
      'O documento ultrapassa o limite de pré-visualização.', 'PREVIEW_TOO_LARGE');
    autAudit_(user, 'DOCUMENTO_VISUALIZADO', 'PROCESSO', document.ID_PROCESSO, {
      idDocumento: documentId,
      nome: document.ARQUIVO_NOME,
      mimeType: mimeType,
      transferencia: 'BLOCOS'
    }, context);
    if (mimeType === 'application/pdf') {
      pdfDoc_audit_(user, 'PDF_VISUALIZADO', document.ID_PROCESSO, {
        idDocumento: documentId, nome: document.ARQUIVO_NOME,
        tamanho: bytes.length, resultado: 'SUCESSO', origem: 'TRANSFERENCIA_BLOCOS'
      }, context);
    }
    return autResult_({
      fileName: document.ARQUIVO_NOME,
      documentName: document.NOME_DOCUMENTO,
      mimeType: mimeType,
      size: bytes.length,
      chunkBytes: AUT_DOCUMENT_CHUNK_BYTES,
      totalChunks: Math.ceil(bytes.length / AUT_DOCUMENT_CHUNK_BYTES),
      hash: document.HASH_SHA256 || ''
    });
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'PREVIEW_CHUNKS' }, err, context);
    return pdfDoc_publicError_(err, 'PREVIEW');
  }
}

function apiLerChunkDocumento(token, documentId, chunkIndex) {
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    autRequireProcess_(user, document.ID_PROCESSO);
    pdfDoc_assertPreviewEnabled_(document.MIME_TYPE);
    var index = Number(chunkIndex);
    autAssert_(isFinite(index) && index >= 0 && Math.floor(index) === index,
      'Bloco de documento inválido.', 'VALIDATION_ERROR');
    var stored = autStoredDocumentBlob_(document);
    var bytes = stored.blob.getBytes();
    var totalChunks = Math.ceil(bytes.length / AUT_DOCUMENT_CHUNK_BYTES);
    autAssert_(index < totalChunks, 'Bloco de documento inexistente.', 'NOT_FOUND');
    var start = index * AUT_DOCUMENT_CHUNK_BYTES;
    var end = Math.min(start + AUT_DOCUMENT_CHUNK_BYTES, bytes.length);
    return autResult_({
      index: index,
      totalChunks: totalChunks,
      size: bytes.length,
      base64: Utilities.base64Encode(bytes.slice(start, end))
    });
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'PREVIEW_CHUNK' }, err, null);
    return pdfDoc_publicError_(err, 'PREVIEW');
  }
}

function apiRegistrarAcessoDocumentoCache(token, documentId, usage, context) {
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    autRequireProcess_(user, document.ID_PROCESSO);
    var isDownload = String(usage || '').toUpperCase() === 'DOWNLOAD';
    if (!isDownload) pdfDoc_assertPreviewEnabled_(document.MIME_TYPE);
    var action = isDownload ? 'DOCUMENTO_BAIXADO' : 'DOCUMENTO_VISUALIZADO';
    autAudit_(user, action, 'PROCESSO', document.ID_PROCESSO, {
      idDocumento: documentId,
      nome: document.ARQUIVO_NOME,
      mimeType: document.MIME_TYPE,
      origem: 'CACHE_NAVEGADOR'
    }, context);
    if (String(document.MIME_TYPE || '').toLowerCase() === 'application/pdf') {
      pdfDoc_audit_(user, isDownload ? 'PDF_DOWNLOAD_REALIZADO' : 'PDF_VISUALIZADO', document.ID_PROCESSO, {
        idDocumento: documentId, nome: document.ARQUIVO_NOME,
        tamanho: Number(document.TAMANHO_BYTES || 0), resultado: 'SUCESSO',
        origem: isDownload ? 'CACHE_NAVEGADOR_DOWNLOAD' : 'CACHE_NAVEGADOR_PREVIEW'
      }, context);
    }
    return autResult_({ registered: true });
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'CACHE_NAVEGADOR' }, err, context);
    return pdfDoc_publicError_(err, isDownload ? 'DOWNLOAD' : 'PREVIEW');
  }
}

function autHasPdfSignature_(bytes) {
  var max = Math.min((bytes || []).length, 1024);
  var signature = '';
  for (var index = 0; index < max; index++) signature += String.fromCharCode((Number(bytes[index]) + 256) % 256);
  return signature.indexOf('%PDF-') >= 0;
}

function apiExcluirDocumento(token, documentId, context) {
  var lock = LockService.getScriptLock();
  try {
    var user = autRequireAuth_(token);
    lock.waitLock(30000);
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
    var process = autRequireProcess_(user, document.ID_PROCESSO);
    autAssertProcessMutable_(process);
    autAssert_(autCanManageProcessDocuments_(user, process),
      'O processo não está sob sua responsabilidade atual para remover documentos.', 'NOT_CURRENT_RESPONSIBLE');
    var requestKey = autClaimRequest_(user, 'DOCUMENTO_EXCLUIR|' + process.ID_PROCESSO + '|' + documentId, context);
    autAssertExpectedVersion_(process, context && context.expectedVersion);
    var own = autNormalize_(document.ENVIADO_POR) === autNormalize_(user.NOME);
    autAssert_(own || autHasPermission_(user, 'DOCUMENTO_EXCLUIR'), 'Você não pode excluir este documento.', 'FORBIDDEN');
    autUpdateRow_('PROCESSO_DOCUMENTOS', document._row, {
      EXCLUIDO_EM: autNow_(),
      STATUS_CONFERENCIA: 'SUBSTITUIDO',
      VERSAO_REGISTRO: Number(document.VERSAO_REGISTRO || 1) + 1
    });
    autUpdateRow_('PROCESSOS', process._row, {
      ATUALIZADO_EM: autNow_(),
      VERSAO_REGISTRO: autProcessVersion_(process) + 1
    });
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Documento removido logicamente do processo', context);
    autAudit_(user, 'DOCUMENTO_EXCLUIDO', 'PROCESSO', document.ID_PROCESSO, { idDocumento: documentId, nome: document.ARQUIVO_NOME }, context);
    if (String(document.MIME_TYPE || '').toLowerCase() === 'application/pdf') {
      pdfDoc_audit_(user, 'PDF_REMOVIDO', document.ID_PROCESSO, {
        idDocumento: documentId, nome: document.ARQUIVO_NOME,
        tamanho: Number(document.TAMANHO_BYTES || 0), resultado: 'SUCESSO', origem: 'WEB_APP'
      }, context);
    }
    autCommitRequest_(requestKey);
    return autResult_({ deleted: true, version: autProcessVersion_(process) + 1 });
  } catch (err) {
    pdfDoc_tryAuditFailure_(token, 'PDF_ACESSO_NEGADO', { documentId: documentId, origin: 'REMOVE' }, err, context);
    return pdfDoc_publicError_(err, 'REMOVE');
  }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}
