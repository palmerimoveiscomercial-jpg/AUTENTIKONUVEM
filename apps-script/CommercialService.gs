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
  var canonicalDocument = autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ);
  return {
    id: row.ID_PARTICIPANTE,
    processId: row.ID_PROCESSO,
    personType: row.TIPO_PESSOA,
    roles: autParticipantRoles_(row),
    name: row.NOME_RAZAO_SOCIAL,
    tradeName: row.NOME_FANTASIA,
    document: String(row.TIPO_PESSOA) === 'PJ' ? autFormatCnpj_(canonicalDocument) : autFormatCpf_(canonicalDocument),
    rawDocument: canonicalDocument,
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
  cpf = autMasterCanonicalDocument_('PF', cpf);
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
    CPF_CNPJ: cpf, RG_IE: data[prefix + '_documento'] || '',
    ORGAO_EXPEDIDOR: data[prefix + '_orgao_expedidor'] || '',
    DATA_NASCIMENTO_ABERTURA: data[prefix + '_nascimento'] || '',
    NACIONALIDADE: data[prefix + '_nacionalidade'] || 'Brasileira',
    ESTADO_CIVIL: data[prefix + '_estado_civil'] || '', REGIME_BENS: data[prefix + '_regime_bens'] || '',
    PROFISSAO: data[prefix + '_profissao'] || '', RENDA: autCurrencyNumber_(data[prefix + '_renda']),
    EMPRESA_TRABALHO: data[prefix + '_empresa'] || '',
    CARGO_FUNCAO: [data[prefix + '_cargo'], data[prefix + '_funcao']].filter(Boolean).join(' / '),
    EMAIL: data[prefix + '_email'] || (prefix === 'cliente' ? process.CLIENTE_EMAIL : ''),
    TELEFONE: data[prefix + '_contato'] || (prefix === 'cliente' ? process.CLIENTE_CONTATO : ''),
    ENDERECO_JSON: autJson_(address), REPRESENTANTE_LEGAL: '', DADOS_JSON: autJson_({
      origem: 'FICHA_CADASTRAL', rendaOrigem: data[prefix + '_renda_origem'] || '',
      tempoEmprego: data[prefix + '_tempo_emprego'] || '', cargo: data[prefix + '_cargo'] || '',
      funcao: data[prefix + '_funcao'] || ''
    }),
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
  if (owner && (!client || autMasterCanonicalDocument_(owner.TIPO_PESSOA, owner.CPF_CNPJ) !== autMasterCanonicalDocument_(client.TIPO_PESSOA, client.CPF_CNPJ) || !owner.CPF_CNPJ)) rows.push(owner);
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
    var document = autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ);
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
  var document = autMasterCanonicalDocument_(type, payload.document);
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
      return String(row.ATIVO) !== 'NAO' && autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ) === normalized.document &&
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
    var masterRegistration = null;
    try {
      masterRegistration = autMasterUpsertClient_(actor, autMasterParticipantProfile_(row), process, 'PARTICIPANTE_PROCESSO', context, {});
    } catch (masterError) {
      autAudit_(actor, 'BASE_CLIENTE_SINCRONIZACAO_PENDENTE', 'PROCESSO', process.ID_PROCESSO, {
        origem: 'PARTICIPANTE_PROCESSO', codigo: masterError.code || 'MASTER_SYNC_ERROR', documentoHash: autHash_(normalized.document)
      }, context);
    }
    if (masterRegistration) row.ID_CADASTRO_BASE = masterRegistration.id;
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
    return String(row.ATIVO) === 'SIM' && Number(row.VERSAO || 1) === Number(model.VERSAO || 1);
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
          clauses: autRowsBy_('CLAUSULAS_CONTRATO', 'ID_MODELO', row.ID_MODELO).filter(function(clause) {
            return String(clause.ATIVO) === 'SIM' && Number(clause.VERSAO || 1) === Number(row.VERSAO || 1);
          }).map(function(clause) {
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
    var clauses = Array.isArray(payload.clauses) ? payload.clauses : [];
    autAssert_(clauses.length >= 1 && clauses.length <= 50, 'O modelo deve possuir de 1 a 50 cláusulas.');
    clauses = clauses.map(function(clause, index) {
      var clauseTitle = String(clause && clause.title || '').trim();
      var clauseText = String(clause && clause.text || '').trim();
      autAssert_(clauseTitle.length >= 3 && clauseTitle.length <= 200, 'Título de cláusula inválido.');
      autAssert_(clauseText.length >= 10 && clauseText.length <= 12000, 'Texto de cláusula inválido.');
      return { order: (index + 1) * 10, title: clauseTitle, text: clauseText };
    });
    var currentVersion = Number(model.VERSAO || 1);
    var nextVersion = currentVersion + 1;
    var oldClauses = autRowsBy_('CLAUSULAS_CONTRATO', 'ID_MODELO', model.ID_MODELO).filter(function(clause) {
      return String(clause.ATIVO) === 'SIM' && Number(clause.VERSAO || 1) === currentVersion;
    });
    var oldSnapshot = {
      title: model.TITULO_CONTRATO, watermark: model.MARCA_DAGUA,
      legalStatus: model.STATUS_JURIDICO,
      clauses: oldClauses.map(function(clause) { return { order: clause.ORDEM, title: clause.TITULO, text: clause.TEXTO }; })
    };
    var now = autNow_();
    autAppendMany_('CLAUSULAS_CONTRATO', clauses.map(function(clause, index) {
      return {
        ID_CLAUSULA: model.ID_MODELO + '_V' + nextVersion + '_' + (index + 1) + '_' + autUuid_().slice(0, 8),
        ID_MODELO: model.ID_MODELO, ORDEM: clause.order, TITULO: clause.title, TEXTO: clause.text,
        ATIVO: 'SIM', VERSAO: nextVersion, STATUS_JURIDICO: legalStatus,
        CRIADO_EM: now, ATUALIZADO_EM: now, ATUALIZADO_POR: actor.NOME
      };
    }));
    autUpdateRow_('MODELOS_CONTRATO', model._row, {
      TITULO_CONTRATO: title, STATUS_JURIDICO: legalStatus,
      MARCA_DAGUA: String(payload.watermark || model.MARCA_DAGUA).slice(0, 100),
      VERSAO: nextVersion, ATUALIZADO_EM: now, ATUALIZADO_POR: actor.NOME
    });
    autPatchRows_('CLAUSULAS_CONTRATO', oldClauses.map(function(clause) { return clause._row; }), {
      ATIVO: 'NAO', ATUALIZADO_EM: now, ATUALIZADO_POR: actor.NOME
    });
    var newSnapshot = { title: title, watermark: String(payload.watermark || model.MARCA_DAGUA).slice(0, 100), legalStatus: legalStatus, clauses: clauses };
    autAudit_(actor, 'MODELO_CONTRATO_ATUALIZADO', 'MODELO_CONTRATO', model.ID_MODELO, {
      statusJuridico: legalStatus, titulo: title, versao: nextVersion,
      hashAnterior: autHash_(JSON.stringify(oldSnapshot)), hashNovo: autHash_(JSON.stringify(newSnapshot)),
      clausulas: clauses.length
    }, context);
    return autResult_({ updated: true, version: nextVersion });
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

// Base mestre de clientes e imóveis. Dados divergentes vindos de processos
// nunca substituem silenciosamente um valor já consolidado: o conflito fica
// registrado para decisão de um perfil autorizado.
function autMasterBaseEditor_(actor, permission) {
  var allowedRoles = ['DESENVOLVEDOR', 'GERENTE_ADMINISTRATIVO', 'GERENTE_GERAL'];
  return !!actor && allowedRoles.indexOf(String(actor.PERFIL || '')) >= 0 && autHasPermission_(actor, permission);
}

function autMasterCanonicalDocument_(type, value) {
  var digits = autDigits_(value);
  var personType = String(type || '').toUpperCase();
  function canonicalFor_(targetLength, validator) {
    if (!digits || digits.length > targetLength) return '';
    if (digits.length === targetLength && validator(digits)) return digits;
    var padded = digits.padStart(targetLength, '0');
    return validator(padded) ? padded : '';
  }
  if (personType === 'PJ') return canonicalFor_(14, autValidateCnpj_) || digits;
  if (personType === 'PF') return canonicalFor_(11, autCpfValido_) || digits;
  var cpf = canonicalFor_(11, autCpfValido_);
  if (cpf) return cpf;
  var cnpj = canonicalFor_(14, autValidateCnpj_);
  return cnpj || digits;
}

function autMasterActiveClient_(row) {
  return !!row && ['EXCLUIDO', 'MESCLADO'].indexOf(String(row.STATUS || 'ATIVO').toUpperCase()) < 0;
}

function autMasterRowsByDocument_(document, type) {
  var canonical = autMasterCanonicalDocument_(type, document);
  if (!canonical) return [];
  return autRows_('BASE_CLIENTES').filter(function(row) {
    if (!autMasterActiveClient_(row)) return false;
    if (type && String(row.TIPO_PESSOA || 'PF').toUpperCase() !== String(type).toUpperCase()) return false;
    return autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ) === canonical;
  });
}

function autMasterDocumentValid_(type, document) {
  var digits = autMasterCanonicalDocument_(type, document);
  return String(type || 'PF') === 'PJ' ? autValidateCnpj_(digits) : autCpfValido_(digits);
}

function autMasterValue_(value) {
  if (value == null) return '';
  if (typeof value === 'object') return autJson_(value);
  return String(value).trim();
}

function autMasterComparable_(field, value) {
  var text = autMasterValue_(value);
  if (field === 'CPF_CNPJ') return autMasterCanonicalDocument_('', text);
  if (field === 'TELEFONE' || field === 'TELEFONE_RECADO') return autDigits_(text);
  if (field === 'EMAIL') return autNormalizeEmail_(text);
  if (field === 'RENDA') return String(Number(value || 0));
  if (field === 'DATA_NASCIMENTO_ABERTURA') {
    var iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return br[3] + '-' + br[2] + '-' + br[1];
  }
  if (field === 'ENDERECO_JSON') {
    var address = typeof value === 'object' && value ? value : autJsonParse_(text, {});
    return autJson_({
      street: autNormalize_(address.street || address.rua || ''),
      number: autNormalize_(address.number || address.numero || ''),
      district: autNormalize_(address.district || address.bairro || ''),
      complement: autNormalize_(address.complement || address.complemento || ''),
      city: autNormalize_(address.city || address.cidade || ''),
      state: String(address.state || address.estado || '').trim().toUpperCase(),
      zip: autDigits_(address.zip || address.cep || '')
    });
  }
  return autNormalize_(text);
}

function autMasterProcessProfile_(data, prefix, roles) {
  data = data || {};
  var document = autMasterCanonicalDocument_('PF', data[prefix + '_cpf']);
  if (!autCpfValido_(document)) return null;
  var address = {
    street: String(data[prefix + '_rua'] || '').trim(),
    number: String(data[prefix + '_numero'] || '').trim(),
    district: String(data[prefix + '_bairro'] || '').trim(),
    complement: String(data[prefix + '_complemento'] || '').trim(),
    city: String(data[prefix + '_cidade'] || '').trim(),
    state: String(data[prefix + '_estado'] || '').trim(),
    zip: autDigits_(data[prefix + '_cep'])
  };
  return {
    TIPO_PESSOA: 'PF', CPF_CNPJ: document,
    NOME_RAZAO_SOCIAL: String(data[prefix + '_nome'] || '').trim(), NOME_FANTASIA: '',
    RG_IE: String(data[prefix + '_documento'] || '').trim(),
    ORGAO_EXPEDIDOR: String(data[prefix + '_orgao_expedidor'] || '').trim(),
    DATA_NASCIMENTO_ABERTURA: String(data[prefix + '_nascimento'] || '').trim(),
    NACIONALIDADE: String(data[prefix + '_nacionalidade'] || '').trim(),
    ESTADO_CIVIL: String(data[prefix + '_estado_civil'] || '').trim(),
    REGIME_BENS: String(data[prefix + '_regime_bens'] || '').trim(),
    PROFISSAO: String(data[prefix + '_profissao'] || '').trim(),
    RENDA: autCurrencyNumber_(data[prefix + '_renda']),
    RENDA_ORIGEM: String(data[prefix + '_renda_origem'] || '').trim(),
    EMPRESA_TRABALHO: String(data[prefix + '_empresa'] || '').trim(),
    CARGO_FUNCAO: [data[prefix + '_cargo'], data[prefix + '_funcao']].filter(Boolean).join(' / '),
    EMAIL: autNormalizeEmail_(data[prefix + '_email']),
    TELEFONE: String(data[prefix + '_contato'] || '').trim(),
    TELEFONE_RECADO: String(data[prefix + '_contato_recado'] || '').trim(),
    CONTATO_RECADO_NOME: String(data[prefix + '_contato_recado_nome'] || '').trim(),
    ENDERECO_JSON: address, REPRESENTANTE_LEGAL: '', PAPEIS_JSON: roles || [],
    DADOS_JSON: {
      documentoExpedicao: String(data[prefix + '_documento_expedicao'] || '').trim(),
      cargo: String(data[prefix + '_cargo'] || '').trim(),
      funcao: String(data[prefix + '_funcao'] || '').trim(),
      tempoEmprego: String(data[prefix + '_tempo_emprego'] || '').trim()
    }
  };
}

function autMasterParticipantProfile_(row) {
  if (!row || String(row.ATIVO || 'SIM') === 'NAO') return null;
  var type = String(row.TIPO_PESSOA || 'PF');
  var document = autMasterCanonicalDocument_(type, row.CPF_CNPJ);
  if (!autMasterDocumentValid_(type, document)) return null;
  var data = autJsonParse_(row.DADOS_JSON, {});
  return {
    TIPO_PESSOA: type, CPF_CNPJ: document, NOME_RAZAO_SOCIAL: row.NOME_RAZAO_SOCIAL,
    NOME_FANTASIA: row.NOME_FANTASIA, RG_IE: row.RG_IE, ORGAO_EXPEDIDOR: row.ORGAO_EXPEDIDOR,
    DATA_NASCIMENTO_ABERTURA: row.DATA_NASCIMENTO_ABERTURA, NACIONALIDADE: row.NACIONALIDADE,
    ESTADO_CIVIL: row.ESTADO_CIVIL, REGIME_BENS: row.REGIME_BENS, PROFISSAO: row.PROFISSAO,
    RENDA: Number(row.RENDA || 0), RENDA_ORIGEM: data.incomeOrigin || '',
    EMPRESA_TRABALHO: row.EMPRESA_TRABALHO, CARGO_FUNCAO: row.CARGO_FUNCAO,
    EMAIL: autNormalizeEmail_(row.EMAIL), TELEFONE: row.TELEFONE,
    TELEFONE_RECADO: data.messagePhone || '', CONTATO_RECADO_NOME: data.messageContactName || '',
    ENDERECO_JSON: autJsonParse_(row.ENDERECO_JSON, {}), REPRESENTANTE_LEGAL: row.REPRESENTANTE_LEGAL,
    PAPEIS_JSON: autParticipantRoles_(row), DADOS_JSON: data
  };
}

function autMasterClientFields_() {
  return [
    'TIPO_PESSOA', 'CPF_CNPJ', 'NOME_RAZAO_SOCIAL', 'NOME_FANTASIA', 'RG_IE',
    'ORGAO_EXPEDIDOR', 'DATA_NASCIMENTO_ABERTURA', 'NACIONALIDADE', 'ESTADO_CIVIL',
    'REGIME_BENS', 'PROFISSAO', 'RENDA', 'RENDA_ORIGEM', 'EMPRESA_TRABALHO',
    'CARGO_FUNCAO', 'EMAIL', 'TELEFONE', 'TELEFONE_RECADO', 'CONTATO_RECADO_NOME',
    'ENDERECO_JSON', 'REPRESENTANTE_LEGAL', 'DADOS_JSON'
  ];
}

function autMasterMeaningful_(field, value) {
  var comparable = autMasterComparable_(field, value);
  if (!comparable || comparable === '{}' || comparable === '[]') return false;
  if (field === 'RENDA' && Number(value || 0) <= 0) return false;
  return ['NAO INFORMADO', 'N/A', 'NA'].indexOf(autNormalize_(autMasterValue_(value))) < 0;
}

function autMasterOpenConflicts_(clientId) {
  return autRowsBy_('BASE_CLIENTES_CONFLITOS', 'ID_CADASTRO', clientId).filter(function(row) {
    return String(row.STATUS || '').toUpperCase() === 'ABERTO';
  });
}

function autMasterRefreshConflictCount_(clientId) {
  var row = autFind_('BASE_CLIENTES', 'ID_CADASTRO', clientId);
  if (!row) return 0;
  var count = autMasterOpenConflicts_(clientId).length;
  if (Number(row.CONFLITOS_ABERTOS || 0) !== count) autUpdateRow_('BASE_CLIENTES', row._row, { CONFLITOS_ABERTOS: count });
  return count;
}

function autMasterConflict_(row, field, currentValue, newValue, process, source) {
  if (field === 'DADOS_JSON' || !autMasterMeaningful_(field, newValue)) return false;
  var normalizedNewValue = autMasterComparable_(field, newValue);
  if (autMasterComparable_(field, currentValue) === normalizedNewValue) return false;
  var hash = autHash_(String(row.ID_CADASTRO) + '|' + field + '|' + normalizedNewValue);
  var exists = autRowsBy_('BASE_CLIENTES_CONFLITOS', 'ID_CADASTRO', row.ID_CADASTRO).some(function(item) {
    return item.STATUS === 'ABERTO' && item.CAMPO === field && autHash_(String(item.ID_CADASTRO) + '|' + field + '|' + autMasterComparable_(field, item.VALOR_NOVO)) === hash;
  });
  if (exists) return false;
  autAppend_('BASE_CLIENTES_CONFLITOS', {
    ID_CONFLITO: 'CON-' + autUuid_().slice(0, 12).toUpperCase(), ID_CADASTRO: row.ID_CADASTRO,
    CPF_CNPJ_HASH: autHash_(row.CPF_CNPJ), CAMPO: field,
    VALOR_ATUAL: autMasterValue_(currentValue).slice(0, 5000), VALOR_NOVO: autMasterValue_(newValue).slice(0, 5000),
    ID_PROCESSO_ORIGEM: process && process.ID_PROCESSO || '', FONTE: source || 'PROCESSO',
    STATUS: 'ABERTO', CRIADO_EM: autNow_(), RESOLVIDO_EM: '', RESOLVIDO_POR: ''
  });
  return true;
}

function autMasterQuality_(row) {
  var fields = ['NOME_RAZAO_SOCIAL', 'CPF_CNPJ', 'RG_IE', 'DATA_NASCIMENTO_ABERTURA', 'EMAIL', 'TELEFONE', 'ENDERECO_JSON'];
  var filled = fields.filter(function(field) {
    var value = autMasterValue_(row[field]);
    return value && value !== '{}' && value !== '[]';
  }).length;
  return Math.round(filled * 100 / fields.length);
}

function autMasterUpsertClient_(actor, profile, process, source, context, options) {
  options = options || {};
  if (!profile) return null;
  var type = String(profile.TIPO_PESSOA || 'PF');
  var document = autMasterCanonicalDocument_(type, profile.CPF_CNPJ);
  autAssert_(autMasterDocumentValid_(type, document), type === 'PJ' ? 'CNPJ inválido na base cadastral.' : 'CPF inválido na base cadastral.', 'INVALID_DOCUMENT');
  profile.CPF_CNPJ = document;
  var matches = autMasterRowsByDocument_(document, type);
  if (options.existing && !matches.some(function(item) { return item.ID_CADASTRO === options.existing.ID_CADASTRO; })) matches.push(options.existing);
  var uniqueIds = {};
  matches = matches.filter(function(item) { if (uniqueIds[item.ID_CADASTRO]) return false; uniqueIds[item.ID_CADASTRO] = true; return true; });
  autAssert_(matches.length <= 1, 'Foram encontrados cadastros duplicados para este CPF/CNPJ. A edição foi bloqueada para proteger os dados.', 'BASE_DUPLICATE_DETECTED');
  var existing = options.existing || matches[0];
  var now = autNow_();
  var processId = process && process.ID_PROCESSO || '';
  var roles = Array.from(new Set((existing ? autJsonParse_(existing.PAPEIS_JSON, []) : []).concat(profile.PAPEIS_JSON || [])));
  var processIds = Array.from(new Set((existing ? autJsonParse_(existing.PROCESSOS_JSON, []) : []).concat(processId ? [processId] : []))).slice(-100);
  var sources = existing ? autJsonParse_(existing.FONTES_JSON, []) : [];
  var sourceAlreadyRegistered = options.silentAudit && sources.some(function(item) {
    return String(item.processId || '') === String(processId) && String(item.source || '') === String(source || 'PROCESSO');
  });
  if (!sourceAlreadyRegistered) sources.push({ processId: processId, source: source || 'PROCESSO', at: now, actorId: actor && actor.ID_USUARIO || 'SISTEMA' });
  sources = sources.slice(-50);
  var patch = { PAPEIS_JSON: autJson_(roles), PROCESSOS_JSON: autJson_(processIds), FONTES_JSON: autJson_(sources) };
  var conflicts = 0;
  autMasterClientFields_().forEach(function(field) {
    var incoming = field === 'ENDERECO_JSON' || field === 'DADOS_JSON' ? autJson_(profile[field] || {}) : profile[field];
    if (field === 'DADOS_JSON') {
      if (!existing || !autMasterMeaningful_(field, existing[field])) patch[field] = incoming;
      return;
    }
    if (incoming == null || !autMasterMeaningful_(field, incoming)) return;
    var current = existing ? existing[field] : '';
    if (!existing || !autMasterMeaningful_(field, current)) patch[field] = incoming;
    else if (autMasterComparable_(field, current) !== autMasterComparable_(field, incoming)) {
      if (options.force && autMasterBaseEditor_(actor, 'BASE_CLIENTES_EDITAR')) patch[field] = incoming;
      else if (autMasterConflict_(existing, field, current, incoming, process, source)) conflicts += 1;
    }
  });
  if (!existing) {
    var id = 'CLI-' + autUuid_().slice(0, 12).toUpperCase();
    patch.ID_CADASTRO = id; patch.STATUS = 'ATIVO'; patch.VERSAO_REGISTRO = 1;
    patch.CRIADO_EM = now; patch.CRIADO_POR = actor && actor.NOME || 'MIGRACAO';
    patch.ATUALIZADO_EM = now; patch.ATUALIZADO_POR = actor && actor.NOME || 'MIGRACAO';
    patch.CONFLITOS_ABERTOS = 0; patch.QUALIDADE = autMasterQuality_(patch);
    autAppend_('BASE_CLIENTES', patch);
    if (!options.silentAudit) autAudit_(actor, 'BASE_CLIENTE_CRIADO', 'BASE_CLIENTE', id, { documentoHash: autHash_(document), fonte: source, processo: processId }, context);
    return { id: id, created: true, conflicts: 0 };
  }
  patch.CONFLITOS_ABERTOS = autMasterOpenConflicts_(existing.ID_CADASTRO).length;
  patch.VERSAO_REGISTRO = Number(existing.VERSAO_REGISTRO || 1) + 1;
  patch.ATUALIZADO_EM = now; patch.ATUALIZADO_POR = actor && actor.NOME || 'MIGRACAO';
  var qualityRow = {};
  autMasterClientFields_().forEach(function(field) { qualityRow[field] = Object.prototype.hasOwnProperty.call(patch, field) ? patch[field] : existing[field]; });
  patch.QUALIDADE = autMasterQuality_(qualityRow);
  if (options.silentAudit && !conflicts) {
    var materialChange = Object.keys(patch).some(function(field) {
      return ['VERSAO_REGISTRO', 'ATUALIZADO_EM', 'ATUALIZADO_POR'].indexOf(field) < 0 && autMasterComparable_(field, patch[field]) !== autMasterComparable_(field, existing[field]);
    });
    if (!materialChange) return { id: existing.ID_CADASTRO, created: false, conflicts: 0, unchanged: true };
  }
  autUpdateRow_('BASE_CLIENTES', existing._row, patch);
  if (!options.silentAudit) autAudit_(actor, conflicts ? 'BASE_CLIENTE_CONFLITO_REGISTRADO' : 'BASE_CLIENTE_ATUALIZADO', 'BASE_CLIENTE', existing.ID_CADASTRO, { documentoHash: autHash_(document), fonte: source, processo: processId, conflitos: conflicts }, context);
  return { id: existing.ID_CADASTRO, created: false, conflicts: conflicts };
}

function autMasterPropertyProfile_(data, ownerIds) {
  data = data || {};
  var address = String(data.imovel_endereco || data.imovel_localidade || '').trim();
  var structured = {
    street: String(data.imovel_rua || '').trim(), number: String(data.imovel_numero || '').trim(),
    district: String(data.imovel_bairro || '').trim(), complement: String(data.imovel_complemento || '').trim(),
    city: String(data.imovel_cidade || '').trim(), state: String(data.imovel_estado || '').trim(), zip: autDigits_(data.imovel_cep)
  };
  if (!address) address = [structured.street, structured.number, structured.district, structured.city, structured.state, structured.zip].filter(Boolean).join(', ');
  var code = String(data.imovel_codigo || '').trim();
  var registration = String(data.imovel_matricula || data.registro_cartorio_numero || '').trim();
  if (!code && !registration && !address) return null;
  return {
    CODIGO_INTERNO: code, MATRICULA: registration,
    INSCRICAO_IPTU: String(data.imovel_iptu || data.iptu_numero_titular || '').trim(),
    TIPO_IMOVEL: String(data.tipo_imovel || '').trim(), ENDERECO: address, ENDERECO_JSON: structured,
    PROPRIETARIOS_JSON: ownerIds || [], MODALIDADE_CAPTACAO: String(data.captacao_modalidade || '').trim(),
    AUTORIZACAO_RYCKY_PALMER: String(data.autorizacao_rycky_palmer || '').trim(),
    STATUS_CAPTACAO: data.captacao_modalidade ? 'CAPTADO' : 'CADASTRADO', DADOS_JSON: {
      observacoes: String(data.captacao_observacoes || '').trim()
    }
  };
}

function autMasterPropertyMatch_(profile) {
  var rows = autRows_('BASE_IMOVEIS').filter(function(row) { return row.STATUS !== 'EXCLUIDO'; });
  var code = autNormalize_(profile.CODIGO_INTERNO);
  var registration = autNormalize_(profile.MATRICULA);
  var address = autNormalize_(profile.ENDERECO);
  var matches = rows.filter(function(row) {
    return (code && autNormalize_(row.CODIGO_INTERNO) === code) ||
      (registration && autNormalize_(row.MATRICULA) === registration) ||
      (address && autNormalize_(row.ENDERECO) === address);
  });
  var ids = {};
  matches = matches.filter(function(row) { if (ids[row.ID_IMOVEL]) return false; ids[row.ID_IMOVEL] = true; return true; });
  autAssert_(matches.length <= 1, 'Há imóveis possivelmente duplicados para este identificador. O cadastro foi bloqueado para conferência.', 'PROPERTY_DUPLICATE_DETECTED');
  return matches[0] || null;
}

function autMasterUpsertProperty_(actor, profile, process, source, context, options) {
  options = options || {};
  if (!profile) return null;
  var existing = options.existing || autMasterPropertyMatch_(profile);
  var now = autNow_();
  var processId = process && process.ID_PROCESSO || '';
  var fields = ['CODIGO_INTERNO', 'MATRICULA', 'INSCRICAO_IPTU', 'TIPO_IMOVEL', 'ENDERECO', 'ENDERECO_JSON', 'PROPRIETARIOS_JSON', 'MODALIDADE_CAPTACAO', 'AUTORIZACAO_RYCKY_PALMER', 'STATUS_CAPTACAO', 'DADOS_JSON'];
  var patch = {};
  var conflicts = [];
  fields.forEach(function(field) {
    var incoming = /_JSON$/.test(field) ? autJson_(profile[field] || (field === 'PROPRIETARIOS_JSON' ? [] : {})) : profile[field];
    if (!autMasterValue_(incoming)) return;
    var current = existing ? existing[field] : '';
    if (!existing || !autMasterValue_(current) || (options.force && autMasterBaseEditor_(actor, 'BASE_IMOVEIS_EDITAR'))) patch[field] = incoming;
    else if (autMasterComparable_(field, current) !== autMasterComparable_(field, incoming)) conflicts.push({ field: field, value: incoming, at: now, processId: processId });
  });
  var processIds = Array.from(new Set((existing ? autJsonParse_(existing.PROCESSOS_JSON, []) : []).concat(processId ? [processId] : []))).slice(-100);
  var sources = existing ? autJsonParse_(existing.FONTES_JSON, []) : [];
  var sourceAlreadyRegistered = options.silentAudit && sources.some(function(item) {
    return String(item.processId || '') === String(processId) && String(item.source || '') === String(source || 'PROCESSO');
  });
  if (!sourceAlreadyRegistered) sources.push({ processId: processId, source: source || 'PROCESSO', at: now, actorId: actor && actor.ID_USUARIO || 'SISTEMA' });
  patch.PROCESSOS_JSON = autJson_(processIds); patch.FONTES_JSON = autJson_(sources.slice(-50));
  if (conflicts.length) {
    var data = autJsonParse_(existing && existing.DADOS_JSON, {});
    data.conflitos = (data.conflitos || []).concat(conflicts).slice(-20);
    patch.DADOS_JSON = autJson_(data);
  }
  if (!existing) {
    var id = 'IMO-' + autUuid_().slice(0, 12).toUpperCase();
    patch.ID_IMOVEL = id;
    patch.CHAVE_IMOVEL = autHash_(profile.MATRICULA || profile.CODIGO_INTERNO || profile.ENDERECO).slice(0, 32);
    patch.STATUS = 'ATIVO'; patch.VERSAO_REGISTRO = 1; patch.CRIADO_EM = now;
    patch.CRIADO_POR = actor && actor.NOME || 'MIGRACAO'; patch.ATUALIZADO_EM = now;
    patch.ATUALIZADO_POR = actor && actor.NOME || 'MIGRACAO';
    autAppend_('BASE_IMOVEIS', patch);
    if (!options.silentAudit) autAudit_(actor, 'BASE_IMOVEL_CRIADO', 'BASE_IMOVEL', id, { processo: processId, fonte: source }, context);
    return { id: id, created: true, conflicts: conflicts.length };
  }
  patch.VERSAO_REGISTRO = Number(existing.VERSAO_REGISTRO || 1) + 1; patch.ATUALIZADO_EM = now;
  patch.ATUALIZADO_POR = actor && actor.NOME || 'MIGRACAO';
  if (options.silentAudit && !conflicts.length) {
    var materialChange = Object.keys(patch).some(function(field) {
      return ['VERSAO_REGISTRO', 'ATUALIZADO_EM', 'ATUALIZADO_POR'].indexOf(field) < 0 && autMasterComparable_(field, patch[field]) !== autMasterComparable_(field, existing[field]);
    });
    if (!materialChange) return { id: existing.ID_IMOVEL, created: false, conflicts: 0, unchanged: true };
  }
  autUpdateRow_('BASE_IMOVEIS', existing._row, patch);
  if (!options.silentAudit) autAudit_(actor, conflicts.length ? 'BASE_IMOVEL_CONFLITO_REGISTRADO' : 'BASE_IMOVEL_ATUALIZADO', 'BASE_IMOVEL', existing.ID_IMOVEL, { processo: processId, fonte: source, conflitos: conflicts.length }, context);
  return { id: existing.ID_IMOVEL, created: false, conflicts: conflicts.length };
}

function autSyncProcessMasterData_(actor, process, data, context, options) {
  options = options || {};
  if (!process || !data) return {};
  var clientRoles = [autPrimaryClientRole_(process.TIPO_PROCESSO)];
  var client = autMasterUpsertClient_(actor, autMasterProcessProfile_(data, 'cliente', clientRoles), process, options.source || 'FICHA_CLIENTE', context, options);
  var owner = autMasterUpsertClient_(actor, autMasterProcessProfile_(data, 'titular', ['PROPRIETARIO']), process, options.source || 'FICHA_TITULAR', context, options);
  var property = autMasterUpsertProperty_(actor, autMasterPropertyProfile_(data, owner ? [owner.id] : []), process, options.source || 'FICHA_IMOVEL', context, options);
  var patch = {};
  if (client) patch.ID_CLIENTE_BASE = client.id;
  if (owner) patch.ID_TITULAR_BASE = owner.id;
  if (property) patch.ID_IMOVEL_BASE = property.id;
  if (Object.keys(patch).length && process._row) autUpdateRow_('PROCESSOS', process._row, patch);
  return { client: client, owner: owner, property: property };
}

function autSyncProcessMasterDataSafe_(actor, process, data, context, options) {
  try {
    return autSyncProcessMasterData_(actor, process, data, context, options);
  } catch (error) {
    autAudit_(actor, 'BASE_MESTRE_SINCRONIZACAO_PENDENTE', 'PROCESSO', process && process.ID_PROCESSO || '', {
      origem: options && options.source || 'PROCESSO', codigo: error.code || 'MASTER_SYNC_ERROR'
    }, context);
    return { pending: true, errorCode: error.code || 'MASTER_SYNC_ERROR' };
  }
}

function autMaskMasterDocument_(value) {
  var digits = autMasterCanonicalDocument_('', value);
  if (digits.length === 11) return '***.***.***-' + digits.slice(-2);
  if (digits.length === 14) return '**.***.***/****-' + digits.slice(-2);
  return '—';
}

function autMasterClientPublic_(row, full) {
  var data = autJsonParse_(row.DADOS_JSON, {});
  var canonicalDocument = autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ);
  var result = {
    id: row.ID_CADASTRO, personType: row.TIPO_PESSOA, document: full ? canonicalDocument : autMaskMasterDocument_(canonicalDocument),
    name: row.NOME_RAZAO_SOCIAL, tradeName: row.NOME_FANTASIA, email: row.EMAIL,
    phone: row.TELEFONE, roles: autJsonParse_(row.PAPEIS_JSON, []), quality: Number(row.QUALIDADE || 0),
    conflicts: Number(row.CONFLITOS_ABERTOS || 0), status: row.STATUS, version: Number(row.VERSAO_REGISTRO || 1),
    processCount: autJsonParse_(row.PROCESSOS_JSON, []).length, updatedAt: row.ATUALIZADO_EM
  };
  if (full) Object.assign(result, {
    rgIe: row.RG_IE, issuer: row.ORGAO_EXPEDIDOR, birthOpening: row.DATA_NASCIMENTO_ABERTURA,
    nationality: row.NACIONALIDADE, maritalStatus: row.ESTADO_CIVIL, propertyRegime: row.REGIME_BENS,
    profession: row.PROFISSAO, income: Number(row.RENDA || 0), incomeOrigin: row.RENDA_ORIGEM,
    employer: row.EMPRESA_TRABALHO, job: row.CARGO_FUNCAO,
    messagePhone: row.TELEFONE_RECADO, messageContactName: row.CONTATO_RECADO_NOME,
    address: autJsonParse_(row.ENDERECO_JSON, {}), legalRepresentative: row.REPRESENTANTE_LEGAL,
    data: data, processIds: autJsonParse_(row.PROCESSOS_JSON, [])
  });
  return result;
}

