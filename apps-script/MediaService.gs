var AUT_MEDIA_TICKET_ACTIONS = Object.freeze([
  'UPLOAD', 'VIEW', 'DOWNLOAD', 'STATUS', 'REPROCESS'
]);
var AUT_MEDIA_DIRECT_DRIVE_LIMIT_BYTES = 6 * 1024 * 1024;
var AUT_MEDIA_LARGE_UPLOAD_HEALTH_CACHE_KEY = 'AUT_MEDIA_LARGE_UPLOAD_HEALTH_V1';

function mediaCloudEnabled_() {
  var configured = autConfigMap_().MEDIA_CLOUD_ENABLED;
  return configured === true || autNormalize_(configured) === 'SIM' || autNormalize_(configured) === 'TRUE';
}

function mediaLargeUploadConfigured_() {
  var config = autConfigMap_();
  var enabled = config.MEDIA_LARGE_UPLOAD_ENABLED === true ||
    autNormalize_(config.MEDIA_LARGE_UPLOAD_ENABLED) === 'SIM' ||
    autNormalize_(config.MEDIA_LARGE_UPLOAD_ENABLED) === 'TRUE';
  var workerReady = config.MEDIA_DRIVE_SYNC_WORKER_READY === true ||
    autNormalize_(config.MEDIA_DRIVE_SYNC_WORKER_READY) === 'SIM' ||
    autNormalize_(config.MEDIA_DRIVE_SYNC_WORKER_READY) === 'TRUE';
  return mediaCloudEnabled_() && enabled && workerReady;
}

function mediaLargeUploadReadiness_(forceRemote) {
  var result = {
    ready: false,
    configured: mediaLargeUploadConfigured_(),
    remoteChecked: false,
    databaseReady: false,
    workerReady: false,
    directDriveLimitBytes: AUT_MEDIA_DIRECT_DRIVE_LIMIT_BYTES,
    code: 'LARGE_UPLOAD_SAFETY_HOLD',
    message: 'Uploads acima de 6 MB estão temporariamente bloqueados até a cópia automática no Google Drive ser confirmada. Nenhum arquivo foi alterado.'
  };
  if (!result.configured) return result;

  var cache = CacheService.getScriptCache();
  if (!forceRemote) {
    var cached = autJsonParse_(cache.get(AUT_MEDIA_LARGE_UPLOAD_HEALTH_CACHE_KEY), null);
    if (cached && Number(cached.checkedAt || 0) > Date.now() - 60000) return cached;
  }

  result.remoteChecked = true;
  try {
    var response = UrlFetchApp.fetch(mediaApiBaseUrl_() + '/api/health?deep=1', {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: false,
      headers: { 'Cache-Control': 'no-cache', 'X-Autentiko-Health': 'large-upload' }
    });
    var status = Number(response.getResponseCode() || 0);
    var parsed = autJsonParse_(response.getContentText(), {});
    var data = parsed && parsed.data || {};
    var worker = data.driveSyncWorker || {};
    result.databaseReady = data.database === true;
    result.workerReady = worker.healthy === true;
    result.ready = status >= 200 && status < 300 && parsed.ok === true &&
      result.databaseReady && result.workerReady;
    if (result.ready) {
      result.code = '';
      result.message = 'Nuvem e cópia automática no Google Drive confirmadas.';
    } else {
      result.message = 'O arquivo não foi enviado: o worker de cópia para o Google Drive não respondeu como saudável. Nenhum arquivo foi alterado.';
    }
  } catch (err) {
    result.message = 'O arquivo não foi enviado porque a verificação da cópia automática no Google Drive falhou. Nenhum arquivo foi alterado.';
  }
  result.checkedAt = Date.now();
  autCachePut_(cache, AUT_MEDIA_LARGE_UPLOAD_HEALTH_CACHE_KEY, result, result.ready ? 60 : 15);
  return result;
}

