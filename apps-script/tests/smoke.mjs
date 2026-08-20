import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(testDir);

class BlobMock {
  constructor(data, contentType = 'application/octet-stream', name = '') {
    if (Buffer.isBuffer(data)) this.buffer = Buffer.from(data);
    else if (Array.isArray(data)) this.buffer = Buffer.from(data.map((v) => (Number(v) + 256) % 256));
    else this.buffer = Buffer.from(String(data ?? ''), 'utf8');
    this.contentType = contentType;
    this.name = name;
  }
  getBytes() { return [...this.buffer].map((v) => (v > 127 ? v - 256 : v)); }
  getContentType() { return this.contentType; }
  getName() { return this.name; }
  setName(value) { this.name = String(value); return this; }
  setContentType(value) { this.contentType = String(value); return this; }
}

class CacheMock {
  constructor() { this.entries = new Map(); }
  get(key) { return this.entries.get(String(key)) ?? null; }
  put(key, value) {
    const text = String(value);
    if (Buffer.byteLength(text, 'utf8') > 100_000) throw new Error('Argumento grande demais: value');
    this.entries.set(String(key), text);
  }
  remove(key) { this.entries.delete(String(key)); }
  removeAll(keys) { for (const key of keys) this.remove(key); }
}

class LockMock {
  constructor() { this.held = false; }
  hasLock() { return this.held; }
  waitLock() { this.held = true; }
  releaseLock() { this.held = false; }
}

function storedCell(value) {
  if (typeof value === 'string' && value.startsWith("'")) return value.slice(1);
  return value;
}

class TextFinderMock {
  constructor(range, target) {
    this.range = range;
    this.target = String(target);
    this.entire = false;
    this.caseSensitive = false;
  }
  matchEntireCell(value) { this.entire = value; return this; }
  matchCase(value) { this.caseSensitive = value; return this; }
  useRegularExpression() { return this; }
  findNext() {
    const target = this.caseSensitive ? this.target : this.target.toLowerCase();
    for (let r = 0; r < this.range.numRows; r++) {
      for (let c = 0; c < this.range.numCols; c++) {
        const raw = this.range.sheet.cell(this.range.row + r, this.range.col + c);
        const text = String(raw ?? '');
        const candidate = this.caseSensitive ? text : text.toLowerCase();
        const matches = this.entire ? candidate === target : candidate.includes(target);
        if (matches) return { getRow: () => this.range.row + r, getColumn: () => this.range.col + c };
      }
    }
    return null;
  }
  findAll() {
    const found = [];
    const target = this.caseSensitive ? this.target : this.target.toLowerCase();
    for (let r = 0; r < this.range.numRows; r++) {
      for (let c = 0; c < this.range.numCols; c++) {
        const raw = this.range.sheet.cell(this.range.row + r, this.range.col + c);
        const text = String(raw ?? '');
        const candidate = this.caseSensitive ? text : text.toLowerCase();
        const matches = this.entire ? candidate === target : candidate.includes(target);
        if (matches) found.push(new RangeMock(this.range.sheet, this.range.row + r, this.range.col + c));
      }
    }
    return found;
  }
}

function columnLetters(column) {
  let value = Number(column);
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function columnNumber(letters) {
  return String(letters).toUpperCase().split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

class RangeMock {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getA1Notation() {
    const start = `${columnLetters(this.col)}${this.row}`;
    if (this.numRows === 1 && this.numCols === 1) return start;
    return `${start}:${columnLetters(this.col + this.numCols - 1)}${this.row + this.numRows - 1}`;
  }
  getValues() {
    return Array.from({ length: this.numRows }, (_, r) =>
      Array.from({ length: this.numCols }, (_, c) => this.sheet.cell(this.row + r, this.col + c)));
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => {
      if (value == null) return '';
      if (value instanceof Date) return value.toISOString();
      return String(value);
    }));
  }
  getValue() { return this.sheet.cell(this.row, this.col); }
  setValue(value) { return this.setValues([[value]]); }
  setValues(values) {
    assert.equal(values.length, this.numRows, 'Quantidade de linhas incompatível com o intervalo');
    for (let r = 0; r < this.numRows; r++) {
      assert.equal(values[r].length, this.numCols, 'Quantidade de colunas incompatível com o intervalo');
      for (let c = 0; c < this.numCols; c++) this.sheet.setCell(this.row + r, this.col + c, storedCell(values[r][c]));
    }
    return this;
  }
  createTextFinder(target) { return new TextFinderMock(this, target); }
  createFilter() { this.sheet.filter = {}; return this.sheet.filter; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  sort() { return this; }
  setWrap() { return this; }
}

let nextSheetId = 1;
class SheetMock {
  constructor(book, name) {
    this.book = book;
    this.name = name;
    this.id = nextSheetId++;
    this.rows = [];
    this.filter = null;
    this.protections = [];
  }
  cell(row, col) { return this.rows[row - 1]?.[col - 1] ?? ''; }
  setCell(row, col, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < col) this.rows[row - 1].push('');
    this.rows[row - 1][col - 1] = value;
  }
  getName() { return this.name; }
  setName(name) { this.book.renameSheet(this, String(name)); return this; }
  getSheetId() { return this.id; }
  getLastRow() {
    for (let r = this.rows.length - 1; r >= 0; r--) {
      if (this.rows[r].some((value) => value !== '' && value != null)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    for (const row of this.rows) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== '' && row[c] != null) { max = Math.max(max, c + 1); break; }
      }
    }
    return max;
  }
  getMaxRows() { return Math.max(this.rows.length, 1000); }
  getRange(row, col, numRows = 1, numCols = 1) { return new RangeMock(this, row, col, numRows, numCols); }
  getRangeList(a1Notations) {
    const ranges = a1Notations.map((notation) => {
      const match = String(notation).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
      assert.ok(match, `Intervalo A1 inválido no mock: ${notation}`);
      const startCol = columnNumber(match[1]);
      const startRow = Number(match[2]);
      const endCol = columnNumber(match[3]);
      const endRow = Number(match[4]);
      return new RangeMock(this, startRow, startCol, endRow - startRow + 1, endCol - startCol + 1);
    });
    return { getRanges: () => ranges };
  }
  getFilter() { return this.filter; }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
  getColumnWidth() { return 100; }
  setColumnWidth() { return this; }
  hideSheet() { return this; }
  getProtections() { return this.protections; }
  protect() {
    const protection = { setDescription() { return this; }, setWarningOnly() { return this; } };
    this.protections.push(protection);
    return protection;
  }
  deleteRows(start, count) { this.rows.splice(start - 1, count); }
}

class SpreadsheetMock {
  constructor() { this.sheets = new Map(); this.insertSheet('Página1'); }
  getSheetByName(name) { return this.sheets.get(String(name)) ?? null; }
  insertSheet(name) {
    const sheet = new SheetMock(this, String(name));
    this.sheets.set(sheet.name, sheet);
    return sheet;
  }
  renameSheet(sheet, nextName) { this.sheets.delete(sheet.name); sheet.name = nextName; this.sheets.set(nextName, sheet); }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/mock/edit'; }
  getUi() { return uiMock; }
}

let nextFileId = 1;
class FileMock {
  constructor(blob) { this.id = `file-${nextFileId++}`; this.blob = blob; this.trashed = false; }
  getId() { return this.id; }
  getBlob() { return this.blob; }
  getMimeType() { return this.blob.getContentType(); }
  getThumbnail() { return new BlobMock('miniatura-segura', 'image/jpeg', 'thumbnail.jpg'); }
  isTrashed() { return this.trashed; }
  setTrashed(value) { this.trashed = Boolean(value); return this; }
}

let nextFolderId = 1;
class FolderMock {
  constructor(name, options = {}) {
    this.id = `folder-${nextFolderId++}`;
    this.name = name;
    this.folders = [];
    this.files = [];
    this.trashed = false;
    this.sharingAccess = options.sharingAccess ?? 'PRIVATE';
    this.sharingPermission = options.sharingPermission ?? 'NONE';
    this.ownerEmail = options.ownerEmail ?? 'palmer.imoveis.comercial@gmail.com';
    this.shareableByEditors = true;
  }
  getId() { return this.id; }
  getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
  getSharingAccess() { return this.sharingAccess; }
  getSharingPermission() { return this.sharingPermission; }
  getOwner() { return { getEmail: () => this.ownerEmail }; }
  setShareableByEditors(value) { this.shareableByEditors = Boolean(value); return this; }
  setTrashed(value) { this.trashed = Boolean(value); return this; }
  createFolder(name) { const folder = new FolderMock(String(name)); this.folders.push(folder); folders.set(folder.id, folder); return folder; }
  getFoldersByName(name) {
    const found = this.folders.filter((folder) => folder.name === String(name));
    let index = 0;
    return { hasNext: () => index < found.length, next: () => found[index++] };
  }
  getFilesByName(name) {
    const found = this.files.filter((file) => file.blob.getName() === String(name));
    let index = 0;
    return { hasNext: () => index < found.length, next: () => found[index++] };
  }
  createFile(blob) { const file = new FileMock(blob); this.files.push(file); files.set(file.id, file); return file; }
}

const spreadsheet = new SpreadsheetMock();
const cache = new CacheMock();
const lock = new LockMock();
const properties = new Map();
const triggers = [];
const folders = new Map();
const files = new Map();
const sentEmails = [];
const drivePermissions = new Map();
const failedDrivePermissionDeletes = new Set();
const drivePermissionListCalls = [];
let legacyPublicRootId = '';

const uiMock = {
  ButtonSet: { OK: 'OK' },
  createMenu() { return { addItem() { return this; }, addToUi() { return this; } }; },
  alert() {}
};

function signedBytes(buffer) { return [...buffer].map((value) => (value > 127 ? value - 256 : value)); }
function bufferFromBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return Buffer.from(value.map((item) => (Number(item) + 256) % 256));
  return Buffer.from(String(value ?? ''), 'utf8');
}

const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8' },
  getUuid: () => crypto.randomUUID(),
  computeDigest: (_algorithm, value) => signedBytes(crypto.createHash('sha256').update(bufferFromBytes(value)).digest()),
  computeHmacSha256Signature: (value, key) => signedBytes(crypto.createHmac('sha256', bufferFromBytes(key)).update(bufferFromBytes(value)).digest()),
  base64EncodeWebSafe: (value) => bufferFromBytes(value).toString('base64url'),
  base64DecodeWebSafe: (value) => signedBytes(Buffer.from(String(value), 'base64url')),
  base64Encode: (value) => bufferFromBytes(value).toString('base64'),
  base64Decode: (value) => signedBytes(Buffer.from(String(value), 'base64')),
  newBlob: (data, contentType, name) => new BlobMock(data, contentType, name),
  formatDate: (date, _timezone, format) => {
    const iso = new Date(date).toISOString();
    if (format === 'yyMMdd') return iso.slice(2, 10).replaceAll('-', '');
    if (format === 'yyyy') return iso.slice(0, 4);
    if (format === 'yyyy-MM-dd') return iso.slice(0, 10);
    if (format === 'yyyyMMddHHmmss') return iso.slice(0, 19).replace(/\D/g, '');
    return iso;
  }
};

const ScriptApp = {
  getOAuthToken: () => 'oauth-token-smoke',
  getProjectTriggers: () => triggers,
  newTrigger(handler) {
    const trigger = { getHandlerFunction: () => handler };
    const builder = {
      forSpreadsheet() { return this; }, onOpen() { return this; }, timeBased() { return this; },
      everyDays() { return this; }, atHour() { return this; }, create() { triggers.push(trigger); return trigger; }
    };
    return builder;
  }
};

