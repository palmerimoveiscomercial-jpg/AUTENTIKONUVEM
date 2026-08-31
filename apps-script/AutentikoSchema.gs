/**
 * Canonical schema shared by AUTENTIKO OK NUVEM, Captação, CHECK and DOCS.
 * This file contains no credentials and can safely be loaded by Apps Script.
 */
var AUT_SCHEMA_VERSION_ = '2026.08.30.1';

var AUT_FIELD_STATES_ = Object.freeze({
  INFORMADO: 'INFORMADO',
  NAO_INFORMADO: 'NAO_INFORMADO',
  NAO_APLICAVEL: 'NAO_APLICAVEL',
  PENDENTE_VALIDACAO: 'PENDENTE_VALIDACAO'
});

var AUT_SCHEMA_ALIASES_ = Object.freeze([
  { system: 'NUVEM', sheet: 'PROCESSOS', source: 'PROTOCOLO', canonical: 'PROTOCOLO' },
  { system: 'NUVEM', sheet: 'PROCESSOS', source: 'IMOVEL_CODIGO', canonical: 'CODIGO_INTERNO' },
  { system: 'NUVEM', sheet: 'BASE_IMOVEIS', source: 'CODIGO_INTERNO', canonical: 'CODIGO_INTERNO' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'ID_CAPTACAO', canonical: 'ID_CAPTACAO' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'CODIGO_INTERNO_IMOVEL', canonical: 'CODIGO_INTERNO' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'PROPRIETARIO_NOME_COMPLETO', canonical: 'PROPRIETARIO_NOME' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'PROPRIETARIO_CPF_CNPJ', canonical: 'PROPRIETARIO_CPF_CNPJ' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'ENDERECO_COMPLETO_IMOVEL', canonical: 'IMOVEL_ENDERECO' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'VALOR_ALUGUEL', canonical: 'VALOR_ALUGUEL' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'UNIDADE_CONSUMIDORA', canonical: 'UNIDADE_CONSUMIDORA' },
  { system: 'CAPTACAO', sheet: 'BASE_DE_DADOS', source: 'MATRICULA_AGUA', canonical: 'MATRICULA_AGUA' },
  { system: 'CHECK', sheet: 'REGISTRO_DE_VISTORIA', source: 'PROTOCOLO_NUVEM', canonical: 'PROTOCOLO' },
  { system: 'CHECK', sheet: 'REGISTRO_DE_VISTORIA', source: 'CODIGO_IMOVEL', canonical: 'CODIGO_INTERNO' },
  { system: 'CHECK', sheet: 'FOTOS_LAUDO', source: 'ARQUIVO_ID', canonical: 'DRIVE_FILE_ID' },
  { system: 'CHECK', sheet: 'FOTOS_LAUDO', source: 'FOTO_URL', canonical: 'MEDIA_URL' },
  { system: 'DOCS', sheet: 'CONTRATOS', source: 'PROTOCOLO_NUVEM', canonical: 'PROTOCOLO' },
  { system: 'DOCS', sheet: 'CONTRATOS', source: 'CODIGO_IMOVEL', canonical: 'CODIGO_INTERNO' }
]);

function autSchemaKey_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function autSchemaText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function autSchemaDigits_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function autSchemaCpf_(value) {
  var digits = autSchemaDigits_(value).slice(0, 11).padStart(11, '0');
  if (!digits.replace(/0/g, '')) return '';
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function autSchemaCnpj_(value) {
  var digits = autSchemaDigits_(value).slice(0, 14).padStart(14, '0');
  if (!digits.replace(/0/g, '')) return '';
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function autSchemaPhone_(value) {
  var digits = autSchemaDigits_(value).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
}

function autSchemaCep_(value) {
  var digits = autSchemaDigits_(value).slice(0, 8);
  return digits.length > 5 ? digits.replace(/(\d{5})(\d{0,3})/, '$1-$2').replace(/-$/, '') : digits;
}

function autSchemaFieldCode_(type, field) {
  return ['AUT', AUT_SCHEMA_VERSION_, autSchemaKey_(type), autSchemaKey_(field)].join(':');
}

function autSchemaValue_(field, value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(function(item) { return autSchemaText_(item).toUpperCase(); }).filter(Boolean);
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value));
  var key = autSchemaKey_(field);
  var text = autSchemaText_(value);
  if (!text) return '';
  if (/EMAIL/.test(key)) return text.toLowerCase();
  if (/CPF_CNPJ/.test(key)) return autSchemaDigits_(text).length > 11 ? autSchemaCnpj_(text) : autSchemaCpf_(text);
  if (/CPF/.test(key)) return autSchemaCpf_(text);
  if (/CNPJ/.test(key)) return autSchemaCnpj_(text);
  if (/TELEFONE|CONTATO|CELULAR/.test(key) && !/NOME|RELACAO/.test(key)) return autSchemaPhone_(text);
  if (/CEP/.test(key)) return autSchemaCep_(text);
  if (/URL|TOKEN|HASH|ARQUIVO_ID|DRIVE_FILE_ID|PUBLIC_ID|ASSET_ID/.test(key)) return text;
  return text.toUpperCase();
}