function mediaAssertLargeUploadReady_(size) {
  if (Number(size || 0) <= AUT_MEDIA_DIRECT_DRIVE_LIMIT_BYTES) return;
  var readiness = mediaLargeUploadReadiness_(false);
  autAssert_(readiness.ready, readiness.message, readiness.code || 'LARGE_UPLOAD_SAFETY_HOLD');
}

function apiVerificarProntidaoUploadGrande(token, forceRemote) {
  try {
    autRequireAuth_(token, 'DOCUMENTO_ENVIAR');
    return autResult_(mediaLargeUploadReadiness_(forceRemote === true));
  } catch (err) { return autPublicError_(err); }
}

function mediaApiBaseUrl_() {
  var value = String(autConfigMap_().MEDIA_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  autAssert_(/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(value),
    'A URL da API de mídia não é segura.', 'MEDIA_CONFIG_INVALID');
  return value;
}

function mediaSigningSecret_() {
  var secret = String(PropertiesService.getScriptProperties().getProperty('AUT_MEDIA_SIGNING_SECRET') || '');
  autAssert_(secret.length >= 32, 'O segredo da nuvem documental ainda não foi configurado.', 'MEDIA_CONFIG_REQUIRED');
  return secret;
}

function mediaBase64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function mediaBase64UrlEncodeText_(text) {
  return mediaBase64UrlEncodeBytes_(Utilities.newBlob(String(text), 'text/plain').getBytes());
}

function mediaBase64UrlDecodeText_(text) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(String(text))).getDataAsString('UTF-8');
}

function mediaConstantTimeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  var difference = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var index = 0; index < length; index++) {
    difference |= (left.charCodeAt(index % Math.max(left.length, 1)) || 0) ^
      (right.charCodeAt(index % Math.max(right.length, 1)) || 0);
  }
  return difference === 0;
}

function mediaSignCompactPayload_(payload) {
  var encoded = mediaBase64UrlEncodeText_(JSON.stringify(payload));
  var signature = Utilities.computeHmacSha256Signature(
    encoded,
    mediaSigningSecret_(),
    Utilities.Charset.UTF_8
  );
  return encoded + '.' + mediaBase64UrlEncodeBytes_(signature);
}

function mediaVerifyCompactPayload_(token) {
  var parts = String(token || '').split('.');
  autAssert_(parts.length === 2 && parts[0] && parts[1], 'Comprovante de mídia inválido.', 'MEDIA_RECEIPT_INVALID');
  var expected = mediaBase64UrlEncodeBytes_(Utilities.computeHmacSha256Signature(
    parts[0],
    mediaSigningSecret_(),
    Utilities.Charset.UTF_8
  ));
  autAssert_(mediaConstantTimeEqual_(expected, parts[1]), 'Assinatura do comprovante de mídia inválida.', 'MEDIA_RECEIPT_INVALID');
  var payload = autJsonParse_(mediaBase64UrlDecodeText_(parts[0]), null);
  autAssert_(payload && Number(payload.exp || 0) > Math.floor(Date.now() / 1000),
    'O comprovante de mídia expirou.', 'MEDIA_RECEIPT_EXPIRED');
  return payload;
}

function mediaRequireDocument_(user, documentId, permission) {
  if (permission) {
    autAssert_(autHasPermission_(user, permission), 'Você não tem permissão para esta ação.', 'FORBIDDEN');
  }
  var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', String(documentId || ''));
  autAssert_(document && !document.EXCLUIDO_EM, 'Documento não encontrado.', 'NOT_FOUND');
  var process = autRequireProcess_(user, document.ID_PROCESSO);
  return { document: document, process: process };
}