const mediaHealthState = {
  status: 200,
  payload: {
    ok: true,
    data: {
      database: false,
      driveSyncWorker: {configured: false, healthy: false},
      largeUploadReady: false,
      deep: true
    }
  }
};
const context = vm.createContext({
  console,
  Buffer,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  Set,
  Utilities,
  CacheService: { getScriptCache: () => cache },
  LockService: { getScriptLock: () => lock, getUserLock: () => lock },
  SpreadsheetApp: {
    ProtectionType: { SHEET: 'SHEET' },
    openById: () => spreadsheet,
    getUi: () => uiMock,
    flush() {}
  },
  Session: {
    getEffectiveUser: () => ({ getEmail: () => 'palmer.imoveis.comercial@gmail.com' }),
    getActiveUser: () => ({ getEmail: () => 'palmer.imoveis.comercial@gmail.com' })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(String(key)) ?? null,
      setProperty: (key, value) => properties.set(String(key), String(value)),
      deleteProperty: (key) => properties.delete(String(key)),
      getProperties: () => Object.fromEntries(properties)
    })
  },
  DriveApp: {
    Access: { PRIVATE: 'PRIVATE' },
    createFolder(name) { const folder = new FolderMock(String(name)); folders.set(folder.id, folder); return folder; },
    getFolderById: (id) => { if (!folders.has(String(id))) throw new Error('Pasta não encontrada'); return folders.get(String(id)); },
    getFileById: (id) => { if (!files.has(String(id))) throw new Error('Arquivo não encontrado'); return files.get(String(id)); }
  },
  UrlFetchApp: {
    fetch(url, options = {}) {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/api/health')) {
        return {
          getResponseCode: () => mediaHealthState.status,
          getContentText: () => JSON.stringify(mediaHealthState.payload)
        };
      }
      const match = parsed.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/);
      if (!match) {
        return { getResponseCode: () => 404, getContentText: () => JSON.stringify({ error: 'not-found' }) };
      }
      const fileId = decodeURIComponent(match[1]);
      const permissionId = match[2] ? decodeURIComponent(match[2]) : '';
      const method = String(options.method || 'get').toLowerCase();
      if (method === 'get') {
        drivePermissionListCalls.push(fileId);
        const permissions = (drivePermissions.get(fileId) || []).map((permission) => ({ ...permission }));
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ permissions }) };
      }
      if (method === 'delete') {
        if (failedDrivePermissionDeletes.has(permissionId)) {
          return { getResponseCode: () => 500, getContentText: () => JSON.stringify({ error: 'forced-delete-failure' }) };
        }
        const permissions = drivePermissions.get(fileId) || [];
        const index = permissions.findIndex((permission) => permission.id === permissionId);
        if (index < 0) return { getResponseCode: () => 404, getContentText: () => '' };
        permissions.splice(index, 1);
        drivePermissions.set(fileId, permissions);
        return { getResponseCode: () => 204, getContentText: () => '' };
      }
      return { getResponseCode: () => 405, getContentText: () => '' };
    }
  },
  ScriptApp,
  MailApp: {
    getRemainingDailyQuota: () => 100,
    sendEmail: (message) => sentEmails.push(message)
  },
  HtmlService: {
    createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }),
    createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    createHtmlOutput: (html) => ({
      getAs: () => new BlobMock(`%PDF-1.4\n${html}`, 'application/pdf', 'contrato.pdf')
    })
  },
  MimeType: { PDF: 'application/pdf' }
});

const order = ['Config.gs', 'Utils.gs', 'DataService.gs', 'AuditService.gs', 'AuthService.gs', 'ProcessService.gs', 'CommercialService.gs', 'WorkflowService.gs', 'MediaService.gs', 'AdminService.gs', 'Setup.gs', 'Code.gs'];
for (const name of order) {
  const source = fs.readFileSync(path.join(projectDir, name), 'utf8');
  new vm.Script(source, { filename: name }).runInContext(context);
}

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
  console.log(`OK ${name}`);
}
function data(result) {
  assert.equal(result?.ok, true, result?.message ?? 'Resposta da API não foi bem-sucedida');
  return result.data;
}

let setup;
check('instalação completa', () => {
  setup = context.setupSystem();
  assert.equal(setup.ok, true);
  assert.equal(setup.sheets.length, 26);
  assert.equal(typeof setup.bootstrapPassword, 'string');
  assert.ok(setup.bootstrapPassword.length >= 12);
  assert.equal(context.autConfigMap_().PDF_PREVIEW_ENABLED, true);
  assert.equal(context.autConfigMap_().MAX_PDF_SIZE_MB, 6);
  assert.equal(context.autConfigMap_().MEDIA_CLOUD_ENABLED, false);
  assert.equal(context.autConfigMap_().MEDIA_MAX_UPLOAD_MB, 25);
  assert.equal(context.autConfigMap_().MEDIA_MAX_PDF_SOURCE_MB, 100);
  assert.equal(context.autConfigMap_().MEDIA_LARGE_UPLOAD_ENABLED, false);
  assert.equal(context.autConfigMap_().MEDIA_DRIVE_SYNC_WORKER_READY, false);
  assert.equal(context.autConfigMap_().ADOBE_ENABLED, false);
});

check('raiz documental privada rotaciona referências sem perder o histórico', () => {
  const installedRootId = properties.get('AUT_DOCUMENTS_FOLDER_ID');
  const installedRoot = folders.get(installedRootId);
  assert.equal(installedRoot.getSharingAccess(), 'PRIVATE');
  assert.equal(installedRoot.getOwner().getEmail(), 'palmer.imoveis.comercial@gmail.com');
  assert.equal(installedRoot.shareableByEditors, false);

  const legacyRoot = new FolderMock('Documentos legados', { sharingAccess: 'ANYONE_WITH_LINK' });
  legacyPublicRootId = legacyRoot.id;
  const legacyProcessFolder = new FolderMock('PROTOCOLO-LEGADO', { sharingAccess: 'ANYONE_WITH_LINK' });
  folders.set(legacyRoot.id, legacyRoot);
  folders.set(legacyProcessFolder.id, legacyProcessFolder);
  const processFolderKey = 'AUT_PROCESS_FOLDER_TESTE_SEGURANCA';
  properties.set('AUT_DOCUMENTS_FOLDER_ID', legacyRoot.id);
  properties.set('AUT_PROCESS_FOLDERS_ROOT_ID', legacyRoot.id);
  properties.set(processFolderKey, legacyProcessFolder.id);

  const repaired = context.repararArmazenamentoDriveSetup();
  assert.equal(repaired.ok, true);
  assert.equal(repaired.private, true);
  assert.equal(repaired.ownedByDeployingAccount, true);
  assert.notEqual(repaired.folderId, legacyRoot.id);
  assert.equal(properties.has(processFolderKey), false, 'a subpasta antiga não pode receber uploads novos');
  assert.ok(context.autFolderHistoryIds_('AUT_DOCUMENTS_FOLDER_ID').includes(legacyRoot.id));
  assert.ok(context.autFolderHistoryIds_(processFolderKey).includes(legacyProcessFolder.id));

  const foreignRoot = new FolderMock('Privada de outra conta', {
    sharingAccess: 'PRIVATE', ownerEmail: 'outra-conta@example.com'
  });
  folders.set(foreignRoot.id, foreignRoot);
  properties.set('AUT_DOCUMENTS_FOLDER_ID', foreignRoot.id);
  properties.set('AUT_PROCESS_FOLDERS_ROOT_ID', foreignRoot.id);
  const repairedOwner = context.repararArmazenamentoDriveSetup();
  assert.equal(repairedOwner.ok, true);
  assert.notEqual(repairedOwner.folderId, foreignRoot.id);
  assert.equal(repairedOwner.ownerEmail, 'palmer.imoveis.comercial@gmail.com');
  assert.ok(context.autFolderHistoryIds_('AUT_DOCUMENTS_FOLDER_ID').includes(foreignRoot.id));
});

check('683 campos organizados e 14 tipos de formulário', () => {
  assert.equal(context.autRows_('FORMULARIOS').length, 683);
  const types = new Set(context.autRows_('FORMULARIOS').map((row) => row.TIPO_PROCESSO));
  assert.equal(types.size, 14);
});

check('cache de formulários segmentado abaixo de 100 KB', () => {
  const all = context.autFormSchemas_();
  assert.equal(Object.keys(all).length, 14);
  assert.ok(Buffer.byteLength(JSON.stringify(all), 'utf8') > 100_000, 'O cenário original precisa exceder 100 KB');
  assert.equal(cache.entries.has('AUT_FORM_SCHEMAS'), false);
  const formEntries = [...cache.entries].filter(([key]) => key.startsWith('AUT_FORM_SCHEMA_'));
  assert.equal(formEntries.length, 14);
  assert.ok(Math.max(...formEntries.map(([, value]) => Buffer.byteLength(value, 'utf8'))) < 15_000);
});

check('diagnóstico seguro executável sem sessão', () => {
  const diagnostic = context.diagnosticarSistema();
  assert.equal(diagnostic.ok, true);
  assert.equal(diagnostic.formFields, 683);
  assert.equal(diagnostic.codeVersion, '2.5.2');
  assert.ok(diagnostic.maxFormCacheBytes < 15_000);
});

check('proteção de texto literal e reparo de configurações', () => {
  assert.equal(context.autSafeCell_('1.1.1'), "'1.1.1");
  assert.equal(context.autSafeCell_('06120034269'), "'06120034269");
  assert.equal(context.autSafeCell_('=IMPORTXML("x")'), "'=IMPORTXML(\"x\")");
  assert.equal(context.autSafeCell_(12594), 12594);
  const headers = context.autHeaders_(spreadsheet.getSheetByName('CONFIGURACOES'));
  const valueCol = headers.indexOf('VALOR') + 1;
  for (const [key, corrupt] of [['VERSAO_SISTEMA', 36526], ['EMPRESA_CRECI', 12594], ['CERTIFICADO_CPF_TITULAR', 6120034269]]) {
    const row = context.autFind_('CONFIGURACOES', 'CHAVE', key);
    spreadsheet.getSheetByName('CONFIGURACOES').getRange(row._row, valueCol).setValue(corrupt);
  }
  const repaired = context.setupSystem();
  assert.equal(repaired.bootstrapPassword, '');
  assert.equal(context.autFind_('CONFIGURACOES', 'CHAVE', 'VERSAO_SISTEMA').VALOR, context.AUTENTIKO.APP_VERSION);
  assert.equal(context.autFind_('CONFIGURACOES', 'CHAVE', 'EMPRESA_CRECI').VALOR, '12.594');
  assert.equal(context.autFind_('CONFIGURACOES', 'CHAVE', 'CERTIFICADO_CPF_TITULAR').VALOR, '06120034269');
  assert.equal(context.autRows_('FORMULARIOS').length, 683, 'A reinstalação não pode duplicar campos');
});

let token;
check('login com senha temporária gerada', () => {
  const login = data(context.apiLogin({ login: setup.developerEmail, password: setup.bootstrapPassword, context: { device: { test: true } } }));
  token = login.token;
  assert.ok(token.length > 20);
  assert.equal(login.user.role, 'DESENVOLVEDOR');
});

check('bootstrap leve sem schema monolítico', () => {
  const bootstrap = data(context.apiBootstrap(token));
  assert.equal(Object.keys(bootstrap.formSchemas).length, 0);
  assert.equal(bootstrap.processTypes.length, 14);
  assert.ok(Buffer.byteLength(JSON.stringify(bootstrap), 'utf8') < 30_000);
});

let financedFields;
check('carregamento sob demanda do formulário financiado', () => {
  const form = data(context.apiObterFormularioProcesso(token, 'COMPRA_IMOVEL_FINANCIADO'));
  financedFields = form.fields;
  assert.equal(financedFields.length, 54);
  const select = financedFields.find((field) => field.name === 'modalidade_financiamento');
  assert.ok(Array.isArray(select.options));
  assert.ok(select.options.length >= 1);
  assert.ok(financedFields.some((field) => field.name === 'cliente_renda_origem'));
  assert.ok(financedFields.some((field) => field.section === 'Cliente — Dados de contato'));
});

