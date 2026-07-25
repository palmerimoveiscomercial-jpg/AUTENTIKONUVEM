import assert from 'node:assert/strict';
import vm from 'node:vm';

const url = process.argv[2];
assert.ok(url, 'Uso: node tests/live-audit.mjs <URL_PUBLICA_DO_WEB_APP>');
assert.match(url, /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/);

const startedAt = Date.now();
const response = await fetch(url, {
  redirect: 'follow',
  headers: { 'user-agent': 'AUTENTIKO-PostDeploy-Audit/2.0' }
});
const html = await response.text();
const elapsedMs = Date.now() - startedAt;
const accessDenied = /access denied|acesso negado|authorization is required|é necessário ter acesso|request access/i.test(html);

function extractAppsScriptPayload(source) {
  const marker = 'goog.script.init("';
  const start = source.indexOf(marker);
  if (start < 0) return null;

  let escaped = false;
  let end = start + marker.length;
  for (; end < source.length; end += 1) {
    const character = source[end];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') break;
  }
  assert.ok(end < source.length, 'O invólucro do Google Apps Script está truncado.');

  const encoded = source.slice(start + marker.length, end);
  const jsonCompatible = encoded.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
  const decodedArgument = JSON.parse(`"${jsonCompatible}"`);
  return JSON.parse(decodedArgument);
}

assert.equal(
  response.status,
  200,
  `A URL pública respondeu HTTP ${response.status}${accessDenied ? ' e exibiu uma página de autorização' : ''}.`
);
assert.equal(accessDenied, false, 'A URL pública exige autorização e não está disponível para quem possui o link.');
assert.ok(html.length > 50_000, `A resposta possui apenas ${html.length} bytes e não contém o aplicativo completo.`);
const payload = extractAppsScriptPayload(html);
const applicationHtml = payload?.userHtml || html;
const functionNames = new Set(payload?.functionNames || []);