function apiPesquisarBaseClientes(token, filters) {
  try {
    var actor = autRequireAuth_(token, 'BASE_CLIENTES_VER');
    filters = filters || {};
    var rawSearch = String(filters.search || '').slice(0, 200);
    var search = autNormalize_(rawSearch);
    var searchDigits = /^[\d.\-\/\s]+$/.test(rawSearch) ? autDigits_(rawSearch) : '';
    var tokens = search.split(/\s+/).filter(Boolean);
    var rows = autRows_('BASE_CLIENTES').filter(function(row) {
      if (!autMasterActiveClient_(row)) return false;
      if (!tokens.length) return true;
      var canonicalDocument = autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ);
      var haystack = autNormalize_([row.ID_CADASTRO, row.NOME_RAZAO_SOCIAL, row.NOME_FANTASIA, canonicalDocument, row.EMAIL, row.TELEFONE, row.PAPEIS_JSON].join(' '));
      return (searchDigits && canonicalDocument.indexOf(searchDigits) >= 0) || tokens.every(function(value) { return haystack.indexOf(value) >= 0; });
    }).sort(function(a, b) { return String(a.NOME_RAZAO_SOCIAL || '').localeCompare(String(b.NOME_RAZAO_SOCIAL || ''), 'pt-BR'); });
    var page = Math.max(Number(filters.page || 1), 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 10), 100);
    return autResult_({
      items: rows.slice((page - 1) * pageSize, page * pageSize).map(function(row) { return autMasterClientPublic_(row, false); }),
      page: page, pageSize: pageSize, total: rows.length,
      canEdit: autMasterBaseEditor_(actor, 'BASE_CLIENTES_EDITAR')
    });
  } catch (err) { return autPublicError_(err); }
}

