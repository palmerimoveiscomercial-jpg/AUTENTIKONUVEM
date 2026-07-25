function setupSystem() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var db = autDb_();
    autInvalidateCaches_();
    autPrepareSheets_(db);
    autSeedConfigurations_();
    autSeedLists_();
    autSeedForms_();
    autSeedDocuments_();
    autSeedWorkflowV2_();
    var developer = autSeedDeveloper_();
    var folder = autEnsureRootFolder_();
    autEnsureOpenTrigger_();
    autEnsureMaintenanceTrigger_();
    autInvalidateCaches_();
    var result = {
      ok: true,
      app: AUTENTIKO.APP_NAME,
      version: AUTENTIKO.APP_VERSION,
      spreadsheetUrl: db.getUrl(),
      sheets: Object.keys(AUTENTIKO_SHEETS),
      developerEmail: developer.email,
      bootstrapPassword: developer.created ? developer.password : '',
      documentsFolderUrl: folder.getUrl(),
      message: developer.created
        ? 'Sistema instalado. Guarde a senha temporária e altere-a após o primeiro acesso.'
        : 'Estrutura verificada e reparada sem alterar a senha existente.'
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function autPrepareSheets_(db) {
  var names = Object.keys(AUTENTIKO_SHEETS);
  var first = db.getSheetByName('Página1');
  if (!db.getSheetByName('CONFIGURACOES') && first && first.getLastRow() <= 1 && first.getLastColumn() <= 1) {
    first.setName('CONFIGURACOES');
  }

  names.forEach(function(name) {
    var headers = AUTENTIKO_SHEETS[name];
    var sheet = db.getSheetByName(name);
    var created = !sheet;
    if (!sheet) sheet = db.insertSheet(name);
    var current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0] : [];
    var isBlank = current.every(function(value) { return !String(value).trim(); });
    var structureChanged = created || isBlank;
    if (isBlank) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      var missing = headers.filter(function(header) { return current.indexOf(header) < 0; });
      if (missing.length) {
        sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
        structureChanged = true;
      }
    }
    var finalColumns = Math.max(sheet.getLastColumn(), headers.length);
    sheet.setFrozenRows(1);
    if (structureChanged) {
      CacheService.getScriptCache().remove('AUT_HEADERS_' + sheet.getSheetId());
      sheet.getRange(1, 1, 1, finalColumns)
        .setBackground('#e5e7eb')
        .setFontColor('#111827')
        .setFontWeight('bold')
        .setWrap(true);
      if (!sheet.getFilter() && sheet.getMaxRows() > 1) {
        sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), finalColumns).createFilter();
      }
      sheet.autoResizeColumns(1, finalColumns);
      for (var col = 1; col <= finalColumns; col++) {
        if (sheet.getColumnWidth(col) > 320) sheet.setColumnWidth(col, 320);
      }
    }
    if (['USUARIOS', 'SESSOES', 'TOKENS_EMAIL'].indexOf(name) >= 0) {
      sheet.hideSheet();
      var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (!protections.length) sheet.protect().setDescription('Dados sensíveis — gerenciados pelo AUTENTIKO').setWarningOnly(true);
    }
  });
}

