function autUserPublic_(row) {
  return {
    id: row.ID_USUARIO,
    name: row.NOME,
    email: row.EMAIL,
    username: row.USUARIO,
    role: row.PERFIL,
    status: row.STATUS,
    permissions: autUserPermissions_(row),
    emailVerified: autNormalize_(row.EMAIL_VERIFICADO) === 'SIM',
    mustChangePassword: autNormalize_(row.DEVE_TROCAR_SENHA) === 'SIM',
    createdAt: row.CRIADO_EM,
    lastAccess: row.ULTIMO_ACESSO
  };
}

function autUserPermissions_(user) {
  var role = String(user.PERFIL || '');
  var custom = autJsonParse_(user.PERMISSOES_JSON, []);
  if (role === 'DESENVOLVEDOR') return ['*'];
  var defaults = AUTENTIKO_DEFAULT_PERMISSIONS[role] || [];
  return Array.from(new Set(defaults.concat(Array.isArray(custom) ? custom : [])));
}

function autHasPermission_(user, permission) {
  var permissions = autUserPermissions_(user);
  return permissions.indexOf('*') >= 0 || permissions.indexOf(permission) >= 0;
}

function autFindUserLogin_(login) {
  var targetEmail = autNormalizeEmail_(login);
  return autFind_('USUARIOS', 'EMAIL', targetEmail) || autFind_('USUARIOS', 'USUARIO', String(login || '').trim());
}

var AUT_SESSION_CACHE_PREFIX_ = 'AUT_SESSION_V2_';
var AUT_SESSION_CACHE_TTL_SECONDS_ = 1800;

function autSessionCacheKeyFromHash_(tokenHash) {
  return AUT_SESSION_CACHE_PREFIX_ + String(tokenHash || '');
}

function autSessionSafeUser_(user) {
  var safe = {};
  var blocked = {
    SENHA_HASH: true,
    SALT: true,
    TENTATIVAS_FALHAS: true,
    BLOQUEADO_ATE: true
  };
  Object.keys(user || {}).forEach(function(key) {
    if (!blocked[key]) safe[key] = user[key];
  });
  return safe;
}

function autCacheSession_(rawToken, session, user) {
  try {
    var tokenHash = autHash_(String(rawToken || ''));
    var remainingSeconds = Math.floor((autDateMs_(session.EXPIRA_EM) - Date.now()) / 1000);
    if (!tokenHash || remainingSeconds < 1) return false;
    return autCachePut_(CacheService.getScriptCache(), autSessionCacheKeyFromHash_(tokenHash), {
      session: {
        id: session.ID_SESSAO,
        userId: session.ID_USUARIO,
        createdAt: session.CRIADO_EM,
        expiresAt: session.EXPIRA_EM,
        row: session._row || 0
      },
      user: autSessionSafeUser_(user)
    }, Math.min(AUT_SESSION_CACHE_TTL_SECONDS_, remainingSeconds));
  } catch (error) {
    console.warn('Não foi possível manter a sessão no cache: ' + error.message);
    return false;
  }
}

function autRemoveSessionCacheByHash_(tokenHash) {
  if (!tokenHash) return;
  try { CacheService.getScriptCache().remove(autSessionCacheKeyFromHash_(tokenHash)); }
  catch (error) { console.warn('Não foi possível invalidar a sessão no cache: ' + error.message); }
}

function autInvalidateUserSessionCaches_(userId) {
  if (!userId) return;
  try {
    var keys = autRowsBy_('SESSOES', 'ID_USUARIO', userId).map(function(row) {
      return row.TOKEN_HASH ? autSessionCacheKeyFromHash_(row.TOKEN_HASH) : '';
    }).filter(Boolean);
    if (keys.length) CacheService.getScriptCache().removeAll(keys);
  } catch (error) {
    console.warn('Não foi possível invalidar as sessões do usuário no cache: ' + error.message);
  }
}