function mediaTicketPayload_(user, document, process, action, requestId) {
  var normalizedAction = autNormalize_(action);
  autAssert_(AUT_MEDIA_TICKET_ACTIONS.indexOf(normalizedAction) >= 0,
    'Ação de mídia inválida.', 'VALIDATION_ERROR');
  var normalizedRequestId = String(requestId || '').trim();
  autAssert_(/^[A-Za-z0-9._:-]{8,128}$/.test(normalizedRequestId),
    'Identificador de requisição inválido.', 'INVALID_REQUEST_ID');
  var now = Math.floor(Date.now() / 1000);
  var ttl = normalizedAction === 'UPLOAD' ? 600 : 60;
  return {
    v: 1,
    iss: 'autentiko-apps-script',
    sub: String(user.ID_USUARIO),
    processId: String(process.ID_PROCESSO),
    documentId: String(document.ID_DOCUMENTO),
    version: Number(document.MEDIA_VERSAO || document.VERSAO || 1),
    action: normalizedAction,
    requestId: normalizedRequestId,
    jti: Utilities.getUuid(),
    iat: now,
    exp: now + ttl
  };
}

function mediaCreateTicket_(user, document, process, action, requestId) {
  var payload = mediaTicketPayload_(user, document, process, action, requestId);
  var isPdf = String(document.MIME_TYPE || '').toLowerCase() === 'application/pdf';
  var configuredLimit = isPdf
    ? Number(autConfigMap_().MEDIA_MAX_PDF_SOURCE_MB || 100)
    : Number(autConfigMap_().MEDIA_MAX_UPLOAD_MB || 25);
  var maximumLimit = isPdf ? 100 : 25;
  return {
    ticket: mediaSignCompactPayload_(payload),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    action: payload.action,
    apiBaseUrl: mediaApiBaseUrl_(),
    maxUploadBytes: Math.min(Math.max(configuredLimit, 1), maximumLimit) * 1024 * 1024
  };
}

function mediaCloudUploadLimitMb_(mimeType, catalog) {
  var isPdf = String(mimeType || '').toLowerCase() === 'application/pdf';
  var configured = isPdf
    ? Number(autConfigMap_().MEDIA_MAX_PDF_SOURCE_MB || 100)
    : Number(autConfigMap_().MEDIA_MAX_UPLOAD_MB || 25);
  var absoluteMaximum = isPdf ? 100 : 25;
  var limit = Math.min(Math.max(configured, 1), absoluteMaximum);
  var catalogLimit = Number(catalog && catalog.maxMb || 0);
  var legacyDirectLimit = Number(AUTENTIKO.MAX_UPLOAD_MB || 6);

  // Os catálogos antigos foram inicializados com o teto técnico do envio pelo
  // Apps Script (6 MB). Na rota direta ao Storage esse valor não deve bloquear
  // o limite próprio da nuvem. Um valor administrativo diferente do legado
  // continua sendo respeitado como regra explícita do tipo documental.
  if (isFinite(catalogLimit) && catalogLimit > 0 && catalogLimit !== legacyDirectLimit) {
    limit = Math.min(limit, catalogLimit);
  }
  return limit;
}

function apiCriarTicketMidia(token, documentId, action, requestId) {
  try {
    autAssert_(mediaCloudEnabled_(), 'A nuvem documental ainda não está ativa para este ambiente.', 'FEATURE_DISABLED');
    var requiredPermission = autNormalize_(action) === 'UPLOAD' ? 'DOCUMENTO_ENVIAR' : 'DOCUMENTO_BAIXAR';
    var user = autRequireAuth_(token, requiredPermission);
    var found = mediaRequireDocument_(user, documentId);
    return autResult_(mediaCreateTicket_(user, found.document, found.process, action, requestId));
  } catch (err) { return autPublicError_(err); }
}

