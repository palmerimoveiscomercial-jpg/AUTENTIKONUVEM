import assert from 'node:assert/strict';
import test from 'node:test';
import {constantTimeEqual, signSyncBody} from '../src/lib/data-auth';
import {decodeSearchCursor, encodeSearchCursor} from '../src/lib/cursor';
import {renderContractHtml, replaceContractPlaceholders, validateContractContext} from '../src/lib/contract-engine';
import {queryDataJud} from '../src/lib/provider-service';

const context = {
  process: {id: 'PROC-1', protocol: '2608125249', version: 3},
  proposal: {id: 'PROP-1', status: 'ACEITA', acceptedValue: 2500},
  company: {EMPRESA_NOME: 'PALMER IMÓVEIS LTDA', EMPRESA_CNPJ: '00.000.000/0001-00'},
  property: {id: 'IMO-1', address: 'Rua de Teste, 10'},
  data: {prazo_meses: 12},
  participants: [
    {name: 'Locador', document: '111', roles: ['LOCADOR']},
    {name: 'Locatário', document: '222', roles: ['LOCATARIO']}
  ],
  contractModel: {
    id: 'PALMER_LOC_RES_ANUAL_V2', version: 2, legalStatus: 'EM_REVISAO_JURIDICA',
    title: 'Contrato de locação residencial',
    clauses: [
      {id: 'LOC-OBJ-001', title: 'Do objeto', text: 'Imóvel {{IMOVEL_ID}}, em {{IMOVEL_ENDERECO_COMPLETO}}.'},
      {id: 'LOC-PRA-001', title: 'Do prazo', text: 'Prazo de {{PRAZO_MESES}} meses.'}
    ]
  }
};

test('cursor de busca é opaco e reversível', () => {
  const value = {updatedAt: '2026-08-28T12:30:00.000Z', sourceId: 'PROC-1'};
  assert.deepEqual(decodeSearchCursor(encodeSearchCursor(value)), value);
  assert.throws(() => decodeSearchCursor('cursor-invalido'), /Cursor de paginação inválido/);
});

test('assinatura HMAC é determinística sem comparação direta de segredos', () => {
  const signature = signSyncBody('s'.repeat(32), '1787932800', '{"ok":true}');
  assert.equal(signature.length, 64);
  assert.equal(constantTimeEqual(signature, signature), true);
  assert.equal(constantTimeEqual(signature, '0'.repeat(64)), false);
});

test('placeholders ausentes são explícitos e nunca inventados', () => {
  const result = replaceContractPlaceholders('A {{CAMPO_OK}} e {{CAMPO_AUSENTE}}.', {CAMPO_OK: 'validado'});
  assert.equal(result.text, 'A validado e [DADO NÃO VALIDADO: CAMPO_AUSENTE].');
  assert.deepEqual(result.missing, ['CAMPO_AUSENTE']);
});

test('minuta determinística usa somente contexto sincronizado', () => {
  const validation = validateContractContext(context, false);
  assert.equal(validation.valid, true);
  const rendered = renderContractHtml(context, 'CTR-2026-000001-R01', false);
  assert.match(rendered.html, /IMO-1/);
  assert.match(rendered.html, /Rua de Teste, 10/);
  assert.match(rendered.html, /MINUTA/);
  assert.doesNotMatch(rendered.html, /\{\{/);
});

test('versão final exige aprovação jurídica e duas testemunhas', () => {
  const validation = validateContractContext(context, true);
  assert.equal(validation.valid, false);
  assert.ok(validation.findings.some((item) => item.code === 'LEGAL_REVIEW_REQUIRED'));
  assert.ok(validation.findings.some((item) => item.code === 'WITNESSES_REQUIRED'));
});

test('DataJud exige configuração server-side e nunca aceita tribunal arbitrário', async () => {
  const previousKey = process.env.DATAJUD_API_KEY;
  delete process.env.DATAJUD_API_KEY;
  await assert.rejects(queryDataJud('tjpa', '00008323520184013202'), (error: unknown) => (
    error instanceof Error && 'code' in error && error.code === 'DATAJUD_NOT_CONFIGURED'
  ));
  process.env.DATAJUD_API_KEY = 'public-key-for-validation-test';
  await assert.rejects(queryDataJud('evil.example', '00008323520184013202'), (error: unknown) => (
    error instanceof Error && 'code' in error && error.code === 'DATAJUD_TRIBUNAL_INVALID'
  ));
  if (previousKey === undefined) delete process.env.DATAJUD_API_KEY;
  else process.env.DATAJUD_API_KEY = previousKey;
});

test('DataJud exige numeração CNJ com 20 dígitos', async () => {
  const previousKey = process.env.DATAJUD_API_KEY;
  process.env.DATAJUD_API_KEY = 'public-key-for-validation-test';
  await assert.rejects(queryDataJud('tjpa', '12345'), (error: unknown) => (
    error instanceof Error && 'code' in error && error.code === 'PROCESS_NUMBER_INVALID'
  ));
  if (previousKey === undefined) delete process.env.DATAJUD_API_KEY;
  else process.env.DATAJUD_API_KEY = previousKey;
});