function autAuthorizeSession_(session, user, permission) {
  autAssert_(session && !session.REVOGADO_EM, 'Sessão inválida ou encerrada.', 'AUTH_REQUIRED');
  autAssert_(autDateMs_(session.EXPIRA_EM || session.expiresAt) > Date.now(), 'Sua sessão expirou. Entre novamente.', 'SESSION_EXPIRED');
  autAssert_(user && user.STATUS === 'ATIVO', 'Usuário bloqueado ou inativo.', 'USER_INACTIVE');
  var config = autConfigMap_();
  if (config.MODO_MANUTENCAO && user.PERFIL !== 'DESENVOLVEDOR') {
    autAssert_(false, config.MENSAGEM_MANUTENCAO || 'Sistema em manutenção.', 'MAINTENANCE');
  }
  if (permission) autAssert_(autHasPermission_(user, permission), 'Você não tem permissão para esta ação.', 'FORBIDDEN');
  user._sessionId = session.ID_SESSAO || session.id;
  user._sessionCreatedAt = session.CRIADO_EM || session.createdAt;
  user._sessionRow = session._row || session.row || 0;
  return user;
}

function autCreateSession_(user, context) {
  var token = autToken_();
  var created = new Date();
  var expires = new Date(created.getTime() + AUTENTIKO.SESSION_HOURS * 60 * 60 * 1000);
  var ctx = autContext_(context);
  var session = {
    ID_SESSAO: autUuid_(),
    ID_USUARIO: user.ID_USUARIO,
    TOKEN_HASH: autHash_(token),
    CRIADO_EM: created.toISOString(),
    EXPIRA_EM: expires.toISOString(),
    REVOGADO_EM: '',
    DISPOSITIVO_JSON: autJson_(ctx.dispositivo),
    LOCALIZACAO_JSON: autJson_(ctx.localizacao)
  };
  session._row = autAppend_('SESSOES', session);
  autCacheSession_(token, session, user);
  return { token: token, expiresAt: expires.toISOString(), user: autUserPublic_(user) };
}

function autRequireAuth_(token, permission) {
  var rawToken = String(token || '');
  autAssert_(rawToken && rawToken.length <= 256, 'Sessão não informada ou inválida.', 'AUTH_REQUIRED');
  var tokenHash = autHash_(rawToken);
  var cacheKey = autSessionCacheKeyFromHash_(tokenHash);
  var cached = autJsonParse_(CacheService.getScriptCache().get(cacheKey), null);
  if (cached && cached.session && cached.user) {
    try {
      return autAuthorizeSession_(cached.session, cached.user, permission);
    } catch (cachedError) {
      if (['AUTH_REQUIRED', 'SESSION_EXPIRED', 'USER_INACTIVE'].indexOf(cachedError.code) >= 0) {
        autRemoveSessionCacheByHash_(tokenHash);
      }
      throw cachedError;
    }
  }
  var session = autFind_('SESSOES', 'TOKEN_HASH', tokenHash);
  autAssert_(session && !session.REVOGADO_EM, 'Sessão inválida ou encerrada.', 'AUTH_REQUIRED');
  autAssert_(autDateMs_(session.EXPIRA_EM) > Date.now(), 'Sua sessão expirou. Entre novamente.', 'SESSION_EXPIRED');
  var user = autFind_('USUARIOS', 'ID_USUARIO', session.ID_USUARIO);
  var authorized = autAuthorizeSession_(session, user, permission);
  autCacheSession_(rawToken, session, authorized);
  return authorized;
}