function apiReservarUploadNuvem(token, payload) {
  var requestKey = '';
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    autAssert_(mediaCloudEnabled_(), 'A nuvem documental ainda não está ativa para este ambiente.', 'FEATURE_DISABLED');
    mediaSigningSecret_();
    mediaApiBaseUrl_();
    var user = autRequireAuth_(token, 'DOCUMENTO_ENVIAR');
    var process = autRequireProcess_(user, String(payload.processId || ''));
    autAssertProcessMutable_(process);
    autAssert_(autCanManageProcessDocuments_(user, process),
      'O processo não está sob sua responsabilidade atual para receber documentos.', 'NOT_CURRENT_RESPONSIBLE');
    var expectedVersion = Number(payload.expectedVersion || 0);
    autAssert_(expectedVersion > 0 && expectedVersion <= autProcessVersion_(process),
      'A versão informada do processo é inválida. Atualize-o antes de enviar o documento.', 'PROCESS_VERSION_CONFLICT');
    var requestId = String(payload.requestId || '').trim();
    var mimeType = String(payload.mimeType || '').toLowerCase();
    autAssert_(AUT_DOCUMENT_PREVIEW_MIME_TYPES.indexOf(mimeType) >= 0,
      'Formato de arquivo não permitido.', 'INVALID_FILE');
    var size = Number(payload.size || 0);
    autAssert_(isFinite(size) && size > 0, 'O arquivo selecionado está vazio.', 'INVALID_FILE');
    // Contenção fail-closed: nenhuma linha, ticket ou objeto é criado enquanto
    // a redundância Supabase -> Drive de arquivos grandes não estiver saudável.
    mediaAssertLargeUploadReady_(size);
    var hash = String(payload.sha256 || '').toLowerCase();
    autAssert_(/^[a-f0-9]{64}$/.test(hash), 'Hash SHA-256 inválido.', 'HASH_INVALID');
    var catalog = autDocumentCatalog_().filter(function(item) {
      return String(item.id) === String(payload.typeId || '');
    })[0];
    autAssert_(catalog, 'Tipo de documento inválido.', 'VALIDATION_ERROR');
    var maxMb = mediaCloudUploadLimitMb_(mimeType, catalog);
    autAssert_(size <= maxMb * 1024 * 1024,
      'O arquivo ultrapassa o limite de ' + maxMb + ' MB configurado para este tipo.', 'FILE_TOO_LARGE');
    var safeName = pdfDoc_sanitizeName_(payload.fileName, mimeType === 'application/pdf' ? 'documento.pdf' : 'documento');
    if (mimeType === 'application/pdf') pdfDoc_assertPdfName_(safeName);
    var existing = autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', process.ID_PROCESSO).filter(function(row) {
      return row.ID_DOCUMENTO_TIPO === catalog.id && !row.EXCLUIDO_EM;
    });
    var existingDocumentId = String(payload.documentId || '').trim();
    if (existingDocumentId) {
      var storedDocument = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', existingDocumentId);
      autAssert_(storedDocument && !storedDocument.EXCLUIDO_EM,
        'O documento salvo no Drive não foi encontrado.', 'NOT_FOUND');
      autAssert_(String(storedDocument.ID_PROCESSO) === String(process.ID_PROCESSO),
        'O documento informado pertence a outro processo.', 'INVALID_DOCUMENT');
      autAssert_(String(storedDocument.ID_DOCUMENTO_TIPO) === String(catalog.id),
        'O tipo do documento salvo não corresponde ao envio.', 'INVALID_DOCUMENT');
      autAssert_(String(storedDocument.ARQUIVO_ID || '').trim(),
        'A réplica na nuvem exige um arquivo original já salvo no Drive.', 'DRIVE_FILE_REQUIRED');
      autAssert_(String(storedDocument.HASH_SHA256 || '').toLowerCase() === hash,
        'O arquivo local não corresponde ao hash do documento salvo no Drive.', 'HASH_MISMATCH');
      autAssert_(Number(storedDocument.TAMANHO_BYTES || 0) === size,
        'O tamanho do arquivo local não corresponde ao documento salvo no Drive.', 'SIZE_MISMATCH');
      autAssert_(String(storedDocument.MIME_TYPE || '').toLowerCase() === mimeType,
        'O formato do arquivo local não corresponde ao documento salvo no Drive.', 'MIME_MISMATCH');

      var storedVersion = Number(storedDocument.MEDIA_VERSAO || storedDocument.VERSAO || 1);
      if (String(storedDocument.MEDIA_STATUS || '') === 'READY' &&
          String(storedDocument.SYNC_DRIVE_SUPABASE || '') === 'SINCRONIZADO') {
        return autResult_({
          documentId: storedDocument.ID_DOCUMENTO,
          mediaVersion: storedVersion,
          processVersion: autProcessVersion_(process),
          replica: true,
          alreadyReady: true
        });
      }

      var replicaTicket = mediaCreateTicket_(user, storedDocument, process, 'UPLOAD', requestId);
      autUpdateRow_('PROCESSO_DOCUMENTOS', storedDocument._row, {
        SYNC_DRIVE_SUPABASE: 'DRIVE_READY_SUPABASE_PENDENTE',
        MEDIA_ATUALIZADO_EM: autNow_(),
        MEDIA_ERRO_CODIGO: ''
      });
      autAudit_(user, 'MEDIA_REPLICA_RESERVADA', 'PROCESSO', process.ID_PROCESSO, {
        idDocumento: storedDocument.ID_DOCUMENTO,
        versao: storedVersion,
        tamanho: size,
        mimeType: mimeType,
        hash: hash
      }, payload.context);
      return autResult_({
        documentId: storedDocument.ID_DOCUMENTO,
        mediaVersion: storedVersion,
        processVersion: autProcessVersion_(process),
        ticket: replicaTicket.ticket,
        expiresAt: replicaTicket.expiresAt,
        apiBaseUrl: replicaTicket.apiBaseUrl,
        maxUploadBytes: replicaTicket.maxUploadBytes,
        replica: true
      });
    }
    var resumable = existing.filter(function(row) {
      return String(row.HASH_SHA256 || '').toLowerCase() === hash &&
        String(row.MEDIA_STATUS || '') === 'UPLOAD_PENDING' && !row.ARQUIVO_ID &&
        String(row.ENVIADO_POR || '') === String(user.NOME || '');
    }).sort(function(a, b) { return autDateMs_(b.CRIADO_EM) - autDateMs_(a.CRIADO_EM); })[0];
    if (resumable) {
      // A reserva pode ter sido confirmada no Apps Script e a resposta ter se
      // perdido antes de o navegador iniciar o TUS. Nesse caso, repetir a mesma
      // requisição deve devolver um ticket novo para a linha pendente, sem criar
      // outro documento e sem cair em DUPLICATE_REQUEST.
      var resumableTicket = mediaCreateTicket_(user, resumable, process, 'UPLOAD', requestId);
      autUpdateRow_('PROCESSO_DOCUMENTOS', resumable._row, {
        MEDIA_ATUALIZADO_EM: autNow_(), MEDIA_ERRO_CODIGO: ''
      });
      autAudit_(user, 'MEDIA_UPLOAD_RETOMADO', 'PROCESSO', process.ID_PROCESSO, {
        idDocumento: resumable.ID_DOCUMENTO, versao: Number(resumable.MEDIA_VERSAO || resumable.VERSAO || 1), hash: hash
      }, payload.context);
      return autResult_({
        documentId: resumable.ID_DOCUMENTO,
        mediaVersion: Number(resumable.MEDIA_VERSAO || resumable.VERSAO || 1),
        processVersion: autProcessVersion_(process),
        ticket: resumableTicket.ticket, expiresAt: resumableTicket.expiresAt,
        apiBaseUrl: resumableTicket.apiBaseUrl, maxUploadBytes: resumableTicket.maxUploadBytes,
        resumed: true
      });
    }
    // A proteção contra clique duplo só é reivindicada quando uma nova linha
    // realmente será criada. Retomadas idempotentes são tratadas acima.
    requestKey = autClaimRequest_(user, 'MEDIA_UPLOAD_RESERVE|' + process.ID_PROCESSO, { requestId: requestId });
    autAssert_(!pdfDoc_findDuplicate_(process.ID_PROCESSO, hash, ''),
      'Este documento já está anexado ao processo.', 'DUPLICATE_DOCUMENT');
    var documentId = autUuid_();
    var mediaVersion = existing.length + 1;
    var now = autNow_();
    lock.waitLock(30000);
    autAppend_('PROCESSO_DOCUMENTOS', {
      ID_DOCUMENTO: documentId,
      ID_PROCESSO: process.ID_PROCESSO,
      PROTOCOLO: process.PROTOCOLO,
      ID_DOCUMENTO_TIPO: catalog.id,
      NOME_DOCUMENTO: catalog.name,
      ARQUIVO_ID: '',
      ARQUIVO_NOME: safeName,
      MIME_TYPE: mimeType,
      TAMANHO_BYTES: size,
      HASH_SHA256: hash,
      VERSAO: mediaVersion,
      OBRIGATORIO: (catalog.requiredProcessTypes || (catalog.required ? catalog.processTypes : [])).indexOf(process.TIPO_PROCESSO) >= 0 ? 'SIM' : 'NAO',
      ENVIADO_POR: user.NOME,
      DISPOSITIVO_JSON: autJson_(autContext_(payload.context).dispositivo),
      LOCALIZACAO_JSON: autJson_(autContext_(payload.context).localizacao),
      CRIADO_EM: now,
      EXCLUIDO_EM: '',
      CATEGORIAS_JSON: autJson_(catalog.categories || []),
      STATUS_CONFERENCIA: 'PENDENTE_CONFERENCIA',
      VERSAO_REGISTRO: 1,
      MEDIA_STATUS: 'UPLOAD_PENDING',
      MEDIA_VERSAO: mediaVersion,
      THUMBNAIL_STATUS: 'PENDENTE',
      PREVIEW_STATUS: 'PENDENTE',
      SYNC_DRIVE_SUPABASE: 'PENDENTE',
      MEDIA_ATUALIZADO_EM: now,
      MEDIA_ERRO_CODIGO: ''
    });
    autUpdateRow_('PROCESSOS', process._row, {
      VERSAO_REGISTRO: autProcessVersion_(process) + 1,
      ATUALIZADO_EM: now
    });
    var document = autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
    var ticket = mediaCreateTicket_(user, document, process, 'UPLOAD', requestId);
    autAudit_(user, 'MEDIA_UPLOAD_RESERVADO', 'PROCESSO', process.ID_PROCESSO, {
      idDocumento: documentId,
      versao: mediaVersion,
      tamanho: size,
      mimeType: mimeType,
      hash: hash
    }, payload.context);
    autCommitRequest_(requestKey);
    return autResult_({
      documentId: documentId,
      mediaVersion: mediaVersion,
      processVersion: autProcessVersion_(process) + 1,
      ticket: ticket.ticket,
      expiresAt: ticket.expiresAt,
      apiBaseUrl: ticket.apiBaseUrl,
      maxUploadBytes: ticket.maxUploadBytes
    });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiFinalizarUploadNuvem(token, receipt, requestId) {
  var requestKey = '';
  try {
    autAssert_(mediaCloudEnabled_(), 'A nuvem documental ainda não está ativa para este ambiente.', 'FEATURE_DISABLED');
    var user = autRequireAuth_(token, 'DOCUMENTO_ENVIAR');
    var payload = mediaVerifyCompactPayload_(receipt);
    autAssert_(payload.kind === 'media-receipt' && payload.status === 'READY',
      'O upload ainda não foi confirmado pela nuvem documental.', 'MEDIA_RECEIPT_INVALID');
    autAssert_(String(payload.requestId || '') === String(requestId || ''),
      'O comprovante pertence a outra requisição.', 'MEDIA_RECEIPT_INVALID');
    var found = mediaRequireDocument_(user, payload.documentId);
    autAssert_(String(found.document.ID_PROCESSO) === String(payload.processId),
      'O comprovante pertence a outro processo.', 'MEDIA_RECEIPT_INVALID');
    autAssert_(Number(payload.version || 0) === Number(found.document.MEDIA_VERSAO || found.document.VERSAO || 1),
      'O comprovante pertence a outra versão do documento.', 'MEDIA_VERSION_CONFLICT');
    requestKey = autClaimRequest_(user, 'MEDIA_UPLOAD_COMPLETE|' + found.document.ID_DOCUMENTO, { requestId: requestId });
    var hasDriveOriginal = Boolean(String(found.document.ARQUIVO_ID || '').trim());
    var syncState = hasDriveOriginal ? 'SINCRONIZADO' : 'SUPABASE_READY_DRIVE_PENDENTE';
    autUpdateRow_('PROCESSO_DOCUMENTOS', found.document._row, {
      MEDIA_STATUS: 'READY',
      MEDIA_VERSAO: Number(payload.version),
      THUMBNAIL_STATUS: payload.thumbnailStatus || 'PENDENTE',
      PREVIEW_STATUS: payload.previewStatus || 'READY',
      SYNC_DRIVE_SUPABASE: syncState,
      MEDIA_ATUALIZADO_EM: autNow_(),
      MEDIA_ERRO_CODIGO: ''
    });
    autAudit_(user, 'MEDIA_NUVEM_SINCRONIZADA', 'PROCESSO', found.process.ID_PROCESSO, {
      idDocumento: found.document.ID_DOCUMENTO,
      versao: Number(payload.version),
      originalHash: String(payload.originalHash || '').slice(0, 64),
      requestId: String(requestId || '')
    }, { requestId: requestId });
    autCommitRequest_(requestKey);
    return autResult_({
      storageReady: true,
      driveSyncPending: !hasDriveOriginal,
      driveReady: hasDriveOriginal,
      syncState: syncState,
      documentId: found.document.ID_DOCUMENTO,
      version: Number(payload.version)
    });
  } catch (err) { return autPublicError_(err); }
}