function apiObterCadastroCliente(token, id) {
  try {
    var actor = autRequireAuth_(token, 'BASE_CLIENTES_VER');
    var row = autFind_('BASE_CLIENTES', 'ID_CADASTRO', id);
    autAssert_(autMasterActiveClient_(row), 'Cadastro não encontrado.', 'NOT_FOUND');
    var canEdit = autMasterBaseEditor_(actor, 'BASE_CLIENTES_EDITAR');
    var conflicts = autMasterOpenConflicts_(row.ID_CADASTRO).map(function(conflict) {
      return {
        id: conflict.ID_CONFLITO, field: conflict.CAMPO, currentValue: conflict.VALOR_ATUAL,
        proposedValue: conflict.VALOR_NOVO, source: conflict.FONTE,
        processId: conflict.ID_PROCESSO_ORIGEM, createdAt: conflict.CRIADO_EM
      };
    });
    return autResult_({ item: autMasterClientPublic_(row, true), conflicts: conflicts, canEdit: canEdit });
  } catch (err) { return autPublicError_(err); }
}

function apiBuscarCadastroPorDocumento(token, document, context) {
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'PROCESSO_CRIAR') || autHasPermission_(actor, 'PROCESSO_EDITAR'), 'Você não pode usar o preenchimento cadastral.', 'FORBIDDEN');
    var digits = autMasterCanonicalDocument_('', document);
    autAssert_(autCpfValido_(digits) || autValidateCnpj_(digits), 'CPF/CNPJ inválido.', 'INVALID_DOCUMENT');
    var rows = autMasterRowsByDocument_(digits, autCpfValido_(digits) ? 'PF' : 'PJ');
    autAssert_(rows.length <= 1, 'Há cadastros duplicados para este CPF/CNPJ. O autopreenchimento foi bloqueado.', 'BASE_DUPLICATE_DETECTED');
    if (!rows.length) return autResult_({ found: false });
    autAudit_(actor, 'BASE_CLIENTE_CONSULTADA_AUTOPREENCHIMENTO', 'BASE_CLIENTE', rows[0].ID_CADASTRO, { documentoHash: autHash_(digits) }, context);
    return autResult_({ found: true, item: autMasterClientPublic_(rows[0], true) });
  } catch (err) { return autPublicError_(err); }
}