function sampleValue(field) {
  if (field.name.includes('cpf')) return '52998224725';
  if (field.input === 'email') return 'cliente@example.com';
  if (field.input === 'select') return field.options[0];
  if (field.input === 'date') return '2026-01-15';
  if (field.input === 'number' || field.input === 'currency') return '100';
  if (field.input === 'tel') return '(91) 99999-9999';
  return `Teste ${field.label}`;
}
const processData = {};
for (const field of financedFields) processData[field.name] = sampleValue(field);

check('validações de tamanho, e-mail e opção', () => {
  const tooLarge = context.apiCriarProcesso(token, { type: 'COMPRA_IMOVEL_FINANCIADO', data: { ...processData, imovel_endereco: 'x'.repeat(46_000) } }, {});
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.code, 'PAYLOAD_TOO_LARGE');
  const badEmail = context.apiCriarProcesso(token, { type: 'COMPRA_IMOVEL_FINANCIADO', data: { ...processData, cliente_email: 'invalido' } }, {});
  assert.equal(badEmail.code, 'INVALID_EMAIL');
  const badCpf = context.apiCriarProcesso(token, { type: 'COMPRA_IMOVEL_FINANCIADO', data: { ...processData, cliente_cpf: '111.111.111-11' } }, {});
  assert.equal(badCpf.code, 'INVALID_CPF');
  const badSelect = context.apiCriarProcesso(token, { type: 'COMPRA_IMOVEL_FINANCIADO', data: { ...processData, modalidade_financiamento: 'OPCAO_INVENTADA' } }, {});
  assert.equal(badSelect.code, 'INVALID_OPTION');
});

let processId;
check('criação, listagem e detalhe do processo', () => {
  const created = data(context.apiCriarProcesso(token, { type: 'COMPRA_IMOVEL_FINANCIADO', data: processData }, { device: { browser: 'test' } }));
  processId = created.process.id;
  assert.ok(created.process.protocol);
  assert.equal(data(context.apiListarProcessos(token, {})).total, 1);
  const detail = data(context.apiDetalharProcesso(token, processId));
  assert.equal(detail.process.id, processId);
  assert.equal(detail.requiredDocuments.filter((doc) => doc.required).length, 5);
  assert.ok(detail.requiredDocuments.some((doc) => doc.name === 'RG/CNH' && doc.required && doc.multiple));
});

check('Carta de Clientes deduplica CPF, permite busca e edição autorizada', () => {
  const clients = data(context.apiPesquisarBaseClientes(token, { search: '52998224725' }));
  assert.equal(clients.items.length, 1, 'O mesmo CPF usado em papéis distintos não pode duplicar cadastro');
  assert.equal(clients.canEdit, true);
  const match = data(context.apiBuscarCadastroPorDocumento(token, '529.982.247-25', { requestId: 'lookup-master-cpf' }));
  assert.equal(match.found, true);
  assert.equal(match.item.document, '52998224725');
  const full = data(context.apiObterCadastroCliente(token, clients.items[0].id));
  const saved = data(context.apiSalvarCadastroCliente(token, {
    id: full.item.id, expectedVersion: full.item.version, personType: 'PF', document: full.item.document,
    name: 'Cliente Mestre Revisado', rgIe: full.item.rgIe, email: 'mestre@palmer.test',
    phone: '(91) 98888-7777', income: 9000, roles: full.item.roles,
    address: { street: 'Rua da Base', number: '100', district: 'Centro', city: 'Belém', state: 'PA', zip: '66000000' }
  }, { requestId: 'edit-master-client-one' }));
  assert.equal(saved.saved, true);
  const refreshed = data(context.apiObterCadastroCliente(token, full.item.id)).item;
  assert.equal(refreshed.name, 'Cliente Mestre Revisado');
  assert.equal(refreshed.income, 9000);
  assert.equal(refreshed.address.city, 'Belém');
  assert.equal(context.autRowsBy_('BASE_CLIENTES', 'CPF_CNPJ', '52998224725').length, 1);
});

check('Carta de Clientes serializa data nativa do Sheets sem criar conflito falso', () => {
  const client = context.autMasterRowsByDocument_('52998224725', 'PF')[0];
  const nativeDate = new Date('2026-01-15T12:00:00Z');
  context.autUpdateRow_('BASE_CLIENTES', client._row, { DATA_NASCIMENTO_ABERTURA: nativeDate });
  assert.equal(context.autMasterDateOnly_(nativeDate), '2026-01-15');
  assert.equal(context.autMasterDateOnly_('2026-01-15'), '2026-01-15', 'string ISO válida deve ser preservada');
  assert.equal(context.autMasterDateOnly_('15/01/2026'), '2026-01-15');
  assert.equal(
    context.autMasterComparable_('DATA_NASCIMENTO_ABERTURA', nativeDate),
    context.autMasterComparable_('DATA_NASCIMENTO_ABERTURA', '2026-01-15')
  );
  const before = context.autMasterOpenConflicts_(client.ID_CADASTRO).length;
  assert.equal(context.autMasterConflict_(client, 'DATA_NASCIMENTO_ABERTURA', nativeDate, '2026-01-15', null, 'TESTE_DATA'), false);
  assert.equal(context.autMasterOpenConflicts_(client.ID_CADASTRO).length, before);
  const lookup = data(context.apiBuscarCadastroPorDocumento(token, '529.982.247-25', { requestId: 'lookup-native-date' }));
  assert.equal(lookup.item.birthOpening, '2026-01-15');
  assert.equal(Object.prototype.toString.call(lookup.item.birthOpening), '[object String]');
});

check('Carta de Clientes repara zero inicial, consolida duplicata e preserva divergência real', () => {
  const source = context.autRows_('BASE_CLIENTES')[0];
  const now = context.autNow_();
  const firstId = 'CLI-ZERO-CANONICO';
  const duplicateId = 'CLI-ZERO-NUMERICO';
  context.autAppend_('BASE_CLIENTES', {
    ...source, ID_CADASTRO: firstId, TIPO_PESSOA: 'PF', CPF_CNPJ: '06120034269',
    NOME_RAZAO_SOCIAL: 'Pessoa Zero', TELEFONE: '(91) 99999-0000', STATUS: 'ATIVO',
    PROCESSOS_JSON: '[]', FONTES_JSON: '[]', PAPEIS_JSON: '["LOCATARIO"]',
    CONFLITOS_ABERTOS: 0, QUALIDADE: 90, CRIADO_EM: now, ATUALIZADO_EM: now
  });
  context.autAppend_('BASE_CLIENTES', {
    ...source, ID_CADASTRO: duplicateId, TIPO_PESSOA: 'PF', CPF_CNPJ: 6120034269,
    NOME_RAZAO_SOCIAL: 'Pessoa Zero Divergente', TELEFONE: '', STATUS: 'ATIVO',
    PROCESSOS_JSON: '[]', FONTES_JSON: '[]', PAPEIS_JSON: '["FIADOR"]',
    CONFLITOS_ABERTOS: 0, QUALIDADE: 30, CRIADO_EM: now, ATUALIZADO_EM: now
  });
  assert.equal(context.autMasterCanonicalDocument_('PF', 6120034269), '06120034269');
  const actor = { ID_USUARIO: 'TESTE', NOME: 'Teste', PERFIL: 'DESENVOLVEDOR', PERMISSOES_JSON: '["*"]' };
  const summary = context.autMasterConsolidateClients_(actor, { requestId: 'normalize-zero-one' });
  assert.equal(summary.merged, 1);
  assert.equal(context.autMasterRowsByDocument_('061.200.342-69', 'PF').length, 1);
  assert.equal(context.autFind_('BASE_CLIENTES', 'ID_CADASTRO', duplicateId).STATUS, 'MESCLADO');
  assert.ok(context.autJsonParse_(context.autFind_('BASE_CLIENTES', 'ID_CADASTRO', firstId).PAPEIS_JSON, []).includes('FIADOR'));
  assert.ok(context.autMasterOpenConflicts_(firstId).some((row) => row.CAMPO === 'NOME_RAZAO_SOCIAL'));
  const repeated = context.autMasterConsolidateClients_(actor, { requestId: 'normalize-zero-two' });
  assert.equal(repeated.merged, 0, 'A consolidação precisa ser idempotente');
  const found = data(context.apiBuscarCadastroPorDocumento(token, '061.200.342-69', { requestId: 'lookup-zero-leading' }));
  assert.equal(found.found, true);
  assert.equal(found.item.document, '06120034269');
  const search = data(context.apiPesquisarBaseClientes(token, { search: '061.200.342-69' }));
  assert.equal(search.items.filter((item) => item.id === firstId).length, 1);
});

check('base de imóveis é reutilizável, versionada e sem duplicação', () => {
  const properties = data(context.apiPesquisarBaseImoveis(token, { search: processData.imovel_codigo }));
  assert.equal(properties.items.length, 1);
  assert.equal(properties.canEdit, true);
  const full = data(context.apiObterCadastroImovel(token, properties.items[0].id));
  const saved = data(context.apiSalvarCadastroImovel(token, {
    id: full.item.id, expectedVersion: full.item.version, code: full.item.code,
    registration: 'MAT-TESTE-001', iptu: 'IPTU-001', type: 'Apartamento',
    address: 'Rua da Base, 100, Belém - PA', addressData: { street: 'Rua da Base', number: '100', city: 'Belém', state: 'PA' },
    captureMode: 'Imóvel com exclusividade', captureStatus: 'CAPTADO', authorizationRyckyPalmer: 'Sim'
  }, { requestId: 'edit-master-property-one' }));
  assert.equal(saved.saved, true);
  const lookup = data(context.apiBuscarImovelPorIdentificador(token, 'MAT-TESTE-001', { requestId: 'lookup-property-one' }));
  assert.equal(lookup.found, true);
  assert.equal(lookup.item.address, 'Rua da Base, 100, Belém - PA');
  assert.equal(context.autRows_('BASE_IMOVEIS').length, 1);
});

check('migração da base mestre é retomável e idempotente', () => {
  const first = data(context.apiMigrarBaseCadastros(token, { requestId: 'master-migration-one' }));
  assert.ok(first.processes >= 1);
  const counts = { clients: context.autRows_('BASE_CLIENTES').length, properties: context.autRows_('BASE_IMOVEIS').length };
  const versions = context.autRows_('BASE_CLIENTES').map((row) => [row.ID_CADASTRO, Number(row.VERSAO_REGISTRO)]);
  data(context.apiMigrarBaseCadastros(token, { requestId: 'master-migration-two' }));
  assert.equal(context.autRows_('BASE_CLIENTES').length, counts.clients);
  assert.equal(context.autRows_('BASE_IMOVEIS').length, counts.properties);
  assert.deepEqual(context.autRows_('BASE_CLIENTES').map((row) => [row.ID_CADASTRO, Number(row.VERSAO_REGISTRO)]), versions);
});

check('captação e homologação cria imóvel com documentação obrigatória própria', () => {
  const form = data(context.apiObterFormularioProcesso(token, 'CAPTACAO_HOMOLOGACAO_IMOVEL'));
  assert.ok(form.fields.some((field) => field.name === 'captacao_modalidade' && field.required));
  assert.ok(form.fields.some((field) => field.name === 'autorizacao_rycky_palmer' && field.required));
  const captureData = {};
  for (const field of form.fields) captureData[field.name] = sampleValue(field);
  captureData.imovel_codigo = 'CAP-IMOVEL-001';
  captureData.imovel_matricula = 'CAP-MAT-001';
  captureData.imovel_endereco = 'Avenida da Captação, 10, Belém - PA';
  const created = data(context.apiCriarProcesso(token, { type: 'CAPTACAO_HOMOLOGACAO_IMOVEL', data: captureData }, { requestId: 'capture-process-one' }));
  const detail = data(context.apiDetalharProcesso(token, created.process.id));
  const required = detail.requiredDocuments.filter((document) => document.required).map((document) => document.id);
  assert.ok(required.includes('DOC_RG_CNH_PROPRIETARIO'));
  assert.ok(required.includes('DOC_CONSULTA_RECEITA_CPF'));
  assert.ok(required.includes('DOC_TERMO_PRESTACAO_LAUDO_CAPTACAO'));
  assert.ok(required.includes('DOC_AUTORIZACAO_RYCKY_PALMER_CAPTACAO'));
  const property = data(context.apiBuscarImovelPorIdentificador(token, 'CAP-IMOVEL-001', { requestId: 'capture-property-lookup' }));
  assert.equal(property.found, true);
  assert.equal(property.item.captureStatus, 'CAPTADO');
});

