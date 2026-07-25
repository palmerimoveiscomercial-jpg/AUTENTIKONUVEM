function autSeedContractModels_() {
  var titles = {
    VENDA: 'Contrato de Intenção de Compra e Venda — Proposta de Venda',
    COMPRA_IMOVEL: 'Contrato de Intenção de Compra e Venda — Proposta de Compra',
    ALUGUEL_ANUAL: 'Contrato de Intenção de Locação Anual',
    ALUGUEL_SEMESTRAL: 'Contrato de Intenção de Locação Semestral',
    ALUGUEL_TEMPORADA: 'Contrato de Intenção de Locação por Temporada'
  };
  var existing = {};
  autRows_('MODELOS_CONTRATO').forEach(function(row) { existing[row.TIPO_PROPOSTA] = row; });
  var now = autNow_();
  Object.keys(titles).forEach(function(type) {
    if (existing[type]) return;
    var modelId = 'MODELO_' + type;
    autAppend_('MODELOS_CONTRATO', {
      ID_MODELO: modelId, TIPO_PROPOSTA: type, NOME_MODELO: autLabel_(type),
      TITULO_CONTRATO: titles[type], VERSAO: 1, STATUS_JURIDICO: 'EM_REVISAO_JURIDICA',
      MARCA_DAGUA: 'PALMER IMÓVEIS', ATIVO: 'SIM', CRIADO_EM: now,
      ATUALIZADO_EM: now, ATUALIZADO_POR: 'SETUP'
    });
    var clauses = [
      ['OBJETO', 'Objeto e finalidade', 'As partes registram sua intenção de realizar o negócio descrito neste instrumento, conforme os dados do imóvel e da proposta aceita.'],
      ['VALORES', 'Valores e condições', 'Os valores, prazos e condições válidos são os indicados na proposta comercial vinculada e em suas condições numeradas.'],
      ['DOCUMENTOS', 'Documentos e informações', 'As partes declaram que forneceram informações verdadeiras e se comprometem a apresentar os documentos necessários à formalização definitiva.'],
      ['BOA_FE', 'Boa-fé e comunicação', 'As partes atuarão com clareza e boa-fé, comunicando por escrito qualquer informação que possa alterar a negociação.'],
      ['DADOS', 'Proteção de dados', 'Os dados pessoais serão utilizados para análise, formalização, execução e auditoria do negócio, observadas as regras aplicáveis de proteção de dados.'],
      ['ASSINATURAS', 'Aceite e assinaturas', 'O instrumento será assinado pelas partes identificadas e por, no mínimo, duas testemunhas.']
    ];
    autAppendMany_('CLAUSULAS_CONTRATO', clauses.map(function(clause, index) {
      return {
        ID_CLAUSULA: modelId + '_' + clause[0], ID_MODELO: modelId, ORDEM: (index + 1) * 10,
        TITULO: clause[1], TEXTO: clause[2], ATIVO: 'SIM', VERSAO: 1,
        STATUS_JURIDICO: 'EM_REVISAO_JURIDICA', CRIADO_EM: now,
        ATUALIZADO_EM: now, ATUALIZADO_POR: 'SETUP'
      };
    }));
  });
}

function autParticipantRoles_(row) {
  var roles = autJsonParse_(row && row.PAPEIS_JSON, []);
  return Array.isArray(roles) ? roles : [];
}

function autParticipantPublic_(row) {
  return {
    id: row.ID_PARTICIPANTE,
    processId: row.ID_PROCESSO,
    personType: row.TIPO_PESSOA,
    roles: autParticipantRoles_(row),
    name: row.NOME_RAZAO_SOCIAL,
    tradeName: row.NOME_FANTASIA,
    document: String(row.TIPO_PESSOA) === 'PJ' ? autFormatCnpj_(row.CPF_CNPJ) : autFormatCpf_(row.CPF_CNPJ),
    rawDocument: row.CPF_CNPJ,
    rgIe: row.RG_IE,
    issuer: row.ORGAO_EXPEDIDOR,
    birthOpening: row.DATA_NASCIMENTO_ABERTURA,
    nationality: row.NACIONALIDADE,
    maritalStatus: row.ESTADO_CIVIL,
    propertyRegime: row.REGIME_BENS,
    profession: row.PROFISSAO,
    income: Number(row.RENDA || 0),
    employer: row.EMPRESA_TRABALHO,
    job: row.CARGO_FUNCAO,
    email: row.EMAIL,
    phone: row.TELEFONE,
    address: autJsonParse_(row.ENDERECO_JSON, {}),
    legalRepresentative: row.REPRESENTANTE_LEGAL,
    data: autJsonParse_(row.DADOS_JSON, {}),
    order: Number(row.ORDEM || 0),
    active: String(row.ATIVO) !== 'NAO',
    version: Number(row.VERSAO_REGISTRO || 1),
    createdAt: row.CRIADO_EM,
    createdBy: row.CRIADO_POR,
    updatedAt: row.ATUALIZADO_EM,
    updatedBy: row.ATUALIZADO_POR
  };
}

function autPrimaryClientRole_(processType) {
  if (/^ALUGUEL_/.test(String(processType || ''))) return 'LOCATARIO';
  if (/^COMPRA_/.test(String(processType || '')) || String(processType) === 'IMOVEL_NA_PLANTA') return 'COMPRADOR';
  return 'SIGNATARIO';
}

function autParticipantFromProcessData_(process, data, prefix, roles, actor, order) {
  var name = prefix === 'cliente' ? (data.cliente_nome || process.CLIENTE_NOME) : (data.titular_nome || process.TITULAR_NOME);
  if (!String(name || '').trim()) return null;
  var cpf = prefix === 'cliente' ? (data.cliente_cpf || process.CLIENTE_CPF) : (data.titular_cpf || data.proprietario_cpf || '');
  var address = {
    street: data[prefix + '_rua'] || '',
    number: data[prefix + '_numero'] || '',
    district: data[prefix + '_bairro'] || '',
    complement: data[prefix + '_complemento'] || '',
    city: data[prefix + '_cidade'] || '',
    state: data[prefix + '_estado'] || '',
    zip: data[prefix + '_cep'] || ''
  };
  var now = autNow_();
  return {
    ID_PARTICIPANTE: autUuid_(), ID_PROCESSO: process.ID_PROCESSO, TIPO_PESSOA: 'PF',
    PAPEIS_JSON: autJson_(roles), NOME_RAZAO_SOCIAL: String(name).trim(), NOME_FANTASIA: '',
    CPF_CNPJ: autDigits_(cpf), RG_IE: data[prefix + '_documento'] || '',
    ORGAO_EXPEDIDOR: data[prefix + '_orgao_expedidor'] || '',
    DATA_NASCIMENTO_ABERTURA: data[prefix + '_nascimento'] || '',
    NACIONALIDADE: data[prefix + '_nacionalidade'] || 'Brasileira',
    ESTADO_CIVIL: data[prefix + '_estado_civil'] || '', REGIME_BENS: data[prefix + '_regime_bens'] || '',
    PROFISSAO: data[prefix + '_profissao'] || '', RENDA: Number(data[prefix + '_renda_numero'] || 0),
    EMPRESA_TRABALHO: data[prefix + '_empresa_trabalho'] || '', CARGO_FUNCAO: data[prefix + '_cargo_funcao'] || '',
    EMAIL: data[prefix + '_email'] || (prefix === 'cliente' ? process.CLIENTE_EMAIL : ''),
    TELEFONE: data[prefix + '_contato'] || (prefix === 'cliente' ? process.CLIENTE_CONTATO : ''),
    ENDERECO_JSON: autJson_(address), REPRESENTANTE_LEGAL: '', DADOS_JSON: autJson_({ origem: 'FICHA_CADASTRAL' }),
    ORDEM: order, ATIVO: 'SIM', VERSAO_REGISTRO: 1, CRIADO_EM: now,
    CRIADO_POR: actor && actor.NOME || 'MIGRACAO_V2', ATUALIZADO_EM: now,
    ATUALIZADO_POR: actor && actor.NOME || 'MIGRACAO_V2'
  };
}