function autMasterPayloadProfile_(payload) {
  payload = payload || {};
  var type = String(payload.personType || 'PF').toUpperCase();
  var document = autMasterCanonicalDocument_(type, payload.document);
  autAssert_(autMasterDocumentValid_(type, document), type === 'PJ' ? 'CNPJ inválido.' : 'CPF inválido.', 'INVALID_DOCUMENT');
  autAssert_(String(payload.name || '').trim().length >= 3, 'Informe o nome ou razão social.', 'VALIDATION_ERROR');
  var email = autNormalizeEmail_(payload.email);
  if (email) autAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'E-mail inválido.', 'INVALID_EMAIL');
  return {
    TIPO_PESSOA: type, CPF_CNPJ: document, NOME_RAZAO_SOCIAL: String(payload.name || '').trim().slice(0, 200),
    NOME_FANTASIA: String(payload.tradeName || '').trim().slice(0, 200), RG_IE: String(payload.rgIe || '').trim().slice(0, 100),
    ORGAO_EXPEDIDOR: String(payload.issuer || '').trim().slice(0, 100), DATA_NASCIMENTO_ABERTURA: String(payload.birthOpening || '').trim().slice(0, 50),
    NACIONALIDADE: String(payload.nationality || '').trim().slice(0, 100), ESTADO_CIVIL: String(payload.maritalStatus || '').trim().slice(0, 100),
    REGIME_BENS: String(payload.propertyRegime || '').trim().slice(0, 100), PROFISSAO: String(payload.profession || '').trim().slice(0, 150),
    RENDA: autCurrencyNumber_(payload.income), RENDA_ORIGEM: String(payload.incomeOrigin || '').trim().slice(0, 150),
    EMPRESA_TRABALHO: String(payload.employer || '').trim().slice(0, 200), CARGO_FUNCAO: String(payload.job || '').trim().slice(0, 200),
    EMAIL: email, TELEFONE: String(payload.phone || '').trim().slice(0, 100), TELEFONE_RECADO: String(payload.messagePhone || '').trim().slice(0, 100),
    CONTATO_RECADO_NOME: String(payload.messageContactName || '').trim().slice(0, 200), ENDERECO_JSON: payload.address || {},
    REPRESENTANTE_LEGAL: String(payload.legalRepresentative || '').trim().slice(0, 200), PAPEIS_JSON: payload.roles || [], DADOS_JSON: payload.data || {}
  };
}