function autSeedConfigurations_() {
  var now = autNow_();
  var configs = [
    ['NOME_SISTEMA', 'AUTENTIKO OK NUVEM', 'IDENTIDADE', 'TEXT', 'Nome exibido no sistema', 'SIM'],
    ['SUBTITULO', 'Sistema de gestão administrativa de processos internos da Palmer Imóveis', 'IDENTIDADE', 'TEXT', 'Subtítulo do sistema', 'SIM'],
    ['VERSAO_SISTEMA', AUTENTIKO.APP_VERSION, 'SISTEMA', 'TEXT', 'Versão instalada', 'NAO'],
    ['EMPRESA_NOME', 'PALMER IMÓVEIS LTDA', 'EMPRESA', 'TEXT', 'Razão social', 'SIM'],
    ['EMPRESA_CNPJ', '55.963.658/0001-90', 'EMPRESA', 'TEXT', 'CNPJ', 'SIM'],
    ['EMPRESA_ENDERECO', 'Rua São Sebastião, 1747, sala 01, João Paulo II, Salinópolis/PA, CEP 68721-000', 'EMPRESA', 'TEXT', 'Endereço comercial', 'SIM'],
    ['EMPRESA_EMAIL', 'rycky.corretor@gmail.com', 'EMPRESA', 'TEXT', 'E-mail principal', 'SIM'],
    ['EMPRESA_EMAIL_COMERCIAL', 'palmer.imoveis.comercial@gmail.com', 'EMPRESA', 'TEXT', 'E-mail comercial', 'SIM'],
    ['EMPRESA_REPRESENTANTE', 'Rycky de Palmer Melo Dias', 'EMPRESA', 'TEXT', 'Representante legal', 'SIM'],
    ['EMPRESA_CRECI', '12.594', 'EMPRESA', 'TEXT', 'CRECI', 'SIM'],
    ['LOGO_URL', '', 'IDENTIDADE', 'URL', 'Logo do sistema', 'SIM'],
    ['COR_PRIMARIA', '#155eef', 'IDENTIDADE', 'COLOR', 'Cor primária', 'SIM'],
    ['MODO_MANUTENCAO', 'NAO', 'SISTEMA', 'BOOLEAN', 'Bloqueia acesso de usuários não desenvolvedores', 'SIM'],
    ['MENSAGEM_MANUTENCAO', 'O sistema está em manutenção programada. Tente novamente em alguns minutos.', 'SISTEMA', 'TEXT', 'Mensagem de manutenção', 'SIM'],
    ['PDF_PREVIEW_ENABLED', 'SIM', 'DOCUMENTOS', 'BOOLEAN', 'Ativa a pré-visualização autenticada e persistente de PDFs', 'SIM'],
    ['MAX_PDF_SIZE_MB', String(AUTENTIKO.MAX_UPLOAD_MB), 'DOCUMENTOS', 'NUMBER', 'Tamanho máximo de PDF aceito e pré-visualizado, em MB', 'SIM'],
    ['MEDIA_CLOUD_ENABLED', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Ativa gradualmente a nuvem documental Supabase/Vercel', 'SIM'],
    ['MEDIA_API_BASE_URL', '', 'DOCUMENTOS', 'TEXT', 'URL HTTPS da API de mídia validada pelo AUTENTIKO', 'SIM'],
    ['MEDIA_MAX_UPLOAD_MB', '25', 'DOCUMENTOS', 'NUMBER', 'Tamanho máximo de novos uploads diretos na nuvem, em MB', 'SIM'],
    ['MEDIA_MAX_PDF_SOURCE_MB', '100', 'DOCUMENTOS', 'NUMBER', 'Limite de entrada para PDF pesado; acima de 25 MB será otimizado em segundo plano', 'SIM'],
    ['ADOBE_ENABLED', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Ativa o processamento excepcional por Adobe PDF Services', 'SIM'],
    ['AUDITORIA_RETENCAO_ANOS', '10', 'AUDITORIA', 'NUMBER', 'Retenção inicial dos registros finalizados e de auditoria', 'SIM'],
    ['IP_CAPTURA_ATIVA', 'SIM', 'AUDITORIA', 'BOOLEAN', 'Registra IP público quando o navegador conseguir obtê-lo', 'SIM'],
    ['IP_SERVICO_PRIVACIDADE', 'api64.ipify.org', 'AUDITORIA', 'TEXT', 'Serviço configurado para consulta não bloqueante do IP público', 'NAO'],
    ['AVISO_PRIVACIDADE_AUDITORIA', 'O AUTENTIKO registra identificação da sessão, data, hora, navegador e, quando disponível, IP público para segurança e auditoria.', 'AUDITORIA', 'TEXT', 'Aviso apresentado antes de aceites eletrônicos', 'SIM'],
    ['CERTIFICADO_TIPO', 'Certificado eletrônico e-Notariado', 'CERTIFICADO', 'TEXT', 'Tipo do certificado', 'SIM'],
    ['CERTIFICADO_EMISSOR', 'Cartório do Único Ofício de Salinópolis/PA', 'CERTIFICADO', 'TEXT', 'Emissor', 'SIM'],
    ['CERTIFICADO_CNS', '06.742-1', 'CERTIFICADO', 'TEXT', 'CNS do emissor', 'SIM'],
    ['CERTIFICADO_CPF_TITULAR', '06120034269', 'CERTIFICADO', 'SENSITIVE', 'CPF vinculado ao certificado', 'SIM'],
    ['CERTIFICADO_THUMBPRINT', 'CxXJ+xdkb0tSCWPn1mE8E3rDD8CcaIDvJSuKHu/BU=', 'CERTIFICADO', 'SENSITIVE', 'Impressão digital do certificado', 'SIM'],
    ['CERTIFICADO_EMISSAO', '18/08/2025', 'CERTIFICADO', 'DATE', 'Data de emissão', 'SIM'],
    ['CERTIFICADO_EXPIRACAO', '17/08/2028', 'CERTIFICADO', 'DATE', 'Data de expiração', 'SIM']
  ];
  var existing = {};
  autRows_('CONFIGURACOES').forEach(function(row) { existing[row.CHAVE] = row; });
  autAppendMany_('CONFIGURACOES', configs.filter(function(item) { return !existing[item[0]]; }).map(function(item) {
      return {
        CHAVE: item[0], VALOR: item[1], GRUPO: item[2], TIPO: item[3],
        DESCRICAO: item[4], EDITAVEL: item[5], ATUALIZADO_EM: now, ATUALIZADO_POR: 'SETUP'
      };
  }));
  var installedVersion = existing.VERSAO_SISTEMA;
  if (installedVersion && String(installedVersion.VALOR) !== AUTENTIKO.APP_VERSION) {
    autUpdateRow_('CONFIGURACOES', installedVersion._row, {
      VALOR: AUTENTIKO.APP_VERSION, ATUALIZADO_EM: now, ATUALIZADO_POR: 'SETUP'
    });
  }
  var literalRepairs = {
    EMPRESA_CRECI: '12.594',
    CERTIFICADO_CPF_TITULAR: '06120034269'
  };
  Object.keys(literalRepairs).forEach(function(key) {
    var row = existing[key];
    if (row && typeof row.VALOR !== 'string') {
      autUpdateRow_('CONFIGURACOES', row._row, {
        VALOR: literalRepairs[key], ATUALIZADO_EM: now, ATUALIZADO_POR: 'MIGRACAO_TEXTO'
      });
    }
  });
}

function autSeedLists_() {
  var lists = {
    ESTADO_CIVIL: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'],
    MODALIDADE_FINANCIAMENTO: ['Minha Casa Minha Vida', 'Subsídio do governo', 'CDC', 'Carta de crédito + CDC', 'Subsídio + CDC'],
    FORMA_ENTRADA: ['À vista', 'Parcelado', 'À vista + parcelamento', 'Carta de crédito', 'Valor + garantia'],
    TIPO_IMOVEL: ['Casa', 'Lote', 'Terreno', 'Apartamento', 'Lançamento', 'Imóvel na planta', 'Prédio comercial', 'Cota'],
    ORIGEM_RENDA: ['Salário', 'Trabalho autônomo', 'Empresa própria', 'Benefício do INSS', 'Aposentadoria ou pensão', 'Aluguéis', 'Investimentos', 'Outros'],
    SIM_NAO: ['Sim', 'Não'],
    TIPO_ATUACAO: ['Observação', 'Contato com cliente', 'Análise documental', 'Solicitação de documento', 'Alteração cadastral', 'Decisão']
  };
  var existing = {};
  autRows_('LISTAS').forEach(function(row) { existing[row.TIPO + '|' + row.VALOR] = true; });
  var missingRows = [];
  Object.keys(lists).forEach(function(type) {
    lists[type].forEach(function(value, index) {
      if (!existing[type + '|' + value]) missingRows.push({ TIPO: type, VALOR: value, ORDEM: index + 1, ATIVO: 'SIM' });
    });
  });
  autAppendMany_('LISTAS', missingRows);
}

function autField_(type, section, name, label, input, required, order, options, condition) {
  return {
    ID_CAMPO: type + '.' + name,
    TIPO_PROCESSO: type,
    SECAO: section,
    CAMPO: name,
    ROTULO: label,
    TIPO_CAMPO: input || 'text',
    OPCOES_JSON: JSON.stringify(options || []),
    OBRIGATORIO: required ? 'SIM' : 'NAO',
    ORDEM: order,
    ATIVO: 'SIM',
    CONDICAO_JSON: condition ? JSON.stringify(condition) : ''
  };
}

function autBuyerFields_(type, start, section) {
  var rental = AUTENTIKO.RENTAL_INCOME_TYPES.indexOf(type) >= 0;
  var fields = [
    ['responsavel_processo', 'Responsável pelo processo', 'text', true, 'Controle do processo', start],
    ['cliente_nome', 'Nome do cliente / comprador / locatário', 'text', true, 'Cliente — Dados pessoais', start + 10],
    ['cliente_cpf', 'CPF', 'cpf', true, 'Cliente — Dados pessoais', start + 11],
    ['cliente_nascimento', 'Data de nascimento', 'date', false, 'Cliente — Dados pessoais', start + 12],
    ['cliente_documento', 'RG, CNH ou carteira de órgão credenciado', 'text', false, 'Cliente — Dados pessoais', start + 13],
    ['cliente_documento_expedicao', 'Data de expedição', 'date', false, 'Cliente — Dados pessoais', start + 14],
    ['cliente_orgao_expedidor', 'Órgão expedidor', 'text', false, 'Cliente — Dados pessoais', start + 15],
    ['cliente_estado_civil', 'Estado civil', 'select', false, 'Cliente — Dados pessoais', start + 16, 'ESTADO_CIVIL'],
    ['cliente_contato', 'Telefone principal', 'tel', true, 'Cliente — Dados de contato', start + 30],
    ['cliente_contato_recado', 'Telefone de recado', 'tel', false, 'Cliente — Dados de contato', start + 31],
    ['cliente_contato_recado_nome', 'Nome do contato de recado', 'text', false, 'Cliente — Dados de contato', start + 32],
    ['cliente_email', 'E-mail', 'email', true, 'Cliente — Dados de contato', start + 33],
    ['cliente_rua', 'Rua', 'text', true, 'Cliente — Dados de endereço', start + 40],
    ['cliente_numero', 'Número', 'text', true, 'Cliente — Dados de endereço', start + 41],
    ['cliente_bairro', 'Bairro', 'text', true, 'Cliente — Dados de endereço', start + 42],
    ['cliente_complemento', 'Complemento', 'text', false, 'Cliente — Dados de endereço', start + 43],
    ['cliente_cidade', 'Cidade', 'text', true, 'Cliente — Dados de endereço', start + 44],
    ['cliente_cep', 'CEP', 'cep', true, 'Cliente — Dados de endereço', start + 45],
    ['cliente_profissao', 'Profissão', 'text', rental, 'Cliente — Renda e emprego', start + 60],
    ['cliente_renda', 'Renda mensal comprovada', 'currency', rental, 'Cliente — Renda e emprego', start + 61],
    ['cliente_renda_origem', 'Origem principal da renda', 'select', rental, 'Cliente — Renda e emprego', start + 62, 'ORIGEM_RENDA'],
    ['cliente_empresa', 'Empresa ou local onde trabalha', 'text', rental, 'Cliente — Renda e emprego', start + 63],
    ['cliente_cargo', 'Cargo', 'text', rental, 'Cliente — Renda e emprego', start + 64],
    ['cliente_funcao', 'Função exercida', 'text', rental, 'Cliente — Renda e emprego', start + 65],
    ['cliente_tempo_emprego', 'Tempo de trabalho ou atividade', 'text', false, 'Cliente — Renda e emprego', start + 66]
  ];
  return fields.map(function(field) {
    return autField_(type, field[4], field[0], field[1], field[2], field[3], field[5], field[6] ? { list: field[6] } : []);
  });
}

function autOwnerFields_(type, start) {
  var fields = [
    ['titular_nome', 'Nome do proprietário / vendedor', 'text', true, 'Proprietário ou vendedor — Dados pessoais', start],
    ['titular_cpf', 'CPF do proprietário / vendedor', 'cpf', true, 'Proprietário ou vendedor — Dados pessoais', start + 1],
    ['titular_nascimento', 'Data de nascimento', 'date', false, 'Proprietário ou vendedor — Dados pessoais', start + 2],
    ['titular_documento', 'RG, CNH ou carteira credenciada', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 3],
    ['titular_documento_expedicao', 'Data de expedição', 'date', false, 'Proprietário ou vendedor — Dados pessoais', start + 4],
    ['titular_orgao_expedidor', 'Órgão expedidor', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 5],
    ['titular_estado_civil', 'Estado civil', 'select', false, 'Proprietário ou vendedor — Dados pessoais', start + 6, 'ESTADO_CIVIL'],
    ['titular_profissao', 'Profissão', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 7],
    ['titular_contato', 'Telefone principal', 'tel', true, 'Proprietário ou vendedor — Dados de contato', start + 20],
    ['titular_contato_recado', 'Telefone de recado', 'tel', false, 'Proprietário ou vendedor — Dados de contato', start + 21],
    ['titular_contato_recado_nome', 'Nome do contato de recado', 'text', false, 'Proprietário ou vendedor — Dados de contato', start + 22],
    ['titular_email', 'E-mail', 'email', false, 'Proprietário ou vendedor — Dados de contato', start + 23],
    ['titular_rua', 'Rua', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 40],
    ['titular_numero', 'Número', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 41],
    ['titular_bairro', 'Bairro', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 42],
    ['titular_complemento', 'Complemento', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 43],
    ['titular_cidade', 'Cidade', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 44],
    ['titular_cep', 'CEP', 'cep', false, 'Proprietário ou vendedor — Dados de endereço', start + 45]
  ];
  return fields.map(function(field) {
    return autField_(type, field[4], field[0], field[1], field[2], field[3], field[5], field[6] ? { list: field[6] } : []);
  });
}

function autSeedForms_() {
  var forms = [];
  AUTENTIKO.PROCESS_TYPES.forEach(function(type) {
    forms = forms.concat(autBuyerFields_(type, 10));
    forms = forms.concat(autOwnerFields_(type, 100));
  });

  var financed = 'COMPRA_IMOVEL_FINANCIADO';
  forms = forms.concat([
    autField_(financed, 'Financiamento', 'modalidade_financiamento', 'Modalidade', 'select', true, 60, { list: 'MODALIDADE_FINANCIAMENTO' }),
    autField_(financed, 'Financiamento', 'numero_nis', 'Número NIS', 'text', false, 61),
    autField_(financed, 'Dados do imóvel', 'imovel_codigo', 'Código interno do imóvel', 'text', true, 200),
    autField_(financed, 'Dados do imóvel', 'imovel_valor_ofertado', 'Valor do imóvel ofertado', 'currency', true, 201),
    autField_(financed, 'Dados do imóvel', 'credito_aprovado', 'Crédito aprovado', 'currency', false, 202),
    autField_(financed, 'Dados do imóvel', 'banco_nome', 'Nome do banco', 'text', false, 203),
    autField_(financed, 'Dados do imóvel', 'imovel_endereco', 'Endereço do imóvel', 'textarea', true, 204),
    autField_(financed, 'Dados do imóvel', 'imovel_matricula', 'Matrícula do imóvel', 'text', false, 205),
    autField_(financed, 'Dados do imóvel', 'imovel_iptu', 'IPTU do imóvel', 'text', false, 206),
    autField_(financed, 'Dados do imóvel', 'valor_entrada', 'Valor de entrada', 'currency', false, 207),
    autField_(financed, 'Dados do imóvel', 'forma_entrada', 'Forma de pagamento da entrada', 'select', false, 208, { list: 'FORMA_ENTRADA' })
  ]);

  var cash = 'COMPRA_IMOVEL_AVISTA';
  forms = forms.concat([
    autField_(cash, 'Regularidade do imóvel', 'tem_contrato_compra_venda', 'Tem contrato de compra e venda?', 'select', true, 200, { list: 'SIM_NAO' }),
    autField_(cash, 'Regularidade do imóvel', 'tem_iptu', 'Tem IPTU?', 'select', true, 201, { list: 'SIM_NAO' }),
    autField_(cash, 'Regularidade do imóvel', 'iptu_numero_titular', 'Número e titular do IPTU', 'text', false, 202, [], { field: 'tem_iptu', equals: 'Sim' }),
    autField_(cash, 'Regularidade do imóvel', 'tem_matricula_agua', 'Tem matrícula de água?', 'select', true, 203, { list: 'SIM_NAO' }),
    autField_(cash, 'Regularidade do imóvel', 'matricula_agua_numero', 'Número da matrícula de água', 'text', false, 204, [], { field: 'tem_matricula_agua', equals: 'Sim' }),
    autField_(cash, 'Regularidade do imóvel', 'tem_registro_cartorio', 'Tem registro em cartório?', 'select', true, 205, { list: 'SIM_NAO' }),
    autField_(cash, 'Regularidade do imóvel', 'registro_cartorio_numero', 'Número do registro', 'text', false, 206, [], { field: 'tem_registro_cartorio', equals: 'Sim' }),
    autField_(cash, 'Regularidade do imóvel', 'imovel_heranca', 'O imóvel é de herança?', 'select', true, 207, { list: 'SIM_NAO' }),
    autField_(cash, 'Regularidade do imóvel', 'tipo_imovel', 'Tipo de imóvel', 'select', true, 208, { list: 'TIPO_IMOVEL' }),
    autField_(cash, 'Regularidade do imóvel', 'unidade_consumidora_numero', 'Número da unidade consumidora', 'text', false, 209),
    autField_(cash, 'Regularidade do imóvel', 'conta_contrato_numero', 'Número da conta contrato', 'text', false, 210),
    autField_(cash, 'Negociação', 'valor_negociado', 'Valor negociado', 'currency', true, 300),
    autField_(cash, 'Negociação', 'forma_pagamento', 'Forma de pagamento', 'text', true, 301),
    autField_(cash, 'Negociação', 'honorarios_valor', 'Honorários de corretagem (R$)', 'currency', false, 302),
    autField_(cash, 'Negociação', 'honorarios_percentual', 'Honorários de corretagem (%)', 'number', false, 303),
    autField_(cash, 'Dados do imóvel', 'imovel_endereco', 'Endereço do imóvel', 'textarea', true, 400)
  ]);

  var season = 'ALUGUEL_TEMPORADA';
  forms = forms.concat([
    autField_(season, 'Negociação', 'imovel_localidade', 'Localidade do imóvel', 'text', true, 200),
    autField_(season, 'Negociação', 'numero_diarias', 'Número de diárias', 'number', true, 201),
    autField_(season, 'Negociação', 'valor_diaria', 'Valor da diária', 'currency', true, 202),
    autField_(season, 'Negociação', 'data_entrada', 'Data de entrada', 'date', true, 203),
    autField_(season, 'Negociação', 'data_saida', 'Data de saída', 'date', true, 204),
    autField_(season, 'Negociação', 'numero_pessoas', 'Número de pessoas', 'number', true, 205),
    autField_(season, 'Negociação', 'comissao_valor', 'Valor da comissão', 'currency', false, 206),
    autField_(season, 'Negociação', 'tipo_imovel', 'Tipo de imóvel', 'select', true, 207, { list: 'TIPO_IMOVEL' }),
    autField_(season, 'Dados do imóvel', 'imovel_endereco', 'Endereço do imóvel', 'textarea', true, 300)
  ]);

  AUTENTIKO.PROCESS_TYPES.filter(function(type) { return [financed, cash, season].indexOf(type) < 0; }).forEach(function(type) {
    if (AUTENTIKO.RENTAL_INCOME_TYPES.indexOf(type) >= 0) {
      forms.push(autField_(type, 'Dados do imóvel e negociação', 'valor_aluguel_mensal', 'Valor mensal do aluguel', 'currency', true, 300));
    }
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'tipo_imovel', 'Tipo de imóvel', 'select', true, 310, { list: 'TIPO_IMOVEL' }));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'imovel_codigo', 'Código interno do imóvel', 'text', false, 311));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'imovel_endereco', 'Endereço do imóvel', 'textarea', true, 312));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'valor_negociado', 'Valor negociado', 'currency', false, 313));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'observacoes_negociacao', 'Observações da negociação', 'textarea', false, 314));
  });

  var existing = {};
  autRows_('FORMULARIOS').forEach(function(row) { existing[row.ID_CAMPO] = row; });
  autAppendMany_('FORMULARIOS', forms.filter(function(field) { return !existing[field.ID_CAMPO]; }));
  var properties = PropertiesService.getScriptProperties();
  var schemaVersion = Number(properties.getProperty('AUT_FORM_SCHEMA_VERSION') || 0);
  if (schemaVersion < 3) {
    var desired = {};
    forms.forEach(function(field) { desired[field.ID_CAMPO] = field; });
    var sheet = autSheet_('FORMULARIOS');
    var headers = autHeaders_(sheet);
    var rows = autRows_('FORMULARIOS');
    if (rows.length) {
      var values = sheet.getRange(2, 1, rows.length, headers.length).getValues();
      rows.forEach(function(row, rowIndex) {
        var field = desired[row.ID_CAMPO];
        if (!field) return;
        headers.forEach(function(header, columnIndex) {
          if (Object.prototype.hasOwnProperty.call(field, header)) values[rowIndex][columnIndex] = autSafeCell_(field[header]);
        });
      });
      sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }
    properties.setProperty('AUT_FORM_SCHEMA_VERSION', '3');
  }
}