function apiConsultarEstadoMidia(token, documentId) {
  try {
    var user = autRequireAuth_(token, 'DOCUMENTO_BAIXAR');
    var found = mediaRequireDocument_(user, documentId);
    return autResult_({
      enabled: mediaCloudEnabled_(),
      documentId: found.document.ID_DOCUMENTO,
      status: found.document.MEDIA_STATUS || 'DRIVE_ONLY',
      version: Number(found.document.MEDIA_VERSAO || found.document.VERSAO || 1),
      thumbnailStatus: found.document.THUMBNAIL_STATUS || '',
      previewStatus: found.document.PREVIEW_STATUS || '',
      driveSupabaseSync: found.document.SYNC_DRIVE_SUPABASE || 'PENDENTE',
      updatedAt: found.document.MEDIA_ATUALIZADO_EM || '',
      errorCode: found.document.MEDIA_ERRO_CODIGO || ''
    });
  } catch (err) { return autPublicError_(err); }
}

function apiReprocessarMidia(token, documentId, requestId) {
  var requestKey = '';
  try {
    autAssert_(mediaCloudEnabled_(), 'A nuvem documental ainda não está ativa para este ambiente.', 'FEATURE_DISABLED');
    var user = autRequireAuth_(token, 'CONFIGURACAO_GERIR');
    var found = mediaRequireDocument_(user, documentId);
    autAssertProcessMutable_(found.process);
    requestKey = autClaimRequest_(user, 'MEDIA_REPROCESS|' + found.document.ID_DOCUMENTO, { requestId: requestId });
    autUpdateRow_('PROCESSO_DOCUMENTOS', found.document._row, {
      MEDIA_STATUS: 'REPROCESSAMENTO_PENDENTE',
      THUMBNAIL_STATUS: 'PENDENTE',
      PREVIEW_STATUS: 'PENDENTE',
      MEDIA_ATUALIZADO_EM: autNow_(),
      MEDIA_ERRO_CODIGO: ''
    });
    var ticket = mediaCreateTicket_(user, found.document, found.process, 'REPROCESS', requestId);
    autAudit_(user, 'MEDIA_REPROCESSAMENTO_SOLICITADO', 'PROCESSO', found.process.ID_PROCESSO, {
      idDocumento: found.document.ID_DOCUMENTO,
      versao: Number(found.document.MEDIA_VERSAO || found.document.VERSAO || 1)
    }, { requestId: requestId });
    autCommitRequest_(requestKey);
    return autResult_(ticket);
  } catch (err) { return autPublicError_(err); }
}