function apiSalvarCadastroCliente(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'BASE_CLIENTES_EDITAR');
    autAssert_(autMasterBaseEditor_(actor, 'BASE_CLIENTES_EDITAR'), 'Somente Desenvolvedor, Gerente Administrativo ou Gerente Geral pode editar a Carta de Clientes.', 'FORBIDDEN');
    payload = payload || {};
    lock.waitLock(30000);
    var existing = autFind_('BASE_CLIENTES', 'ID_CADASTRO', payload.id);
    autAssert_(existing, 'Cadastro não encontrado.', 'NOT_FOUND');
    autAssert_(Number(payload.expectedVersion || 0) === Number(existing.VERSAO_REGISTRO || 1), 'Este cadastro foi alterado por outro usuário. Atualize a Carta de Clientes.', 'VERSION_CONFLICT');
    var requestKey = autClaimRequest_(actor, 'BASE_CLIENTE_EDITAR|' + existing.ID_CADASTRO, context);
    var profile = autMasterPayloadProfile_(payload);
    var other = autMasterRowsByDocument_(profile.CPF_CNPJ, profile.TIPO_PESSOA).filter(function(row) { return row.ID_CADASTRO !== existing.ID_CADASTRO; });
    autAssert_(!other.length, 'Já existe outro cadastro para este CPF/CNPJ.', 'DUPLICATE_DOCUMENT');
    var result = autMasterUpsertClient_(actor, profile, null, 'EDICAO_MANUAL', context, { existing: existing, force: true });
    var refreshed = autFind_('BASE_CLIENTES', 'ID_CADASTRO', existing.ID_CADASTRO);
    var openConflicts = autMasterRefreshConflictCount_(existing.ID_CADASTRO);
    autAudit_(actor, 'BASE_CLIENTE_EDITADO_MANUALMENTE', 'BASE_CLIENTE', existing.ID_CADASTRO, { documentoHash: autHash_(profile.CPF_CNPJ) }, context);
    autCommitRequest_(requestKey);
    return autResult_({ saved: true, id: result.id, version: Number(refreshed.VERSAO_REGISTRO || 1), conflicts: openConflicts });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autMasterPropertyPublic_(row, full) {
  var result = {
    id: row.ID_IMOVEL, code: row.CODIGO_INTERNO, registration: row.MATRICULA, type: row.TIPO_IMOVEL,
    address: row.ENDERECO, captureMode: row.MODALIDADE_CAPTACAO, captureStatus: row.STATUS_CAPTACAO,
    processCount: autJsonParse_(row.PROCESSOS_JSON, []).length, status: row.STATUS,
    version: Number(row.VERSAO_REGISTRO || 1), updatedAt: row.ATUALIZADO_EM
  };
  if (full) Object.assign(result, {
    iptu: row.INSCRICAO_IPTU, addressData: autJsonParse_(row.ENDERECO_JSON, {}),
    ownerIds: autJsonParse_(row.PROPRIETARIOS_JSON, []), authorizationRyckyPalmer: row.AUTORIZACAO_RYCKY_PALMER,
    data: autJsonParse_(row.DADOS_JSON, {}), processIds: autJsonParse_(row.PROCESSOS_JSON, [])
  });
  return result;
}