check('modal leve e quatro abas carregadas de forma independente', () => {
  const shell = data(context.apiAbrirProcesso(token, processId));
  assert.equal(shell.process.id, processId);
  assert.ok(shell.workflow);
  assert.ok(shell.capabilities);
  assert.equal('documents' in shell, false);
  assert.equal('audit' in shell, false);
  assert.equal('data' in shell, false);

  const registration = data(context.apiCarregarAbaProcesso(token, processId, 'CADASTRO'));
  assert.equal(registration.tab, 'CADASTRO');
  assert.ok(registration.data);
  assert.ok(registration.formFields.length >= 40);
  assert.ok(registration.formFields.some((field) => field.name === 'cliente_renda_origem'));
  assert.ok(registration.formFields.some((field) => field.name === 'cliente_empresa'));
  assert.ok(registration.commercial);
  assert.equal('documents' in registration, false);
  assert.equal('audit' in registration, false);
  const browserRegistration = data(context.apiCarregarAbaProcesso(token, processId, 'REGISTRATION'));
  assert.equal(browserRegistration.tab, 'CADASTRO');
  assert.ok(browserRegistration.data);

  const documents = data(context.apiCarregarAbaProcesso(token, processId, 'DOCUMENTOS'));
  assert.equal(documents.tab, 'DOCUMENTOS');
  assert.ok(Array.isArray(documents.documents));
  assert.ok(Array.isArray(documents.requiredDocuments));
  assert.equal('data' in documents, false);
  assert.equal('audit' in documents, false);

  const review = data(context.apiCarregarAbaProcesso(token, processId, 'REVISAO'));
  assert.equal(review.tab, 'REVISAO');
  assert.ok(review.workflow);
  assert.ok(review.reviewReadiness);
  assert.ok(Array.isArray(review.pending));
  assert.ok(Array.isArray(review.movements));
  assert.equal('audit' in review, false);

  const audit = data(context.apiCarregarAbaProcesso(token, processId, 'AUDITORIA'));
  assert.equal(audit.tab, 'AUDITORIA');
  assert.ok(Array.isArray(audit.audit));
  assert.equal('documents' in audit, false);
  assert.equal('data' in audit, false);
});

check('edição da ficha é versionada e preserva a versão anterior', () => {
  const before = context.autFind_('PROCESSOS', 'ID_PROCESSO', processId);
  const versionBefore = context.autProcessVersion_(before);
  const updatedData = { ...processData, cliente_nome: 'Cliente Atualizado com Segurança' };
  const updated = data(context.apiAtualizarProcesso(token, processId, updatedData, {
    expectedVersion: versionBefore,
    requestId: 'process-edit-versioned-test'
  }));
  assert.equal(updated.version, versionBefore + 1);
  const rows = context.autRowsBy_('PROCESSO_DADOS', 'ID_PROCESSO', processId);
  const activeRows = rows.filter((row) => row.ATIVO === 'SIM');
  const inactiveRows = rows.filter((row) => row.ATIVO === 'NAO');
  assert.ok(activeRows.length >= financedFields.length);
  assert.ok(inactiveRows.length >= financedFields.length);
  assert.ok(inactiveRows.every((row) => row.SUBSTITUIDO_EM));
  const registration = data(context.apiCarregarAbaProcesso(token, processId, 'CADASTRO'));
  assert.equal(registration.data.cliente_nome, 'Cliente Atualizado com Segurança');
  assert.equal(registration.processVersion, versionBefore + 1);
});

check('OK da pendência cria aceite eletrônico individual', () => {
  const created = data(context.apiCriarPendencia(token, processId, {
    title: 'Conferir dado cadastral',
    description: 'Pendência criada para validar o aceite eletrônico individual.',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId))
  }, { requestId: 'pending-create-ok-test' }));
  const completed = data(context.apiConcluirPendencia(token, created.id, {
    requestId: 'pending-complete-ok-test',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    device: { browser: 'test' }
  }));
  assert.ok(completed.acceptanceId);
  const acceptance = context.autFind_('ACEITES_ELETRONICOS', 'ID_ACEITE', completed.acceptanceId);
  assert.ok(acceptance);
  assert.equal(acceptance.TIPO_ESCOPO, 'PENDENCIA');
  assert.equal(acceptance.ID_ESCOPO, created.id);
  assert.equal(acceptance.DECISAO, 'OK');
  const pending = context.autFind_('PENDENCIAS', 'ID_PENDENCIA', created.id);
  assert.equal(pending.STATUS, 'CONCLUIDA');
  assert.equal(pending.CONCLUIDO_POR, context.autFind_('USUARIOS', 'EMAIL', setup.developerEmail).NOME);
});

let rentalProcessId;
check('renda locatícia, aceite eletrônico e grupo documental de renda', () => {
  const rentalFields = data(context.apiObterFormularioProcesso(token, 'ALUGUEL_MENSAL')).fields;
  const rentalData = {};
  for (const field of rentalFields) rentalData[field.name] = sampleValue(field);
  rentalData.cliente_renda = 'R$ 2.000,00';
  rentalData.valor_aluguel_mensal = 'R$ 1.000,00';
  const blocked = context.apiCriarProcesso(token, { type: 'ALUGUEL_MENSAL', data: rentalData }, {});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'INCOME_ACCEPTANCE_REQUIRED');
  const created = data(context.apiCriarProcesso(token, {
    type: 'ALUGUEL_MENSAL',
    data: { ...rentalData, aceite_renda_insuficiente: 'SIM' }
  }, {}));
  rentalProcessId = created.process.id;
  assert.equal(created.incomeEvaluation.adequate, false);
  assert.match(created.incomeEvaluation.token, /^ACE-\d{14}-\d{6}$/);
  const detail = data(context.apiDetalharProcesso(token, rentalProcessId));
  assert.equal(detail.data.aceite_renda_insuficiente, 'SIM');
  assert.equal(detail.documentGroups.length, 1);
  assert.equal(detail.documentGroups[0].id, 'COMPROVACAO_RENDA');
  assert.equal(detail.documentGroups[0].uploaded, false);
  assert.ok(detail.requiredDocuments.filter((doc) => doc.requirementGroup === 'COMPROVACAO_RENDA').length >= 7);
  const proof = data(context.apiUploadDocumentoForm({
    token, processId: rentalProcessId, typeId: 'DOC_CONTRACHEQUE_OLERITE',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', rentalProcessId)), contextJson: '{}',
    file: new BlobMock('%PDF-1.4 olerite', 'application/pdf', 'olerite.pdf')
  }));
  assert.equal(proof.fileName, 'olerite.pdf');
  assert.equal(data(context.apiDetalharProcesso(token, rentalProcessId)).documentGroups[0].uploaded, true);
  assert.ok(context.autRows_('AUDITORIA').some((row) => row.ID_ENTIDADE === rentalProcessId && row.ACAO === 'ACEITE_RENDA_INSUFICIENTE'));
});

check('alteração livre de status bloqueada pelo fluxo controlado', () => {
  const result = context.apiAtualizarStatusProcesso(token, processId, 'EM_ANALISE', 'teste', {});
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONTROLLED_WORKFLOW_REQUIRED');
});