function apiLogin(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var login = String(payload.login || '').trim();
    var password = String(payload.password || '');
    autAssert_(login && password, 'Informe usuário/e-mail e senha.');
    autAssert_(login.length <= 254 && password.length <= 256, 'Credenciais inválidas.', 'INVALID_CREDENTIALS');
    lock.waitLock(30000);
    var user = autFindUserLogin_(login);
    autAssert_(user && user.STATUS !== 'EXCLUIDO', 'Credenciais inválidas.', 'INVALID_CREDENTIALS');
    if (user.BLOQUEADO_ATE && autDateMs_(user.BLOQUEADO_ATE) > Date.now()) {
      autAssert_(false, 'Acesso temporariamente bloqueado por tentativas inválidas.', 'LOGIN_THROTTLED');
    }
    if (autPasswordHash_(password, user.SALT) !== String(user.SENHA_HASH)) {
      var attempts = Number(user.TENTATIVAS_FALHAS || 0) + 1;
      var patch = { TENTATIVAS_FALHAS: attempts };
      if (attempts >= 5) patch.BLOQUEADO_ATE = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      autUpdateRow_('USUARIOS', user._row, patch);
      autAudit_(user, 'LOGIN_FALHOU', 'USUARIO', user.ID_USUARIO, { tentativas: attempts }, payload.context);
      autAssert_(false, 'Credenciais inválidas.', 'INVALID_CREDENTIALS');
    }
    autAssert_(user.STATUS === 'ATIVO', user.STATUS === 'PENDENTE' ? 'Cadastro aguardando aprovação.' : 'Usuário bloqueado.', 'USER_INACTIVE');
    autUpdateRow_('USUARIOS', user._row, { TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '', ULTIMO_ACESSO: autNow_() });
    var session = autCreateSession_(user, payload.context);
    autAudit_(user, 'LOGIN_SUCESSO', 'USUARIO', user.ID_USUARIO, {}, payload.context);
    return autResult_(session);
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiLogout(token, context) {
  try {
    var user = autRequireAuth_(token);
    var tokenHash = autHash_(token);
    var session = user._sessionRow ? autRowAt_('SESSOES', user._sessionRow) : autFind_('SESSOES', 'TOKEN_HASH', tokenHash);
    if (!session || session.TOKEN_HASH !== tokenHash) session = autFind_('SESSOES', 'TOKEN_HASH', tokenHash);
    autAssert_(session && session.TOKEN_HASH === tokenHash, 'Sessão inválida ou encerrada.', 'AUTH_REQUIRED');
    autUpdateRow_('SESSOES', session._row, { REVOGADO_EM: autNow_() });
    autRemoveSessionCacheByHash_(tokenHash);
    autAudit_(user, 'LOGOUT', 'USUARIO', user.ID_USUARIO, {}, context);
    return autResult_({ loggedOut: true });
  } catch (err) { return autPublicError_(err); }
}

function apiCadastrarUsuario(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var name = String(payload.name || '').trim();
    var email = autNormalizeEmail_(payload.email);
    var username = String(payload.username || '').trim();
    var password = String(payload.password || '');
    autAssert_(name.length >= 3, 'Informe o nome completo.');
    autAssert_(name.length <= 150 && email.length <= 254, 'Nome ou e-mail muito extenso.', 'FIELD_TOO_LARGE');
    autAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Informe um e-mail válido.');
    autAssert_(/^[A-Za-z0-9._-]{4,40}$/.test(username), 'O usuário deve ter entre 4 e 40 caracteres válidos.');
    autAssert_(password.length >= 10 && password.length <= 256 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 'A senha deve ter entre 10 e 256 caracteres, letra maiúscula, minúscula e número.');
    lock.waitLock(30000);
    autAssert_(!autFindUserLogin_(email) && !autFindUserLogin_(username), 'E-mail ou usuário já cadastrado.', 'DUPLICATE_USER');
    var salt = autRandom_(24);
    var user = {
      ID_USUARIO: autUuid_(), NOME: name, EMAIL: email, USUARIO: username,
      SENHA_HASH: autPasswordHash_(password, salt), SALT: salt, PERFIL: 'CORRETOR',
      STATUS: 'PENDENTE', PERMISSOES_JSON: '[]', EMAIL_VERIFICADO: 'NAO',
      CRIADO_EM: autNow_(), ATUALIZADO_EM: autNow_(), ULTIMO_ACESSO: '',
      TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '', DEVE_TROCAR_SENHA: 'NAO'
    };
    autAppend_('USUARIOS', user);
    autAudit_(user, 'USUARIO_CADASTRADO', 'USUARIO', user.ID_USUARIO, { perfil: user.PERFIL, status: user.STATUS }, payload.context);
    return autResult_({ message: 'Cadastro enviado. Aguarde a aprovação do administrador.' });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiSolicitarTokenEmail(email, purpose, context) {
  try {
    var normalized = autNormalizeEmail_(email);
    var generic = { message: 'Se o e-mail estiver cadastrado e ativo, um código será enviado.' };
    if (normalized.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return autResult_(generic);
    var finalPurpose = purpose === 'RESET' ? 'RESET' : 'LOGIN';
    var cache = CacheService.getScriptCache();
    var rateKey = 'AUT_EMAIL_RATE_' + autHash_(normalized + '|' + finalPurpose);
    var prepared = autWithScriptLock_(function() {
      if (cache.get(rateKey)) {
        return { response: { message: 'Um código já foi solicitado. Aguarde alguns segundos e verifique também a caixa de spam.' } };
      }
      if (MailApp.getRemainingDailyQuota() < 1) {
        return { response: { message: 'O limite diário de e-mails foi atingido. Use sua senha ou tente novamente mais tarde.' } };
      }
      cache.put(rateKey, '1', 45);
      var user = autFindUserLogin_(normalized);
      if (!user || user.STATUS !== 'ATIVO') return { response: generic };
      var token = autOtpCode_();
      var expires = new Date(Date.now() + AUTENTIKO.EMAIL_TOKEN_MINUTES * 60 * 1000);
      var tokenRow = autAppend_('TOKENS_EMAIL', {
        ID_TOKEN: autUuid_(), ID_USUARIO: user.ID_USUARIO, FINALIDADE: finalPurpose,
        TOKEN_HASH: autHash_(token), EXPIRA_EM: expires.toISOString(), USADO_EM: '', CRIADO_EM: autNow_()
      });
      var tokenCacheKey = 'AUT_EMAIL_TOKEN_' + autHash_(user.ID_USUARIO + '|' + finalPurpose + '|' + token);
      cache.put(tokenCacheKey, JSON.stringify({ row: tokenRow, userId: user.ID_USUARIO, purpose: finalPurpose }), AUTENTIKO.EMAIL_TOKEN_MINUTES * 60);
      return {
        user: user,
        token: token,
        tokenRow: tokenRow,
        tokenCacheKey: tokenCacheKey,
        rateKey: rateKey
      };
    });
    if (prepared.response) return autResult_(prepared.response);
    var emailConfig = autConfigMap_();
    try {
      MailApp.sendEmail({
        to: prepared.user.EMAIL,
        name: String(emailConfig.EMPRESA_NOME || 'PALMER IMÓVEIS').slice(0, 100),
        replyTo: String(emailConfig.EMPRESA_EMAIL_COMERCIAL || emailConfig.EMPRESA_EMAIL || ''),
        subject: 'Palmer Imóveis — código AUTENTIKO',
        htmlBody: '<p>Olá, ' + autHtmlEscapeServer_(prepared.user.NOME) + '.</p><p>Seu código de ' + (finalPurpose === 'RESET' ? 'recuperação' : 'acesso') + ' é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">' + prepared.token + '</p><p>Ele expira em ' + AUTENTIKO.EMAIL_TOKEN_MINUTES + ' minutos. Se você não solicitou, ignore esta mensagem.</p>'
      });
    } catch (mailError) {
      autWithScriptLock_(function() {
        try { autUpdateRow_('TOKENS_EMAIL', prepared.tokenRow, { USADO_EM: autNow_() }); }
        catch (cleanupError) { console.error('Falha ao invalidar token após erro de e-mail: ' + cleanupError.message); }
        cache.remove(prepared.tokenCacheKey);
        cache.remove(prepared.rateKey);
      });
      throw mailError;
    }
    autAudit_(prepared.user, 'TOKEN_EMAIL_SOLICITADO', 'USUARIO', prepared.user.ID_USUARIO, { finalidade: finalPurpose }, context);
    return autResult_({ message: 'Código enviado. Ele pode levar alguns segundos para chegar; verifique também a caixa de spam.', expiresInMinutes: AUTENTIKO.EMAIL_TOKEN_MINUTES });
  } catch (err) { return autPublicError_(err); }
}

function autConsumeEmailToken_(email, token, purpose) {
  autAssert_(/^\d{6}$/.test(String(token || '')), 'Código inválido ou expirado.', 'INVALID_TOKEN');
  var normalizedEmail = autNormalizeEmail_(email);
  autAssert_(normalizedEmail.length <= 254, 'Código inválido ou expirado.', 'INVALID_TOKEN');
  var user = autFindUserLogin_(normalizedEmail);
  autAssert_(user, 'Código inválido ou expirado.', 'INVALID_TOKEN');
  var cache = CacheService.getScriptCache();
  var tokenCacheKey = 'AUT_EMAIL_TOKEN_' + autHash_(user.ID_USUARIO + '|' + purpose + '|' + token);
  var cached = autJsonParse_(cache.get(tokenCacheKey), null);
  var cachedRow = cached && cached.row ? autRowAt_('TOKENS_EMAIL', Number(cached.row)) : null;
  var matches = cachedRow ? [cachedRow] : autRows_('TOKENS_EMAIL').filter(function(row) {
    return row.ID_USUARIO === user.ID_USUARIO && row.FINALIDADE === purpose && !row.USADO_EM &&
      row.TOKEN_HASH === autHash_(token) && autDateMs_(row.EXPIRA_EM) > Date.now();
  }).sort(function(a, b) { return autDateMs_(b.CRIADO_EM) - autDateMs_(a.CRIADO_EM); });
  var match = matches[0];
  autAssert_(match && match.ID_USUARIO === user.ID_USUARIO && match.FINALIDADE === purpose && !match.USADO_EM && match.TOKEN_HASH === autHash_(token) && autDateMs_(match.EXPIRA_EM) > Date.now(), 'Código inválido ou expirado.', 'INVALID_TOKEN');
  autUpdateRow_('TOKENS_EMAIL', match._row, { USADO_EM: autNow_() });
  cache.remove(tokenCacheKey);
  return user;
}

function apiEntrarComToken(email, token, context) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var user = autConsumeEmailToken_(email, String(token || ''), 'LOGIN');
    autAssert_(user.STATUS === 'ATIVO', 'Usuário bloqueado ou inativo.', 'USER_INACTIVE');
    autUpdateRow_('USUARIOS', user._row, { EMAIL_VERIFICADO: 'SIM', ULTIMO_ACESSO: autNow_() });
    var session = autCreateSession_(user, context);
    autAudit_(user, 'LOGIN_TOKEN_EMAIL', 'USUARIO', user.ID_USUARIO, {}, context);
    return autResult_(session);
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function apiRedefinirSenha(email, token, newPassword, context) {
  var lock = LockService.getScriptLock();
  try {
    var password = String(newPassword || '');
    autAssert_(password.length >= 10 && password.length <= 256 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 'A senha deve ter entre 10 e 256 caracteres, letra maiúscula, minúscula e número.');
    lock.waitLock(30000);
    var user = autConsumeEmailToken_(email, String(token || ''), 'RESET');
    var salt = autRandom_(24);
    autUpdateRow_('USUARIOS', user._row, {
      SENHA_HASH: autPasswordHash_(password, salt), SALT: salt, ATUALIZADO_EM: autNow_(),
      TENTATIVAS_FALHAS: 0, BLOQUEADO_ATE: '', EMAIL_VERIFICADO: 'SIM', DEVE_TROCAR_SENHA: 'NAO'
    });
    autRows_('SESSOES').filter(function(row) { return row.ID_USUARIO === user.ID_USUARIO && !row.REVOGADO_EM; }).forEach(function(row) {
      autUpdateRow_('SESSOES', row._row, { REVOGADO_EM: autNow_() });
    });
    autInvalidateUserSessionCaches_(user.ID_USUARIO);
    autAudit_(user, 'SENHA_REDEFINIDA', 'USUARIO', user.ID_USUARIO, {}, context);
    return autResult_({ message: 'Senha atualizada. Entre novamente.' });
  } catch (err) { return autPublicError_(err); }
  finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function autHtmlEscapeServer_(value) {
  return String(value || '').replace(/[&<>"']/g, function(char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function cleanupExpiredAuthData() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var now = Date.now();
    var tokenCutoff = now - 24 * 60 * 60 * 1000;
    var sessionCutoff = now - 30 * 24 * 60 * 60 * 1000;
    var tokenRows = autRows_('TOKENS_EMAIL').filter(function(row) {
      return autDateMs_(row.CRIADO_EM) < tokenCutoff && (row.USADO_EM || autDateMs_(row.EXPIRA_EM) < now);
    }).map(function(row) { return row._row; });
    var sessionRows = autRows_('SESSOES').filter(function(row) {
      var closedAt = row.REVOGADO_EM ? autDateMs_(row.REVOGADO_EM) : autDateMs_(row.EXPIRA_EM);
      return closedAt > 0 && closedAt < sessionCutoff;
    }).map(function(row) { return row._row; });
    autDeleteRowNumbers_('TOKENS_EMAIL', tokenRows);
    autDeleteRowNumbers_('SESSOES', sessionRows);
    return { ok: true, tokensRemoved: tokenRows.length, sessionsRemoved: sessionRows.length };
  } finally { lock.releaseLock(); }
}