function autSchemaNormalizeFormData_(type, raw) {
  raw = raw || {};
  var output = {};
  var states = raw._fieldState && typeof raw._fieldState === 'object' ? raw._fieldState : {};
  var normalizedStates = {};
  Object.keys(raw).forEach(function(field) {
    if (field === '_fieldState') return;
    var state = AUT_FIELD_STATES_[autSchemaKey_(states[field])] || '';
    var value = raw[field];
    if (state === AUT_FIELD_STATES_.NAO_INFORMADO || state === AUT_FIELD_STATES_.NAO_APLICAVEL) {
      output[field] = null;
      normalizedStates[field] = state;
      return;
    }
    output[field] = autSchemaValue_(field, value);
    normalizedStates[field] = state || ((output[field] === '' || output[field] == null) ? AUT_FIELD_STATES_.PENDENTE_VALIDACAO : AUT_FIELD_STATES_.INFORMADO);
  });
  Object.keys(states).forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(normalizedStates, field)) normalizedStates[field] = AUT_FIELD_STATES_[autSchemaKey_(states[field])] || AUT_FIELD_STATES_.NAO_INFORMADO;
  });
  output._fieldState = normalizedStates;
  output._schemaVersion = AUT_SCHEMA_VERSION_;
  output._processType = autSchemaKey_(type);
  return output;
}

function autSchemaAliases_(canonical, system, sheet) {
  var wanted = autSchemaKey_(canonical);
  return AUT_SCHEMA_ALIASES_.filter(function(item) {
    return autSchemaKey_(item.canonical) === wanted &&
      (!system || autSchemaKey_(item.system) === autSchemaKey_(system)) &&
      (!sheet || autSchemaKey_(item.sheet) === autSchemaKey_(sheet));
  }).map(function(item) { return item.source; });
}

function autSchemaCanonicalField_(source, system, sheet) {
  var wanted = autSchemaKey_(source);
  var match = AUT_SCHEMA_ALIASES_.filter(function(item) {
    return autSchemaKey_(item.source) === wanted &&
      (!system || autSchemaKey_(item.system) === autSchemaKey_(system)) &&
      (!sheet || autSchemaKey_(item.sheet) === autSchemaKey_(sheet));
  })[0];
  return match ? match.canonical : wanted;
}

function autSchemaNormalizeRecord_(record, system, sheet) {
  var output = {};
  Object.keys(record || {}).forEach(function(source) {
    var canonical = autSchemaCanonicalField_(source, system, sheet);
    var value = autSchemaValue_(canonical, record[source]);
    if (!Object.prototype.hasOwnProperty.call(output, canonical) || output[canonical] === '' || output[canonical] == null) output[canonical] = value;
  });
  output._schemaVersion = AUT_SCHEMA_VERSION_;
  output._sourceSystem = autSchemaKey_(system || 'NUVEM');
  output._sourceSheet = String(sheet || '');
  return output;
}

function autSchemaDenormalizeRecord_(record, system, sheet) {
  var output = {};
  Object.keys(record || {}).forEach(function(canonical) {
    if (/^_/.test(canonical)) return;
    var aliases = autSchemaAliases_(canonical, system, sheet);
    output[aliases[0] || canonical] = record[canonical];
  });
  return output;
}

var SCHEMA = Object.freeze({
  version: AUT_SCHEMA_VERSION_,
  fieldStates: AUT_FIELD_STATES_,
  getCanonicalField: autSchemaCanonicalField_,
  getAliases: autSchemaAliases_,
  normalizeRecord: autSchemaNormalizeRecord_,
  denormalizeRecord: autSchemaDenormalizeRecord_,
  normalizeFormData: autSchemaNormalizeFormData_,
  normalizeCpf: autSchemaCpf_,
  normalizeCnpj: autSchemaCnpj_,
  normalizePhone: autSchemaPhone_,
  normalizeCep: autSchemaCep_,
  fieldCode: autSchemaFieldCode_
});