let documentId;
check('upload por formulário/Blob, prévia segura, metadados, download e limites', () => {
  const emptyPdf = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: '{}',
    file: new BlobMock('', 'application/pdf', 'vazio.pdf')
  });
  assert.equal(emptyPdf.ok, false);
  assert.equal(emptyPdf.code, 'INVALID_FILE');
  const falseExtension = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: '{}',
    file: new BlobMock('%PDF-1.4 arquivo disfarçado', 'application/pdf', 'disfarcado.txt')
  });
  assert.equal(falseExtension.ok, false);
  assert.equal(falseExtension.code, 'INVALID_FILE');
  const invalidMime = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: '{}',
    file: new BlobMock('conteúdo', 'text/plain', 'identidade.txt')
  });
  assert.equal(invalidMime.ok, false);
  const oversized = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: '{}',
    file: new BlobMock(Buffer.alloc(6 * 1024 * 1024 + 1), 'application/pdf', 'grande.pdf')
  });
  assert.equal(oversized.ok, false);
  const fakePdf = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: '{}',
    file: new BlobMock('isto não é um PDF', 'application/pdf', 'falso.pdf')
  });
  assert.equal(fakePdf.ok, false);
  assert.equal(fakePdf.code, 'INVALID_FILE');
  const uploaded = data(context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: JSON.stringify({ device: { test: true } }),
    file: new BlobMock('%PDF-1.4 teste', 'application/pdf', 'identidade.pdf')
  }));
  documentId = uploaded.id;
  assert.equal(uploaded.fileName, 'identidade.pdf');
  const duplicate = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    contextJson: '{}',
    file: new BlobMock('%PDF-1.4 teste', 'application/pdf', 'copia-identidade.pdf')
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, 'DUPLICATE_DOCUMENT');
  const previewed = data(context.apiVisualizarDocumento(token, documentId, {}));
  assert.equal(previewed.fileName, 'identidade.pdf');
  assert.equal(previewed.mimeType, 'application/pdf');
  assert.ok(previewed.base64.length > 0);
  const manifest = data(context.apiPrepararDocumento(token, documentId, {}));
  assert.equal(manifest.fileName, 'identidade.pdf');
  assert.ok(manifest.totalChunks >= 1);
  const chunks = Array.from({ length: manifest.totalChunks }, (_, index) =>
    data(context.apiLerChunkDocumento(token, documentId, index))
  );
  assert.equal(chunks.reduce((total, chunk) => total + context.Utilities.base64Decode(chunk.base64).length, 0), manifest.size);
  const thumbnail = data(context.apiMiniaturaDocumento(token, documentId, {}));
  assert.equal(thumbnail.available, true);
  assert.equal(thumbnail.sourceMimeType, 'application/pdf');
  assert.equal(thumbnail.mimeType, 'image/jpeg');
  assert.ok(thumbnail.base64.length < previewed.base64.length * 4);
  const storedDocument = context.autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
  const storedFileId = storedDocument.ARQUIVO_ID;
  const storedFile = files.get(storedFileId);
  const originalGetThumbnail = storedFile.getThumbnail;
  storedFile.getThumbnail = () => new BlobMock(Buffer.alloc(91 * 1024, 1), 'image/jpeg', 'thumbnail-grande.jpg');
  cache.remove(`AUT_THUMB_${documentId}_${Number(storedDocument.VERSAO || 1)}`);
  const oversizedThumbnail = data(context.apiMiniaturaDocumento(token, documentId, {}));
  assert.equal(oversizedThumbnail.available, false);
  assert.equal(oversizedThumbnail.errorCode, 'THUMBNAIL_TOO_LARGE');
  assert.equal(oversizedThumbnail.fallbackAllowed, true);
  assert.equal(oversizedThumbnail.base64, undefined);
  storedFile.getThumbnail = originalGetThumbnail;
  const rootDocumentsFolder = folders.get(properties.get('AUT_DOCUMENTS_FOLDER_ID'));
  const protocolDocumentsFolder = rootDocumentsFolder.folders.find((folder) => folder.name === storedDocument.PROTOCOLO);
  cache.remove(`AUT_THUMB_${documentId}_${Number(storedDocument.VERSAO || 1)}`);
  files.delete(storedFileId);
  protocolDocumentsFolder.files = protocolDocumentsFolder.files.filter((file) => file.id !== storedFileId);
  const unavailableThumbnail = data(context.apiMiniaturaDocumento(token, documentId, {}));
  assert.equal(unavailableThumbnail.available, false);
  assert.equal(unavailableThumbnail.errorCode, 'DOCUMENT_FILE_UNAVAILABLE');
  assert.equal(unavailableThumbnail.deploymentAccount, 'palmer.imoveis.comercial@gmail.com');
  files.set(storedFileId, storedFile);
  protocolDocumentsFolder.files.push(storedFile);
  const documentDetail = data(context.apiDetalharProcesso(token, processId)).documents[0];
  assert.equal(documentDetail.id, documentId);
  assert.equal(documentDetail.fileName, 'identidade.pdf');
  assert.equal(documentDetail.uploadedBy, context.autFind_('USUARIOS', 'EMAIL', setup.developerEmail).NOME);
  assert.ok(documentDetail.createdAt);
  assert.ok(context.autRows_('AUDITORIA').some((row) => row.ACAO === 'DOCUMENTO_VISUALIZADO'));
  ['PDF_SELECIONADO', 'PDF_UPLOAD_INICIADO', 'PDF_UPLOAD_CONCLUIDO', 'PDF_UPLOAD_FALHOU', 'PDF_VISUALIZADO'].forEach((action) => {
    assert.ok(context.autRows_('AUDITORIA').some((row) => row.ID_ENTIDADE === processId && row.ACAO === action), `Evento ausente: ${action}`);
  });
  data(context.apiRegistrarAcessoDocumentoCache(token, documentId, 'PREVIEW', {}));
  assert.ok(context.autRows_('AUDITORIA').some((row) =>
    row.ACAO === 'DOCUMENTO_VISUALIZADO' && JSON.parse(row.DETALHES_JSON).origem === 'CACHE_NAVEGADOR'
  ));
  const downloaded = data(context.apiBaixarDocumento(token, documentId, {}));
  assert.equal(downloaded.fileName, 'identidade.pdf');
  assert.ok(downloaded.base64.length > 0);
  assert.ok(context.autRows_('AUDITORIA').some((row) => row.ID_ENTIDADE === processId && row.ACAO === 'PDF_DOWNLOAD_REALIZADO'));

  const previewFlag = context.autFind_('CONFIGURACOES', 'CHAVE', 'PDF_PREVIEW_ENABLED');
  context.autUpdateRow_('CONFIGURACOES', previewFlag._row, { VALOR: 'NAO' });
  context.autInvalidateCaches_();
  const disabledPreview = context.apiPrepararDocumento(token, documentId, {});
  assert.equal(disabledPreview.ok, false);
  assert.equal(disabledPreview.code, 'PREVIEW_DISABLED');
  assert.equal(data(context.apiBaixarDocumento(token, documentId, {})).fileName, 'identidade.pdf');
  context.autUpdateRow_('CONFIGURACOES', previewFlag._row, { VALOR: 'SIM' });
  context.autInvalidateCaches_();
  assert.equal(data(context.apiPrepararDocumento(token, documentId, {})).fileName, 'identidade.pdf');

  const webp = data(context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    contextJson: '{}',
    file: new BlobMock('RIFF-webp-seguro', 'image/webp', 'identidade.webp')
  }));
  const webpManifest = data(context.apiPrepararDocumento(token, webp.id, {}));
  assert.equal(webpManifest.mimeType, 'image/webp');

  const special = data(context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    contextJson: '{}',
    file: new BlobMock('%PDF-1.7 documento removível', 'application/pdf', `${'contrato:especial?'.repeat(9)}.pdf`)
  }));
  assert.ok(special.fileName.length <= 150);
  assert.match(special.fileName, /\.pdf$/i);
  assert.doesNotMatch(special.fileName, /[\\/:*?"<>|]/);
  data(context.apiExcluirDocumento(token, special.id, {
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId))
  }));
  assert.ok(context.autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', special.id).EXCLUIDO_EM);
  assert.equal(context.apiPrepararDocumento(token, special.id, {}).code, 'NOT_FOUND');
  assert.equal(context.apiPrepararDocumento(token, 'documento-inexistente', {}).code, 'NOT_FOUND');
  const storedMain = context.autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', documentId);
  files.get(storedMain.ARQUIVO_ID).setTrashed(true);
  const missingDriveFile = context.apiPrepararDocumento(token, documentId, {});
  files.get(storedMain.ARQUIVO_ID).setTrashed(false);
  assert.equal(missingDriveFile.ok, false);
  assert.equal(missingDriveFile.code, 'DOCUMENT_FILE_UNAVAILABLE');
  assert.ok(context.autRows_('AUDITORIA').some((row) => row.ID_ENTIDADE === processId && row.ACAO === 'PDF_REMOVIDO'));
  assert.ok(context.autRows_('AUDITORIA').some((row) => row.ACAO === 'PDF_ACESSO_NEGADO'));
});

check('higienização Drive remove somente anyone, preserva ACL nominal e retoma após falha', () => {
  const activeRootId = properties.get('AUT_DOCUMENTS_FOLDER_ID');
  const documentFileIds = context.autRows_('PROCESSO_DOCUMENTOS')
    .map((row) => String(row.ARQUIVO_ID || ''))
    .filter((id, index, all) => id && all.indexOf(id) === index);
  assert.ok(legacyPublicRootId);
  assert.ok(documentFileIds.length >= 3);

  drivePermissions.set(activeRootId, [
    { id: 'perm-active-private-sentinel', type: 'anyone', role: 'reader' }
  ]);
  drivePermissions.set(legacyPublicRootId, [
    { id: 'perm-root-anyone', type: 'anyone', role: 'writer' },
    { id: 'perm-root-owner', type: 'user', role: 'owner' }
  ]);
  drivePermissions.set(documentFileIds[0], [
    { id: 'perm-file-anyone', type: 'anyone', role: 'reader' },
    { id: 'perm-file-user', type: 'user', role: 'writer' },
    { id: 'perm-file-domain', type: 'domain', role: 'reader' }
  ]);
  drivePermissions.set(documentFileIds[1], [
    { id: 'perm-file-failing-anyone', type: 'anyone', role: 'reader' },
    { id: 'perm-file-group', type: 'group', role: 'reader' }
  ]);
  drivePermissions.set(documentFileIds[2], [
    { id: 'perm-file-after-failure', type: 'anyone', role: 'reader' }
  ]);
  failedDrivePermissionDeletes.add('perm-file-failing-anyone');

  const diagnostic = context.diagnosticarPermissoesPublicasDriveSetup(30);
  assert.equal(diagnostic.mode, 'READ_ONLY');
  assert.ok(diagnostic.stats.publicPermissionsFound >= 4);
  assert.ok(drivePermissions.get(legacyPublicRootId).some((permission) => permission.type === 'anyone'));

  let firstRun;
  for (let attempt = 0; attempt < 30; attempt++) {
    firstRun = context.higienizarPermissoesPublicasDriveSetup(2);
    if (firstRun.complete) break;
  }
  assert.equal(firstRun.complete, true);
  assert.equal(firstRun.ok, false, 'a falha individual precisa constar no resultado sem abortar o lote');
  assert.ok(firstRun.stats.targetsWithFailures >= 1);
  assert.equal(properties.has('AUT_DRIVE_PUBLIC_ACL_CLEANUP_V1'), false);

  assert.equal(drivePermissions.get(legacyPublicRootId).some((permission) => permission.type === 'anyone'), false);
  assert.deepEqual(drivePermissions.get(legacyPublicRootId).map((permission) => permission.type), ['user']);
  assert.equal(drivePermissions.get(documentFileIds[0]).some((permission) => permission.type === 'anyone'), false);
  assert.deepEqual(drivePermissions.get(documentFileIds[0]).map((permission) => permission.type).sort(), ['domain', 'user']);
  assert.equal(drivePermissions.get(documentFileIds[1]).some((permission) => permission.type === 'anyone'), true);
  assert.equal(drivePermissions.get(documentFileIds[1]).some((permission) => permission.type === 'group'), true);
  assert.equal(drivePermissions.get(documentFileIds[2]).some((permission) => permission.type === 'anyone'), false,
    'uma falha anterior não pode impedir os itens seguintes');

  // A raiz ativa confirmada como privada não recebe sequer chamada de listagem
  // da API: sua permissão sentinela comprova que nenhuma alteração foi tentada.
  assert.equal(drivePermissionListCalls.includes(activeRootId), false);
  assert.equal(drivePermissions.get(activeRootId)[0].id, 'perm-active-private-sentinel');

  failedDrivePermissionDeletes.delete('perm-file-failing-anyone');
  let retryRun;
  for (let attempt = 0; attempt < 30; attempt++) {
    retryRun = context.higienizarPermissoesPublicasDriveSetup(3);
    if (retryRun.complete) break;
  }
  assert.equal(retryRun.complete, true);
  assert.equal(retryRun.ok, true);
  assert.equal(drivePermissions.get(documentFileIds[1]).some((permission) => permission.type === 'anyone'), false);
  assert.deepEqual(drivePermissions.get(documentFileIds[1]).map((permission) => permission.type), ['group']);
  assert.ok(context.autRows_('AUDITORIA').some((row) =>
    row.ACAO === 'DRIVE_PERMISSOES_PUBLICAS_HIGIENIZADAS' && row.ID_ENTIDADE === 'DRIVE_ACL'
  ));
});

check('reserva de upload na nuvem pode ser retomada sem duplicar e não conta como documento enviado', () => {
  const cloudFlag = context.autFind_('CONFIGURACOES', 'CHAVE', 'MEDIA_CLOUD_ENABLED');
  context.autUpdateRow_('CONFIGURACOES', cloudFlag._row, { VALOR: 'SIM' });
  properties.set('AUT_MEDIA_SIGNING_SECRET', 'segredo-smoke-media-32-caracteres-minimo');
  context.autInvalidateCaches_();
  const expectedVersion = context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId));
  const payload = {
    processId,
    typeId: 'DOC_COMPROVANTE_ENDERECO',
    fileName: 'retomada-segura.jpg',
    mimeType: 'image/jpeg',
    size: 145963,
    sha256: 'a'.repeat(64),
    expectedVersion,
    requestId: 'media-reserve-retry-same-request',
    context: { requestId: 'media-reserve-retry-same-request' }
  };
  const first = data(context.apiReservarUploadNuvem(token, payload));
  const resumed = data(context.apiReservarUploadNuvem(token, payload));
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.documentId, first.documentId);
  assert.equal(context.autRowsBy_('PROCESSO_DOCUMENTOS', 'ID_PROCESSO', processId)
    .filter((row) => row.ID_DOCUMENTO === first.documentId).length, 1);
  const pendingThumbnail = data(context.apiMiniaturaDocumento(token, first.documentId, {}));
  assert.equal(pendingThumbnail.available, false);
  assert.equal(pendingThumbnail.errorCode, 'CLOUD_UPLOAD_PENDING');
  const requirement = data(context.apiDetalharProcesso(token, processId)).requiredDocuments
    .find((item) => item.id === 'DOC_COMPROVANTE_ENDERECO');
  assert.equal(requirement.uploaded, false, 'uma reserva incompleta não pode cumprir o requisito documental');
  const pendingRow = context.autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', first.documentId);
  assert.equal(context.autIsDocumentStored_(pendingRow), false);
  data(context.apiExcluirDocumento(token, first.documentId, {
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    requestId: 'remove-pending-cloud-smoke'
  }));
  context.autUpdateRow_('CONFIGURACOES', cloudFlag._row, { VALOR: 'NAO' });
  context.autInvalidateCaches_();
});