function autBootstrapParticipantsFromProcess_(process, actor) {
  if (!process || !process.ID_PROCESSO || autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO).some(function(row) {
    return String(row.ATIVO) !== 'NAO';
  })) return;
  var data = typeof autProcessDataMap_ === 'function' ? autProcessDataMap_(process) : autJsonParse_(process.DADOS_JSON, {});
  var rows = [];
  var client = autParticipantFromProcessData_(process, data, 'cliente', [autPrimaryClientRole_(process.TIPO_PROCESSO)], actor, 10);
  var owner = autParticipantFromProcessData_(process, data, 'titular', ['PROPRIETARIO'], actor, 20);
  if (client) rows.push(client);
  if (owner && (!client || autDigits_(owner.CPF_CNPJ) !== autDigits_(client.CPF_CNPJ) || !owner.CPF_CNPJ)) rows.push(owner);
  if (rows.length) autAppendMany_('PROCESSO_PARTICIPANTES', rows);
}

function autParticipantCompleteness_(processId) {
  var rows = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', processId).filter(function(row) {
    return String(row.ATIVO) !== 'NAO';
  });
  var errors = [];
  if (!rows.length) errors.push('Adicione ao menos um participante ao processo.');
  rows.forEach(function(row) {
    var label = row.NOME_RAZAO_SOCIAL || 'Participante';
    if (!String(row.NOME_RAZAO_SOCIAL || '').trim()) errors.push(label + ': nome ou razão social não informado.');
    var document = autDigits_(row.CPF_CNPJ);
    if (String(row.TIPO_PESSOA) === 'PJ') {
      if (!autValidateCnpj_(document)) errors.push(label + ': CNPJ inválido.');
      if (!String(row.REPRESENTANTE_LEGAL || '').trim()) errors.push(label + ': representante legal não informado.');
    } else if (!autCpfValido_(document)) errors.push(label + ': CPF inválido.');
    if (!autParticipantRoles_(row).length) errors.push(label + ': papel no processo não informado.');
    if (!String(row.EMAIL || '').trim() && !String(row.TELEFONE || '').trim()) errors.push(label + ': informe e-mail ou telefone.');
  });
  return { ready: errors.length === 0, errors: errors, count: rows.length };
}

function apiListarParticipantesProcesso(token, processId) {
  try {
    var actor = autRequireAuth_(token);
    var process = autRequireProcess_(actor, processId);
    return autResult_({
      items: autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO)
        .filter(function(row) { return String(row.ATIVO) !== 'NAO'; })
        .map(autParticipantPublic_)
        .sort(function(a, b) { return a.order - b.order || a.name.localeCompare(b.name); }),
      completeness: autParticipantCompleteness_(process.ID_PROCESSO)
    });
  } catch (err) { return autPublicError_(err); }
}

function autNormalizeParticipantPayload_(payload) {
  var type = String(payload.personType || 'PF').toUpperCase();
  autAssert_(['PF', 'PJ'].indexOf(type) >= 0, 'Tipo de pessoa inválido.');
  var roles = Array.isArray(payload.roles) ? Array.from(new Set(payload.roles.map(function(role) {
    return String(role || '').toUpperCase();
  }).filter(function(role) { return AUTENTIKO.PARTICIPANT_ROLES.indexOf(role) >= 0; }))) : [];
  autAssert_(roles.length > 0, 'Selecione ao menos um papel para o participante.');
  var name = String(payload.name || '').trim();
  autAssert_(name.length >= 3 && name.length <= 200, 'Informe um nome ou razão social válido.');
  var document = autDigits_(payload.document);
  autAssert_(type === 'PJ' ? autValidateCnpj_(document) : autCpfValido_(document),
    type === 'PJ' ? 'CNPJ inválido.' : 'CPF inválido.', type === 'PJ' ? 'INVALID_CNPJ' : 'INVALID_CPF');
  var email = autNormalizeEmail_(payload.email);
  if (email) autAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'E-mail inválido.', 'INVALID_EMAIL');
  if (type === 'PJ') autAssert_(String(payload.legalRepresentative || '').trim().length >= 3, 'Informe o representante legal da pessoa jurídica.');
  var address = payload.address && typeof payload.address === 'object' ? payload.address : {};
  var data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  autAssert_(autJson_(address).length <= 10000 && autJson_(data).length <= 20000, 'Os dados do participante ultrapassam o limite permitido.', 'PAYLOAD_TOO_LARGE');
  return {
    type: type, roles: roles, name: name, document: document, email: email,
    tradeName: String(payload.tradeName || '').trim().slice(0, 200),
    rgIe: String(payload.rgIe || '').trim().slice(0, 100),
    issuer: String(payload.issuer || '').trim().slice(0, 100),
    birthOpening: String(payload.birthOpening || '').trim().slice(0, 50),
    nationality: String(payload.nationality || '').trim().slice(0, 100),
    maritalStatus: String(payload.maritalStatus || '').trim().slice(0, 100),
    propertyRegime: String(payload.propertyRegime || '').trim().slice(0, 100),
    profession: String(payload.profession || '').trim().slice(0, 150),
    income: Number(payload.income || 0),
    employer: String(payload.employer || '').trim().slice(0, 200),
    job: String(payload.job || '').trim().slice(0, 150),
    phone: String(payload.phone || '').trim().slice(0, 100),
    address: address,
    legalRepresentative: String(payload.legalRepresentative || '').trim().slice(0, 200),
    data: data,
    order: Number(payload.order || 999)
  };
}