function apiPesquisarBaseImoveis(token, filters) {
  try {
    var actor = autRequireAuth_(token, 'BASE_IMOVEIS_VER');
    filters = filters || {};
    var search = autNormalize_(String(filters.search || '')).slice(0, 200);
    var tokens = search.split(/\s+/).filter(Boolean);
    var rows = autRows_('BASE_IMOVEIS').filter(function(row) {
      if (row.STATUS === 'EXCLUIDO') return false;
      var haystack = autNormalize_([row.ID_IMOVEL, row.CODIGO_INTERNO, row.MATRICULA, row.INSCRICAO_IPTU, row.TIPO_IMOVEL, row.ENDERECO, row.MODALIDADE_CAPTACAO].join(' '));
      return tokens.every(function(value) { return haystack.indexOf(value) >= 0; });
    }).sort(function(a, b) { return String(a.ENDERECO || a.CODIGO_INTERNO || '').localeCompare(String(b.ENDERECO || b.CODIGO_INTERNO || ''), 'pt-BR'); });
    var page = Math.max(Number(filters.page || 1), 1); var pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 10), 100);
    return autResult_({ items: rows.slice((page - 1) * pageSize, page * pageSize).map(function(row) { return autMasterPropertyPublic_(row, false); }), page: page, pageSize: pageSize, total: rows.length, canEdit: autMasterBaseEditor_(actor, 'BASE_IMOVEIS_EDITAR') });
  } catch (err) { return autPublicError_(err); }
}

function apiObterCadastroImovel(token, id) {
  try {
    var actor = autRequireAuth_(token, 'BASE_IMOVEIS_VER');
    var row = autFind_('BASE_IMOVEIS', 'ID_IMOVEL', id);
    autAssert_(row && row.STATUS !== 'EXCLUIDO', 'Imóvel não encontrado.', 'NOT_FOUND');
    return autResult_({ item: autMasterPropertyPublic_(row, true), canEdit: autMasterBaseEditor_(actor, 'BASE_IMOVEIS_EDITAR') });
  } catch (err) { return autPublicError_(err); }
}