check('upload acima de 6 MB falha fechado até worker Drive e health profundo estarem saudáveis', () => {
  const cloudFlag = context.autFind_('CONFIGURACOES', 'CHAVE', 'MEDIA_CLOUD_ENABLED');
  const largeFlag = context.autFind_('CONFIGURACOES', 'CHAVE', 'MEDIA_LARGE_UPLOAD_ENABLED');
  const workerFlag = context.autFind_('CONFIGURACOES', 'CHAVE', 'MEDIA_DRIVE_SYNC_WORKER_READY');
  context.autUpdateRow_('CONFIGURACOES', cloudFlag._row, {VALOR:'SIM'});
  properties.set('AUT_MEDIA_SIGNING_SECRET', 'segredo-smoke-media-32-caracteres-minimo');
  context.autInvalidateCaches_();

  const basePayload = {
    processId,
    typeId:'DOC_COMPROVANTE_ENDERECO',
    fileName:'pdf-pesado-seguro.pdf',
    mimeType:'application/pdf',
    size:7 * 1024 * 1024,
    sha256:'b'.repeat(64),
    expectedVersion:context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    requestId:'large-upload-disabled-flags',
    context:{requestId:'large-upload-disabled-flags'}
  };
  const before = context.autRows_('PROCESSO_DOCUMENTOS').length;
  const flagsDisabled = context.apiReservarUploadNuvem(token, basePayload);
  assert.equal(flagsDisabled.ok, false);
  assert.equal(flagsDisabled.code, 'LARGE_UPLOAD_SAFETY_HOLD');
  assert.equal(context.autRows_('PROCESSO_DOCUMENTOS').length, before,
    'a contenção deve ocorrer antes de criar linha ou ticket');

  context.autUpdateRow_('CONFIGURACOES', largeFlag._row, {VALOR:'SIM'});
  context.autUpdateRow_('CONFIGURACOES', workerFlag._row, {VALOR:'SIM'});
  context.autInvalidateCaches_();
  mediaHealthState.payload.data.database = false;
  mediaHealthState.payload.data.driveSyncWorker = {configured:true, healthy:false};
  const unhealthy = data(context.apiVerificarProntidaoUploadGrande(token, true));
  assert.equal(unhealthy.ready, false);
  const healthBlocked = context.apiReservarUploadNuvem(token, {
    ...basePayload,
    requestId:'large-upload-worker-unhealthy',
    context:{requestId:'large-upload-worker-unhealthy'}
  });
  assert.equal(healthBlocked.ok, false);
  assert.equal(healthBlocked.code, 'LARGE_UPLOAD_SAFETY_HOLD');
  assert.equal(context.autRows_('PROCESSO_DOCUMENTOS').length, before);

  mediaHealthState.payload.data.database = true;
  mediaHealthState.payload.data.driveSyncWorker = {configured:true, healthy:true};
  const healthy = data(context.apiVerificarProntidaoUploadGrande(token, true));
  assert.equal(healthy.ready, true);
  const reserved = data(context.apiReservarUploadNuvem(token, {
    ...basePayload,
    expectedVersion:context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    requestId:'large-upload-worker-healthy',
    context:{requestId:'large-upload-worker-healthy'}
  }));
  const pending = context.autFind_('PROCESSO_DOCUMENTOS', 'ID_DOCUMENTO', reserved.documentId);
  assert.equal(pending.MEDIA_STATUS, 'UPLOAD_PENDING');
  assert.equal(pending.SYNC_DRIVE_SUPABASE, 'PENDENTE');
  assert.equal(pending.ARQUIVO_ID, '', 'reserva Supabase não pode fingir que já existe backup no Drive');
  data(context.apiExcluirDocumento(token, reserved.documentId, {
    expectedVersion:context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)),
    requestId:'remove-large-upload-smoke'
  }));

  context.autUpdateRow_('CONFIGURACOES', largeFlag._row, {VALOR:'NAO'});
  context.autUpdateRow_('CONFIGURACOES', workerFlag._row, {VALOR:'NAO'});
  context.autUpdateRow_('CONFIGURACOES', cloudFlag._row, {VALOR:'NAO'});
  mediaHealthState.payload.data.database = false;
  mediaHealthState.payload.data.driveSyncWorker = {configured:false, healthy:false};
  cache.remove('AUT_MEDIA_LARGE_UPLOAD_HEALTH_V1');
  context.autInvalidateCaches_();
});

check('falhas de Drive e planilha não deixam PDF parcial', () => {
  const process = context.autFind_('PROCESSOS', 'ID_PROCESSO', processId);
  const folderKey = `AUT_PROCESS_FOLDER_${context.autHash_(String(process.PROTOCOLO)).slice(0, 24)}`;
  const folder = folders.get(properties.get(folderKey));
  assert.ok(folder);

  const originalCreateFile = folder.createFile;
  const rootFolder = folders.get(properties.get('AUT_DOCUMENTS_FOLDER_ID'));
  const originalRootCreateProcessFolder = rootFolder.createFolder;
  const originalRootCreate = context.autCreateDocumentsRootFolder_;
  const originalDriveCreateFolder = context.DriveApp.createFolder;
  folder.createFile = () => { throw new Error('Falha simulada no Google Drive'); };
  context.autCreateDocumentsRootFolder_ = () => ({
    getId: () => 'root-failure', getUrl: () => 'https://drive.google.com/drive/folders/root-failure',
    createFile: () => { throw new Error('Falha simulada no Google Drive'); }
  });
  context.DriveApp.createFolder = () => { throw new Error('Falha simulada no Google Drive'); };
  rootFolder.createFolder = () => { throw new Error('Falha simulada no Google Drive'); };
  const driveFailure = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE',
    expectedVersion: context.autProcessVersion_(process), contextJson: '{}',
    file: new BlobMock('%PDF-1.7 falha drive', 'application/pdf', 'falha-drive.pdf')
  });
  folder.createFile = originalCreateFile;
  context.autCreateDocumentsRootFolder_ = originalRootCreate;
  context.DriveApp.createFolder = originalDriveCreateFolder;
  rootFolder.createFolder = originalRootCreateProcessFolder;
  assert.equal(driveFailure.ok, false);
  assert.equal(driveFailure.code, 'PDF_OPERATION_FAILED');
  assert.equal(driveFailure.message, 'Não foi possível enviar o documento. Tente novamente.');

  const originalAppend = context.autAppend_;
  context.autAppend_ = (sheetName, row) => {
    if (sheetName === 'PROCESSO_DOCUMENTOS') throw new Error('Falha simulada na planilha');
    return originalAppend(sheetName, row);
  };
  const sheetFailure = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: '{}',
    file: new BlobMock('%PDF-1.7 falha planilha', 'application/pdf', 'falha-planilha.pdf')
  });
  context.autAppend_ = originalAppend;
  assert.equal(sheetFailure.ok, false);
  assert.equal(sheetFailure.code, 'PDF_OPERATION_FAILED');
  assert.equal(folder.files.at(-1).isTrashed(), true);
  assert.ok(context.autRows_('AUDITORIA').filter((row) =>
    row.ID_ENTIDADE === processId && row.ACAO === 'PDF_UPLOAD_FALHOU'
  ).length >= 2);
});

check('envio de token, cooldown e acesso com código', () => {
  const first = data(context.apiSolicitarTokenEmail(setup.developerEmail, 'LOGIN', {}));
  assert.match(first.message, /Código enviado/);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].subject, 'Palmer Imóveis — código AUTENTIKO');
  assert.equal(sentEmails[0].name, 'PALMER IMÓVEIS LTDA');
  assert.equal(sentEmails[0].replyTo, 'palmer.imoveis.comercial@gmail.com');
  const match = sentEmails[0].htmlBody.match(/\b(\d{6})\b/);
  assert.ok(match);
  const second = data(context.apiSolicitarTokenEmail(setup.developerEmail, 'LOGIN', {}));
  assert.match(second.message, /já foi solicitado/);
  assert.equal(sentEmails.length, 1);
  const login = data(context.apiEntrarComToken(setup.developerEmail, match[1], {}));
  assert.ok(login.token);
});

check('falha de e-mail invalida o código e libera nova tentativa', () => {
  const previousSendEmail = context.MailApp.sendEmail;
  const rowsBefore = context.autRows_('TOKENS_EMAIL').length;
  context.MailApp.sendEmail = () => { throw new Error('Falha simulada no provedor de e-mail'); };
  const failed = context.apiSolicitarTokenEmail(setup.developerEmail, 'RESET', {});
  context.MailApp.sendEmail = previousSendEmail;
  assert.equal(failed.ok, false);
  const rows = context.autRows_('TOKENS_EMAIL');
  assert.equal(rows.length, rowsBefore + 1);
  assert.ok(rows.at(-1).USADO_EM);
  const rateKey = 'AUT_EMAIL_RATE_' + context.autHash_(setup.developerEmail + '|RESET');
  assert.equal(cache.get(rateKey), null);
});

check('administração sem autenticações redundantes visíveis', () => {
  const dateConfig = context.autFind_('CONFIGURACOES', 'CHAVE', 'CERTIFICADO_EMISSAO');
  const configHeaders = context.autHeaders_(spreadsheet.getSheetByName('CONFIGURACOES'));
  spreadsheet.getSheetByName('CONFIGURACOES').getRange(dateConfig._row, configHeaders.indexOf('VALOR') + 1).setValue(new Date('2025-08-18T12:00:00Z'));
  const admin = data(context.apiAdminBootstrap(token));
  assert.equal(admin.users.users.length, 1);
  assert.equal(admin.documents.documents.length, 42);
  assert.equal(admin.documents.documents.find((doc) => doc.id === 'DOC_IDENTIDADE_CLIENTE').requiredProcessTypes.length, 13);
  assert.equal(admin.documents.documents.find((doc) => doc.id === 'DOC_CONTRACHEQUE_OLERITE').processTypes.length, 4);
  assert.equal(admin.forms.length, 683);
  assert.ok(admin.configs.configs.length >= 20);
  assert.equal(admin.configs.configs.find((config) => config.key === 'CERTIFICADO_EMISSAO').value, '2025-08-18');
  const sensitive = admin.configs.configs.filter((config) => config.type === 'SENSITIVE');
  assert.ok(sensitive.length >= 1);
  assert.ok(sensitive.every((config) => config.value === '' && config.maskedValue === '••••••••' && config.hasValue));
});

check('regras documentais configuráveis por tipo de processo', () => {
  const saved = data(context.apiSalvarTipoDocumento(token, {
    id: 'DOC_REGRA_TESTE',
    name: 'Documento com regra de teste',
    processTypes: ['COMPRA_IMOVEL_FINANCIADO', 'COMPRA_IMOVEL_AVISTA'],
    requiredProcessTypes: ['COMPRA_IMOVEL_FINANCIADO'],
    active: true,
    order: 998,
    maxMb: 6,
    mimeTypes: 'application/pdf,image/jpeg,image/png'
  }, {}));
  assert.equal(saved.id, 'DOC_REGRA_TESTE');
  const row = context.autFind_('DOCUMENTOS_CATALOGO', 'ID_DOCUMENTO_TIPO', 'DOC_REGRA_TESTE');
  assert.deepEqual(JSON.parse(row.TIPOS_OBRIGATORIOS_JSON), ['COMPRA_IMOVEL_FINANCIADO']);
  context.autInvalidateCaches_();
  const financed = context.autDocumentCatalog_().find((doc) => doc.id === 'DOC_REGRA_TESTE');
  assert.deepEqual(financed.requiredProcessTypes, ['COMPRA_IMOVEL_FINANCIADO']);
});

