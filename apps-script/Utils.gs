function autNow_() {
  return Utilities.formatDate(new Date(), AUTENTIKO.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function autUuid_() {
  return Utilities.getUuid();
}

function autNormalize_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase();
}

function autNormalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function autDigits_(value) {
  return String(value || '').replace(/\D/g, '');
}

function autCurrencyNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  var text = String(value == null ? '' : value).trim().replace(/[R$\s]/g, '');
  if (!text) return 0;
  if (text.indexOf(',') >= 0) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, '');
  } else if (/^\-?\d{1,3}\.\d{3}$/.test(text)) {
    text = text.replace('.', '');
  }
  text = text.replace(/[^0-9.\-]/g, '');
  var number = Number(text);
  return isFinite(number) ? number : 0;
}

function autSafeCell_(value) {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') value = JSON.stringify(value);
  var text = String(value);
  var needsLiteralText = /^[=+\-@]/.test(text) || /^[0-9][0-9.,/:\-]*$/.test(text);
  return needsLiteralText ? "'" + text : text;
}

function autJsonParse_(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; } catch (err) { return fallback; }
}

function autJson_(value) {
  return JSON.stringify(value == null ? {} : value);
}

function autHash_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function autHashBytes_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function autRandom_(length) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  var out = '';
  var pool = '';
  while (pool.length < length * 2) pool += autHash_(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now() + '|' + pool);
  for (var i = 0; i < length; i++) {
    var byte = parseInt(pool.substr(i * 2, 2), 16);
    out += alphabet.charAt(byte % alphabet.length);
  }
  return out;
}

function autRandomDigits_(length) {
  var size = Math.max(Number(length || 1), 1);
  var entropy = '';
  while (entropy.length < size * 2) entropy += autHash_(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now() + '|' + entropy);
  var out = '';
  for (var i = 0; i < size; i++) out += String(parseInt(entropy.substr(i * 2, 2), 16) % 10);
  return out;
}

function autTemporaryPassword_(length) {
  var size = Math.max(Number(length || 16), 12);
  return 'Aa7!' + autRandom_(size - 4);
}

function autOtpCode_() {
  return autRandomDigits_(6);
}

function autToken_() {
  return Utilities.base64EncodeWebSafe(Utilities.getUuid() + Utilities.getUuid()).replace(/=+$/g, '');
}

function autPasswordHash_(password, salt) {
  return autHash_(String(salt) + '|' + String(password) + '|AUTENTIKO_OK_NUVEM');
}

function autAssert_(condition, message, code) {
  if (!condition) {
    var err = new Error(message || 'Operação não permitida.');
    err.code = code || 'VALIDATION_ERROR';
    throw err;
  }
}

function autCleanObject_(obj) {
  var out = {};
  Object.keys(obj || {}).forEach(function(key) {
    var value = obj[key];
    if (value !== undefined && typeof value !== 'function') out[key] = value;
  });
  return out;
}

function autPublicError_(err) {
  var expectedCodes = ['VALIDATION_ERROR', 'AUTH_REQUIRED', 'SESSION_EXPIRED', 'USER_INACTIVE', 'FORBIDDEN', 'INVALID_CREDENTIALS', 'LOGIN_THROTTLED', 'DUPLICATE_USER', 'DUPLICATE_DOCUMENT', 'INVALID_TOKEN', 'INVALID_CURSOR', 'INVALID_JSON', 'INDEX_NOT_READY', 'DRIVE_INDEX_NOT_CONFIGURED', 'DRIVE_INDEX_LIMIT', 'NOT_FOUND', 'INVALID_TRANSITION', 'MISSING_DOCUMENTS', 'INCOME_ACCEPTANCE_REQUIRED', 'PAYLOAD_TOO_LARGE', 'FIELD_TOO_LARGE', 'INVALID_CPF', 'INVALID_EMAIL', 'INVALID_OPTION', 'INVALID_FILE', 'PREVIEW_DISABLED', 'PREVIEW_UNAVAILABLE', 'PREVIEW_TOO_LARGE', 'DOCUMENT_FILE_UNAVAILABLE', 'PROCESS_VERSION_REQUIRED', 'PROCESS_VERSION_CONFLICT', 'FEATURE_DISABLED', 'MEDIA_CONFIG_REQUIRED', 'AUDIT_ANCHOR_FAILED', 'SETUP_REQUIRED', 'MAINTENANCE'];
  var detail = err && err.stack ? err.stack : err;
  if (err && expectedCodes.indexOf(err.code) >= 0) console.warn(detail);
  else console.error(detail);
  return {
    ok: false,
    code: err && err.code ? err.code : 'INTERNAL_ERROR',
    message: err && err.message ? err.message : 'Não foi possível concluir a operação.'
  };
}

function autResult_(data) {
  return { ok: true, data: data == null ? null : data };
}

function autDateMs_(value) {
  var ms = new Date(value || 0).getTime();
  return isNaN(ms) ? 0 : ms;
}

function autCpfValido_(value) {
  var cpf = autDigits_(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  var sum = 0;
  for (var i = 0; i < 9; i++) sum += Number(cpf.charAt(i)) * (10 - i);
  var d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf.charAt(9))) return false;
  sum = 0;
  for (var j = 0; j < 10; j++) sum += Number(cpf.charAt(j)) * (11 - j);
  var d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf.charAt(10));
}

function autFormatCpf_(value) {
  var cpf = autDigits_(value);
  if (cpf.length !== 11) return String(value || '');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function autValidateCnpj_(value) {
  var cnpj = autDigits_(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  function digit(base, weights) {
    var sum = 0;
    for (var i = 0; i < weights.length; i++) sum += Number(base.charAt(i)) * weights[i];
    var remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }
  var first = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  var second = digit(cnpj.slice(0, 12) + first, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj.slice(-2) === String(first) + String(second);
}

function autFormatCnpj_(value) {
  var cnpj = autDigits_(value);
  if (cnpj.length !== 14) return String(value || '');
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function autLabel_(key) {
  return AUTENTIKO_LABELS[key] || String(key || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, function(m) { return m.toUpperCase(); });
}

function autContext_(context) {
  context = context || {};
  function boundedFlatObject(value, maxProperties, maxTextLength) {
    var out = {};
    Object.keys(value && typeof value === 'object' ? value : {}).slice(0, maxProperties).forEach(function(key) {
      var safeKey = String(key).slice(0, 60);
      var item = value[key];
      if (typeof item === 'number' || typeof item === 'boolean') out[safeKey] = item;
      else if (item != null) out[safeKey] = String(item).slice(0, maxTextLength);
    });
    return out;
  }
  return {
    dispositivo: boundedFlatObject(context.device || context.dispositivo || {}, 12, 500),
    localizacao: boundedFlatObject(context.location || context.localizacao || {}, 10, 100),
    ipPublico: String(context.ipPublic || context.ip || '').trim().slice(0, 64),
    timezone: String(context.timezone || (context.device && context.device.timezone) || '').trim().slice(0, 100),
    requestId: String(context.requestId || '').trim().slice(0, 128)
  };
}