function apiSalvarCadastroImovel(token, payload, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'BASE_IMOVEIS_EDITAR');
    autAssert_(autMasterBaseEditor_(actor, 'BASE_IMOVEIS_EDITAR'), 'Somente Desenvolvedor, Gerente Administrativo ou Gerente Geral pode editar a base de imóveis.', 'FORBIDDEN');
    payload = payload || {};
    lock.waitLock(30000);
    var existing = autFind_('BASE_IMOVEIS', 'ID_IMOVEL', payload.id);
    autAssert_(existing && existing.STATUS !== 'EXCLUIDO', 'Imóvel não encontrado.', 'NOT_FOUND');
    autAssert_(Number(payload.expectedVersion || 0) === Number(existing.VERSAO_REGISTRO || 1), 'Este imóvel foi alterado por outro usuário. Atualize a base.', 'VERSION_CONFLICT');
    var profile = {
      CODIGO_INTERNO: String(payload.code || '').trim().slice(0, 100),
      MATRICULA: String(payload.registration || '').trim().slice(0, 150),
      INSCRICAO_IPTU: String(payload.iptu || '').trim().slice(0, 150),
      TIPO_IMOVEL: String(payload.type || '').trim().slice(0, 150),
      ENDERECO: String(payload.address || '').trim().slice(0, 1000),
      ENDERECO_JSON: payload.addressData || {},
      PROPRIETARIOS_JSON: autJsonParse_(existing.PROPRIETARIOS_JSON, []),
      MODALIDADE_CAPTACAO: String(payload.captureMode || '').trim().slice(0, 150),
      AUTORIZACAO_RYCKY_PALMER: String(payload.authorizationRyckyPalmer || '').trim().slice(0, 100),
      STATUS_CAPTACAO: String(payload.captureStatus || 'CADASTRADO').trim().slice(0, 100),
      DADOS_JSON: { observacoes: String(payload.observations || '').trim().slice(0, 5000) }
    };
    autAssert_(profile.CODIGO_INTERNO || profile.MATRICULA || profile.ENDERECO, 'Informe ao menos código, matrícula ou endereço.', 'VALIDATION_ERROR');
    var normalizedCode = autNormalize_(profile.CODIGO_INTERNO);
    var normalizedRegistration = autNormalize_(profile.MATRICULA);
    var normalizedAddress = autNormalize_(profile.ENDERECO);
    var duplicate = autRows_('BASE_IMOVEIS').filter(function(row) {
      if (row.STATUS === 'EXCLUIDO' || row.ID_IMOVEL === existing.ID_IMOVEL) return false;
      return (normalizedCode && autNormalize_(row.CODIGO_INTERNO) === normalizedCode) ||
        (normalizedRegistration && autNormalize_(row.MATRICULA) === normalizedRegistration) ||
        (normalizedAddress && autNormalize_(row.ENDERECO) === normalizedAddress);
    });
    autAssert_(!duplicate.length, 'Outro imóvel já utiliza este código, matrícula ou endereço.', 'PROPERTY_DUPLICATE_DETECTED');
    var requestKey = autClaimRequest_(actor, 'BASE_IMOVEL_EDITAR|' + existing.ID_IMOVEL, context);
    autMasterUpsertProperty_(actor, profile, null, 'EDICAO_MANUAL', context, { existing: existing, force: true });
    var refreshed = autFind_('BASE_IMOVEIS', 'ID_IMOVEL', existing.ID_IMOVEL);
    autAudit_(actor, 'BASE_IMOVEL_EDITADO_MANUALMENTE', 'BASE_IMOVEL', existing.ID_IMOVEL, { versao: refreshed.VERSAO_REGISTRO }, context);
    autCommitRequest_(requestKey);
    return autResult_({ saved: true, id: existing.ID_IMOVEL, version: Number(refreshed.VERSAO_REGISTRO || 1) });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiBuscarImovelPorIdentificador(token, identifier, context) {
  try {
    var actor = autRequireAuth_(token);
    autAssert_(autHasPermission_(actor, 'PROCESSO_CRIAR') || autHasPermission_(actor, 'PROCESSO_EDITAR'), 'Você não pode usar o preenchimento de imóveis.', 'FORBIDDEN');
    var normalized = autNormalize_(String(identifier || '')).slice(0, 200);
    autAssert_(normalized.length >= 2, 'Informe o código ou a matrícula do imóvel.', 'VALIDATION_ERROR');
    var rows = autRows_('BASE_IMOVEIS').filter(function(row) {
      return row.STATUS !== 'EXCLUIDO' && (autNormalize_(row.CODIGO_INTERNO) === normalized || autNormalize_(row.MATRICULA) === normalized || autNormalize_(row.ID_IMOVEL) === normalized);
    });
    autAssert_(rows.length <= 1, 'Há imóveis duplicados para este identificador.', 'PROPERTY_DUPLICATE_DETECTED');
    if (!rows.length) return autResult_({ found: false });
    autAudit_(actor, 'BASE_IMOVEL_CONSULTADA_AUTOPREENCHIMENTO', 'BASE_IMOVEL', rows[0].ID_IMOVEL, { identificadorHash: autHash_(normalized) }, context);
    return autResult_({ found: true, item: autMasterPropertyPublic_(rows[0], true) });
  } catch (err) { return autPublicError_(err); }
}