assert.match(applicationHtml, /AUTENTIKO/i, 'A resposta não contém a identidade do aplicativo.');
assert.match(applicationHtml, /Carregando o AUTENTIKO|page-loader/i, 'A resposta não contém a estrutura inicial esperada.');
assert.match(applicationHtml, /incomeEvaluationFromForm/, 'A implantação não contém a regra de renda.');
assert.match(applicationHtml, /enqueueDocumentUploads/, 'A implantação não contém a fila de uploads em segundo plano.');
assert.match(applicationHtml, /downloadRegistrationSheet/, 'A implantação não contém a ficha imprimível.');
assert.match(applicationHtml, /rotatePreview/, 'A implantação não contém a rotação de documentos.');
assert.match(applicationHtml, /apiMiniaturaDocumento/, 'A implantação não contém miniaturas leves do Drive.');
assert.match(applicationHtml, /THUMBNAIL_TOO_LARGE/, 'A implantação não trata miniaturas do Drive acima do limite seguro.');
assert.match(applicationHtml, /canvasToBoundedThumbnailBlob/, 'A implantação não reduz a miniatura no navegador.');
assert.match(applicationHtml, /80 \* 1024/, 'A implantação não limita miniaturas persistentes a 80 KB.');
assert.match(applicationHtml, /pdf-fallback-preview/, 'A implantação não contém fallback visual para PDFs.');
assert.match(applicationHtml, /function fetchStoredDocument/, 'A implantação não contém transferência documental em blocos.');
assert.match(applicationHtml, /AUTENTIKO_BROWSER_CACHE/, 'A implantação não contém o cache persistente do navegador.');
assert.match(applicationHtml, /function cleanupBrowserCache/, 'A implantação não contém expiração e descarte LRU do cache.');
assert.match(applicationHtml, /function optimizeDocumentImage/, 'A implantação não contém otimização condicional de imagens.');
assert.match(applicationHtml, /image\/avif/, 'A implantação não contém suporte a AVIF.');
assert.match(applicationHtml, /image\/webp/, 'A implantação não contém suporte a WebP.');
assert.match(applicationHtml, /apiPrepararDocumento/, 'A implantação não contém manifesto seguro do documento.');
assert.match(applicationHtml, /apiLerChunkDocumento/, 'A implantação não contém leitura segura em blocos.');
assert.match(applicationHtml, /PDF_PREVIEW_ENABLED/, 'A implantação não contém a flag de pré-visualização de PDF.');
assert.match(applicationHtml, /MAX_PDF_SIZE_MB/, 'A implantação não contém o limite configurável de PDFs.');
assert.match(applicationHtml, /hasPdfSignature/, 'A implantação não valida a assinatura binária dos PDFs.');
assert.match(applicationHtml, /data-preview-open-tab/, 'A implantação não oferece abertura segura da prévia em nova aba.');
assert.match(applicationHtml, /data-delete-doc/, 'A implantação não oferece remoção lógica auditável de documentos.');
assert.match(applicationHtml, /data-retry-preview-doc/, 'A implantação não oferece nova tentativa da prévia.');
assert.match(applicationHtml, /detail-action-header/, 'A implantação não contém o cabeçalho organizado de ações.');
assert.match(applicationHtml, /semantic-form-section/, 'A implantação não contém a ficha organizada.');
assert.match(applicationHtml, /renderWorkflowActions/, 'A implantação não contém o fluxo hierárquico 2.0.');
assert.match(applicationHtml, /apiAbrirProcesso/, 'A implantação não contém a abertura leve do processo.');
assert.match(applicationHtml, /apiCarregarAbaProcesso/, 'A implantação não contém as abas carregadas sob demanda.');
assert.match(applicationHtml, /function processTabApiKey/, 'A implantação não contém a tradução segura das chaves das abas.');
assert.match(
  applicationHtml,
  /registration\s*:\s*['"]CADASTRO['"]/,
  'A implantação não traduz a aba cadastral do navegador para a chave aceita pelo servidor.'
);
assert.doesNotMatch(
  applicationHtml,
  /apiCarregarAbaProcesso[^;\n]*normalized\.toUpperCase\(\)/,
  'A implantação ainda envia ao servidor a chave inglesa inválida da aba.'
);
assert.match(applicationHtml, /root\?\.querySelectorAll/, 'A implantação não protege consultas em blocos ausentes.');
assert.match(applicationHtml, /data-process-detail-pane="documents"/, 'A implantação não utiliza a aba documental atual.');
assert.doesNotMatch(applicationHtml, /data-process-detail-pane="visual"/, 'A implantação ainda referencia a antiga aba visual.');
assert.match(applicationHtml, /detail\.formFields/, 'A implantação não renderiza o esquema cadastral completo.');
assert.match(applicationHtml, /renderProcessOkPanel/, 'A implantação não contém o painel central de OKs.');
assert.match(applicationHtml, /OK da pendência/, 'A implantação não contém a confirmação individual de pendência.');
assert.match(applicationHtml, /id="proposal-accept-modal"/, 'A implantação não contém o aceite visual da proposta.');
assert.match(applicationHtml, /capabilities\.activity/, 'A implantação não filtra as ações pela responsabilidade atual.');
assert.match(applicationHtml, /apiAprovarTodasCategorias/, 'A implantação não contém o checklist gerencial atômico.');
assert.match(applicationHtml, /apiSalvarParticipante/, 'A implantação não contém a gestão de participantes.');
assert.match(applicationHtml, /apiSalvarRevisaoProposta/, 'A implantação não contém as revisões de proposta.');
assert.match(applicationHtml, /apiEmitirContrato/, 'A implantação não contém a emissão de contratos.');
assert.match(applicationHtml, /apiVerificarIntegridadeProcesso/, 'A implantação não contém a verificação de integridade.');
assert.match(applicationHtml, /runCloudUploadJob/, 'A implantação não contém o upload retomável protegido por flag.');
assert.match(applicationHtml, /chunkSize: 6 \* 1024 \* 1024/, 'A implantação não usa blocos TUS de 6 MB.');
assert.match(applicationHtml, /'x-signature': target\.uploadToken/, 'A implantação não envia a assinatura temporária do Storage.');
assert.match(applicationHtml, /Adicionar participante/, 'A implantação não contém o botão visual de participantes.');
assert.doesNotMatch(applicationHtml, /id="status-change-form"/, 'A implantação ainda expõe alteração livre de status.');
[
  'apiAprovarTodasCategorias',
  'apiAbrirProcesso',
  'apiCarregarAbaProcesso',
  'apiMiniaturaDocumento',
  'apiRegistrarAcessoDocumentoCache',
  'apiSalvarParticipante',
  'apiSalvarRevisaoProposta',
  'apiEmitirContrato',
  'apiVerificarIntegridadeProcesso'
].forEach((name) => assert.ok(functionNames.has(name), `A função remota ${name} não foi publicada.`));

const scripts = [...applicationHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
const applicationScript = scripts.find((source) =>
  source.includes('incomeEvaluationFromForm') &&
  source.includes('enqueueDocumentUploads') &&
  source.includes('renderWorkflowActions') &&
  source.includes('apiEmitirContrato')
);
assert.ok(applicationScript, 'O JavaScript principal não foi incorporado à resposta do Apps Script.');
scripts.forEach((source, index) => {
  if (!source.trim()) return;
  new vm.Script(source, { filename: `AUTENTIKO-live-script-${index}.html` });
});

console.log(`OK acesso anônimo HTTP 200 (${elapsedMs} ms, ${html.length} bytes)`);
console.log('OK versão 2.2.0, miniaturas até 80 KB, prévia persistente e upload retomável protegido por flag');
console.log(`OK conteúdo completo do AUTENTIKO disponível em ${response.url}`);