let assistantId;
let managerId;
let generalManagerId;
let auditorId;
let brokerId;
check('cadastro e filtragem dos destinatários de encaminhamento', () => {
  assistantId = data(context.apiSalvarUsuario(token, {
    name: 'Ana Administrativo',
    email: 'ana.admin@example.com',
    username: 'ana.admin',
    role: 'ASSISTENTE_ADMINISTRATIVO',
    status: 'ATIVO',
    permissions: [],
    password: 'SenhaAdmin123'
  }, {})).id;
  managerId = data(context.apiSalvarUsuario(token, {
    name: 'Marcos Gerente',
    email: 'marcos.gerente@example.com',
    username: 'marcos.gerente',
    role: 'GERENTE_ADMINISTRATIVO',
    status: 'ATIVO',
    permissions: [],
    password: 'SenhaGerente123'
  }, {})).id;
  generalManagerId = data(context.apiSalvarUsuario(token, {
    name: 'Gabriela Gerente Geral',
    email: 'gabriela.geral@example.com',
    username: 'gabriela.geral',
    role: 'GERENTE_GERAL',
    status: 'ATIVO',
    permissions: [],
    password: 'SenhaGeral123'
  }, {})).id;
  auditorId = data(context.apiSalvarUsuario(token, {
    name: 'Alice Auditoria',
    email: 'alice.auditoria@example.com',
    username: 'alice.auditoria',
    role: 'AUDITOR',
    status: 'ATIVO',
    permissions: [],
    password: 'SenhaAuditor123'
  }, {})).id;
  brokerId = data(context.apiSalvarUsuario(token, {
    name: 'Carlos Corretor',
    email: 'carlos.corretor@example.com',
    username: 'carlos.corretor',
    role: 'CORRETOR',
    status: 'ATIVO',
    permissions: ['CONTRATO_EMITIR'],
    password: 'SenhaCorretor123'
  }, {})).id;
  const routing = data(context.apiListarDestinatariosProcesso(token, processId));
  const assistantSector = routing.sectors.find((sector) => sector.value === 'ADMINISTRATIVO');
  const managerSector = routing.sectors.find((sector) => sector.value === 'GERENTE_ADMINISTRATIVO');
  const generalManagerSector = routing.sectors.find((sector) => sector.value === 'GERENTE_GERAL');
  assert.deepEqual([...assistantSector.users.map((user) => user.id)], [assistantId]);
  assert.deepEqual([...managerSector.users.map((user) => user.id)], [managerId]);
  assert.deepEqual([...generalManagerSector.users.map((user) => user.id)], [generalManagerId]);
  const assistant = context.autFind_('USUARIOS', 'ID_USUARIO', assistantId);
  assert.equal(context.autHasPermission_(assistant, 'PROCESSO_ANALISAR'), true);
  assert.equal(context.autHasPermission_(assistant, 'PROCESSO_ENCAMINHAR'), true);
  assert.equal(context.autHasPermission_(assistant, 'DOCUMENTO_BAIXAR'), true);
  assert.equal(context.autHasPermission_(assistant, 'PENDENCIA_GERIR'), true);
  assert.equal(assistantSector.users.some((user) => user.email === setup.developerEmail), false);
  assert.deepEqual(data(context.apiListarDestinatariosFluxo(token, processId, 'AUDITOR')).users.map((user) => user.id), [auditorId]);
  assert.deepEqual(data(context.apiListarDestinatariosFluxo(token, processId, 'GERENTE_GERAL')).users.map((user) => user.id), [generalManagerId]);
});

let workflowProcessId;
check('fluxo completo Corretor → Administrativo → Gerente Administrativo → Gerente Geral → Auditor', () => {
  const brokerToken = data(context.apiLogin({ login: 'carlos.corretor', password: 'SenhaCorretor123', context: { device: { browser: 'smoke' } } })).token;
  const administrativeToken = data(context.apiLogin({ login: 'ana.admin', password: 'SenhaAdmin123', context: {} })).token;
  const managerToken = data(context.apiLogin({ login: 'marcos.gerente', password: 'SenhaGerente123', context: {} })).token;
  const generalManagerToken = data(context.apiLogin({ login: 'gabriela.geral', password: 'SenhaGeral123', context: {} })).token;
  const auditorToken = data(context.apiLogin({ login: 'alice.auditoria', password: 'SenhaAuditor123', context: {} })).token;
  workflowProcessId = data(context.apiCriarProcesso(brokerToken, {
    type: 'COMPRA_IMOVEL_FINANCIADO',
    data: { ...processData, cliente_cpf: '52998224725', titular_cpf: '11144477735' }
  }, { device: { browser: 'smoke' } })).process.id;
  const draftDeniedToAdministrative = context.apiAbrirProcesso(administrativeToken, workflowProcessId);
  assert.equal(draftDeniedToAdministrative.ok, false);
  assert.equal(draftDeniedToAdministrative.code, 'FORBIDDEN');
  const managerDraftView = data(context.apiAbrirProcesso(managerToken, workflowProcessId));
  assert.equal(managerDraftView.workflow.routing.executiveView, true);
  assert.equal(managerDraftView.capabilities.edit, true);
  let detail = data(context.apiDetalharProcesso(brokerToken, workflowProcessId));
  for (const document of detail.requiredDocuments.filter((item) => item.required)) {
    data(context.apiUploadDocumentoForm({
      token: brokerToken,
      processId: workflowProcessId,
      typeId: document.id,
      expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId)),
      contextJson: JSON.stringify({ requestId: `upload-${document.id}-workflow` }),
      file: new BlobMock(`%PDF-1.4 ${document.id}`, 'application/pdf', `${document.id}.pdf`)
    }));
  }
  let process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  const brokerApproval = data(context.apiEnviarAdministrativo(brokerToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process),
    userId: assistantId, observation: 'Documentação completa'
  }, { requestId: 'workflow-send-administrative' }));
  assert.ok(brokerApproval.acceptanceId);
  assert.ok(context.autRowsBy_('ACEITES_ELETRONICOS', 'ID_PROCESSO', workflowProcessId)
    .some((row) => row.ID_ACEITE === brokerApproval.acceptanceId && row.PERFIL === 'CORRETOR'));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  assert.equal(process.STATUS_TRAMITACAO, 'AGUARDANDO_ADMINISTRATIVO');
  const brokerReadOnly = context.apiAbrirProcesso(brokerToken, workflowProcessId);
  assert.equal(brokerReadOnly.ok, false);
  assert.equal(brokerReadOnly.code, 'FORBIDDEN');
  const assignedAdministrative = data(context.apiAbrirProcesso(administrativeToken, workflowProcessId));
  assert.equal(assignedAdministrative.workflow.routing.isResponsible, true);
  const lateBrokerUpload = context.apiUploadDocumentoForm({
    token: brokerToken,
    processId: workflowProcessId,
    typeId: detail.requiredDocuments[0].id,
    expectedVersion: context.autProcessVersion_(process),
    contextJson: JSON.stringify({ requestId: 'workflow-late-broker-upload' }),
    file: new BlobMock('%PDF-1.4 late', 'application/pdf', 'late.pdf')
  });
  assert.equal(lateBrokerUpload.ok, false);
  assert.equal(lateBrokerUpload.code, 'FORBIDDEN');
  data(context.apiIniciarAnaliseAdministrativa(administrativeToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process)
  }, { requestId: 'workflow-start-administrative' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  data(context.apiConferirDocumentosValidos(administrativeToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process)
  }, { requestId: 'workflow-check-documents' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  data(context.apiAprovarAdministrativo(administrativeToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process),
    userId: managerId, observation: 'Etapa administrativa aprovada'
  }, { requestId: 'workflow-approve-administrative' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  data(context.apiIniciarAnaliseGerencial(managerToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process)
  }, { requestId: 'workflow-start-manager' }));
  detail = data(context.apiDetalharProcesso(managerToken, workflowProcessId));
  for (const category of detail.workflow.categories) {
    const decision = category.readyForOk ? 'OK' : 'NAO_SE_APLICA';
    data(context.apiDecidirCategoriaGerencial(managerToken, {
      processId: workflowProcessId,
      expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId)),
      category: category.category,
      decision,
      justification: decision === 'NAO_SE_APLICA' ? 'Categoria não aplicável neste processo de teste.' : ''
    }, { requestId: `workflow-category-${category.category}` }));
  }
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  data(context.apiEnviarGerenteGeral(managerToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process),
    userId: generalManagerId, observation: 'Checklist do Gerente Administrativo concluído'
  }, { requestId: 'workflow-send-general-manager' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  assert.equal(process.STATUS_TRAMITACAO, 'AGUARDANDO_GERENTE_GERAL');
  data(context.apiIniciarAnaliseGerenteGeral(generalManagerToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process)
  }, { requestId: 'workflow-start-general-manager' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  data(context.apiEnviarAuditoria(generalManagerToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process),
    userId: auditorId, observation: 'Gerência Geral aprovou o processo'
  }, { requestId: 'workflow-send-audit' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  data(context.apiIniciarAuditoria(auditorToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process)
  }, { requestId: 'workflow-start-audit' }));
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  const finalized = data(context.apiFinalizarAuditoria(auditorToken, {
    processId: workflowProcessId, expectedVersion: context.autProcessVersion_(process),
    observation: 'Auditoria concluída'
  }, { requestId: 'workflow-finalize' }));
  assert.ok(finalized.manifestHash);
  process = context.autFind_('PROCESSOS', 'ID_PROCESSO', workflowProcessId);
  assert.equal(process.STATUS, 'FINALIZADO');
  assert.equal(process.STATUS_TRAMITACAO, 'CONCLUIDO');
  assert.ok(process.BLOQUEADO_EM);
  assert.equal(data(context.apiVerificarIntegridadeProcesso(auditorToken, workflowProcessId)).valid, true);
  const blockedEdit = context.apiAdicionarAtuacao(auditorToken, workflowProcessId, {
    type: 'Teste', description: 'Tentativa após finalização', expectedVersion: context.autProcessVersion_(process)
  }, { requestId: 'workflow-blocked-edit' });
  assert.equal(blockedEdit.code, 'PROCESS_LOCKED');
});