function autMasterProtectDocumentColumns_() {
  [['BASE_CLIENTES', 'CPF_CNPJ'], ['PROCESSO_PARTICIPANTES', 'CPF_CNPJ'], ['PROCESSOS', 'CLIENTE_CPF']].forEach(function(entry) {
    var sheet = autSheet_(entry[0]);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var column = headers.indexOf(entry[1]) + 1;
    if (column > 0 && sheet.getMaxRows() > 1) sheet.getRange(2, column, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  });
}

function autMasterReconcileConflicts_(actor) {
  var resolved = 0;
  var kept = 0;
  var seen = {};
  autRows_('BASE_CLIENTES_CONFLITOS').filter(function(row) { return row.STATUS === 'ABERTO'; }).forEach(function(conflict) {
    var client = autFind_('BASE_CLIENTES', 'ID_CADASTRO', conflict.ID_CADASTRO);
    var field = conflict.CAMPO;
    var current = client ? client[field] : conflict.VALOR_ATUAL;
    var proposed = conflict.VALOR_NOVO;
    var comparable = autMasterComparable_(field, proposed);
    var key = String(conflict.ID_CADASTRO) + '|' + field + '|' + comparable;
    var equivalent = field === 'DADOS_JSON' || (client && (!autMasterMeaningful_(field, proposed) ||
      autMasterComparable_(field, current) === comparable || Boolean(seen[key])));
    if (equivalent) {
      autUpdateRow_('BASE_CLIENTES_CONFLITOS', conflict._row, {
        STATUS: 'RESOLVIDO_AUTOMATICAMENTE', RESOLVIDO_EM: autNow_(),
        RESOLVIDO_POR: actor && actor.NOME || 'NORMALIZACAO_SEGURA'
      });
      resolved += 1;
    } else {
      seen[key] = true;
      kept += 1;
    }
  });
  autRows_('BASE_CLIENTES').forEach(function(row) { autMasterRefreshConflictCount_(row.ID_CADASTRO); });
  return { resolved: resolved, kept: kept };
}

function autMasterConsolidateClients_(actor, context) {
  autMasterProtectDocumentColumns_();
  var groups = {};
  autRows_('BASE_CLIENTES').filter(autMasterActiveClient_).forEach(function(row) {
    var canonical = autMasterCanonicalDocument_(row.TIPO_PESSOA, row.CPF_CNPJ);
    if (!autMasterDocumentValid_(row.TIPO_PESSOA, canonical)) return;
    var key = String(row.TIPO_PESSOA || 'PF').toUpperCase() + '|' + canonical;
    (groups[key] = groups[key] || []).push(row);
  });
  var summary = { canonicalized: 0, merged: 0, relinkedProcesses: 0, relinkedParticipants: 0, relinkedProperties: 0 };
  Object.keys(groups).forEach(function(key) {
    var rows = groups[key].sort(function(a, b) {
      var quality = Number(b.QUALIDADE || 0) - Number(a.QUALIDADE || 0);
      if (quality) return quality;
      return String(a.CRIADO_EM || '').localeCompare(String(b.CRIADO_EM || '')) || Number(a._row) - Number(b._row);
    });
    var survivor = rows[0];
    var canonical = key.split('|')[1];
    var survivorPatch = {};
    if (String(survivor.CPF_CNPJ || '') !== canonical) {
      survivorPatch.CPF_CNPJ = canonical;
      summary.canonicalized += 1;
    }
    rows.slice(1).forEach(function(duplicate) {
      autMasterClientFields_().forEach(function(field) {
        if (field === 'DADOS_JSON' || field === 'CPF_CNPJ' || field === 'TIPO_PESSOA') return;
        var current = Object.prototype.hasOwnProperty.call(survivorPatch, field) ? survivorPatch[field] : survivor[field];
        var incoming = duplicate[field];
        if (!autMasterMeaningful_(field, current) && autMasterMeaningful_(field, incoming)) survivorPatch[field] = incoming;
        else if (autMasterMeaningful_(field, incoming) && autMasterComparable_(field, current) !== autMasterComparable_(field, incoming)) {
          autMasterConflict_(survivor, field, current, incoming, null, 'CONSOLIDACAO_DUPLICATA');
        }
      });
      ['PAPEIS_JSON', 'PROCESSOS_JSON'].forEach(function(field) {
        var current = autJsonParse_(survivorPatch[field] || survivor[field], []);
        survivorPatch[field] = autJson_(Array.from(new Set(current.concat(autJsonParse_(duplicate[field], [])))));
      });
      var currentSources = autJsonParse_(survivorPatch.FONTES_JSON || survivor.FONTES_JSON, []);
      var duplicateSources = autJsonParse_(duplicate.FONTES_JSON, []);
      survivorPatch.FONTES_JSON = autJson_(currentSources.concat(duplicateSources).slice(-100));
      autRowsBy_('PROCESSOS', 'ID_CLIENTE_BASE', duplicate.ID_CADASTRO).forEach(function(process) {
        autUpdateRow_('PROCESSOS', process._row, { ID_CLIENTE_BASE: survivor.ID_CADASTRO }); summary.relinkedProcesses += 1;
      });
      autRowsBy_('PROCESSOS', 'ID_TITULAR_BASE', duplicate.ID_CADASTRO).forEach(function(process) {
        autUpdateRow_('PROCESSOS', process._row, { ID_TITULAR_BASE: survivor.ID_CADASTRO }); summary.relinkedProcesses += 1;
      });
      autRowsBy_('PROCESSO_PARTICIPANTES', 'ID_CADASTRO_BASE', duplicate.ID_CADASTRO).forEach(function(participant) {
        autUpdateRow_('PROCESSO_PARTICIPANTES', participant._row, { ID_CADASTRO_BASE: survivor.ID_CADASTRO }); summary.relinkedParticipants += 1;
      });
      autRows_('BASE_IMOVEIS').forEach(function(property) {
        var owners = autJsonParse_(property.PROPRIETARIOS_JSON, []);
        if (owners.indexOf(duplicate.ID_CADASTRO) < 0) return;
        autUpdateRow_('BASE_IMOVEIS', property._row, { PROPRIETARIOS_JSON: autJson_(Array.from(new Set(owners.map(function(id) { return id === duplicate.ID_CADASTRO ? survivor.ID_CADASTRO : id; })))) });
        summary.relinkedProperties += 1;
      });
      autRowsBy_('BASE_CLIENTES_CONFLITOS', 'ID_CADASTRO', duplicate.ID_CADASTRO).forEach(function(conflict) {
        autUpdateRow_('BASE_CLIENTES_CONFLITOS', conflict._row, { ID_CADASTRO: survivor.ID_CADASTRO, CPF_CNPJ_HASH: autHash_(canonical) });
      });
      var duplicateData = autJsonParse_(duplicate.DADOS_JSON, {});
      duplicateData.registroMesclado = { idCadastroCanonico: survivor.ID_CADASTRO, em: autNow_() };
      autUpdateRow_('BASE_CLIENTES', duplicate._row, {
        CPF_CNPJ: canonical, STATUS: 'MESCLADO', DADOS_JSON: autJson_(duplicateData),
        ATUALIZADO_EM: autNow_(), ATUALIZADO_POR: actor && actor.NOME || 'NORMALIZACAO_SEGURA',
        VERSAO_REGISTRO: Number(duplicate.VERSAO_REGISTRO || 1) + 1
      });
      summary.merged += 1;
    });
    if (Object.keys(survivorPatch).length) {
      var qualityRow = {};
      autMasterClientFields_().forEach(function(field) { qualityRow[field] = Object.prototype.hasOwnProperty.call(survivorPatch, field) ? survivorPatch[field] : survivor[field]; });
      survivorPatch.QUALIDADE = autMasterQuality_(qualityRow);
      survivorPatch.VERSAO_REGISTRO = Number(survivor.VERSAO_REGISTRO || 1) + 1;
      survivorPatch.ATUALIZADO_EM = autNow_();
      survivorPatch.ATUALIZADO_POR = actor && actor.NOME || 'NORMALIZACAO_SEGURA';
      autUpdateRow_('BASE_CLIENTES', survivor._row, survivorPatch);
    }
  });
  var conflicts = autMasterReconcileConflicts_(actor);
  summary.conflictsAutoResolved = conflicts.resolved;
  summary.conflictsPreserved = conflicts.kept;
  if (summary.merged || summary.canonicalized || conflicts.resolved) {
    autAudit_(actor, 'BASE_CLIENTES_NORMALIZADA', 'SISTEMA', AUTENTIKO.APP_NAME, summary, context);
  }
  return summary;
}

function autRunMasterMigration_(actor, context) {
  var consolidation = autMasterConsolidateClients_(actor, context);
  var processes = autRows_('PROCESSOS').filter(function(row) { return !row.EXCLUIDO_EM; });
  var summary = { processes: 0, clients: 0, properties: 0, participants: 0, conflicts: 0, consolidation: consolidation };
  processes.forEach(function(process) {
    var data = autProcessDataMap_(process);
    var links = autSyncProcessMasterData_(actor, process, data, context, { source: 'MIGRACAO_PROCESSO', silentAudit: true });
    summary.processes += 1;
    if (links.client) { summary.clients += 1; summary.conflicts += links.client.conflicts || 0; }
    if (links.owner) { summary.clients += 1; summary.conflicts += links.owner.conflicts || 0; }
    if (links.property) { summary.properties += 1; summary.conflicts += links.property.conflicts || 0; }
  });
  autRows_('PROCESSO_PARTICIPANTES').filter(function(row) { return String(row.ATIVO || 'SIM') !== 'NAO'; }).forEach(function(row) {
    var process = autFind_('PROCESSOS', 'ID_PROCESSO', row.ID_PROCESSO);
    var result = autMasterUpsertClient_(actor, autMasterParticipantProfile_(row), process, 'MIGRACAO_PARTICIPANTE', context, { silentAudit: true });
    if (result) {
      autUpdateRow_('PROCESSO_PARTICIPANTES', row._row, { ID_CADASTRO_BASE: result.id });
      summary.participants += 1; summary.conflicts += result.conflicts || 0;
    }
  });
  summary.conflictReconciliation = autMasterReconcileConflicts_(actor);
  var clientSheet = autSheet_('BASE_CLIENTES');
  if (clientSheet.getLastRow() > 2) clientSheet.getRange(2, 1, clientSheet.getLastRow() - 1, clientSheet.getLastColumn()).sort({ column: 4, ascending: true });
  var propertySheet = autSheet_('BASE_IMOVEIS');
  if (propertySheet.getLastRow() > 2) propertySheet.getRange(2, 1, propertySheet.getLastRow() - 1, propertySheet.getLastColumn()).sort({ column: 7, ascending: true });
  autAudit_(actor, 'BASE_MESTRE_MIGRADA', 'SISTEMA', AUTENTIKO.APP_NAME, summary, context);
  return summary;
}

function migrarBaseCadastros() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    autPrepareSheets_(autDb_());
    var actor = { ID_USUARIO: 'SISTEMA-MIGRACAO', NOME: 'Migração segura da base mestre', PERFIL: 'DESENVOLVEDOR', ID_SESSAO: '', PERMISSOES_JSON: autJson_(['*']) };
    return autResult_(autRunMasterMigration_(actor, { requestId: 'MIGRACAO-BASE-' + Utilities.formatDate(new Date(), AUTENTIKO.TIMEZONE, 'yyyyMMddHHmmss') }));
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiMigrarBaseCadastros(token, context) {
  var lock = LockService.getScriptLock();
  try {
    var actor = autRequireAuth_(token, 'BASE_CLIENTES_EDITAR');
    autAssert_(autMasterBaseEditor_(actor, 'BASE_CLIENTES_EDITAR'), 'Perfil não autorizado para migrar a base.', 'FORBIDDEN');
    lock.waitLock(30000);
    return autResult_(autRunMasterMigration_(actor, context));
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}
