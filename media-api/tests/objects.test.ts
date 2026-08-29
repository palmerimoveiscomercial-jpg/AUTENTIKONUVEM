import assert from 'node:assert/strict';
import test from 'node:test';
import {assertMediaInput, immutableObjectPath} from '../src/lib/objects';

test('gera chave imutável por processo, documento, versão e hash', () => {
  const hash = 'a'.repeat(64);
  const path = immutableObjectPath({
    processId: 'PROC-2026-001',
    documentId: 'DOC-001',
    version: 3,
    sha256: hash,
    role: 'original',
    mimeType: 'application/pdf'
  });
  assert.equal(path, `PROC-2026-001/DOC-001/v3/${hash}/original.pdf`);
});

test('rejeita travessia e identificadores inseguros', () => {
  assert.throws(() => immutableObjectPath({
    processId: '../outro',
    documentId: 'DOC-001',
    version: 1,
    sha256: 'b'.repeat(64),
    role: 'original',
    mimeType: 'application/pdf'
  }), /Identificador de objeto inválido/);
});

test('aceita PDF original de 100 MB e rejeita bytes excedentes', () => {
  assert.doesNotThrow(() => assertMediaInput('original', 'application/pdf', 100 * 1024 * 1024, 'c'.repeat(64)));
  assert.throws(() => assertMediaInput('original', 'application/pdf', 100 * 1024 * 1024 + 1, 'c'.repeat(64)), /100 MB/);
});

test('imagens originais continuam limitadas a 25 MB', () => {
  assert.doesNotThrow(() => assertMediaInput('original', 'image/jpeg', 25 * 1024 * 1024, 'e'.repeat(64)));
  assert.throws(() => assertMediaInput('original', 'image/jpeg', 25 * 1024 * 1024 + 1, 'e'.repeat(64)), /25 MB/);
});

test('miniatura nunca pode ultrapassar 80 KB', () => {
  assert.doesNotThrow(() => assertMediaInput('thumbnail', 'image/webp', 80 * 1024, 'd'.repeat(64)));
  assert.throws(() => assertMediaInput('thumbnail', 'image/webp', 80 * 1024 + 1, 'd'.repeat(64)), /80 KB/);
});