check('participantes PF/PJ, revisões de proposta e cinco modelos de contrato', () => {
  const brokerToken = data(context.apiLogin({ login: 'carlos.corretor', password: 'SenhaCorretor123', context: {} })).token;
  const created = data(context.apiCriarProcesso(brokerToken, {
    type: 'COMPRA_IMOVEL_FINANCIADO',
    data: { ...processData, cliente_cpf: '52998224725', titular_cpf: '11144477735' }
  }, {}));
  const commercialProcessId = created.process.id;
  const saveParticipant = (payload) => data(context.apiSalvarParticipante(brokerToken, {
    processId: commercialProcessId,
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId)),
    email: 'parte@example.com',
    phone: '(91) 99999-9999',
    address: { street: 'Rua Teste', number: '10', city: 'Belém', state: 'PA', zip: '66000-000' },
    ...payload
  }, { requestId: `participant-${String(payload.document).replace(/\D/g, '')}` }));
  saveParticipant({
    personType: 'PJ', roles: ['PROPRIETARIO'], name: 'Palmer Patrimonial Ltda',
    document: '04.252.011/0001-10', legalRepresentative: 'Representante Legal'
  });
  saveParticipant({ personType: 'PF', roles: ['TESTEMUNHA'], name: 'Testemunha Um', document: '93541134780' });
  saveParticipant({ personType: 'PF', roles: ['TESTEMUNHA'], name: 'Testemunha Dois', document: '11144477735' });
  const participants = data(context.apiListarParticipantesProcesso(brokerToken, commercialProcessId));
  assert.ok(participants.items.some((item) => item.personType === 'PJ'));
  assert.equal(participants.items.filter((item) => item.roles.includes('TESTEMUNHA')).length, 2);
  const offeror = participants.items.find((item) => item.roles.includes('PROPRIETARIO'));
  const recipient = participants.items.find((item) => item.roles.includes('COMPRADOR')) || participants.items[0];
  const revisionOne = data(context.apiSalvarRevisaoProposta(brokerToken, {
    processId: commercialProcessId,
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId)),
    type: 'COMPRA_IMOVEL', offerorId: offeror.id, recipientId: recipient.id,
    initialValue: 300000, proposedValue: 290000, negotiatedValue: 295000, acceptedValue: 295000,
    conditions: [{ type: 'Pagamento', details: 'Entrada de vinte por cento.' }]
  }, { requestId: 'proposal-revision-one' }));
  const revisionTwo = data(context.apiSalvarRevisaoProposta(brokerToken, {
    processId: commercialProcessId,
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId)),
    type: 'COMPRA_IMOVEL', offerorId: offeror.id, recipientId: recipient.id,
    initialValue: 300000, proposedValue: 292000, negotiatedValue: 296000, acceptedValue: 296000,
    conditions: [{ type: 'Prazo', details: 'Conclusão em trinta dias.' }]
  }, { requestId: 'proposal-revision-two' }));
  assert.equal(revisionTwo.revision, revisionOne.revision + 1);
  assert.equal(context.autFind_('PROPOSTAS', 'ID_PROPOSTA', revisionOne.id).STATUS, 'SUBSTITUIDA');
  let proposal = context.autFind_('PROPOSTAS', 'ID_PROPOSTA', revisionTwo.id);
  context.autUpdateRow_('PROPOSTAS', proposal._row, { STATUS: 'ACEITA', ACEITO_EM: context.autNow_() });
  proposal = context.autFind_('PROPOSTAS', 'ID_PROPOSTA', revisionTwo.id);
  const process = context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId);
  const expectedTitles = {
    VENDA: 'Contrato de Intenção de Compra e Venda — Proposta de Venda',
    COMPRA_IMOVEL: 'Contrato de Intenção de Compra e Venda — Proposta de Compra',
    ALUGUEL_ANUAL: 'Contrato de Intenção de Locação Anual',
    ALUGUEL_SEMESTRAL: 'Contrato de Intenção de Locação Semestral',
    ALUGUEL_TEMPORADA: 'Contrato de Intenção de Locação por Temporada'
  };
  for (const [type, title] of Object.entries(expectedTitles)) {
    proposal.TIPO_PROPOSTA = type;
    const model = context.autContractModelForProposal_(proposal);
    const html = context.autBuildContractHtml_(process, proposal, model, { final: false, number: 'PREVIA' });
    assert.match(html, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /MINUTA — REVISÃO JURÍDICA PENDENTE/);
    assert.match(html, /Times New Roman/);
  }
  context.autUpdateRow_('PROPOSTAS', proposal._row, { TIPO_PROPOSTA: 'COMPRA_IMOVEL' });
  const model = context.autContractModelForProposal_(context.autFind_('PROPOSTAS', 'ID_PROPOSTA', revisionTwo.id));
  context.autUpdateRow_('MODELOS_CONTRATO', model._row, { STATUS_JURIDICO: 'APROVADO_JURIDICO' });
  const issued = data(context.apiEmitirContrato(brokerToken, {
    processId: commercialProcessId,
    proposalId: revisionTwo.id,
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId)),
    final: true
  }, { requestId: 'contract-final-issue' }));
  assert.match(issued.number, /^CTR-\d{4}-\d{6}-R\d{2}$/);
  assert.equal(issued.draft, false);
  const signed = data(context.apiRegistrarContratoAssinadoForm({
    token: brokerToken,
    contractId: issued.id,
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId)),
    contextJson: JSON.stringify({ requestId: 'contract-signed-upload' }),
    file: new BlobMock('%PDF-1.4 contrato assinado', 'application/pdf', 'assinado.pdf')
  }));
  assert.ok(signed.hash);
  assert.equal(context.autFind_('CONTRATOS', 'ID_CONTRATO', issued.id).STATUS, 'ASSINADO_AGUARDANDO_CONFERENCIA');

  const categoryDocumentId = {};
  for (const category of context.AUTENTIKO.REVIEW_CATEGORIES.filter((item) => item !== 'CONTRATOS')) {
    const documentId = crypto.randomUUID();
    categoryDocumentId[category] = documentId;
    context.autAppend_('PROCESSO_DOCUMENTOS', {
      ID_DOCUMENTO: documentId, ID_PROCESSO: commercialProcessId, PROTOCOLO: created.process.protocol,
      ID_DOCUMENTO_TIPO: `QA_${category}`, NOME_DOCUMENTO: `QA ${category}`,
      ARQUIVO_ID: `qa-file-${category}`, ARQUIVO_NOME: `${category}.pdf`,
      MIME_TYPE: 'application/pdf', TAMANHO_BYTES: 64, HASH_SHA256: crypto.createHash('sha256').update(category).digest('hex'),
      VERSAO: 1, OBRIGATORIO: 'NAO', ENVIADO_POR: 'QA', DISPOSITIVO_JSON: '{}', LOCALIZACAO_JSON: '{}',
      CRIADO_EM: context.autNow_(), EXCLUIDO_EM: '', CATEGORIAS_JSON: JSON.stringify([category]),
      STATUS_CONFERENCIA: 'CONFERIDO', CONFERIDO_EM: context.autNow_(), CONFERIDO_POR_ID: assistantId,
      CONFERIDO_POR: 'Ana Administrativo', MOTIVO_PENDENCIA: '', SUBSTITUIDO_POR: '', VERSAO_REGISTRO: 1, BLOQUEADO_EM: ''
    });
  }
  context.autUpdateRow_('PROPOSTAS', proposal._row, { ID_DOCUMENTO_EVIDENCIA: categoryDocumentId.NEGOCIACOES });
  let managerProcess = context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId);
  context.autUpdateRow_('PROCESSOS', managerProcess._row, {
    ID_RESPONSAVEL: managerId, RESPONSAVEL: 'Marcos Gerente', SETOR_ATUAL: 'ADMINISTRATIVO',
    STATUS: 'EM_ANALISE', FASE: 'GERENCIAL', STATUS_TRAMITACAO: 'COM_GERENTE', ETAPA_ATUAL: 'GERENCIAL'
  });
  managerProcess = context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId);
  const managerToken = data(context.apiLogin({
    login: 'marcos.gerente', password: 'SenhaGerente123', context: { device: { browser: 'smoke' } }
  })).token;
  const acceptancesBefore = context.autRowsBy_('ACEITES_ELETRONICOS', 'ID_PROCESSO', commercialProcessId).length;
  const checklistsBefore = context.autRowsBy_('PROCESSO_CHECKLIST', 'ID_PROCESSO', commercialProcessId).length;
  const allApproved = data(context.apiAprovarTodasCategorias(managerToken, {
    processId: commercialProcessId, expectedVersion: context.autProcessVersion_(managerProcess)
  }, { requestId: 'manager-approve-all-categories' }));
  assert.equal(allApproved.approved, 7);
  assert.equal(context.autRowsBy_('ACEITES_ELETRONICOS', 'ID_PROCESSO', commercialProcessId).length - acceptancesBefore, 7);
  assert.equal(context.autRowsBy_('PROCESSO_CHECKLIST', 'ID_PROCESSO', commercialProcessId).length - checklistsBefore, 7);
  assert.equal(context.autFind_('CONTRATOS', 'ID_CONTRATO', issued.id).STATUS, 'APROVADO');

  const originalCreateHtmlOutput = context.HtmlService.createHtmlOutput;
  const contractRowsBeforeFailure = context.autRowsBy_('CONTRATOS', 'ID_PROCESSO', commercialProcessId).length;
  const activeFilesBeforeFailure = [...files.values()].filter((file) => !file.trashed).length;
  context.HtmlService.createHtmlOutput = () => ({ getAs() { throw new Error('Falha simulada na conversão PDF'); } });
  managerProcess = context.autFind_('PROCESSOS', 'ID_PROCESSO', commercialProcessId);
  const failedIssue = context.apiEmitirContrato(managerToken, {
    processId: commercialProcessId, proposalId: revisionTwo.id,
    expectedVersion: context.autProcessVersion_(managerProcess), final: true
  }, { requestId: 'contract-conversion-failure' });
  context.HtmlService.createHtmlOutput = originalCreateHtmlOutput;
  assert.equal(failedIssue.ok, false);
  assert.equal(context.autRowsBy_('CONTRATOS', 'ID_PROCESSO', commercialProcessId).length, contractRowsBeforeFailure);
  assert.equal([...files.values()].filter((file) => !file.trashed).length, activeFilesBeforeFailure);
});

check('requisição duplicada de atuação grava somente uma vez', () => {
  const before = context.autRows_('ATUACOES').length;
  const actionContext = { requestId: 'test-request-activity-0001' };
  const payload = {
    type: 'Observação', description: 'Registro protegido contra duplicidade',
    expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId))
  };
  const first = context.apiAdicionarAtuacao(token, processId, payload, actionContext);
  const second = context.apiAdicionarAtuacao(token, processId, payload, actionContext);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'DUPLICATE_REQUEST');
  assert.equal(context.autRows_('ATUACOES').length, before + 1);
});

check('configurações tipadas validam entrada e preservam segredos', () => {
  const secretBefore = context.autFind_('CONFIGURACOES', 'CHAVE', 'CERTIFICADO_THUMBPRINT').VALOR;
  const kept = data(context.apiSalvarConfiguracao(token, 'CERTIFICADO_THUMBPRINT', '', {}));
  assert.equal(kept.keptExisting, true);
  assert.equal(context.autFind_('CONFIGURACOES', 'CHAVE', 'CERTIFICADO_THUMBPRINT').VALOR, secretBefore);
  assert.equal(context.apiSalvarConfiguracao(token, 'LOGO_URL', 'http://inseguro.example.com/logo.png', {}).ok, false);
  assert.equal(context.apiSalvarConfiguracao(token, 'COR_PRIMARIA', '#ZZZZZZ', {}).ok, false);
  assert.equal(context.apiSalvarConfiguracao(token, 'CERTIFICADO_EMISSAO', '31/02/2026', {}).ok, false);
  assert.equal(context.apiSalvarConfiguracao(token, 'EMPRESA_EMAIL', 'email-invalido', {}).ok, false);
  data(context.apiSalvarConfiguracao(token, 'CERTIFICADO_EMISSAO', '16/07/2026', {}));
  assert.equal(context.autFind_('CONFIGURACOES', 'CHAVE', 'CERTIFICADO_EMISSAO').VALOR, '2026-07-16');
});

check('barreiras contra argumentos e campos excessivos', () => {
  const hugeToken = context.apiBootstrap('x'.repeat(2000));
  assert.equal(hugeToken.ok, false);
  assert.equal(hugeToken.code, 'AUTH_REQUIRED');
  const hugeContext = context.apiUploadDocumentoForm({
    token, processId, typeId: 'DOC_IDENTIDADE_CLIENTE', expectedVersion: context.autProcessVersion_(context.autFind_('PROCESSOS', 'ID_PROCESSO', processId)), contextJson: 'x'.repeat(5001),
    file: new BlobMock('%PDF', 'application/pdf', 'teste.pdf')
  });
  assert.equal(hugeContext.code, 'PAYLOAD_TOO_LARGE');
  const hugeFieldOptions = context.apiSalvarCampoFormulario(token, {
    processType: 'COMPRA_IMOVEL_FINANCIADO', section: 'Teste', name: 'campo_teste', label: 'Campo teste',
    input: 'select', options: Array.from({ length: 101 }, (_, index) => `Opção ${index}`)
  }, {});
  assert.equal(hugeFieldOptions.code, 'PAYLOAD_TOO_LARGE');
  const hugeActivity = context.apiAdicionarAtuacao(token, processId, { type: 'Observação', description: 'x'.repeat(5001) }, {});
  assert.equal(hugeActivity.code, 'FIELD_TOO_LARGE');
});

check('cadeia de auditoria íntegra', () => {
  const integrity = data(context.apiVerificarIntegridadeAuditoria(token));
  assert.equal(integrity.valid, true);
  assert.equal(integrity.failures.length, 0);
  assert.ok(integrity.records >= 5);
});

check('nenhuma entrada de cache ultrapassa o limite', () => {
  const sizes = [...cache.entries].map(([key, value]) => [key, Buffer.byteLength(value, 'utf8')]);
  assert.ok(sizes.every(([, size]) => size <= 100_000));
  const largest = sizes.sort((a, b) => b[1] - a[1])[0];
  console.log(`INFO maior cache: ${largest[0]} = ${largest[1]} bytes`);
});

console.log(`\n${checks.length} verificações de integração concluídas com sucesso.`);
