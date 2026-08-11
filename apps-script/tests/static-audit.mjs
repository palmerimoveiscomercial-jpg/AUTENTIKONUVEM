import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(testDir);
const files = fs.readdirSync(projectDir);
const serverFiles = files.filter((name) => name.endsWith('.gs')).sort();
const serverSource = serverFiles.map((name) => fs.readFileSync(path.join(projectDir, name), 'utf8')).join('\n');
const scriptsHtml = fs.readFileSync(path.join(projectDir, 'Scripts.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(projectDir, 'Index.html'), 'utf8');
const stylesHtml = fs.readFileSync(path.join(projectDir, 'Styles.html'), 'utf8');

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`OK ${name}`);
}

check('sintaxe de todos os arquivos do servidor', () => {
  for (const name of serverFiles) {
    new vm.Script(fs.readFileSync(path.join(projectDir, name), 'utf8'), { filename: name });
  }
  assert.equal(serverFiles.length, 12);
});

check('sintaxe do JavaScript do navegador', () => {
  const blocks = [...scriptsHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(blocks.length, 1);
  new vm.Script(blocks[0][1], { filename: 'Scripts.html' });
});

check('inicialização possui recuperação contra tela carregando para sempre', () => {
  assert.match(indexHtml, /window\.__autentikoStartupTimer\s*=\s*setTimeout/);
  assert.match(indexHtml, /O sistema não conseguiu iniciar/);
  assert.match(scriptsHtml, /const API_TIMEOUTS\s*=\s*\{/);
  assert.match(scriptsHtml, /apiPublicBootstrap:\s*20000/);
  assert.match(scriptsHtml, /function hidePageLoader\(\)/);
  assert.match(scriptsHtml, /async function init\(\)\s*\{\s*try\s*\{\s*void initializeBrowserCache\(\);\s*wireEvents\(\)/);
  assert.match(scriptsHtml, /showPublic\(\);\s*hidePageLoader\(\);\s*try\s*\{\s*state\.public = await api\('apiPublicBootstrap'\)/);
  assert.match(scriptsHtml, /finally\s*\{\s*hidePageLoader\(\);\s*\}/);
});

check('todas as APIs chamadas pela tela existem no servidor', () => {
  const declared = new Set([...serverSource.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((match) => match[1]));
  const called = new Set([...scriptsHtml.matchAll(/\bapi\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map((match) => match[1]));
  const missing = [...called].filter((name) => !declared.has(name));
  assert.deepEqual(missing, []);
  assert.ok(called.size >= 25);
  console.log(`INFO ${called.size} APIs da interface verificadas`);
});

check('IDs estáticos únicos e seletores literais resolvidos', () => {
  const indexIds = [...indexHtml.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicates = indexIds.filter((id, index) => indexIds.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
  const knownIds = new Set([
    ...indexIds,
    ...[...scriptsHtml.matchAll(/\bid=["']([A-Za-z][\w:-]*)["']/g)].map((match) => match[1])
  ]);
  const literalSelectors = [...scriptsHtml.matchAll(/\$\(\s*['"]#([A-Za-z][\w:-]*)['"]\s*(?:,|\))/g)].map((match) => match[1]);
  const missing = [...new Set(literalSelectors.filter((id) => !knownIds.has(id)))];
  assert.deepEqual(missing, []);
  assert.ok(indexIds.length >= 70);
});

check('correções estruturais contra os erros observados', () => {
  assert.doesNotMatch(serverSource, /\.put\(\s*['"]AUT_FORM_SCHEMAS['"]/);
  assert.match(serverSource, /AUT_FORM_SCHEMA_/);
  assert.match(serverSource, /bytes\s*>\s*95000/);
  assert.doesNotMatch(serverSource, /XFrameOptionsMode\.ALLOWALL/);
  assert.doesNotMatch(serverSource, /Math\.random/);
  assert.doesNotMatch(scriptsHtml, /readAsDataURL|fileToBase64/);
  assert.doesNotMatch(scriptsHtml, /event\.currentTarget\.reset\s*\(/);
  assert.match(scriptsHtml, /apiUploadDocumentoForm/);
  assert.match(scriptsHtml, /apiObterFormularioProcesso/);
  assert.match(serverSource, /if \(!e \|\| !e\.source\)/);
  assert.match(scriptsHtml, /root\?\.querySelectorAll\s*\?/);
  assert.match(scriptsHtml, /root\?\.querySelector\s*\?/);
});

check('nenhuma credencial temporária fixa no código', () => {
  assert.doesNotMatch(serverSource + scriptsHtml + indexHtml, /admin123/i);
  assert.doesNotMatch(serverSource, /bootstrapPassword\s*:\s*['"][^'"]+['"]/);
});

check('limites de entrada presentes no cliente e servidor', () => {
  assert.match(serverSource, /PAYLOAD_TOO_LARGE/);
  assert.match(serverSource, /FIELD_TOO_LARGE/);
  assert.match(serverSource, /INVALID_EMAIL/);
  assert.match(serverSource, /INVALID_OPTION/);
  assert.match(scriptsHtml, /maxlength="5000"/);
  assert.match(scriptsHtml, /maxlength="500"/);
  assert.match(serverSource, /rawToken\.length <= 256/);
  assert.match(serverSource, /target\.length > 1000/);
});

check('fluxo documental dinâmico e auditável', () => {
  assert.match(indexHtml, /id="document-upload-modal"/);
  assert.match(indexHtml, /id="preview-modal"/);
  assert.match(scriptsHtml, /openDocumentUploadStep\(result\.process\.id/);
  assert.match(scriptsHtml, /data-document-dropzone/);
  assert.match(scriptsHtml, /addEventListener\('dragover'/);
  assert.match(scriptsHtml, /addEventListener\('drop'/);
  assert.match(scriptsHtml, /URL\.createObjectURL\(file\)/);
  assert.match(scriptsHtml, /data-preview-doc/);
  assert.match(scriptsHtml, /data-toggle-preview/);
  assert.match(scriptsHtml, /uploadedBy/);
  assert.match(scriptsHtml, /createdAt/);
  assert.match(serverSource, /function apiVisualizarDocumento/);
  assert.match(serverSource, /function apiPrepararDocumento/);
  assert.match(serverSource, /function apiLerChunkDocumento/);
  assert.match(serverSource, /AUT_DOCUMENT_CHUNK_BYTES/);
  assert.match(serverSource, /DOCUMENT_FILE_UNAVAILABLE/);
  assert.match(scriptsHtml, /function fetchStoredDocument/);
  assert.match(scriptsHtml, /Carregando arquivo completo/);
  assert.match(scriptsHtml, /data-retry-preview-doc/);
  assert.match(serverSource, /DOCUMENTO_VISUALIZADO/);
  assert.match(serverSource, /autRequireAuth_\(token, 'DOCUMENTO_BAIXAR'\)/);
  assert.match(stylesHtml, /\.document-dropzone\.drag-active/);
  assert.match(stylesHtml, /\.preview-modal\.expanded/);
  assert.match(stylesHtml, /@media\(max-width:820px\).*document-upload-step/s);
});

check('ficha cadastral em etapas, regras documentais e fluxograma visual', () => {
  assert.match(serverSource, /TIPOS_OBRIGATORIOS_JSON/);
  assert.match(serverSource, /requiredProcessTypes/);
  assert.match(serverSource, /DOC_RG_CNH_PROPRIETARIO/);
  assert.match(serverSource, /DOC_TERMO_PRESTACAO_LAUDO_CAPTACAO/);
  assert.match(indexHtml, /Próxima etapa: documentos/);
  assert.match(indexHtml, /id="doc-process-rules"/);
  assert.match(scriptsHtml, /registrationFinishAction/);
  assert.match(scriptsHtml, /data-finish-registration/);
  assert.match(scriptsHtml, /apiEnviarAdministrativo/);
  assert.match(serverSource, /CONTROLLED_WORKFLOW_REQUIRED/);
  assert.match(scriptsHtml, /function renderProcessFlow/);
  assert.match(scriptsHtml, /data-open-process-flow/);
  assert.match(scriptsHtml, /data-process-detail-tab="review"/);
  assert.match(stylesHtml, /\.process-flow-track/);
  assert.match(stylesHtml, /\.doc-rules-grid/);
});

check('ficha semântica, máscaras, CPF e qualificação de renda', () => {
  assert.match(scriptsHtml, /function semanticSectionForField/);
  assert.match(scriptsHtml, /class="form-section semantic-form-section/);
  assert.match(scriptsHtml, /data-mask="\$\{field\.input\}"/);
  assert.match(scriptsHtml, /function validateCpfField/);
  assert.match(scriptsHtml, /setCustomValidity\([^)]*CPF inválido/);
  assert.match(scriptsHtml, /function parseCurrencyText/);
  assert.match(scriptsHtml, /function incomeEvaluationFromForm/);
  assert.match(scriptsHtml, /aceite_renda_insuficiente\s*=\s*'SIM'/);
  assert.match(serverSource, /INCOME_ACCEPTANCE_REQUIRED/);
  assert.match(serverSource, /requiredIncome:\s*requiredIncome/);
  assert.match(serverSource, /DOC_CONTRACHEQUE_OLERITE/);
  assert.match(serverSource, /COMPROVACAO_RENDA/);
  assert.match(stylesHtml, /\.validated-control\.is-valid/);
  assert.match(stylesHtml, /\.validated-control\.is-invalid/);
  assert.match(stylesHtml, /\.income-qualification\.warning/);
});

check('consulta organizada, ficha imprimível e rotação da prévia', () => {
  assert.match(scriptsHtml, /function renderOrganizedRegistration/);
  assert.match(scriptsHtml, /function downloadRegistrationSheet/);
  assert.match(scriptsHtml, /window\.open\('', '_blank'/);
  assert.match(scriptsHtml, /data-download-registration-sheet/);
  assert.match(indexHtml, /data-rotate-preview="-90"/);
  assert.match(indexHtml, /data-rotate-preview="90"/);
  assert.match(scriptsHtml, /function rotatePreview/);
  assert.match(scriptsHtml, /rotation:\(Number\(page\.rotate \|\| 0\) \+ state\.previewRotation/);
  assert.match(stylesHtml, /\.organized-registration/);
  assert.match(stylesHtml, /\.registration-group-grid/);
});

check('PDF renderizado em canvas sem depender do visualizador nativo', () => {
  assert.match(scriptsHtml, /pdfjs-dist@5\.7\.284\/build\/pdf\.min\.mjs/);
  assert.doesNotMatch(scriptsHtml, /https:\/\//, 'URLs literais no JavaScript podem ser corrompidas pelo HtmlService.');
  assert.match(scriptsHtml, /moduleUrl\.replace\('\/pdf\.min\.mjs', '\/pdf\.worker\.min\.mjs'\)/);
  assert.doesNotMatch(scriptsHtml, /const workerUrl\s*=\s*['"]https:/);
  assert.match(scriptsHtml, /const pdfAssetBase\s*=\s*\['https:',\s*'',\s*'cdn\.jsdelivr\.net\/npm\/pdfjs-dist@5\.7\.284'\]\.join\('\/'\)/);
  assert.doesNotMatch(scriptsHtml, /standardFontDataUrl\s*:\s*['"]https:/);
  assert.match(scriptsHtml, /getDocument\(\{/);
  assert.match(scriptsHtml, /page\.render\(\{/);
  assert.match(scriptsHtml, /className = 'pdf-page-canvas'/);
  assert.match(scriptsHtml, /URL\.createObjectURL\(new Blob\(\[source\]/);
  assert.match(scriptsHtml, /pdf-fallback-preview/);
  assert.match(indexHtml, /id="pdf-preview-controls"/);
  assert.match(indexHtml, /data-pdf-previous/);
  assert.doesNotMatch(scriptsHtml, /<iframe\s+src=/);
  assert.match(serverSource, /function autHasPdfSignature_/);
  assert.match(serverSource, /O PDF está corrompido/);
  assert.match(scriptsHtml, /loadVisualThumbnail/);
  assert.match(stylesHtml, /\.visual-pdf-thumbnail/);
});

check('uploads múltiplos em segundo plano sem congelar a interface', () => {
  assert.match(scriptsHtml, /multiple><span class="dropzone-icon"/);
  assert.match(scriptsHtml, /function enqueueDocumentUploads/);
  assert.match(scriptsHtml, /uploadConcurrency:\s*2/);
  assert.match(scriptsHtml, /function processUploadQueue/);
  assert.match(scriptsHtml, /new DataTransfer\(\)/);
  assert.match(scriptsHtml, /apiUploadDocumentoForm/);
  assert.match(indexHtml, /id="upload-queue-widget"/);
  assert.match(stylesHtml, /\.upload-queue-widget/);
  assert.match(stylesHtml, /\.upload-job\.uploading/);
});

check('encaminhamento por setor e responsável auditável', () => {
  assert.match(serverSource, /PROCESSO_ENCAMINHAR/);
  assert.match(serverSource, /function apiListarDestinatariosFluxo/);
  assert.match(serverSource, /function apiEnviarAdministrativo/);
  assert.match(serverSource, /ASSISTENTE_ADMINISTRATIVO/);
  assert.match(serverSource, /PROCESSO_ENVIADO_ADMINISTRATIVO/);
  assert.match(serverSource, /SETOR_ATUAL/);
  assert.match(indexHtml, /id="workflow-modal"/);
  assert.match(scriptsHtml, /data-workflow-action/);
  assert.match(scriptsHtml, /openWorkflowAction/);
  assert.match(stylesHtml, /\.workflow-state-card/);
});

check('configurações administrativas tipadas e segredos protegidos', () => {
  assert.match(serverSource, /maskedValue: sensitive \? '••••••••'/);
  assert.match(serverSource, /function autNormalizeConfigValue_/);
  assert.match(serverSource, /Informe uma URL segura iniciada por https/);
  assert.match(serverSource, /LockService\.getScriptLock\(\)/);
  assert.match(scriptsHtml, /data-config-form/);
  assert.match(scriptsHtml, /type="color"/);
  assert.match(scriptsHtml, /type="date"/);
  assert.doesNotMatch(scriptsHtml, /data-edit-config/);
  assert.match(stylesHtml, /\.settings-grid/);
  assert.match(stylesHtml, /\.config-protected/);
});

check('galeria visual por duplo clique com carregamento progressivo', () => {
  assert.match(scriptsHtml, /addEventListener\('dblclick'/);
  assert.match(scriptsHtml, /openProcess\(row\.dataset\.processId,'visual'\)/);
  assert.match(scriptsHtml, /data-process-detail-tab="documents"/);
  assert.match(scriptsHtml, /class="visual-document-grid"/);
  assert.match(scriptsHtml, /data-visual-thumbnail/);
  assert.match(scriptsHtml, /scheduleVisualThumbnails/);
  assert.match(scriptsHtml, /visualThumbnailConcurrency:\s*2/);
  assert.match(scriptsHtml, /enqueueVisualThumbnail/);
  assert.match(scriptsHtml, /createThumbnailFromStoredDocument/);
  assert.match(scriptsHtml, /allowSourceFallback/);
  assert.match(scriptsHtml, /DOCUMENT_FILE_UNAVAILABLE/);
  assert.match(scriptsHtml, /data-process-detail-pane="documents"/);
  assert.doesNotMatch(scriptsHtml, /data-process-detail-pane="visual"/);
  assert.match(scriptsHtml, /apiMiniaturaDocumento/);
  assert.doesNotMatch(scriptsHtml, /loadVisualThumbnail[\s\S]{0,1200}apiVisualizarDocumento/);
  assert.match(serverSource, /function apiMiniaturaDocumento/);
  assert.match(serverSource, /file\.getThumbnail\(\)/);
  assert.match(serverSource, /deploymentAccount:\s*deploymentAccount/);
  assert.match(serverSource, /errorCode:\s*'DOCUMENT_FILE_UNAVAILABLE'/);
  assert.match(scriptsHtml, /visualObjectUrls/);
  assert.match(scriptsHtml, /clearVisualObjectUrls/);
  assert.match(stylesHtml, /\.visual-doc-card/);
  assert.match(stylesHtml, /\.visual-document-grid/);
  assert.match(stylesHtml, /@media\(max-width:520px\).*visual-document-grid/s);
  assert.match(indexHtml, /id="detail-action-header"/);
  assert.match(scriptsHtml, /function renderProcessActionHeader/);
  assert.match(scriptsHtml, /data-jump-detail-section/);
  assert.match(stylesHtml, /\.process-action-header/);
});

check('modal estável com quatro abas e carregamento sob demanda', () => {
  assert.match(serverSource, /function apiAbrirProcesso/);
  assert.match(serverSource, /function apiCarregarAbaProcesso/);
  assert.match(serverSource, /formFields:\s*autFormSchema_\(process\.TIPO_PROCESSO\)/);
  assert.match(serverSource, /CADASTRO/);
  assert.match(serverSource, /DOCUMENTOS/);
  assert.match(serverSource, /REVISAO/);
  assert.match(serverSource, /AUDITORIA/);
  assert.match(scriptsHtml, /function ensureProcessTab/);
  assert.match(scriptsHtml, /function processTabApiKey/);
  assert.match(scriptsHtml, /registration:'CADASTRO'/);
  assert.match(scriptsHtml, /documents:'DOCUMENTOS'/);
  assert.match(scriptsHtml, /review:'REVISAO'/);
  assert.match(scriptsHtml, /audit:'AUDITORIA'/);
  assert.match(scriptsHtml, /apiCarregarAbaProcesso', state\.token, processId, processTabApiKey\(normalized\)/);
  assert.doesNotMatch(scriptsHtml, /normalized\.toUpperCase\(\)/);
  assert.match(serverSource, /REGISTRATION:\s*'CADASTRO'/);
  assert.match(scriptsHtml, /function syncProcessAfterMutation/);
  assert.match(scriptsHtml, /if \(payload\.formFields\) next\.formFields = payload\.formFields/);
  assert.match(scriptsHtml, /const detailPromise = api\('apiAbrirProcesso'/);
  assert.match(scriptsHtml, /getProcessTabCache\(id, state\.processDetailTab\)/);
  assert.match(scriptsHtml, /const \[base, tabPayload\] = await Promise\.all/);
  assert.match(scriptsHtml, /processLoadedTabs:\s*new Set/);
  assert.match(scriptsHtml, /data-process-detail-tab="registration"/);
  assert.match(scriptsHtml, /data-process-detail-tab="documents"/);
  assert.match(scriptsHtml, /data-process-detail-tab="review"/);
  assert.match(scriptsHtml, /data-process-detail-tab="audit"/);
  assert.doesNotMatch(scriptsHtml, /api\('apiDetalharProcesso'/);
  assert.match(scriptsHtml, /Somente esta parte do processo está sendo consultada/);
  assert.match(scriptsHtml, /const schema = Array\.isArray\(detail\.formFields\)/);
  assert.doesNotMatch(scriptsHtml, /internal\.has\(key\) \|\| value === '' \|\| value == null/);
  assert.match(scriptsHtml, /OK documento/);
  assert.match(scriptsHtml, /OK da proposta/);
  assert.match(scriptsHtml, /OK da pendência/);
  assert.match(scriptsHtml, /OK do processo/);
  assert.match(serverSource, /scopeType:\s*'PENDENCIA'/);
  assert.match(stylesHtml, /\.process-ok-panel/);
  assert.match(stylesHtml, /#detail-content\{flex:1 1 auto/);
});

check('cache seguro, resistente e sem recarregar prévias ou abas', () => {
  assert.match(scriptsHtml, /database:\s*'AUTENTIKO_BROWSER_CACHE'/);
  assert.match(scriptsHtml, /globalThis\.indexedDB/);
  assert.match(scriptsHtml, /maxBytes:\s*96 \* 1024 \* 1024/);
  assert.match(scriptsHtml, /documentTtlMs:\s*7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(scriptsHtml, /function cleanupBrowserCache/);
  assert.match(scriptsHtml, /lastAccess/);
  assert.match(scriptsHtml, /autentiko_cache_schema/);
  assert.doesNotMatch(scriptsHtml, /document\.cookie\s*=.*(?:token|password|documento)/i);
  assert.match(scriptsHtml, /function documentFromCache/);
  assert.match(scriptsHtml, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(scriptsHtml, /apiRegistrarAcessoDocumentoCache/);
  assert.match(serverSource, /origem:\s*'CACHE_NAVEGADOR'/);
  assert.match(scriptsHtml, /if \(!rendered\) renderProcessPane/);
  assert.doesNotMatch(scriptsHtml, /state\.processLoadedTabs\.has\(normalized\)\)\s*\{\s*renderProcessPane/);
  assert.match(scriptsHtml, /state\.processTabScroll\.set/);
  assert.match(scriptsHtml, /schemaVersion:\s*'2\.2\.0'/);
  assert.match(scriptsHtml, /canvasToBoundedThumbnailBlob\(canvas, preferredType, 80 \* 1024\)/);
  assert.match(scriptsHtml, /maxWidth = 360/);
  assert.match(scriptsHtml, /maxHeight = 270/);
});

check('prévia PDF persistente possui flag, validação, auditoria e rollback seguro', () => {
  assert.match(serverSource, /PDF_PREVIEW_ENABLED/);
  assert.match(serverSource, /MAX_PDF_SIZE_MB/);
  assert.match(serverSource, /function pdfDoc_previewEnabled_/);
  assert.match(serverSource, /function pdfDoc_maxSizeMb_/);
  assert.match(serverSource, /function pdfDoc_assertPdfName_/);
  assert.match(serverSource, /\\\.pdf\$\/i/);
  assert.match(serverSource, /function pdfDoc_findDuplicate_/);
  assert.match(serverSource, /DUPLICATE_DOCUMENT/);
  assert.match(serverSource, /PDF_SELECIONADO/);
  assert.match(serverSource, /PDF_UPLOAD_INICIADO/);
  assert.match(serverSource, /PDF_UPLOAD_CONCLUIDO/);
  assert.match(serverSource, /PDF_UPLOAD_FALHOU/);
  assert.match(serverSource, /PDF_VISUALIZADO/);
  assert.match(serverSource, /PDF_DOWNLOAD_REALIZADO/);
  assert.match(serverSource, /PDF_REMOVIDO/);
  assert.match(serverSource, /PDF_ACESSO_NEGADO/);
  assert.match(serverSource, /bytes\.length > 90 \* 1024/);
  assert.match(serverSource, /THUMBNAIL_TOO_LARGE/);
  assert.match(serverSource, /MEDIA_CLOUD_ENABLED/);
  assert.match(serverSource, /MEDIA_MAX_PDF_SOURCE_MB/);
  assert.match(serverSource, /apiCriarTicketMidia/);
  assert.match(serverSource, /apiReservarUploadNuvem/);
  assert.match(serverSource, /apiFinalizarUploadNuvem/);
  assert.match(scriptsHtml, /runCloudUploadJob/);
  assert.match(scriptsHtml, /'x-signature': target\.uploadToken/);
  assert.match(scriptsHtml, /chunkSize: 6 \* 1024 \* 1024/);
  assert.match(scriptsHtml, /uploadDataDuringCreation: true/);
  assert.match(scriptsHtml, /rangeChunkSize:64 \* 1024/);
  assert.doesNotMatch(serverSource, /bytes\.length <= 768 \* 1024/);
  assert.match(serverSource, /pdfDoc_assertPreviewEnabled_\(document\.MIME_TYPE\)/);
  assert.match(scriptsHtml, /const pdfPreviewEnabled/);
  assert.match(scriptsHtml, /async function hasPdfSignature/);
  assert.match(scriptsHtml, /signature\.includes\('%PDF-'\)/);
  assert.match(scriptsHtml, /data-preview-open-tab/);
  assert.match(scriptsHtml, /function openPreviewInNewTab/);
  assert.match(scriptsHtml, /previewReturnFocus/);
  assert.match(scriptsHtml, /data-delete-doc/);
  assert.match(scriptsHtml, /function removeStoredDocument/);
  assert.match(indexHtml, /id="preview-open-tab-btn"/);
  assert.doesNotMatch(serverSource, /\.setSharing\(|DriveApp\.Access\.ANYONE|ANYONE_WITH_LINK/);
  assert.ok(fs.existsSync(path.join(projectDir, 'AUDITORIA_PREVIEW_PDF.md')));
  assert.ok(fs.existsSync(path.join(projectDir, 'ROLLBACK_PREVIEW_PDF.md')));
});

check('WebP e AVIF condicionais preservam resolução e possuem fallback', () => {
  assert.match(scriptsHtml, /function optimizeDocumentImage/);
  assert.match(scriptsHtml, /canvas\.width = decoded\.width/);
  assert.match(scriptsHtml, /canvas\.height = decoded\.height/);
  assert.match(scriptsHtml, /image\/avif/);
  assert.match(scriptsHtml, /image\/webp/);
  assert.match(scriptsHtml, /blob\.size <= file\.size \* \(1 - format\.minimumSaving\)/);
  assert.match(scriptsHtml, /return result;\s*\}\s*finally\s*\{\s*decoded\?\.close\(\)/);
  assert.match(serverSource, /AUT_DOCUMENT_PREVIEW_MIME_TYPES = \['application\/pdf', 'image\/jpeg', 'image\/png', 'image\/webp', 'image\/avif'\]/);
  assert.match(serverSource, /\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/avif'\]\.forEach/);
});

check('ações visuais respeitam a responsabilidade atual do processo', () => {
  assert.match(serverSource, /function autCanActOnProcess_/);
  assert.match(serverSource, /function autCanEditProcessRegistration_/);
  assert.match(serverSource, /function autCanManageProcessDocuments_/);
  assert.match(serverSource, /NOT_CURRENT_RESPONSIBLE/);
  assert.match(serverSource, /upload:\s*autCanManageProcessDocuments_/);
  assert.match(serverSource, /activity:\s*autHasPermission_\(user, 'ATUACAO_CRIAR'\).*canAct/);
  assert.match(scriptsHtml, /capabilities\.activity/);
  assert.match(scriptsHtml, /async function openWorkflowAction/);
  assert.match(scriptsHtml, /action === 'pend'.*!state\.processLoadedTabs\.has\('documents'\)/);
  assert.match(indexHtml, /id="proposal-accept-modal"/);
  assert.match(indexHtml, /id="proposal-accept-form"/);
  assert.match(scriptsHtml, /function submitProposalAcceptance/);
  assert.doesNotMatch(scriptsHtml, /Informe o ID da evidência conferida/);
});

check('hierarquia gerencial, sinal de roteamento e rascunho protegido', () => {
  assert.match(serverSource, /GERENTE_GERAL/);
  assert.match(serverSource, /function apiEnviarGerenteGeral/);
  assert.match(serverSource, /function apiIniciarAnaliseGerenteGeral/);
  assert.match(serverSource, /AGUARDANDO_GERENTE_GERAL/);
  assert.match(serverSource, /function autIsProcessExecutive_/);
  assert.match(serverSource, /routing:\s*routing/);
  assert.match(scriptsHtml, /sendGeneralManager/);
  assert.match(scriptsHtml, /SHORT_PROCESS_DRAFT_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(scriptsHtml, /function saveShortProcessDraft/);
  assert.match(scriptsHtml, /function readShortProcessDraft/);
  assert.match(scriptsHtml, /Esta janela não fecha ao clicar fora/);
  assert.match(indexHtml, /id="process-draft-status"/);
});

check('correções preventivas de desempenho, e-mail, privacidade e transições', () => {
  assert.match(serverSource, /var AUTENTIKO_DB_INSTANCE_\s*=\s*null/);
  assert.match(serverSource, /if \(!AUTENTIKO_DB_INSTANCE_\)/);
  assert.match(serverSource, /AUTENTIKO_SHEET_INSTANCES_\[name\]/);
  assert.match(serverSource, /function autRowsBy_/);
  assert.match(serverSource, /\.createTextFinder\(target\)[\s\S]*\.findAll\(\)/);
  assert.match(serverSource, /getRangeList\(/);
  assert.match(serverSource, /subject:\s*'Palmer Imóveis — código AUTENTIKO'/);
  assert.match(serverSource, /replyTo:\s*String\(emailConfig\.EMPRESA_EMAIL_COMERCIAL/);
  assert.match(serverSource, /autUpdateRow_\('TOKENS_EMAIL', prepared\.tokenRow, \{ USADO_EM: autNow_\(\) \}\)/);
  assert.match(serverSource, /cache\.remove\(prepared\.tokenCacheKey\)/);
  assert.match(serverSource, /function autAssertExpectedVersion_/);
  assert.match(serverSource, /var maxEncodedLength = Math\.ceil\(AUTENTIKO\.MAX_UPLOAD_MB/);
  assert.match(serverSource, /file && !committed/);
  assert.match(scriptsHtml, /navigator\.permissions\.query\(\{name:'geolocation'\}\)/);
  assert.match(scriptsHtml, /permission\.state !== 'granted'/);
  assert.doesNotMatch(scriptsHtml, /function requestLocation\(\)\s*\{\s*if \(!navigator\.geolocation\) return;\s*navigator\.geolocation\.getCurrentPosition/s);
  assert.match(serverSource, /ASSISTENTE_ADMINISTRATIVO:\s*\[\s*'PROCESSO_EDITAR'/);
  assert.doesNotMatch(serverSource, /if \(role === 'ASSISTENTE_ADMINISTRATIVO'\) return/);
  assert.match(serverSource, /function autClaimRequest_/);
  assert.match(serverSource, /DUPLICATE_REQUEST/);
  assert.match(serverSource, /autCommitRequest_\(requestKey\)/);
  assert.match(scriptsHtml, /const apiInFlight = new Map\(\)/);
  assert.match(scriptsHtml, /if \(apiInFlight\.has\(originalKey\)\)/);
  assert.match(serverSource, /ACEITES_ELETRONICOS/);
  assert.match(serverSource, /PROCESSO_PARTICIPANTES/);
  assert.match(serverSource, /PROPOSTA_CONDICOES/);
  assert.match(serverSource, /MODELOS_CONTRATO/);
  assert.match(serverSource, /HASH_MANIFESTO/);
  assert.match(serverSource, /HtmlService\.createHtmlOutput\(html\)\.getAs\(MimeType\.PDF\)/);
  assert.match(scriptsHtml, /data-add-participant/);
  assert.match(scriptsHtml, /data-approve-all-categories/);
  assert.match(indexHtml, /id="contracts-view"/);
});

console.log(`\n${checks} grupos de auditoria estática concluídos com sucesso.`);