function autSeedDocuments_() {
  var all = AUTENTIKO.PROCESS_TYPES.slice();
  var rental = AUTENTIKO.RENTAL_INCOME_TYPES.slice();
  var commonMimeTypes = 'application/pdf,image/jpeg,image/png';
  var docs = [
    ['DOC_IDENTIDADE_CLIENTE', 'RG/CNH', all, all, 10, commonMimeTypes],
    ['DOC_COMPROVANTE_ENDERECO', 'Comprovante de residência', all, all, 20, commonMimeTypes],
    ['DOC_RG_CNH_PROPRIETARIO', 'RG/CNH do proprietário', all, all, 30, commonMimeTypes],
    ['DOC_COMPROVANTE_RESIDENCIA_PROPRIETARIO', 'Comprovante de residência do proprietário', all, all, 40, commonMimeTypes],
    ['DOC_TERMO_PRESTACAO_LAUDO_CAPTACAO', 'Termo de prestação de serviço / laudo de captação de imóvel assinado', all, all, 50, commonMimeTypes],
    ['DOC_CONSULTA_RECEITA_CPF', 'Consulta Receita Federal — CPF', all, [], 100, commonMimeTypes],
    ['DOC_CONSULTA_NEGATIVA_PF', 'Consulta negativa PF', all, [], 110, commonMimeTypes],
    ['DOC_CONSULTA_NEGATIVA_PRF', 'Consulta negativa PRF', all, [], 120, commonMimeTypes],
    ['DOC_CONSULTA_NEGATIVA_PC', 'Consulta negativa PC', all, [], 130, commonMimeTypes],
    ['DOC_CONSULTA_NEGATIVA_TJ', 'Consulta negativa TJ', all, [], 140, commonMimeTypes],
    ['DOC_CONSULTA_SERASA', 'Consulta Serasa', all, [], 150, commonMimeTypes],
    ['DOC_COMPROVANTE_RENDA', 'Comprovante de renda', all, [], 160, commonMimeTypes],
    ['DOC_EXTRATO_BANCARIO', 'Extrato bancário', rental, [], 161, commonMimeTypes],
    ['DOC_CONTRACHEQUE_OLERITE', 'Contracheque / holerite', rental, [], 162, commonMimeTypes],
    ['DOC_DECORE_ELETRONICO', 'DECORE eletrônico', rental, [], 163, commonMimeTypes],
    ['DOC_EXTRATO_INSS', 'Extrato do INSS', rental, [], 164, commonMimeTypes],
    ['DOC_EXTRATO_FGTS', 'Extrato do FGTS', rental, [], 165, commonMimeTypes],
    ['DOC_DECLARACAO_IMPOSTO_RENDA', 'Declaração de Imposto de Renda', rental, [], 166, commonMimeTypes],
    ['DOC_DECLARACAO_RENDA_CONTADOR', 'Declaração de renda simples assinada pelo contador', rental, [], 167, commonMimeTypes],
    ['DOC_COMPROVANTE_PAGAMENTO', 'Comprovante de pagamento', all, [], 170, commonMimeTypes],
    ['DOC_CONTRATO_COMPRA_VENDA', 'Contrato de compra e venda', all, [], 180, commonMimeTypes],
    ['DOC_CONTRATO_ALUGUEL_ANUAL', 'Contrato de aluguel anual', all, [], 190, commonMimeTypes],
    ['DOC_CONTRATO_ALUGUEL_SEMESTRAL', 'Contrato de aluguel semestral', all, [], 200, commonMimeTypes],
    ['DOC_CONTRATO_ALUGUEL_MENSAL', 'Contrato de aluguel mensal', all, [], 210, commonMimeTypes],
    ['DOC_LAUDO_VISTORIA', 'Laudo de vistoria', all, [], 220, commonMimeTypes],
    ['DOC_CERTIDAO_NEGATIVA_CARTORIO', 'Certidão negativa — cartório', all, [], 230, commonMimeTypes],
    ['DOC_CERTIDAO_NEGATIVA_PREFEITURA', 'Certidão negativa — prefeitura', all, [], 240, commonMimeTypes],
    ['DOC_IPTU', 'Espelho IPTU', all, [], 250, commonMimeTypes],
    ['DOC_PROTOCOLO_PREFEITURA', 'Protocolo da prefeitura', all, [], 260, commonMimeTypes],
    ['DOC_PROTOCOLO_CARTORIO', 'Protocolo do cartório', all, [], 270, commonMimeTypes],
    ['DOC_RECIBOS', 'Recibos', all, [], 280, commonMimeTypes],
    ['DOC_PROTOCOLOS_GERAIS', 'Protocolos em geral', all, [], 290, commonMimeTypes],
    ['DOC_BOLETO_IPTU', 'Boleto IPTU', all, [], 300, commonMimeTypes],
    ['DOC_CONSULTA_DADOS_PUBLICOS_CERTIDOES', 'Consulta de dados públicos e certidões', all, [], 310, commonMimeTypes],
    ['DOC_CERTIDAO_CASAMENTO', 'Certidão de casamento', all, [], 320, commonMimeTypes],
    ['DOC_CERTIDAO_DIVORCIO', 'Certidão de divórcio', all, [], 330, commonMimeTypes],
    ['DOC_CERTIDAO_NASCIMENTO', 'Certidão de nascimento', all, [], 340, commonMimeTypes],
    ['DOC_ESTADO_CIVIL', 'Certidão ou comprovante de estado civil', all, [], 350, commonMimeTypes],
    ['DOC_MATRICULA_IMOVEL', 'Certidão de matrícula do imóvel', all, [], 360, commonMimeTypes],
    ['DOC_CONTRATO', 'Contrato ou minuta contratual', all, [], 370, commonMimeTypes],
    ['DOC_OUTRO', 'Outros', all, [], 999, commonMimeTypes]
  ];
  var existing = {};
  autRows_('DOCUMENTOS_CATALOGO').forEach(function(row) { existing[row.ID_DOCUMENTO_TIPO] = true; });
  autAppendMany_('DOCUMENTOS_CATALOGO', docs.filter(function(doc) { return !existing[doc[0]]; }).map(function(doc) {
      return {
        ID_DOCUMENTO_TIPO: doc[0], NOME_DOCUMENTO: doc[1], TIPOS_PROCESSO_JSON: JSON.stringify(doc[2]),
        TIPOS_OBRIGATORIOS_JSON: JSON.stringify(doc[3]), OBRIGATORIO: doc[3].length ? 'SIM' : 'NAO',
        ATIVO: 'SIM', ORDEM: doc[4], MIME_ACEITOS: doc[5],
        TAMANHO_MAX_MB: AUTENTIKO.MAX_UPLOAD_MB, CRIADO_EM: autNow_()
      };
  }));

  var properties = PropertiesService.getScriptProperties();
  var catalogVersion = Number(properties.getProperty('AUT_DOCUMENT_CATALOG_VERSION') || 0);
  var currentRows = {};
  autRows_('DOCUMENTOS_CATALOGO').forEach(function(row) { currentRows[row.ID_DOCUMENTO_TIPO] = row; });
  var catalogAlreadyConfigured = docs.every(function(doc) {
    return currentRows[doc[0]] && String(currentRows[doc[0]].TIPOS_OBRIGATORIOS_JSON || '').trim();
  });
  if (catalogVersion < 2 && !catalogAlreadyConfigured) {
    docs.forEach(function(doc) {
      var row = currentRows[doc[0]];
      if (!row) return;
      autUpdateRow_('DOCUMENTOS_CATALOGO', row._row, {
        NOME_DOCUMENTO: doc[1],
        TIPOS_PROCESSO_JSON: JSON.stringify(doc[2]),
        TIPOS_OBRIGATORIOS_JSON: JSON.stringify(doc[3]),
        OBRIGATORIO: doc[3].length ? 'SIM' : 'NAO',
        ATIVO: 'SIM',
        ORDEM: doc[4],
        MIME_ACEITOS: doc[5],
        TAMANHO_MAX_MB: AUTENTIKO.MAX_UPLOAD_MB
      });
    });
  }
  if (catalogVersion < 3) properties.setProperty('AUT_DOCUMENT_CATALOG_VERSION', '3');
}

