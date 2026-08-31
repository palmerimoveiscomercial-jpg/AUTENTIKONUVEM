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
    var authorizedAccounts = autEnsureAuthorizedAccounts_();
    var folder = autEnsureWritableRootFolder_();
    var indexBootstrap = null;
    if (typeof autSearchRebuildIndex_ === 'function') {
      var lastIndex = PropertiesService.getScriptProperties().getProperty('AUT_SEARCH_LAST_REBUILD_V1');
      if (!lastIndex) {
        try { indexBootstrap = autSearchRebuildIndex_({ reason: 'SETUP' }); }
        catch (indexError) { console.warn('Índice de busca será reconstruído pela administração: ' + indexError.message); }
      }
    }
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
      authorizedAccounts: authorizedAccounts,
      bootstrapPassword: developer.created ? developer.password : '',
      documentsFolderUrl: folder.getUrl(),
      searchIndex: indexBootstrap,
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

/**
 * Atalho operacional mantido neste arquivo para permitir que a migração
 * idempotente das bases cadastrais seja executada pela interface do Apps Script
 * sem precisar abrir o arquivo CommercialService.gs, que é consideravelmente
 * maior. Nenhum dado existente é apagado por esta rotina.
 */
function migrarBaseCadastrosSetup() {
  return migrarBaseCadastros();
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
    if (['USUARIOS', 'SESSOES', 'TOKENS_EMAIL', 'API_CHAVES', 'BUSCA_INDICE', 'DRIVE_INDICE'].indexOf(name) >= 0) {
      sheet.hideSheet();
      var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (!protections.length) sheet.protect().setDescription(name.indexOf('INDICE') >= 0 ? 'Índice materializado — gerenciado pelo AUTENTIKO' : 'Dados sensíveis — gerenciados pelo AUTENTIKO').setWarningOnly(true);
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
    ['MEDIA_CLOUD_ENABLED', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Ativa gradualmente a nuvem documental privada e autenticada', 'SIM'],
    ['MEDIA_PROVIDER', 'CLOUDINARY', 'DOCUMENTOS', 'TEXT', 'Cloudinary é a camada operacional de mídia; Drive mantém os originais e backups', 'NAO'],
    ['MEDIA_API_BASE_URL', 'https://kgcucxqtzqcsskhjfmzl.supabase.co/functions/v1/media-api', 'DOCUMENTOS', 'TEXT', 'URL HTTPS da API de mídia validada pelo AUTENTIKO', 'SIM'],
    ['MEDIA_MAX_UPLOAD_MB', '25', 'DOCUMENTOS', 'NUMBER', 'Tamanho máximo de novos uploads diretos na nuvem, em MB', 'SIM'],
    ['MEDIA_MAX_PDF_SOURCE_MB', '100', 'DOCUMENTOS', 'NUMBER', 'Limite de entrada para PDF pesado; acima de 25 MB será otimizado em segundo plano', 'SIM'],
    ['MEDIA_LARGE_UPLOAD_ENABLED', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Libera arquivos acima de 6 MB somente após a redundância Drive estar operacional', 'SIM'],
    ['MEDIA_DRIVE_SYNC_WORKER_READY', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Confirmação operacional do worker Supabase para Google Drive; manter desativado até health check profundo', 'NAO'],
    ['AUTENTIKO_OK_DOC_ENABLED', 'SIM', 'CONTRATOS', 'BOOLEAN', 'Ativa o módulo contratual determinístico integrado ao AUTENTIKO OK NUVEM', 'SIM'],
    ['PRIMARY_DATA_SOURCE', 'SHEETS', 'BANCO_DE_DADOS', 'TEXT', 'Fonte operacional durante a transição; alterar para NEON somente depois da migração validada', 'NAO'],
    ['REMOTE_BACKEND_ENABLED', 'NAO', 'BANCO_DE_DADOS', 'BOOLEAN', 'Libera o gateway seguro Apps Script para a API do backend', 'SIM'],
    ['NEON_READ_ENABLED', 'NAO', 'BANCO_DE_DADOS', 'BOOLEAN', 'Libera leituras do Neon depois do teste de equivalência', 'SIM'],
    ['NEON_WRITE_ENABLED', 'NAO', 'BANCO_DE_DADOS', 'BOOLEAN', 'Libera gravações e a migração para o Neon depois do schema aplicado', 'SIM'],
    ['SHEETS_BACKUP_ENABLED', 'SIM', 'BANCO_DE_DADOS', 'BOOLEAN', 'Mantém a planilha como espelho administrativo e backup', 'SIM'],
    ['DRIVE_BACKUP_ENABLED', 'SIM', 'BANCO_DE_DADOS', 'BOOLEAN', 'Mantém os originais pesados e cópias de segurança no Drive', 'SIM'],
    ['DATA_CLOUD_ENABLED', 'NAO', 'BANCO_DE_DADOS', 'BOOLEAN', 'Ativa consultas e sincronização com o índice Neon por meio da API Vercel', 'SIM'],
    ['DATA_API_BASE_URL', '', 'BANCO_DE_DADOS', 'URL', 'URL HTTPS do backend Vercel, sem caminho final nem barra no fim', 'SIM'],
    ['DATA_SYNC_BATCH_SIZE', '250', 'BANCO_DE_DADOS', 'NUMBER', 'Quantidade máxima de registros enviados por lote ao Neon', 'SIM'],
    ['CLOUDINARY_ENABLED', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Ativa uploads assinados e miniaturas pelo backend', 'SIM'],
    ['CLOUDINARY_CLOUD_NAME', 'llbdih6f', 'DOCUMENTOS', 'TEXT', 'Nome público da conta Cloudinary', 'NAO'],
    ['CLOUDINARY_FOLDER_MODE', 'DYNAMIC_FOLDERS', 'DOCUMENTOS', 'TEXT', 'Organização dos assets em pastas dinâmicas sem mudar o identificador', 'NAO'],
    ['ADOBE_ENABLED', 'NAO', 'DOCUMENTOS', 'BOOLEAN', 'Ativa o processamento excepcional por Adobe PDF Services', 'SIM'],
    ['ADOBE_MONTHLY_LIMIT', '500', 'DOCUMENTOS', 'NUMBER', 'Limite mensal monitorado de transações do Adobe PDF Services', 'SIM'],
    ['AUDITORIA_RETENCAO_ANOS', '10', 'AUDITORIA', 'NUMBER', 'Retenção inicial dos registros finalizados e de auditoria', 'SIM'],
    ['AUDIT_ANCHOR_ENABLED', 'NAO', 'AUDITORIA', 'BOOLEAN', 'Ancora periodicamente a raiz da auditoria no banco externo append-only', 'SIM'],
    ['AUDIT_ANCHOR_INTERVAL_MINUTES', '15', 'AUDITORIA', 'NUMBER', 'Intervalo de ancoragem externa da cadeia de auditoria', 'SIM'],
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
  var blankDefaultRepairs = {
    MEDIA_PROVIDER: 'CLOUDINARY',
    MEDIA_API_BASE_URL: 'https://kgcucxqtzqcsskhjfmzl.supabase.co/functions/v1/media-api',
    ADOBE_MONTHLY_LIMIT: '500',
    DATA_SYNC_BATCH_SIZE: '250'
  };
  Object.keys(blankDefaultRepairs).forEach(function(key) {
    var row = existing[key];
    if (row && !String(row.VALOR || '').trim()) {
      autUpdateRow_('CONFIGURACOES', row._row, {
        VALOR: blankDefaultRepairs[key], ATUALIZADO_EM: now, ATUALIZADO_POR: 'MIGRACAO_PADRAO_SEGURO'
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
    MODALIDADE_CAPTACAO: ['Imóvel com exclusividade', 'Imóvel sem exclusividade', 'Autorização verbal simples', 'Autorização simples'],
    ORIGEM_RENDA: ['Salário', 'Trabalho autônomo', 'Empresa própria', 'Benefício do INSS', 'Aposentadoria ou pensão', 'Aluguéis', 'Investimentos', 'Outros'],
    RELACAO_RECADO: ['Cônjuge', 'Pai', 'Mãe', 'Filho(a)', 'Irmão(ã)', 'Parente', 'Amigo(a)', 'Trabalho', 'Outro'],
    NATUREZA_OCUPACAO: ['Empregado CLT', 'Servidor público', 'Autônomo', 'Empresário', 'Aposentado', 'Pensionista', 'Profissional liberal', 'Estudante', 'Desempregado', 'Outro'],
    PARCELAMENTO_CAUCAO_POR: ['Imobiliária', 'Cartão de crédito'],
    FORMA_PAGAMENTO_NEGOCIACAO: ['À vista', 'Crédito', 'Débito', 'Parcelado', 'PIX', 'Transferência bancária'],
    TIPO_CHAVE_PIX: ['E-mail', 'CPF', 'Contato', 'Chave aleatória'],
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
    CONDICAO_JSON: condition ? JSON.stringify(condition) : '',
    CODIGO_INDICE: SCHEMA.fieldCode(type, name),
    FONTE_SISTEMA: 'AUTENTIKO_OK_NUVEM',
    FONTE_ABA: 'PROCESSO_DADOS',
    FONTE_COLUNA: name,
    ALIASES_JSON: JSON.stringify(SCHEMA.getAliases(name)),
    SCHEMA_VERSION: SCHEMA.version
  };
}

function autBuyerFields_(type, start, section) {
  var fields = [
    ['responsavel_processo', 'Responsável pelo processo', 'user_select', true, 'Controle do processo', start],
    ['cliente_nome', 'Nome do cliente / comprador / locatário', 'text', true, 'Cliente — Dados de identificação', start + 10],
    ['cliente_cpf', 'CPF', 'cpf', true, 'Cliente — Dados pessoais', start + 11],
    ['cliente_nascimento', 'Data de nascimento', 'date', false, 'Cliente — Dados pessoais', start + 12],
    ['cliente_documento', 'RG, CNH ou carteira de órgão credenciado', 'text', false, 'Cliente — Dados pessoais', start + 13],
    ['cliente_documento_expedicao', 'Data de expedição', 'date', false, 'Cliente — Dados pessoais', start + 14],
    ['cliente_orgao_expedidor', 'Órgão expedidor', 'text', false, 'Cliente — Dados pessoais', start + 15],
    ['cliente_estado_civil', 'Estado civil', 'select', false, 'Cliente — Dados pessoais', start + 16, 'ESTADO_CIVIL'],
    ['cliente_nome_mae', 'Nome da mãe', 'text', false, 'Cliente — Dados pessoais', start + 17],
    ['cliente_nome_pai', 'Nome do pai', 'text', false, 'Cliente — Dados pessoais', start + 18],
    ['cliente_conjuge_nome', 'Nome do cônjuge', 'text', false, 'Cliente — Dados pessoais', start + 19, null, { field: 'cliente_estado_civil', in: ['Casado(a)', 'União estável'] }],
    ['cliente_conjuge_cpf', 'CPF do cônjuge', 'cpf', false, 'Cliente — Dados pessoais', start + 20, null, { field: 'cliente_estado_civil', in: ['Casado(a)', 'União estável'] }],
    ['cliente_conjuge_rg', 'RG do cônjuge', 'text', false, 'Cliente — Dados pessoais', start + 21, null, { field: 'cliente_estado_civil', in: ['Casado(a)', 'União estável'] }],
    ['cliente_contato', 'Telefone principal', 'tel', false, 'Cliente — Dados de contato e endereço', start + 30],
    ['cliente_contato_recado', 'Telefone de recado', 'tel', false, 'Cliente — Dados de contato', start + 31],
    ['cliente_contato_recado_nome', 'Nome do contato de recado', 'text', false, 'Cliente — Dados de contato', start + 32],
    ['cliente_contato_recado_relacao', 'Relação do contato de recado', 'select', false, 'Cliente — Dados de contato', start + 33, 'RELACAO_RECADO'],
    ['cliente_email', 'E-mail', 'email', false, 'Cliente — Dados de contato', start + 34],
    ['cliente_rua', 'Logradouro', 'text', false, 'Cliente — Dados de endereço', start + 40],
    ['cliente_numero', 'Número', 'text', false, 'Cliente — Dados de endereço', start + 41],
    ['cliente_bairro', 'Bairro', 'text', false, 'Cliente — Dados de endereço', start + 42],
    ['cliente_complemento', 'Complemento', 'text', false, 'Cliente — Dados de endereço', start + 43],
    ['cliente_cidade', 'Cidade', 'text', false, 'Cliente — Dados de endereço', start + 44],
    ['cliente_cep', 'CEP', 'cep', false, 'Cliente — Dados de endereço', start + 45],
    ['cliente_renda', 'Renda bruta', 'currency', false, 'Cliente — Renda e emprego', start + 60],
    ['cliente_renda_origem', 'Origem da renda', 'select', false, 'Cliente — Renda e emprego', start + 61, 'ORIGEM_RENDA'],
    ['cliente_profissao', 'Profissão', 'text', false, 'Cliente — Renda e emprego', start + 62],
    ['cliente_emprego', 'Emprego', 'text', false, 'Cliente — Renda e emprego', start + 63],
    ['cliente_empresa', 'Empresa', 'text', false, 'Cliente — Renda e emprego', start + 64],
    ['cliente_natureza_ocupacao', 'Natureza da ocupação', 'select', false, 'Cliente — Renda e emprego', start + 65, 'NATUREZA_OCUPACAO'],
    ['cliente_contato_trabalho', 'Contato de trabalho', 'tel', false, 'Cliente — Renda e emprego', start + 66],
    ['cliente_tem_renda_extra', 'Tem renda extra?', 'select', false, 'Cliente — Renda e emprego', start + 67, 'SIM_NAO'],
    ['cliente_renda_extra_valor', 'Valor da renda extra', 'currency', false, 'Cliente — Renda e emprego', start + 68, null, { field: 'cliente_tem_renda_extra', equals: 'Sim' }],
    ['cliente_renda_extra_origem', 'Origem da renda extra', 'text', false, 'Cliente — Renda e emprego', start + 69, null, { field: 'cliente_tem_renda_extra', equals: 'Sim' }]
  ];
  return fields.map(function(field) {
    return autField_(type, field[4], field[0], field[1], field[2], field[3], field[5], field[6] ? { list: field[6] } : [], field[7] || null);
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
    ['titular_nome_mae', 'Nome da mãe', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 7],
    ['titular_nome_pai', 'Nome do pai', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 8],
    ['titular_conjuge_nome', 'Nome do cônjuge', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 9, null, { field: 'titular_estado_civil', in: ['Casado(a)', 'União estável'] }],
    ['titular_conjuge_cpf', 'CPF do cônjuge', 'cpf', false, 'Proprietário ou vendedor — Dados pessoais', start + 10, null, { field: 'titular_estado_civil', in: ['Casado(a)', 'União estável'] }],
    ['titular_conjuge_rg', 'RG do cônjuge', 'text', false, 'Proprietário ou vendedor — Dados pessoais', start + 11, null, { field: 'titular_estado_civil', in: ['Casado(a)', 'União estável'] }],
    ['titular_contato', 'Telefone principal', 'tel', false, 'Proprietário ou vendedor — Dados de contato', start + 20],
    ['titular_contato_recado', 'Telefone de recado', 'tel', false, 'Proprietário ou vendedor — Dados de contato', start + 21],
    ['titular_contato_recado_nome', 'Nome do contato de recado', 'text', false, 'Proprietário ou vendedor — Dados de contato', start + 22],
    ['titular_contato_recado_relacao', 'Relação do contato de recado', 'select', false, 'Proprietário ou vendedor — Dados de contato', start + 23, 'RELACAO_RECADO'],
    ['titular_email', 'E-mail', 'email', false, 'Proprietário ou vendedor — Dados de contato', start + 24],
    ['titular_rua', 'Rua', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 40],
    ['titular_numero', 'Número', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 41],
    ['titular_bairro', 'Bairro', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 42],
    ['titular_complemento', 'Complemento', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 43],
    ['titular_cidade', 'Cidade', 'text', false, 'Proprietário ou vendedor — Dados de endereço', start + 44],
    ['titular_cep', 'CEP', 'cep', false, 'Proprietário ou vendedor — Dados de endereço', start + 45],
    ['titular_renda', 'Renda bruta', 'currency', false, 'Proprietário ou vendedor — Renda e emprego', start + 60],
    ['titular_renda_origem', 'Origem da renda', 'select', false, 'Proprietário ou vendedor — Renda e emprego', start + 61, 'ORIGEM_RENDA'],
    ['titular_profissao', 'Profissão', 'text', false, 'Proprietário ou vendedor — Renda e emprego', start + 62],
    ['titular_emprego', 'Emprego', 'text', false, 'Proprietário ou vendedor — Renda e emprego', start + 63],
    ['titular_empresa', 'Empresa', 'text', false, 'Proprietário ou vendedor — Renda e emprego', start + 64],
    ['titular_natureza_ocupacao', 'Natureza da ocupação', 'select', false, 'Proprietário ou vendedor — Renda e emprego', start + 65, 'NATUREZA_OCUPACAO'],
    ['titular_contato_trabalho', 'Contato de trabalho', 'tel', false, 'Proprietário ou vendedor — Renda e emprego', start + 66],
    ['titular_tem_renda_extra', 'Tem renda extra?', 'select', false, 'Proprietário ou vendedor — Renda e emprego', start + 67, 'SIM_NAO'],
    ['titular_renda_extra_valor', 'Valor da renda extra', 'currency', false, 'Proprietário ou vendedor — Renda e emprego', start + 68, null, { field: 'titular_tem_renda_extra', equals: 'Sim' }],
    ['titular_renda_extra_origem', 'Origem da renda extra', 'text', false, 'Proprietário ou vendedor — Renda e emprego', start + 69, null, { field: 'titular_tem_renda_extra', equals: 'Sim' }]
  ];
  return fields.map(function(field) {
    return autField_(type, field[4], field[0], field[1], field[2], field[3], field[5], field[6] ? { list: field[6] } : [], field[7] || null);
  });
}

function autSeedForms_() {
  var forms = [];
  var capture = 'CAPTACAO_HOMOLOGACAO_IMOVEL';
  AUTENTIKO.PROCESS_TYPES.forEach(function(type) {
    if (type !== capture) forms = forms.concat(autBuyerFields_(type, 10));
    else forms.push(autField_(type, 'Controle do processo', 'responsavel_processo', 'Responsável pelo processo', 'user_select', true, 10));
    forms = forms.concat(autOwnerFields_(type, 100));
  });

  forms = forms.concat([
    autField_(capture, 'Captação e autorização', 'captacao_modalidade', 'Modalidade da captação', 'select', true, 200, { list: 'MODALIDADE_CAPTACAO' }),
    autField_(capture, 'Captação e autorização', 'autorizacao_rycky_palmer', 'Autorização de Rycky de Palmer para captação', 'select', true, 201, { list: 'SIM_NAO' }),
    autField_(capture, 'Captação e autorização', 'captacao_observacoes', 'Condições e observações da autorização', 'textarea', false, 202),
    autField_(capture, 'Dados do imóvel', 'tipo_imovel', 'Tipo de imóvel', 'select', true, 300, { list: 'TIPO_IMOVEL' }),
    autField_(capture, 'Dados do imóvel', 'imovel_codigo', 'Código interno do imóvel', 'text', false, 301),
    autField_(capture, 'Dados do imóvel', 'imovel_matricula', 'Matrícula do imóvel', 'text', false, 302),
    autField_(capture, 'Dados do imóvel', 'imovel_iptu', 'Inscrição ou espelho do IPTU', 'text', false, 303),
    autField_(capture, 'Dados do imóvel', 'imovel_endereco', 'Endereço completo do imóvel', 'textarea', true, 304),
    autField_(capture, 'Dados do imóvel', 'imovel_rua', 'Rua', 'text', false, 305),
    autField_(capture, 'Dados do imóvel', 'imovel_numero', 'Número', 'text', false, 306),
    autField_(capture, 'Dados do imóvel', 'imovel_bairro', 'Bairro', 'text', false, 307),
    autField_(capture, 'Dados do imóvel', 'imovel_complemento', 'Complemento', 'text', false, 308),
    autField_(capture, 'Dados do imóvel', 'imovel_cidade', 'Cidade', 'text', false, 309),
    autField_(capture, 'Dados do imóvel', 'imovel_estado', 'Estado', 'text', false, 310),
    autField_(capture, 'Dados do imóvel', 'imovel_cep', 'CEP', 'cep', false, 311)
  ]);

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

  AUTENTIKO.PROCESS_TYPES.filter(function(type) { return [financed, cash, season, capture].indexOf(type) < 0; }).forEach(function(type) {
    if (AUTENTIKO.RENTAL_INCOME_TYPES.indexOf(type) >= 0) {
      forms.push(autField_(type, 'Dados do imóvel e negociação', 'valor_aluguel_mensal', 'Valor mensal do aluguel', 'currency', true, 300));
    }
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'tipo_imovel', 'Tipo de imóvel', 'select', true, 310, { list: 'TIPO_IMOVEL' }));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'imovel_codigo', 'Código interno do imóvel', 'text', false, 311));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'imovel_endereco', 'Endereço do imóvel', 'textarea', true, 312));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'valor_negociado', 'Valor negociado', 'currency', false, 313));
    forms.push(autField_(type, 'Dados do imóvel e negociação', 'observacoes_negociacao', 'Observações da negociação', 'textarea', false, 314));
  });

  AUTENTIKO.RENTAL_INCOME_TYPES.forEach(function(type) {
    forms = forms.concat([
      autField_(type, 'Dados do imóvel', 'imovel_codigo', 'Código interno do imóvel', 'property_lookup', false, 300),
      autField_(type, 'Dados do imóvel', 'imovel_endereco', 'Endereço completo', 'textarea', false, 301),
      autField_(type, 'Dados do imóvel', 'valor_aluguel_mensal', 'Valor do aluguel', 'currency', false, 302),
      autField_(type, 'Dados do imóvel', 'valor_caucao', 'Valor da caução', 'currency', false, 303),
      autField_(type, 'Dados do imóvel', 'quantidade_caucao', 'Quantidade de cauções', 'number', false, 304),
      autField_(type, 'Dados do imóvel', 'comissao_valor', 'Valor da comissão', 'currency', false, 305),
      autField_(type, 'Dados do imóvel', 'unidade_consumidora_numero', 'Unidade consumidora', 'text', false, 306),
      autField_(type, 'Dados do imóvel', 'registro_cartorio_numero', 'Número de registro', 'text', false, 307),
      autField_(type, 'Dados do imóvel', 'matricula_agua_numero', 'Matrícula Águas do Pará', 'text', false, 308),
      autField_(type, 'Tratativas finais', 'caucao_parcelada', 'Contrato teve parcelamento de caução?', 'select', false, 400, { list: 'SIM_NAO' }),
      autField_(type, 'Tratativas finais', 'caucao_parcelada_por', 'Parcelamento realizado por', 'select', false, 401, { list: 'PARCELAMENTO_CAUCAO_POR' }, { field: 'caucao_parcelada', equals: 'Sim' }),
      autField_(type, 'Tratativas finais', 'caucao_numero_parcelas', 'Quantidade de parcelas da caução', 'number', false, 402, [], { field: 'caucao_parcelada_por', equals: 'Imobiliária' }),
      autField_(type, 'Tratativas finais', 'caucao_parcelas', 'Datas e valores das parcelas', 'installments', false, 403, [], { field: 'caucao_parcelada_por', equals: 'Imobiliária' }),
      autField_(type, 'Tratativas finais', 'contrato_tem_vencimento', 'Contrato já tem dia de vencimento?', 'select', false, 404, { list: 'SIM_NAO' }),
      autField_(type, 'Tratativas finais', 'contrato_dia_vencimento', 'Dia do vencimento', 'number', false, 405, [], { field: 'contrato_tem_vencimento', equals: 'Sim' }),
      autField_(type, 'Tratativas finais', 'administracao_interna', 'Imóvel sob administração interna?', 'select', false, 406, { list: 'SIM_NAO' })
    ]);
  });

  var transactionTypes = [financed, cash, 'COMPRA_IMOVEL_PARCELADO', 'COMPRA_VENDA_IMOVEL', 'PERMUTA_IMOVEL', 'CONTRATO_LEGALIZACAO'];
  transactionTypes.forEach(function(type) {
    forms = forms.concat([
      autField_(type, 'Tratativas da negociação', 'imovel_valor', 'Valor do imóvel', 'currency', false, 500),
      autField_(type, 'Tratativas da negociação', 'valor_negociado', 'Valor negociado', 'currency', false, 501),
      autField_(type, 'Tratativas da negociação', 'comissao_valor', 'Comissão', 'currency', false, 502),
      autField_(type, 'Tratativas da negociação', 'formas_pagamento', 'Formas de pagamento', 'multiselect', false, 503, { list: 'FORMA_PAGAMENTO_NEGOCIACAO' }),
      autField_(type, 'Tratativas da negociação', 'distribuicao_pagamentos', 'Valor pago em cada forma selecionada', 'payment_allocation', false, 504),
      autField_(type, 'Tratativas da negociação', 'conta_bancaria_proprietario', 'Conta bancária do proprietário', 'text', false, 505),
      autField_(type, 'Tratativas da negociação', 'chave_pix', 'Chave PIX', 'text', false, 506),
      autField_(type, 'Tratativas da negociação', 'tipo_chave_pix', 'Tipo de chave PIX', 'select', false, 507, { list: 'TIPO_CHAVE_PIX' }),
      autField_(type, 'Tratativas da negociação', 'valor_entrada', 'Valor de entrada', 'currency', false, 508, [], { field: 'formas_pagamento', contains: 'Parcelado' }),
      autField_(type, 'Tratativas da negociação', 'numero_parcelas', 'Número de parcelas', 'number', false, 509, [], { field: 'formas_pagamento', contains: 'Parcelado' }),
      autField_(type, 'Tratativas da negociação', 'dia_vencimento_parcela', 'Dia de vencimento', 'number', false, 510, [], { field: 'formas_pagamento', contains: 'Parcelado' }),
      autField_(type, 'Tratativas da negociação', 'valor_parcela', 'Valor de cada parcela', 'currency', false, 511, [], { field: 'formas_pagamento', contains: 'Parcelado' }),
      autField_(type, 'Tratativas da negociação', 'adicional_credito', 'Adicional pago pelo cliente na simulação de crédito', 'currency', false, 512, [], { field: 'formas_pagamento', contains: 'Crédito' })
    ]);
  });

  var uniqueForms = {};
  forms.forEach(function(field) { uniqueForms[field.ID_CAMPO] = field; });
  forms = Object.keys(uniqueForms).map(function(id) { return uniqueForms[id]; });

  var existing = {};
  autRows_('FORMULARIOS').forEach(function(row) { existing[row.ID_CAMPO] = row; });
  autAppendMany_('FORMULARIOS', forms.filter(function(field) { return !existing[field.ID_CAMPO]; }));
  var properties = PropertiesService.getScriptProperties();
  var schemaVersion = Number(properties.getProperty('AUT_FORM_SCHEMA_VERSION') || 0);
  if (schemaVersion < 7) {
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
    properties.setProperty('AUT_FORM_SCHEMA_VERSION', '7');
  }
}

function autSeedDocuments_() {
  var all = AUTENTIKO.PROCESS_TYPES.slice();
  var capture = 'CAPTACAO_HOMOLOGACAO_IMOVEL';
  var standard = all.filter(function(type) { return type !== capture; });
  var rental = AUTENTIKO.RENTAL_INCOME_TYPES.slice();
  var commonMimeTypes = 'application/pdf,image/jpeg,image/png';
  var docs = [
    ['DOC_IDENTIDADE_CLIENTE', 'RG/CNH', all, standard, 10, commonMimeTypes],
    ['DOC_COMPROVANTE_ENDERECO', 'Comprovante de residência', all, standard, 20, commonMimeTypes],
    ['DOC_RG_CNH_PROPRIETARIO', 'RG/CNH do proprietário', all, all, 30, commonMimeTypes],
    ['DOC_COMPROVANTE_RESIDENCIA_PROPRIETARIO', 'Comprovante de residência do proprietário', all, standard, 40, commonMimeTypes],
    ['DOC_TERMO_PRESTACAO_LAUDO_CAPTACAO', 'Termo de prestação de serviço / laudo de captação de imóvel assinado', all, all, 50, commonMimeTypes],
    ['DOC_AUTORIZACAO_RYCKY_PALMER_CAPTACAO', 'Autorização de Rycky de Palmer para captação do imóvel', [capture], [capture], 60, commonMimeTypes],
    ['DOC_CONSULTA_RECEITA_CPF', 'Consulta Receita Federal — CPF', all, [capture], 100, commonMimeTypes],
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
  if (catalogVersion < 4) {
    docs.forEach(function(doc) {
      var row = currentRows[doc[0]] || autFind_('DOCUMENTOS_CATALOGO', 'ID_DOCUMENTO_TIPO', doc[0]);
      if (!row) return;
      var available = autJsonParse_(row.TIPOS_PROCESSO_JSON, []);
      var required = autJsonParse_(row.TIPOS_OBRIGATORIOS_JSON, []);
      if (doc[2].indexOf(capture) >= 0 && available.indexOf(capture) < 0) available.push(capture);
      if (doc[3].indexOf(capture) >= 0 && required.indexOf(capture) < 0) required.push(capture);
      autUpdateRow_('DOCUMENTOS_CATALOGO', row._row, {
        TIPOS_PROCESSO_JSON: JSON.stringify(available),
        TIPOS_OBRIGATORIOS_JSON: JSON.stringify(required),
        OBRIGATORIO: required.length ? 'SIM' : 'NAO'
      });
    });
    properties.setProperty('AUT_DOCUMENT_CATALOG_VERSION', '4');
  }
}

function autSeedDeveloper_() {
  var email = autNormalizeEmail_(Session.getEffectiveUser().getEmail() || 'barros.drt.autentiko@gmail.com');
  var existing = autRowsBy_('USUARIOS', 'EMAIL', email)[0];
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

function autEnsureAuthorizedAccounts_() {
  var accounts = [
    { email: 'antonio.barros3445@gmail.com', name: 'Antonio Barros da Costa Neto', role: 'DESENVOLVEDOR' },
    { email: 'palmer.imoveis.comercial@gmail.com', name: 'Palmer Imóveis', role: 'ADMINISTRADOR' }
  ];
  accounts.forEach(function(account) {
    var existing = autRowsBy_('USUARIOS', 'EMAIL', account.email)[0];
    if (existing) {
      if (autNormalize_(existing.STATUS) !== 'ATIVO') autUpdateRow_('USUARIOS', existing._row, { STATUS: 'ATIVO', ATUALIZADO_EM: autNow_() });
      return;
    }
    var inaccessiblePassword = autTemporaryPassword_(32);
    var salt = autRandom_(24);
    autAppend_('USUARIOS', {
      ID_USUARIO: autUuid_(), NOME: account.name, EMAIL: account.email,
      USUARIO: account.email.split('@')[0], SENHA_HASH: autPasswordHash_(inaccessiblePassword, salt), SALT: salt,
      PERFIL: account.role, STATUS: 'ATIVO', PERMISSOES_JSON: JSON.stringify(account.role === 'DESENVOLVEDOR' ? ['*'] : AUTENTIKO_DEFAULT_PERMISSIONS.ADMINISTRADOR),
      EMAIL_VERIFICADO: 'SIM', CRIADO_EM: autNow_(), ATUALIZADO_EM: autNow_(),
      ULTIMO_ACESSO: '', TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '', DEVE_TROCAR_SENHA: 'NAO'
    });
  });
  return accounts.map(function(account) { return account.email; });
}

function autPreviousFolderIdsKey_(propertyKey) {
  return propertyKey === 'AUT_DOCUMENTS_FOLDER_ID'
    ? 'AUT_DOCUMENTS_FOLDER_PREVIOUS_IDS'
    : propertyKey + '_PREVIOUS_IDS';
}

function autFolderHistoryIds_(propertyKey) {
  var props = PropertiesService.getScriptProperties();
  var ids = [];
  var current = String(props.getProperty(propertyKey) || '').trim();
  if (current) ids.push(current);
  var previous = [];
  try { previous = JSON.parse(props.getProperty(autPreviousFolderIdsKey_(propertyKey)) || '[]'); }
  catch (ignore) { previous = []; }
  if (!Array.isArray(previous)) previous = [];
  previous.forEach(function(id) {
    id = String(id || '').trim();
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  return ids;
}

function autRememberPreviousFolderId_(propertyKey, folderId) {
  folderId = String(folderId || '').trim();
  if (!folderId) return;
  var props = PropertiesService.getScriptProperties();
  var historyKey = autPreviousFolderIdsKey_(propertyKey);
  var previous = [];
  try { previous = JSON.parse(props.getProperty(historyKey) || '[]'); }
  catch (ignore) { previous = []; }
  if (!Array.isArray(previous)) previous = [];
  previous = previous.map(function(id) { return String(id || '').trim(); }).filter(Boolean);
  if (previous.indexOf(folderId) < 0) previous.push(folderId);
  // O limite impede crescimento acidental da propriedade sem apagar arquivos.
  if (previous.length > 100) previous = previous.slice(previous.length - 100);
  props.setProperty(historyKey, JSON.stringify(previous));
}

function autProbeFolderWrite_(folder) {
  var probe = null;
  try {
    probe = folder.createFile(Utilities.newBlob(
      'AUTENTIKO_WRITE_CHECK',
      'text/plain',
      '.autentiko-write-check-' + Utilities.getUuid() + '.tmp'
    ));
    return { writable: true, error: '' };
  } catch (err) {
    return { writable: false, error: String(err && err.message || 'Falha de escrita no Google Drive.').slice(0, 300) };
  } finally {
    if (probe) {
      try { probe.setTrashed(true); }
      catch (cleanupError) { console.warn('Não foi possível mover o arquivo temporário de diagnóstico para a lixeira.'); }
    }
  }
}

function autFolderSecurity_(folder) {
  var access = '';
  var permission = '';
  var ownerEmail = '';
  try { access = String(folder.getSharingAccess() || ''); } catch (ignoreAccess) {}
  try { permission = String(folder.getSharingPermission() || ''); } catch (ignorePermission) {}
  try { ownerEmail = String(folder.getOwner().getEmail() || '').trim().toLowerCase(); } catch (ignoreOwner) {}
  var effectiveEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  return {
    access: access,
    permission: permission,
    ownerEmail: ownerEmail,
    effectiveEmail: effectiveEmail,
    private: access === String(DriveApp.Access.PRIVATE),
    // Falha fechada: se o Apps Script não conseguir confirmar ambos os
    // endereços, a pasta não pode ser promovida a raiz documental ativa.
    ownedByEffectiveUser: Boolean(effectiveEmail && ownerEmail && ownerEmail === effectiveEmail)
  };
}

function autIsSecureDocumentsRoot_(folder) {
  var security = autFolderSecurity_(folder);
  return security.private && security.ownedByEffectiveUser;
}

function autCreateDocumentsRootFolder_() {
  var timeZone = AUTENTIKO.TIMEZONE || 'America/Sao_Paulo';
  var suffix = Utilities.formatDate(new Date(), timeZone, 'yyyyMMdd-HHmmss');
  var folder = DriveApp.createFolder('AUTENTIKO OK NUVEM - Documentos Privados - ' + suffix);
  // A pasta deve nascer privada. O AUTENTIKO entrega os bytes somente depois
  // de validar sessão e permissão; não depende de compartilhamento público.
  try { folder.setShareableByEditors(false); } catch (ignoreEditors) {}
  if (!autIsSecureDocumentsRoot_(folder)) {
    try { folder.setTrashed(true); } catch (ignoreTrash) {}
    throw new Error('A nova pasta documental não pôde ser confirmada como privada e pertencente à conta da implantação.');
  }
  return folder;
}

function autAlignProcessFolderReferencesWithRoot_(rootFolderId) {
  rootFolderId = String(rootFolderId || '').trim();
  autAssert_(rootFolderId, 'A raiz documental ativa não foi informada.');
  var props = PropertiesService.getScriptProperties();
  var bindingKey = 'AUT_PROCESS_FOLDERS_ROOT_ID';
  var boundRootId = String(props.getProperty(bindingKey) || '').trim();
  if (boundRootId === rootFolderId) return;

  // Uma raiz nova não pode reutilizar subpastas de processos da raiz anterior.
  // Os IDs antigos continuam no histórico e permanecem disponíveis para
  // localizar/visualizar documentos legados, sem mover ou excluir arquivos.
  var allProperties = props.getProperties();
  Object.keys(allProperties).forEach(function(propertyKey) {
    if (propertyKey.indexOf('AUT_PROCESS_FOLDER_') !== 0) return;
    if (propertyKey.indexOf('_PREVIOUS_IDS') >= 0) return;
    var folderId = String(allProperties[propertyKey] || '').trim();
    if (folderId) autRememberPreviousFolderId_(propertyKey, folderId);
    props.deleteProperty(propertyKey);
  });
  props.setProperty(bindingKey, rootFolderId);
}

function autActivateDocumentsRoot_(folder) {
  var props = PropertiesService.getScriptProperties();
  var folderId = String(folder && folder.getId() || '').trim();
  autAssert_(folderId && autIsSecureDocumentsRoot_(folder),
    'A raiz documental somente pode ser ativada quando for privada e pertencer à conta efetiva.');
  props.setProperty('AUT_DOCUMENTS_FOLDER_ID', folderId);
  autAlignProcessFolderReferencesWithRoot_(folderId);
  return folder;
}

function autEnsureRootFolder_() {
  return autEnsureWritableRootFolder_();
}

function autEnsureWritableRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('AUT_DOCUMENTS_FOLDER_ID') || '').trim();
  var folder = null;
  if (id) {
    try { folder = DriveApp.getFolderById(id); }
    catch (err) { folder = null; }
    if (folder && autIsSecureDocumentsRoot_(folder)) {
      var currentProbe = autProbeFolderWrite_(folder);
      if (currentProbe.writable) return autActivateDocumentsRoot_(folder);
    }
    if (folder) console.warn('A pasta documental configurada não é privada ou não pertence à conta efetiva; ela será preservada somente no histórico.');
    autRememberPreviousFolderId_('AUT_DOCUMENTS_FOLDER_ID', id);
  }

  folder = autCreateDocumentsRootFolder_();
  var newProbe = autProbeFolderWrite_(folder);
  if (!newProbe.writable) {
    throw new Error('Não foi possível criar uma pasta gravável para os documentos do AUTENTIKO. ' + newProbe.error);
  }
  return autActivateDocumentsRoot_(folder);
}

function diagnosticarArmazenamentoDriveSetup() {
  var props = PropertiesService.getScriptProperties();
  var account = String(Session.getEffectiveUser().getEmail() || '').trim();
  var id = String(props.getProperty('AUT_DOCUMENTS_FOLDER_ID') || '').trim();
  var folder = null;
  var probe = { writable: false, error: id ? '' : 'Pasta documental não configurada.' };
  if (id) {
    try {
      folder = DriveApp.getFolderById(id);
      probe = autProbeFolderWrite_(folder);
    } catch (err) {
      probe = { writable: false, error: String(err && err.message || 'Pasta inacessível.').slice(0, 300) };
    }
  }
  var result = {
    ok: probe.writable && Boolean(folder) && autIsSecureDocumentsRoot_(folder),
    deployingAccount: account,
    folderId: folder ? folder.getId() : id,
    folderUrl: folder ? folder.getUrl() : '',
    writable: probe.writable,
    private: folder ? autFolderSecurity_(folder).private : false,
    sharingAccess: folder ? autFolderSecurity_(folder).access : '',
    sharingPermission: folder ? autFolderSecurity_(folder).permission : '',
    ownerEmail: folder ? autFolderSecurity_(folder).ownerEmail : '',
    ownedByDeployingAccount: folder ? autFolderSecurity_(folder).ownedByEffectiveUser : false,
    previousFolderCount: Math.max(0, autFolderHistoryIds_('AUT_DOCUMENTS_FOLDER_ID').length - (id ? 1 : 0)),
    error: probe.writable ? '' : probe.error
  };
  console.log(JSON.stringify(result));
  return result;
}

function repararArmazenamentoDriveSetup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var folder = autEnsureWritableRootFolder_();
    var probe = autProbeFolderWrite_(folder);
    var result = {
      ok: probe.writable && autIsSecureDocumentsRoot_(folder),
      deployingAccount: String(Session.getEffectiveUser().getEmail() || '').trim(),
      folderId: folder.getId(),
      folderUrl: folder.getUrl(),
      writable: probe.writable,
      private: autFolderSecurity_(folder).private,
      sharingAccess: autFolderSecurity_(folder).access,
      sharingPermission: autFolderSecurity_(folder).permission,
      ownerEmail: autFolderSecurity_(folder).ownerEmail,
      ownedByDeployingAccount: autFolderSecurity_(folder).ownedByEffectiveUser,
      previousFolderCount: Math.max(0, autFolderHistoryIds_('AUT_DOCUMENTS_FOLDER_ID').length - 1),
      error: probe.writable ? '' : probe.error
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/*
 * Higienização conservadora de permissões públicas do acervo documental.
 *
 * Regras de segurança desta rotina:
 * - só pode ser iniciada manualmente, no editor, pela conta Palmer;
 * - usa a API Drive v3 e remove exclusivamente permissões cujo `type` é
 *   exatamente `anyone`;
 * - nunca move, exclui ou altera o conteúdo de pastas/arquivos;
 * - nunca remove permissões owner, user, group ou domain;
 * - trabalha em lotes pequenos e salva o cursor após cada alvo;
 * - uma falha individual é registrada e não interrompe os demais alvos.
 */
var AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_ = 'AUT_DRIVE_PUBLIC_ACL_CLEANUP_V1';
var AUT_DRIVE_PUBLIC_ACL_CLEANUP_LAST_KEY_ = 'AUT_DRIVE_PUBLIC_ACL_CLEANUP_LAST_RESULT';
var AUT_DRIVE_PUBLIC_ACL_DEFAULT_BATCH_ = 12;
var AUT_DRIVE_PUBLIC_ACL_MAX_BATCH_ = 30;

function autDriveAclOperator_() {
  var expected = 'palmer.imoveis.comercial@gmail.com';
  var effective = autNormalizeEmail_(Session.getEffectiveUser().getEmail() || '');
  var active = '';
  try { active = autNormalizeEmail_(Session.getActiveUser().getEmail() || ''); }
  catch (ignoreActiveUser) {}
  autAssert_(effective === expected && active === expected,
    'Execute esta manutenção manualmente no editor do Apps Script com a conta Palmer Imóveis.',
    'FORBIDDEN');
  return {
    ID_USUARIO: '',
    NOME: expected,
    EMAIL: expected,
    PERFIL: 'DESENVOLVEDOR'
  };
}

function autDriveAclLimit_(value) {
  var limit = Math.floor(Number(value || AUT_DRIVE_PUBLIC_ACL_DEFAULT_BATCH_));
  if (!isFinite(limit) || limit < 1) limit = AUT_DRIVE_PUBLIC_ACL_DEFAULT_BATCH_;
  return Math.min(limit, AUT_DRIVE_PUBLIC_ACL_MAX_BATCH_);
}

function autDriveAclDocumentTargets_() {
  var seen = {};
  return autRows_('PROCESSO_DOCUMENTOS')
    .sort(function(a, b) { return Number(a._row || 0) - Number(b._row || 0); })
    .map(function(row) {
      var fileId = String(row.ARQUIVO_ID || '').trim();
      if (!fileId || seen[fileId]) return null;
      seen[fileId] = true;
      return {
        kind: 'DOCUMENT',
        id: fileId,
        row: Number(row._row || 0),
        documentId: String(row.ID_DOCUMENTO || '').trim()
      };
    })
    .filter(Boolean);
}

function autDriveAclRootTargets_() {
  var activeId = String(PropertiesService.getScriptProperties()
    .getProperty('AUT_DOCUMENTS_FOLDER_ID') || '').trim();
  return autFolderHistoryIds_('AUT_DOCUMENTS_FOLDER_ID').map(function(folderId) {
    return {
      kind: 'FOLDER',
      id: String(folderId || '').trim(),
      active: String(folderId || '').trim() === activeId
    };
  }).filter(function(target) { return Boolean(target.id); });
}

function autDriveAclResponseError_(code) {
  return 'DRIVE_API_HTTP_' + String(code || 'UNKNOWN');
}

function autDriveAclFetch_(url, options, acceptedCodes) {
  var request = options || {};
  request.muteHttpExceptions = true;
  request.headers = request.headers || {};
  request.headers.Authorization = 'Bearer ' + ScriptApp.getOAuthToken();
  request.headers.Accept = 'application/json';
  var response = UrlFetchApp.fetch(url, request);
  var code = Number(response.getResponseCode());
  var accepted = acceptedCodes || [200];
  if (accepted.indexOf(code) < 0) {
    var err = new Error(autDriveAclResponseError_(code));
    err.code = autDriveAclResponseError_(code);
    throw err;
  }
  return response;
}

function autDriveAclListPermissions_(fileId) {
  fileId = String(fileId || '').trim();
  autAssert_(fileId, 'Identificador do item do Drive ausente.');
  var permissions = [];
  var pageToken = '';
  var pages = 0;
  do {
    var url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '/permissions?supportsAllDrives=true&pageSize=100&fields=' +
      encodeURIComponent('nextPageToken,permissions(id,type,role)');
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    var response = autDriveAclFetch_(url, { method: 'get' }, [200]);
    var body = autJsonParse_(response.getContentText(), {});
    (Array.isArray(body.permissions) ? body.permissions : []).forEach(function(permission) {
      permissions.push({
        id: String(permission && permission.id || '').trim(),
        type: String(permission && permission.type || '').trim().toLowerCase(),
        role: String(permission && permission.role || '').trim().toLowerCase()
      });
    });
    pageToken = String(body.nextPageToken || '').trim();
    pages++;
  } while (pageToken && pages < 20);
  return permissions;
}

function autDriveAclDeletePermission_(fileId, permissionId) {
  var url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(String(fileId)) +
    '/permissions/' + encodeURIComponent(String(permissionId)) + '?supportsAllDrives=true';
  // 404 é sucesso idempotente: outra execução já pode ter removido a mesma
  // permissão entre a listagem e a exclusão.
  var response = autDriveAclFetch_(url, { method: 'delete' }, [200, 204, 404]);
  return Number(response.getResponseCode()) !== 404;
}

function autDriveAclFolderIsPrivate_(folderId) {
  try {
    var folder = DriveApp.getFolderById(String(folderId || ''));
    return String(folder.getSharingAccess() || '') === String(DriveApp.Access.PRIVATE);
  } catch (ignoreFolder) {
    return false;
  }
}

function autDriveAclInspectTarget_(target, mutate) {
  var result = {
    kind: target.kind,
    id: target.id,
    checked: true,
    privateVerified: false,
    anyoneFound: 0,
    anyoneRemoved: 0,
    anyoneAlreadyAbsent: 0,
    nonPublicPreserved: 0,
    failures: []
  };

  // A raiz ativa privada é apenas verificada. Nenhuma chamada de alteração é
  // feita nela. Arquivos continuam sendo auditados individualmente, pois podem
  // possuir uma permissão pública explícita independente da pasta.
  if (target.kind === 'FOLDER' && autDriveAclFolderIsPrivate_(target.id)) {
    result.privateVerified = true;
    return result;
  }

  var permissions = autDriveAclListPermissions_(target.id);
  var anyone = permissions.filter(function(permission) {
    return permission.type === 'anyone' && Boolean(permission.id);
  });
  result.anyoneFound = anyone.length;
  result.nonPublicPreserved = permissions.length - anyone.length;
  if (!mutate) return result;

  anyone.forEach(function(permission) {
    try {
      if (autDriveAclDeletePermission_(target.id, permission.id)) result.anyoneRemoved++;
      else result.anyoneAlreadyAbsent++;
    } catch (err) {
      result.failures.push({
        permissionId: permission.id,
        code: String(err && err.code || 'DRIVE_API_ERROR').slice(0, 80)
      });
    }
  });
  return result;
}

function autDriveAclInitialStats_() {
  return {
    checked: 0,
    foldersChecked: 0,
    documentsChecked: 0,
    privateVerified: 0,
    publicPermissionsFound: 0,
    publicPermissionsRemoved: 0,
    alreadyRemoved: 0,
    nonPublicPermissionsPreserved: 0,
    targetsWithFailures: 0,
    failures: []
  };
}

function autDriveAclMergeStats_(stats, result) {
  stats.checked++;
  if (result.kind === 'FOLDER') stats.foldersChecked++;
  else stats.documentsChecked++;
  if (result.privateVerified) stats.privateVerified++;
  stats.publicPermissionsFound += Number(result.anyoneFound || 0);
  stats.publicPermissionsRemoved += Number(result.anyoneRemoved || 0);
  stats.alreadyRemoved += Number(result.anyoneAlreadyAbsent || 0);
  stats.nonPublicPermissionsPreserved += Number(result.nonPublicPreserved || 0);
  if (result.failures && result.failures.length) {
    stats.targetsWithFailures++;
    result.failures.forEach(function(failure) {
      if (stats.failures.length >= 25) return;
      stats.failures.push({ kind: result.kind, id: result.id, code: failure.code });
    });
  }
}

function autDriveAclRecordAudit_(actor, action, details) {
  try {
    autAudit_(actor, action, 'SISTEMA', 'DRIVE_ACL', details, {
      requestId: 'drive-acl-' + Utilities.getUuid(),
      device: { origem: 'EDITOR_APPS_SCRIPT' }
    });
  } catch (auditError) {
    console.warn('A manutenção do Drive foi concluída, mas o registro de auditoria falhou: ' +
      String(auditError && auditError.message || auditError).slice(0, 200));
  }
}

function diagnosticarPermissoesPublicasDriveSetup(limite) {
  var actor = autDriveAclOperator_();
  var maxTargets = autDriveAclLimit_(limite);
  var targets = autDriveAclRootTargets_().concat(autDriveAclDocumentTargets_());
  var stats = autDriveAclInitialStats_();
  targets.slice(0, maxTargets).forEach(function(target) {
    try {
      autDriveAclMergeStats_(stats, autDriveAclInspectTarget_(target, false));
    } catch (err) {
      autDriveAclMergeStats_(stats, {
        kind: target.kind,
        id: target.id,
        failures: [{ code: String(err && err.code || 'DRIVE_API_ERROR').slice(0, 80) }]
      });
    }
  });
  var result = {
    ok: stats.targetsWithFailures === 0,
    mode: 'READ_ONLY',
    partial: targets.length > maxTargets,
    totalTargets: targets.length,
    inspectedTargets: Math.min(targets.length, maxTargets),
    stats: stats,
    message: targets.length > maxTargets
      ? 'Diagnóstico parcial concluído; aumente o lote ou execute a higienização retomável.'
      : 'Diagnóstico de permissões públicas concluído sem alterar o Drive.'
  };
  autDriveAclRecordAudit_(actor, 'DRIVE_PERMISSOES_PUBLICAS_DIAGNOSTICADAS', result);
  console.log(JSON.stringify(result));
  return result;
}

function higienizarPermissoesPublicasDriveSetup(limite) {
  var actor = autDriveAclOperator_();
  var maxTargets = autDriveAclLimit_(limite);
  var props = PropertiesService.getScriptProperties();
  var roots = autDriveAclRootTargets_();
  var documents = autDriveAclDocumentTargets_();
  var rootFingerprint = autHash_(roots.map(function(target) { return target.id; }).join('|'));
  var state = autJsonParse_(props.getProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_), null);
  if (!state || Number(state.version || 0) !== 1) {
    state = {
      version: 1,
      runId: Utilities.getUuid(),
      startedAt: autNow_(),
      rootFingerprint: rootFingerprint,
      rootIndex: 0,
      documentRowCursor: 1,
      stats: autDriveAclInitialStats_()
    };
  }
  if (state.rootFingerprint !== rootFingerprint) {
    // Uma rotação de raiz reinicia apenas a etapa de pastas. As exclusões são
    // idempotentes e os documentos já percorridos não precisam ser refeitos.
    state.rootFingerprint = rootFingerprint;
    state.rootIndex = 0;
  }
  state.stats = state.stats || autDriveAclInitialStats_();

  var processedThisBatch = 0;
  function processTarget(target) {
    try {
      autDriveAclMergeStats_(state.stats, autDriveAclInspectTarget_(target, true));
    } catch (err) {
      autDriveAclMergeStats_(state.stats, {
        kind: target.kind,
        id: target.id,
        failures: [{ code: String(err && err.code || 'DRIVE_API_ERROR').slice(0, 80) }]
      });
    }
    processedThisBatch++;
    state.updatedAt = autNow_();
    // Cursor gravado após cada alvo: uma interrupção retoma do ponto seguro.
    props.setProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_, JSON.stringify(state));
  }

  while (processedThisBatch < maxTargets && Number(state.rootIndex || 0) < roots.length) {
    var rootTarget = roots[Number(state.rootIndex || 0)];
    processTarget(rootTarget);
    state.rootIndex = Number(state.rootIndex || 0) + 1;
    props.setProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_, JSON.stringify(state));
  }

  for (var i = 0; processedThisBatch < maxTargets && i < documents.length; i++) {
    if (Number(documents[i].row || 0) <= Number(state.documentRowCursor || 1)) continue;
    processTarget(documents[i]);
    state.documentRowCursor = Number(documents[i].row || state.documentRowCursor);
    props.setProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_, JSON.stringify(state));
  }

  var hasPendingRoots = Number(state.rootIndex || 0) < roots.length;
  var hasPendingDocuments = documents.some(function(target) {
    return Number(target.row || 0) > Number(state.documentRowCursor || 1);
  });
  var complete = !hasPendingRoots && !hasPendingDocuments;
  var result = {
    ok: state.stats.targetsWithFailures === 0,
    mode: 'REMOVE_ANYONE_ONLY',
    runId: state.runId,
    startedAt: state.startedAt,
    updatedAt: autNow_(),
    complete: complete,
    processedThisBatch: processedThisBatch,
    totalTargetsAtThisRun: roots.length + documents.length,
    nextRootIndex: Number(state.rootIndex || 0),
    nextDocumentRow: Number(state.documentRowCursor || 1),
    stats: state.stats,
    message: complete
      ? 'Higienização concluída. Somente permissões públicas do tipo anyone foram removidas.'
      : 'Lote concluído com segurança. Execute higienizarPermissoesPublicasDriveSetup novamente para continuar.'
  };

  if (complete) {
    props.deleteProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_);
    props.setProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_LAST_KEY_, JSON.stringify(result));
  } else {
    props.setProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_, JSON.stringify(state));
  }
  autDriveAclRecordAudit_(actor, 'DRIVE_PERMISSOES_PUBLICAS_HIGIENIZADAS', result);
  console.log(JSON.stringify(result));
  return result;
}

function reiniciarCursorHigienizacaoPermissoesDriveSetup() {
  var actor = autDriveAclOperator_();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(AUT_DRIVE_PUBLIC_ACL_CLEANUP_STATE_KEY_);
  var result = {
    ok: true,
    resetAt: autNow_(),
    message: 'O cursor foi reiniciado. Nenhum arquivo ou permissão do Drive foi alterado.'
  };
  autDriveAclRecordAudit_(actor, 'DRIVE_HIGIENIZACAO_CURSOR_REINICIADO', result);
  console.log(JSON.stringify(result));
  return result;
}

function autEnsureOpenTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'onSpreadsheetOpen'; });
  if (!exists) ScriptApp.newTrigger('onSpreadsheetOpen').forSpreadsheet(AUTENTIKO.SPREADSHEET_ID).onOpen().create();
}

function autEnsureMaintenanceTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'cleanupExpiredAuthData'; });
  if (!exists) ScriptApp.newTrigger('cleanupExpiredAuthData').timeBased().everyDays(1).atHour(3).create();
}