function apiSalvarParticipante(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token);
    payload = payload || {};
    var normalized = autNormalizeParticipantPayload_(payload);
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    var requestKey = autClaimRequest_(actor, 'SALVAR_PARTICIPANTE|' + process.ID_PROCESSO + '|' + String(payload.id || normalized.document), context);
    autAssert_(autCanEditProcessRegistration_(actor, process), 'Você não pode alterar participantes deste processo.', 'FORBIDDEN');
    var existing = payload.id ? autFind_('PROCESSO_PARTICIPANTES', 'ID_PARTICIPANTE', payload.id) : null;
    if (existing) autAssert_(String(existing.ID_PROCESSO) === String(process.ID_PROCESSO), 'Participante inválido.', 'NOT_FOUND');
    var duplicate = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return String(row.ATIVO) !== 'NAO' && autDigits_(row.CPF_CNPJ) === normalized.document &&
        (!existing || String(row.ID_PARTICIPANTE) !== String(existing.ID_PARTICIPANTE));
    })[0];
    if (duplicate) {
      normalized.roles = Array.from(new Set(autParticipantRoles_(duplicate).concat(normalized.roles)));
      existing = duplicate;
    }
    var now = autNow_();
    var id = existing ? existing.ID_PARTICIPANTE : autUuid_();
    var row = {
      ID_PARTICIPANTE: id, ID_PROCESSO: process.ID_PROCESSO, TIPO_PESSOA: normalized.type,
      PAPEIS_JSON: autJson_(normalized.roles), NOME_RAZAO_SOCIAL: normalized.name,
      NOME_FANTASIA: normalized.tradeName, CPF_CNPJ: normalized.document, RG_IE: normalized.rgIe,
      ORGAO_EXPEDIDOR: normalized.issuer, DATA_NASCIMENTO_ABERTURA: normalized.birthOpening,
      NACIONALIDADE: normalized.nationality, ESTADO_CIVIL: normalized.maritalStatus,
      REGIME_BENS: normalized.propertyRegime, PROFISSAO: normalized.profession,
      RENDA: normalized.income, EMPRESA_TRABALHO: normalized.employer, CARGO_FUNCAO: normalized.job,
      EMAIL: normalized.email, TELEFONE: normalized.phone, ENDERECO_JSON: autJson_(normalized.address),
      REPRESENTANTE_LEGAL: normalized.legalRepresentative, DADOS_JSON: autJson_(normalized.data),
      ORDEM: normalized.order, ATIVO: 'SIM',
      VERSAO_REGISTRO: existing ? Number(existing.VERSAO_REGISTRO || 1) + 1 : 1,
      CRIADO_EM: existing ? existing.CRIADO_EM : now, CRIADO_POR: existing ? existing.CRIADO_POR : actor.NOME,
      ATUALIZADO_EM: now, ATUALIZADO_POR: actor.NOME
    };
    if (existing) autUpdateRow_('PROCESSO_PARTICIPANTES', existing._row, row);
    else autAppend_('PROCESSO_PARTICIPANTES', row);
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Dados de participante alterados.', context);
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: now });
    autAudit_(actor, existing ? 'PARTICIPANTE_ATUALIZADO' : 'PARTICIPANTE_ADICIONADO', 'PROCESSO', process.ID_PROCESSO, {
      idParticipante: id, tipoPessoa: normalized.type, papeis: normalized.roles,
      documentoHash: autHash_(normalized.document)
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({ id: id, merged: !!duplicate, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiDesativarParticipante(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token);
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    var requestKey = autClaimRequest_(actor, 'DESATIVAR_PARTICIPANTE|' + process.ID_PROCESSO + '|' + String(payload.participantId || ''), context);
    autAssert_(autCanEditProcessRegistration_(actor, process), 'Você não pode remover participantes deste processo.', 'FORBIDDEN');
    var participant = autFind_('PROCESSO_PARTICIPANTES', 'ID_PARTICIPANTE', payload.participantId);
    autAssert_(participant && String(participant.ID_PROCESSO) === String(process.ID_PROCESSO), 'Participante não encontrado.', 'NOT_FOUND');
    autAssert_(!autAcceptedProposal_(process.ID_PROCESSO), 'Crie uma nova revisão da proposta antes de remover uma parte já vinculada.', 'PARTICIPANT_IN_USE');
    autUpdateRow_('PROCESSO_PARTICIPANTES', participant._row, {
      ATIVO: 'NAO', VERSAO_REGISTRO: Number(participant.VERSAO_REGISTRO || 1) + 1,
      ATUALIZADO_EM: autNow_(), ATUALIZADO_POR: actor.NOME
    });
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Participante removido.', context);
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autAudit_(actor, 'PARTICIPANTE_DESATIVADO', 'PROCESSO', process.ID_PROCESSO, { idParticipante: participant.ID_PARTICIPANTE }, context);
    autCommitRequest_(requestKey);
    return autResult_({ disabled: true, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autMoney_(value) {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  var text = String(value || '').replace(/[^\d,.-]/g, '').trim();
  if (!text) return 0;
  if (text.indexOf(',') >= 0) text = text.replace(/\./g, '').replace(',', '.');
  var number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function autProposalPublic_(row) {
  return {
    id: row.ID_PROPOSTA, processId: row.ID_PROCESSO, number: row.NUMERO_PROPOSTA,
    type: row.TIPO_PROPOSTA, typeLabel: autLabel_(row.TIPO_PROPOSTA), revision: Number(row.REVISAO || 1),
    status: row.STATUS, initialValue: Number(row.VALOR_INICIAL || 0),
    proposedValue: Number(row.VALOR_PROPOSTO || 0), negotiatedValue: Number(row.VALOR_NEGOCIADO || 0),
    acceptedValue: Number(row.VALOR_ACEITO || 0), offerorId: row.ID_PARTICIPANTE_OFERTANTE,
    recipientId: row.ID_PARTICIPANTE_DESTINATARIO, evidenceDocumentId: row.ID_DOCUMENTO_EVIDENCIA,
    observations: row.OBSERVACOES, snapshotHash: row.HASH_SNAPSHOT,
    processVersion: Number(row.VERSAO_PROCESSO || 1), createdAt: row.CRIADO_EM,
    createdBy: row.CRIADO_POR, sentAt: row.ENVIADO_EM, acceptedAt: row.ACEITO_EM,
    acceptedBy: row.ACEITO_POR, substitutedAt: row.SUBSTITUIDO_EM,
    conditions: autRowsBy_('PROPOSTA_CONDICOES', 'ID_PROPOSTA', row.ID_PROPOSTA)
      .sort(function(a, b) { return Number(a.ORDEM || 0) - Number(b.ORDEM || 0); })
      .map(function(condition) {
        return { id: condition.ID_CONDICAO, order: Number(condition.ORDEM || 0), type: condition.TIPO_CONDICAO, details: condition.DETALHES };
      })
  };
}

function autAcceptedProposal_(processId) {
  var rows = autRowsBy_('PROPOSTAS', 'ID_PROCESSO', processId).filter(function(row) {
    return String(row.STATUS) === 'ACEITA' && !row.SUBSTITUIDO_EM;
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function apiListarPropostasProcesso(token, processId) {
  try {
    var actor = autRequireAuth_(token);
    var process = autRequireProcess_(actor, processId);
    var items = autRowsBy_('PROPOSTAS', 'ID_PROCESSO', process.ID_PROCESSO).map(autProposalPublic_)
      .sort(function(a, b) { return b.revision - a.revision; });
    return autResult_({ items: items, acceptedId: (autAcceptedProposal_(process.ID_PROCESSO) || {}).ID_PROPOSTA || '' });
  } catch (err) { return autPublicError_(err); }
}

function autProposalSnapshot_(process, values, conditions) {
  var participants = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO)
    .filter(function(row) { return String(row.ATIVO) !== 'NAO'; })
    .map(function(row) { return [row.ID_PARTICIPANTE, row.PAPEIS_JSON, row.NOME_RAZAO_SOCIAL, row.CPF_CNPJ, row.VERSAO_REGISTRO]; })
    .sort();
  return autHash_(autJson_({
    process: [process.ID_PROCESSO, process.PROTOCOLO, process.TIPO_PROCESSO, process.VERSAO_REGISTRO],
    participants: participants, values: values, conditions: conditions
  }));
}

function apiSalvarRevisaoProposta(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PROPOSTA_GERIR');
    payload = payload || {};
    var type = String(payload.type || '');
    autAssert_(AUTENTIKO.PROPOSAL_TYPES.indexOf(type) >= 0, 'Tipo de proposta inválido.');
    var conditions = Array.isArray(payload.conditions) ? payload.conditions.filter(function(item) {
      return item && String(item.details || '').trim();
    }).slice(0, 30).map(function(item, index) {
      return { order: (index + 1) * 10, type: String(item.type || 'Condição').slice(0, 150), details: String(item.details || '').trim().slice(0, 5000) };
    }) : [];
    var values = {
      initial: autMoney_(payload.initialValue), proposed: autMoney_(payload.proposedValue),
      negotiated: autMoney_(payload.negotiatedValue), accepted: autMoney_(payload.acceptedValue)
    };
    autAssert_(values.initial || values.proposed || values.negotiated || values.accepted, 'Informe ao menos um valor para a proposta.');
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    var requestKey = autClaimRequest_(actor, 'SALVAR_REVISAO_PROPOSTA|' + process.ID_PROCESSO, context);
    autAssertCurrentResponsible_(actor, process);
    var participants = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) { return String(row.ATIVO) !== 'NAO'; });
    autAssert_(participants.some(function(row) { return String(row.ID_PARTICIPANTE) === String(payload.offerorId); }), 'Selecione um ofertante válido.');
    autAssert_(participants.some(function(row) { return String(row.ID_PARTICIPANTE) === String(payload.recipientId); }), 'Selecione um destinatário válido.');
    var previousRows = autRowsBy_('PROPOSTAS', 'ID_PROCESSO', process.ID_PROCESSO).sort(function(a, b) { return Number(a.REVISAO || 0) - Number(b.REVISAO || 0); });
    var revision = previousRows.length ? Number(previousRows[previousRows.length - 1].REVISAO || 0) + 1 : 1;
    var now = autNow_();
    previousRows.filter(function(row) { return !row.SUBSTITUIDO_EM && ['RASCUNHO', 'ENVIADA', 'EM_NEGOCIACAO', 'ACEITA'].indexOf(String(row.STATUS)) >= 0; })
      .forEach(function(row) {
        autUpdateRow_('PROPOSTAS', row._row, { STATUS: 'SUBSTITUIDA', SUBSTITUIDO_EM: now, SUBSTITUIDO_POR_ID: actor.ID_USUARIO });
      });
    autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return !row.SUBSTITUIDO_EM && !row.ARQUIVO_ASSINADO_ID;
    }).forEach(function(row) {
      autUpdateRow_('CONTRATOS', row._row, { STATUS: 'SUBSTITUIDO', SUBSTITUIDO_EM: now });
    });
    var proposalId = autUuid_();
    var number = 'PROP-' + Utilities.formatDate(new Date(), AUTENTIKO.TIMEZONE, 'yyyy') + '-' +
      String(autRows_('PROPOSTAS').length + 1).padStart(6, '0') + '-R' + String(revision).padStart(2, '0');
    var snapshotHash = autProposalSnapshot_(process, values, conditions);
    autAppend_('PROPOSTAS', {
      ID_PROPOSTA: proposalId, ID_PROCESSO: process.ID_PROCESSO, NUMERO_PROPOSTA: number,
      TIPO_PROPOSTA: type, REVISAO: revision, STATUS: 'RASCUNHO',
      VALOR_INICIAL: values.initial, VALOR_PROPOSTO: values.proposed,
      VALOR_NEGOCIADO: values.negotiated, VALOR_ACEITO: values.accepted,
      ID_PARTICIPANTE_OFERTANTE: payload.offerorId, ID_PARTICIPANTE_DESTINATARIO: payload.recipientId,
      ID_DOCUMENTO_EVIDENCIA: payload.evidenceDocumentId || '', OBSERVACOES: String(payload.observations || '').slice(0, 5000),
      HASH_SNAPSHOT: snapshotHash, VERSAO_PROCESSO: autProcessVersion_(process),
      CRIADO_EM: now, CRIADO_POR_ID: actor.ID_USUARIO, CRIADO_POR: actor.NOME,
      ENVIADO_EM: '', ACEITO_EM: '', ACEITO_POR_ID: '', ACEITO_POR: '',
      SUBSTITUIDO_EM: '', SUBSTITUIDO_POR_ID: ''
    });
    autAppendMany_('PROPOSTA_CONDICOES', conditions.map(function(condition) {
      return {
        ID_CONDICAO: autUuid_(), ID_PROPOSTA: proposalId, ORDEM: condition.order,
        TIPO_CONDICAO: condition.type, DETALHES: condition.details, CRIADO_EM: now
      };
    }));
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Nova revisão de proposta criada.', context);
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: now });
    autAudit_(actor, 'PROPOSTA_REVISAO_CRIADA', 'PROCESSO', process.ID_PROCESSO, {
      idProposta: proposalId, numero: number, revisao: revision, tipo: type, hashSnapshot: snapshotHash
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({ id: proposalId, number: number, revision: revision, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiEnviarProposta(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PROPOSTA_GERIR');
    payload = payload || {};
    lock.waitLock(30000);
    var proposal = autFind_('PROPOSTAS', 'ID_PROPOSTA', payload.proposalId);
    autAssert_(proposal && !proposal.SUBSTITUIDO_EM, 'Proposta não encontrada.', 'NOT_FOUND');
    var process = autRequireProcess_(actor, proposal.ID_PROCESSO);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    var requestKey = autClaimRequest_(actor, 'ENVIAR_PROPOSTA|' + proposal.ID_PROPOSTA, context);
    autAssertCurrentResponsible_(actor, process);
    autAssert_(String(proposal.STATUS) === 'RASCUNHO', 'Somente propostas em rascunho podem ser enviadas.', 'INVALID_TRANSITION');
    autUpdateRow_('PROPOSTAS', proposal._row, { STATUS: 'ENVIADA', ENVIADO_EM: autNow_() });
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autAudit_(actor, 'PROPOSTA_ENVIADA', 'PROCESSO', process.ID_PROCESSO, { idProposta: proposal.ID_PROPOSTA, numero: proposal.NUMERO_PROPOSTA }, context);
    autCommitRequest_(requestKey);
    return autResult_({ sent: true, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiMarcarPropostaNegociacao(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PROPOSTA_GERIR');
    payload = payload || {};
    lock.waitLock(30000);
    var proposal = autFind_('PROPOSTAS', 'ID_PROPOSTA', payload.proposalId);
    autAssert_(proposal && !proposal.SUBSTITUIDO_EM, 'Proposta não encontrada.', 'NOT_FOUND');
    var process = autRequireProcess_(actor, proposal.ID_PROCESSO);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    var requestKey = autClaimRequest_(actor, 'NEGOCIAR_PROPOSTA|' + proposal.ID_PROPOSTA, context);
    autAssertCurrentResponsible_(actor, process);
    autAssert_(['ENVIADA', 'EM_NEGOCIACAO'].indexOf(String(proposal.STATUS)) >= 0, 'A proposta não pode entrar em negociação.', 'INVALID_TRANSITION');
    autUpdateRow_('PROPOSTAS', proposal._row, { STATUS: 'EM_NEGOCIACAO' });
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autAudit_(actor, 'PROPOSTA_EM_NEGOCIACAO', 'PROCESSO', process.ID_PROCESSO, { idProposta: proposal.ID_PROPOSTA }, context);
    autCommitRequest_(requestKey);
    return autResult_({ negotiating: true, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiAceitarProposta(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'PROPOSTA_ACEITAR');
    payload = payload || {};
    lock.waitLock(30000);
    var proposal = autFind_('PROPOSTAS', 'ID_PROPOSTA', payload.proposalId);
    autAssert_(proposal && !proposal.SUBSTITUIDO_EM, 'Proposta não encontrada.', 'NOT_FOUND');
    var process = autRequireProcess_(actor, proposal.ID_PROCESSO);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    autAssertActorRole_(actor, ['GERENTE_ADMINISTRATIVO']);
    autAssert_(['ENVIADA', 'EM_NEGOCIACAO'].indexOf(String(proposal.STATUS)) >= 0, 'A proposta não está disponível para aceite.', 'INVALID_TRANSITION');
    var evidenceId = String(payload.evidenceDocumentId || proposal.ID_DOCUMENTO_EVIDENCIA || '');
    var evidence = evidenceId ? autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', evidenceId) : null;
    autAssert_(evidence && String(evidence.ID_PROCESSO) === String(process.ID_PROCESSO) && !evidence.EXCLUIDO_EM &&
      String(evidence.STATUS_CONFERENCIA) === 'CONFERIDO', 'Anexe e confira a evidência do aceite do proprietário antes de aceitar a proposta.', 'PROPOSAL_EVIDENCE_REQUIRED');
    autAssert_(Number(proposal.VALOR_ACEITO || proposal.VALOR_NEGOCIADO || 0) > 0, 'Informe o valor aceito na proposta.');
    var requestKey = autClaimRequest_(actor, 'ACEITAR_PROPOSTA|' + proposal.ID_PROPOSTA, context);
    var acceptance = autCreateAcceptance_(actor, process, {
      scopeType: 'PROPOSTA', scopeId: proposal.ID_PROPOSTA, scopeVersion: proposal.REVISAO,
      contentHash: proposal.HASH_SNAPSHOT, category: 'NEGOCIACOES', decision: 'OK',
      text: 'Declaro que conferi a proposta comercial, seus valores, condições e a evidência de aceite do proprietário.'
    }, context);
    autUpdateRow_('PROPOSTAS', proposal._row, {
      STATUS: 'ACEITA', ID_DOCUMENTO_EVIDENCIA: evidenceId, ACEITO_EM: autNow_(),
      ACEITO_POR_ID: actor.ID_USUARIO, ACEITO_POR: actor.NOME
    });
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autAudit_(actor, 'PROPOSTA_ACEITA', 'PROCESSO', process.ID_PROCESSO, {
      idProposta: proposal.ID_PROPOSTA, evidenciaId: evidenceId, aceiteId: acceptance.id
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({ accepted: true, acceptanceId: acceptance.id, version: nextVersion });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autContractModelForProposal_(proposal) {
  var rows = autRows_('MODELOS_CONTRATO').filter(function(row) {
    return String(row.TIPO_PROPOSTA) === String(proposal.TIPO_PROPOSTA) && String(row.ATIVO) === 'SIM';
  }).sort(function(a, b) { return Number(b.VERSAO || 0) - Number(a.VERSAO || 0); });
  autAssert_(rows.length, 'Não há modelo contratual ativo para este tipo de proposta.', 'CONTRACT_TEMPLATE_MISSING');
  return rows[0];
}

function autHtmlEscape_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function autCurrencyBr_(value) {
  var number = Number(value || 0);
  return 'R$ ' + number.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function autParticipantAddressText_(row) {
  var address = autJsonParse_(row.ENDERECO_JSON, {});
  return [address.street, address.number, address.district, address.complement, address.city, address.state, address.zip]
    .filter(function(item) { return String(item || '').trim(); }).join(', ');
}

function autContractPartyTable_(title, rows) {
  if (!rows.length) return '<section><h2>' + autHtmlEscape_(title) + '</h2><p>Não informado.</p></section>';
  return '<section><h2>' + autHtmlEscape_(title) + '</h2><table><tbody>' + rows.map(function(row) {
    var document = String(row.TIPO_PESSOA) === 'PJ' ? autFormatCnpj_(row.CPF_CNPJ) : autFormatCpf_(row.CPF_CNPJ);
    return '<tr><th>Nome / razão social</th><td>' + autHtmlEscape_(row.NOME_RAZAO_SOCIAL) +
      '</td><th>CPF / CNPJ</th><td>' + autHtmlEscape_(document) + '</td></tr>' +
      '<tr><th>Papel</th><td>' + autHtmlEscape_(autParticipantRoles_(row).map(autLabel_).join(', ')) +
      '</td><th>Contato</th><td>' + autHtmlEscape_([row.EMAIL, row.TELEFONE].filter(Boolean).join(' / ')) + '</td></tr>' +
      '<tr><th>Endereço</th><td colspan="3">' + autHtmlEscape_(autParticipantAddressText_(row)) + '</td></tr>';
  }).join('') + '</tbody></table></section>';
}

function autBuildContractHtml_(process, proposal, model, options) {
  options = options || {};
  var config = autConfigMap_();
  var participants = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
    return String(row.ATIVO) !== 'NAO';
  });
  var offeror = participants.filter(function(row) { return String(row.ID_PARTICIPANTE) === String(proposal.ID_PARTICIPANTE_OFERTANTE); });
  var recipient = participants.filter(function(row) { return String(row.ID_PARTICIPANTE) === String(proposal.ID_PARTICIPANTE_DESTINATARIO); });
  var witnesses = participants.filter(function(row) { return autParticipantRoles_(row).indexOf('TESTEMUNHA') >= 0; });
  var conditions = autRowsBy_('PROPOSTA_CONDICOES', 'ID_PROPOSTA', proposal.ID_PROPOSTA)
    .sort(function(a, b) { return Number(a.ORDEM || 0) - Number(b.ORDEM || 0); });
  var clauses = autRowsBy_('CLAUSULAS_CONTRATO', 'ID_MODELO', model.ID_MODELO).filter(function(row) {
    return String(row.ATIVO) === 'SIM';
  }).sort(function(a, b) { return Number(a.ORDEM || 0) - Number(b.ORDEM || 0); });
  var draft = String(model.STATUS_JURIDICO) !== 'APROVADO_JURIDICO' || !options.final;
  var title = model.TITULO_CONTRATO;
  var contractNumber = options.number || 'PRÉVIA';
  var processData = autJsonParse_(process.DADOS_JSON, {});
  var logo = String(config.LOGO_URL || '');
  var clauseNumber = 1;
  var clausesHtml = clauses.map(function(clause) {
    return '<article class="clause"><h3>CLÁUSULA ' + clauseNumber++ + 'ª — ' + autHtmlEscape_(clause.TITULO) +
      '</h3><p>' + autHtmlEscape_(clause.TEXTO) + '</p></article>';
  }).join('');
  var conditionsHtml = conditions.map(function(condition) {
    return '<article class="clause condition"><h3>CONDIÇÃO ' + clauseNumber++ + 'ª — ' +
      autHtmlEscape_(condition.TIPO_CONDICAO) + '</h3><p>' + autHtmlEscape_(condition.DETALHES) + '</p></article>';
  }).join('');
  var signers = participants.filter(function(row) { return autParticipantRoles_(row).indexOf('TESTEMUNHA') < 0; });
  var signatures = signers.concat(witnesses).map(function(row) {
    return '<div class="signature"><span></span><strong>' + autHtmlEscape_(row.NOME_RAZAO_SOCIAL) +
      '</strong><small>' + autHtmlEscape_(autParticipantRoles_(row).map(autLabel_).join(', ')) +
      ' — ' + autHtmlEscape_(String(row.TIPO_PESSOA) === 'PJ' ? autFormatCnpj_(row.CPF_CNPJ) : autFormatCpf_(row.CPF_CNPJ)) +
      '</small></div>';
  }).join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' +
    autHtmlEscape_(title) + '</title><style>' +
    '@page{size:A4;margin:20mm 16mm 22mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:9pt \"Times New Roman\";color:#667085}}' +
    '*{box-sizing:border-box}body{margin:0;color:#172033;font:12pt/1.45 \"Times New Roman\",serif;background:#fff}' +
    '.page{position:relative}.watermark{position:fixed;inset:38% 0 auto;z-index:-1;text-align:center;transform:rotate(-32deg);font:bold 42pt Arial;color:rgba(21,94,239,.08);letter-spacing:.12em}' +
    '.draft{position:fixed;top:0;left:0;right:0;padding:5px;background:#b42318;color:#fff;text-align:center;font:bold 9pt Arial}' +
    'header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #155eef;padding:4mm 0 5mm;margin-bottom:6mm}' +
    'header img{max-width:38mm;max-height:22mm}header h1{margin:0;font-size:16pt;text-transform:uppercase}header p{margin:2px 0;font-size:9.5pt}' +
    '.contract-id{text-align:right}.contract-id strong{display:block;color:#155eef;font-size:12pt}' +
    'section{margin:0 0 6mm;break-inside:avoid}h2{margin:0 0 3mm;padding:2.5mm 3mm;background:#eef4ff;border-left:3px solid #155eef;font-size:12pt;text-transform:uppercase}' +
    'table{width:100%;border-collapse:collapse;font-size:10.5pt}th,td{border:1px solid #cfd6e4;padding:2.2mm;vertical-align:top}th{width:18%;background:#f8fafc;text-align:left}' +
    '.clause{break-inside:avoid;margin:0 0 4mm;text-align:justify}.clause h3{margin:0 0 1.5mm;font-size:11pt}.clause p{margin:0}' +
    '.signatures{display:grid;grid-template-columns:1fr 1fr;gap:14mm 10mm;margin-top:18mm}.signature{text-align:center;break-inside:avoid}.signature span{display:block;border-top:1px solid #172033;margin-bottom:2mm}.signature strong,.signature small{display:block}' +
    'footer{position:fixed;bottom:-14mm;left:0;right:0;border-top:1px solid #cfd6e4;padding-top:2mm;text-align:center;font-size:8.5pt;color:#667085}' +
    '</style></head><body>' + (draft ? '<div class="draft">MINUTA — REVISÃO JURÍDICA PENDENTE / NÃO ASSINAR COMO VERSÃO FINAL</div>' : '') +
    '<div class="watermark">' + autHtmlEscape_(draft ? 'MINUTA' : (model.MARCA_DAGUA || 'PALMER IMÓVEIS')) + '</div><main class="page"><header>' +
    (logo ? '<img src="' + autHtmlEscape_(logo) + '" alt="Palmer Imóveis">' : '<strong>PALMER IMÓVEIS</strong>') +
    '<div><h1>' + autHtmlEscape_(title) + '</h1><p>' + autHtmlEscape_(config.EMPRESA_NOME || 'PALMER IMÓVEIS LTDA') +
    ' — CNPJ ' + autHtmlEscape_(config.EMPRESA_CNPJ || '') + ' — CRECI Jurídico ' + autHtmlEscape_(config.EMPRESA_CRECI || '') +
    '</p></div><div class="contract-id"><span>CONTRATO</span><strong>' + autHtmlEscape_(contractNumber) +
    '</strong><small>Processo #' + autHtmlEscape_(process.PROTOCOLO) + '</small></div></header>' +
    autContractPartyTable_(proposal.TIPO_PROPOSTA.indexOf('ALUGUEL') === 0 ? 'Dados do locador' : 'Dados do vendedor / ofertante', offeror) +
    autContractPartyTable_(proposal.TIPO_PROPOSTA.indexOf('ALUGUEL') === 0 ? 'Dados do locatário' : 'Dados do comprador / destinatário', recipient) +
    '<section><h2>Dados do imóvel</h2><table><tbody><tr><th>Código</th><td>' + autHtmlEscape_(process.IMOVEL_CODIGO || '—') +
    '</td><th>Endereço</th><td>' + autHtmlEscape_(process.IMOVEL_ENDERECO || '—') +
    '</td></tr><tr><th>Descrição</th><td colspan="3">' + autHtmlEscape_(processData.imovel_descricao || processData.descricao_imovel || 'Conforme ficha cadastral e documentos anexos.') +
    '</td></tr></tbody></table></section><section><h2>Dados da negociação</h2><table><tbody>' +
    '<tr><th>Valor inicial</th><td>' + autCurrencyBr_(proposal.VALOR_INICIAL) + '</td><th>Valor proposto</th><td>' + autCurrencyBr_(proposal.VALOR_PROPOSTO) + '</td></tr>' +
    '<tr><th>Valor negociado</th><td>' + autCurrencyBr_(proposal.VALOR_NEGOCIADO) + '</td><th>Valor aceito</th><td>' + autCurrencyBr_(proposal.VALOR_ACEITO) + '</td></tr>' +
    '</tbody></table></section><section><h2>Proposta vinculada</h2><p>Proposta ' + autHtmlEscape_(proposal.NUMERO_PROPOSTA) +
    ', revisão ' + Number(proposal.REVISAO || 1) + ', aceita em ' + autHtmlEscape_(proposal.ACEITO_EM || '—') + '.</p></section>' +
    '<section><h2>Cláusulas contratuais</h2>' + clausesHtml + conditionsHtml + '</section>' +
    '<section><h2>Assinaturas</h2><p>As partes confirmam que leram o instrumento e que as informações acima representam a negociação registrada.</p>' +
    '<div class="signatures">' + signatures + '</div></section></main><footer>' +
    autHtmlEscape_(config.EMPRESA_NOME || 'PALMER IMÓVEIS LTDA') + ' · ' + autHtmlEscape_(config.EMPRESA_ENDERECO || '') +
    ' · ' + autHtmlEscape_(config.EMPRESA_EMAIL_COMERCIAL || config.EMPRESA_EMAIL || '') + '</footer></body></html>';
}

function apiPreverContrato(token, payload) {
  try {
    var actor = autRequireAuth_(token);
    payload = payload || {};
    var process = autRequireProcess_(actor, payload.processId);
    var proposal = payload.proposalId ? autFind_('PROPOSTAS', 'ID_PROPOSTA', payload.proposalId) : autAcceptedProposal_(process.ID_PROCESSO);
    autAssert_(proposal && String(proposal.ID_PROCESSO) === String(process.ID_PROCESSO) && String(proposal.STATUS) === 'ACEITA',
      'É necessária uma proposta aceita para gerar o contrato.', 'ACCEPTED_PROPOSAL_REQUIRED');
    var model = autContractModelForProposal_(proposal);
    var html = autBuildContractHtml_(process, proposal, model, { final: false, number: 'PRÉVIA' });
    autAssert_(html.length <= 250000, 'A prévia do contrato ultrapassa o limite seguro.', 'PAYLOAD_TOO_LARGE');
    return autResult_({
      html: html, title: model.TITULO_CONTRATO, modelStatus: model.STATUS_JURIDICO,
      draft: String(model.STATUS_JURIDICO) !== 'APROVADO_JURIDICO'
    });
  } catch (err) { return autPublicError_(err); }
}

function apiEmitirContrato(token, payload, context) {
  var lock = LockService.getScriptLock();
  var htmlFile = null;
  var pdfFile = null;
  try {
    var actor = autRequireAuth_(token, 'CONTRATO_EMITIR');
    payload = payload || {};
    lock.waitLock(30000);
    var process = autRequireProcess_(actor, payload.processId);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, payload.expectedVersion);
    autAssertCurrentResponsible_(actor, process);
    var proposal = payload.proposalId ? autFind_('PROPOSTAS', 'ID_PROPOSTA', payload.proposalId) : autAcceptedProposal_(process.ID_PROCESSO);
    autAssert_(proposal && String(proposal.ID_PROCESSO) === String(process.ID_PROCESSO) && String(proposal.STATUS) === 'ACEITA',
      'É necessária uma proposta aceita para emitir o contrato.', 'ACCEPTED_PROPOSAL_REQUIRED');
    var model = autContractModelForProposal_(proposal);
    var finalVersion = !!payload.final;
    if (finalVersion) {
      autAssert_(String(model.STATUS_JURIDICO) === 'APROVADO_JURIDICO', 'O modelo ainda não possui aprovação jurídica.', 'LEGAL_REVIEW_REQUIRED');
      var witnesses = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
        return String(row.ATIVO) !== 'NAO' && autParticipantRoles_(row).indexOf('TESTEMUNHA') >= 0;
      });
      autAssert_(witnesses.length >= 2, 'Adicione pelo menos duas testemunhas antes da emissão final.', 'WITNESSES_REQUIRED');
    }
    var requestKey = autClaimRequest_(actor, 'EMITIR_CONTRATO|' + process.ID_PROCESSO + '|' + proposal.ID_PROPOSTA, context);
    var activeContracts = autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) { return !row.SUBSTITUIDO_EM; });
    var revision = activeContracts.length ? Math.max.apply(null, activeContracts.map(function(row) { return Number(row.REVISAO || 1); })) + 1 : 1;
    var number = 'CTR-' + Utilities.formatDate(new Date(), AUTENTIKO.TIMEZONE, 'yyyy') + '-' +
      String(autRows_('CONTRATOS').length + 1).padStart(6, '0') + '-R' + String(revision).padStart(2, '0');
    var html = autBuildContractHtml_(process, proposal, model, { final: finalVersion, number: number });
    var folder = autProcessFolder_(process.PROTOCOLO);
    htmlFile = folder.createFile(Utilities.newBlob(html, 'text/html', number + '.html'));
    var pdfBlob = HtmlService.createHtmlOutput(html).getAs(MimeType.PDF).setName(number + '.pdf');
    pdfFile = folder.createFile(pdfBlob);
    var htmlHash = autHashBytes_(htmlFile.getBlob().getBytes());
    var pdfHash = autHashBytes_(pdfFile.getBlob().getBytes());
    activeContracts.filter(function(row) { return !row.ARQUIVO_ASSINADO_ID; }).forEach(function(row) {
      autUpdateRow_('CONTRATOS', row._row, { STATUS: 'SUBSTITUIDO', SUBSTITUIDO_EM: autNow_() });
    });
    var contractId = autUuid_();
    autAppend_('CONTRATOS', {
      ID_CONTRATO: contractId, ID_PROCESSO: process.ID_PROCESSO, ID_PROPOSTA: proposal.ID_PROPOSTA,
      ID_MODELO: model.ID_MODELO, NUMERO_CONTRATO: number, REVISAO: revision,
      TITULO: model.TITULO_CONTRATO,
      STATUS: finalVersion ? 'EMITIDO_AGUARDANDO_ASSINATURA' : 'MINUTA',
      ARQUIVO_HTML_ID: htmlFile.getId(), HASH_HTML: htmlHash,
      ARQUIVO_PDF_ID: pdfFile.getId(), HASH_PDF: pdfHash,
      ARQUIVO_ASSINADO_ID: '', HASH_ASSINADO: '',
      VERSAO_PROCESSO: autProcessVersion_(process), MODELO_VERSAO: model.VERSAO,
      CRIADO_EM: autNow_(), CRIADO_POR_ID: actor.ID_USUARIO, CRIADO_POR: actor.NOME,
      ASSINADO_EM: '', CONFERIDO_EM: '', CONFERIDO_POR_ID: '', CONFERIDO_POR: '', SUBSTITUIDO_EM: ''
    });
    var participants = autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return String(row.ATIVO) !== 'NAO';
    });
    autAppendMany_('CONTRATO_PARTES', participants.map(function(row, index) {
      var snapshot = {
        tipoPessoa: row.TIPO_PESSOA, papeis: autParticipantRoles_(row), nome: row.NOME_RAZAO_SOCIAL,
        documento: row.CPF_CNPJ, contato: [row.EMAIL, row.TELEFONE], endereco: autJsonParse_(row.ENDERECO_JSON, {})
      };
      return {
        ID_CONTRATO_PARTE: autUuid_(), ID_CONTRATO: contractId, ID_PARTICIPANTE: row.ID_PARTICIPANTE,
        PAPEIS_JSON: row.PAPEIS_JSON, NOME_RAZAO_SOCIAL: row.NOME_RAZAO_SOCIAL,
        CPF_CNPJ: row.CPF_CNPJ, DADOS_JSON: autJson_(snapshot), ORDEM: index + 1,
        HASH_PARTE: autHash_(autJson_(snapshot))
      };
    }));
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Nova versão de contrato emitida.', context);
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, {
      VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_(), FASE: 'CONTRATO',
      STATUS_TRAMITACAO: 'CONTRATO_EM_PREPARACAO'
    });
    autAudit_(actor, 'CONTRATO_EMITIDO', 'PROCESSO', process.ID_PROCESSO, {
      idContrato: contractId, numero: number, revisao: revision, statusJuridico: model.STATUS_JURIDICO,
      hashHtml: htmlHash, hashPdf: pdfHash
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({
      id: contractId, number: number, revision: revision, status: finalVersion ? 'EMITIDO_AGUARDANDO_ASSINATURA' : 'MINUTA',
      draft: !finalVersion, pdfFileId: pdfFile.getId(), version: nextVersion
    });
  } catch (err) {
    if (pdfFile) try { pdfFile.setTrashed(true); } catch (ignorePdf) {}
    if (htmlFile) try { htmlFile.setTrashed(true); } catch (ignoreHtml) {}
    return autPublicError_(err);
  } finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiRegistrarContratoAssinadoForm(formPayload) {
  var lock = LockService.getScriptLock();
  var file = null;
  try {
    formPayload = formPayload || {};
    var context = autJsonParse_(String(formPayload.contextJson || ''), {});
    var actor = autRequireAuth_(String(formPayload.token || ''), 'CONTRATO_EMITIR');
    lock.waitLock(30000);
    var contract = autFind_('CONTRATOS', 'ID_CONTRATO', String(formPayload.contractId || ''));
    autAssert_(contract && !contract.SUBSTITUIDO_EM, 'Contrato não encontrado.', 'NOT_FOUND');
    var process = autRequireProcess_(actor, contract.ID_PROCESSO);
    autAssertProcessMutable_(process);
    autAssertExpectedVersion_(process, formPayload.expectedVersion);
    var requestKey = autClaimRequest_(actor, 'CONTRATO_ASSINADO|' + contract.ID_CONTRATO, context);
    autAssertCurrentResponsible_(actor, process);
    var blob = formPayload.file;
    autAssert_(blob && typeof blob.getBytes === 'function', 'Selecione o contrato assinado.');
    var bytes = blob.getBytes();
    autAssert_(bytes.length > 0 && bytes.length <= AUTENTIKO.MAX_UPLOAD_MB * 1024 * 1024, 'O contrato assinado é inválido ou excede o limite.');
    autAssert_(String(blob.getContentType()).toLowerCase() === 'application/pdf' && autHasPdfSignature_(bytes),
      'O contrato assinado deve ser um PDF válido.', 'INVALID_FILE');
    file = autProcessFolder_(process.PROTOCOLO).createFile(blob.setName(contract.NUMERO_CONTRATO + '-ASSINADO.pdf').setContentType('application/pdf'));
    var hash = autHashBytes_(bytes);
    autUpdateRow_('CONTRATOS', contract._row, {
      STATUS: 'ASSINADO_AGUARDANDO_CONFERENCIA', ARQUIVO_ASSINADO_ID: file.getId(),
      HASH_ASSINADO: hash, ASSINADO_EM: autNow_()
    });
    autInvalidateProcessApprovals_(process.ID_PROCESSO, 'Contrato assinado anexado para conferência.', context);
    var nextVersion = autProcessVersion_(process) + 1;
    autUpdateRow_('PROCESSOS', process._row, { VERSAO_REGISTRO: nextVersion, ATUALIZADO_EM: autNow_() });
    autAudit_(actor, 'CONTRATO_ASSINADO_ANEXADO', 'PROCESSO', process.ID_PROCESSO, {
      idContrato: contract.ID_CONTRATO, arquivoId: file.getId(), hash: hash
    }, context);
    autCommitRequest_(requestKey);
    return autResult_({ uploaded: true, contractId: contract.ID_CONTRATO, hash: hash, version: nextVersion });
  } catch (err) {
    if (file) try { file.setTrashed(true); } catch (ignore) {}
    return autPublicError_(err);
  } finally { try { lock.releaseLock(); } catch (ignoreLock) {} }
}

function autContractPublic_(row) {
  return {
    id: row.ID_CONTRATO, processId: row.ID_PROCESSO, proposalId: row.ID_PROPOSTA,
    modelId: row.ID_MODELO, number: row.NUMERO_CONTRATO, revision: Number(row.REVISAO || 1),
    title: row.TITULO, status: row.STATUS, htmlFileId: row.ARQUIVO_HTML_ID,
    pdfFileId: row.ARQUIVO_PDF_ID, signedFileId: row.ARQUIVO_ASSINADO_ID,
    htmlHash: row.HASH_HTML, pdfHash: row.HASH_PDF, signedHash: row.HASH_ASSINADO,
    modelVersion: Number(row.MODELO_VERSAO || 1), createdAt: row.CRIADO_EM,
    createdBy: row.CRIADO_POR, signedAt: row.ASSINADO_EM, checkedAt: row.CONFERIDO_EM,
    checkedBy: row.CONFERIDO_POR, substitutedAt: row.SUBSTITUIDO_EM
  };
}

function apiListarContratos(token, filters) {
  try {
    var actor = autRequireAuth_(token);
    filters = filters || {};
    var processId = String(filters.processId || '');
    var processMap = {};
    autVisibleProcesses_(actor).forEach(function(process) { processMap[process.ID_PROCESSO] = process; });
    var rows = autRows_('CONTRATOS').filter(function(row) {
      return processMap[row.ID_PROCESSO] && (!processId || String(row.ID_PROCESSO) === processId);
    }).map(function(row) {
      var item = autContractPublic_(row);
      item.protocol = processMap[row.ID_PROCESSO].PROTOCOLO;
      item.clientName = processMap[row.ID_PROCESSO].CLIENTE_NOME;
      return item;
    }).sort(function(a, b) { return autDateMs_(b.createdAt) - autDateMs_(a.createdAt); });
    var activeProposalContracts = {};
    rows.filter(function(item) { return !item.substitutedAt; }).forEach(function(item) {
      activeProposalContracts[item.proposalId] = true;
    });
    var acceptedProposals = autRows_('PROPOSTAS').filter(function(row) {
      return processMap[row.ID_PROCESSO] && String(row.STATUS) === 'ACEITA' && !row.SUBSTITUIDO_EM &&
        !activeProposalContracts[row.ID_PROPOSTA] && (!processId || String(row.ID_PROCESSO) === processId);
    }).map(function(row) {
      var item = autProposalPublic_(row);
      item.protocol = processMap[row.ID_PROCESSO].PROTOCOLO;
      item.clientName = processMap[row.ID_PROCESSO].CLIENTE_NOME;
      return item;
    }).sort(function(a, b) { return autDateMs_(b.acceptedAt) - autDateMs_(a.acceptedAt); });
    return autResult_({ items: rows, acceptedProposals: acceptedProposals });
  } catch (err) { return autPublicError_(err); }
}

function apiVisualizarContrato(token, contractId, signed) {
  try {
    var actor = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var contract = autFind_('CONTRATOS', 'ID_CONTRATO', contractId);
    autAssert_(contract, 'Contrato não encontrado.', 'NOT_FOUND');
    autRequireProcess_(actor, contract.ID_PROCESSO);
    var fileId = signed && contract.ARQUIVO_ASSINADO_ID ? contract.ARQUIVO_ASSINADO_ID : contract.ARQUIVO_PDF_ID;
    autAssert_(fileId, 'Arquivo do contrato indisponível.', 'NOT_FOUND');
    var blob = DriveApp.getFileById(fileId).getBlob();
    return autResult_({
      fileName: signed && contract.ARQUIVO_ASSINADO_ID ? contract.NUMERO_CONTRATO + '-ASSINADO.pdf' : contract.NUMERO_CONTRATO + '.pdf',
      mimeType: 'application/pdf', base64: Utilities.base64Encode(blob.getBytes())
    });
  } catch (err) { return autPublicError_(err); }
}

function apiListarModelosContrato(token) {
  try {
    autRequireAuth_(token, 'CONTRATO_MODELO_GERIR');
    return autResult_({
      models: autRows_('MODELOS_CONTRATO').map(function(row) {
        return {
          id: row.ID_MODELO, type: row.TIPO_PROPOSTA, name: row.NOME_MODELO,
          title: row.TITULO_CONTRATO, version: Number(row.VERSAO || 1),
          legalStatus: row.STATUS_JURIDICO, watermark: row.MARCA_DAGUA,
          active: String(row.ATIVO) === 'SIM',
          clauses: autRowsBy_('CLAUSULAS_CONTRATO', 'ID_MODELO', row.ID_MODELO).map(function(clause) {
            return {
              id: clause.ID_CLAUSULA, order: Number(clause.ORDEM || 0), title: clause.TITULO,
              text: clause.TEXTO, active: String(clause.ATIVO) === 'SIM',
              legalStatus: clause.STATUS_JURIDICO, version: Number(clause.VERSAO || 1)
            };
          }).sort(function(a, b) { return a.order - b.order; })
        };
      })
    });
  } catch (err) { return autPublicError_(err); }
}

function apiSalvarModeloContrato(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'CONTRATO_MODELO_GERIR');
    payload = payload || {};
    lock.waitLock(30000);
    var model = autFind_('MODELOS_CONTRATO', 'ID_MODELO', payload.id);
    autAssert_(model, 'Modelo não encontrado.', 'NOT_FOUND');
    var legalStatus = String(payload.legalStatus || model.STATUS_JURIDICO);
    autAssert_(['EM_REVISAO_JURIDICA', 'APROVADO_JURIDICO'].indexOf(legalStatus) >= 0, 'Status jurídico inválido.');
    var title = String(payload.title || model.TITULO_CONTRATO).trim();
    autAssert_(title.length >= 10 && title.length <= 250, 'Título contratual inválido.');
    autUpdateRow_('MODELOS_CONTRATO', model._row, {
      TITULO_CONTRATO: title, STATUS_JURIDICO: legalStatus,
      MARCA_DAGUA: String(payload.watermark || model.MARCA_DAGUA).slice(0, 100),
      VERSAO: Number(model.VERSAO || 1) + 1, ATUALIZADO_EM: autNow_(), ATUALIZADO_POR: actor.NOME
    });
    autAudit_(actor, 'MODELO_CONTRATO_ATUALIZADO', 'MODELO_CONTRATO', model.ID_MODELO, {
      statusJuridico: legalStatus, titulo: title, versao: Number(model.VERSAO || 1) + 1
    }, context);
    return autResult_({ updated: true, version: Number(model.VERSAO || 1) + 1 });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autCommercialSnapshot_(actor, process) {
  return {
    participants: autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_PROCESSO', process.ID_PROCESSO)
      .filter(function(row) { return String(row.ATIVO) !== 'NAO'; }).map(autParticipantPublic_)
      .sort(function(a, b) { return a.order - b.order || a.name.localeCompare(b.name); }),
    participantCompleteness: autParticipantCompleteness_(process.ID_PROCESSO),
    proposals: autRowsBy_('PROPOSTAS', 'ID_PROCESSO', process.ID_PROCESSO).map(autProposalPublic_)
      .sort(function(a, b) { return b.revision - a.revision; }),
    contracts: autRowsBy_('CONTRATOS', 'ID_PROCESSO', process.ID_PROCESSO).map(autContractPublic_)
      .sort(function(a, b) { return b.revision - a.revision; })
  };
}