function autSeedDeveloper_() {
  var email = autNormalizeEmail_(Session.getEffectiveUser().getEmail() || 'barros.drt.autentiko@gmail.com');
  var existing = autRows_('USUARIOS').filter(function(row) { return row.PERFIL === 'DESENVOLVEDOR' || autNormalizeEmail_(row.EMAIL) === email; })[0];
  if (existing) return { created: false, email: existing.EMAIL, password: '' };
  var password = autTemporaryPassword_(16);
  var salt = autRandom_(24);
  autAppend_('USUARIOS', {
      ID_USUARIO: autUuid_(), NOME: 'Antonio Barros da Costa Neto', EMAIL: email,
    USUARIO: email.split('@')[0], SENHA_HASH: autPasswordHash_(password, salt), SALT: salt,
    PERFIL: 'DESENVOLVEDOR', STATUS: 'ATIVO', PERMISSOES_JSON: JSON.stringify(['*']),
    EMAIL_VERIFICADO: 'SIM', CRIADO_EM: autNow_(), ATUALIZADO_EM: autNow_(),
    ULTIMO_ACESSO: '', TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '', DEVE_TROCAR_SENHA: 'SIM'
  });
  return { created: true, email: email, password: password };
}

function autEnsureRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('AUT_DOCUMENTS_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { console.warn('Pasta anterior indisponível: ' + err.message); }
  }
  var folder = DriveApp.createFolder('AUTENTIKO OK NUVEM - Documentos');
  props.setProperty('AUT_DOCUMENTS_FOLDER_ID', folder.getId());
  return folder;
}

function autEnsureOpenTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'onSpreadsheetOpen'; });
  if (!exists) ScriptApp.newTrigger('onSpreadsheetOpen').forSpreadsheet(AUTENTIKO.SPREADSHEET_ID).onOpen().create();
}

function autEnsureMaintenanceTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'cleanupExpiredAuthData'; });
  if (!exists) ScriptApp.newTrigger('cleanupExpiredAuthData').timeBased().everyDays(1).atHour(3).create();
}
