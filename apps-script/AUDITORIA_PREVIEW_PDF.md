# Auditoria técnica — pré-visualização persistente de PDFs

Data da análise: 24/07/2026
Versão auditada: 2.1.6
Escopo: projeto local `autentiko-ok-nuvem`
Implantação em produção: não autorizada nesta entrega

## 1. Arquitetura encontrada

O AUTENTIKO é um Web App do Google Apps Script composto por:

- backend modular em arquivos `.gs`;
- frontend servido pelo HTML Service (`Index.html`, `Scripts.html` e `Styles.html`);
- Google Sheets como banco de metadados;
- Google Drive privado como armazenamento físico;
- autenticação própria, sessões com token armazenado somente como hash e permissões verificadas no servidor;
- APIs chamadas por `google.script.run`, com envelope uniforme `{ok, data}` ou `{ok:false, code, message}`;
- auditoria encadeada por SHA-256 na aba `AUDITORIA`;
- cache de servidor para configurações/catálogos e cache de navegador IndexedDB para documentos e miniaturas.

`doGet()` somente monta o HTML. A leitura de dados exige sessão válida no AUTENTIKO, apesar de a tela de login ser publicamente acessível pela URL do Web App.

## 2. Arquivos e módulos relacionados

- `Code.gs`: `doGet`, includes, bootstrap público e autenticado.
- `Config.gs`: versão, permissões, abas/cabeçalhos e configurações públicas.
- `Setup.gs`: instalação e migrações idempotentes.
- `AuthService.gs`: login, sessão e autorização.
- `DataService.gs`: acesso por nome de cabeçalho, cache e idempotência.
- `ProcessService.gs`: upload, Drive, metadados, download, chunks, miniaturas, prévia e exclusão lógica.
- `AuditService.gs`: cadeia de auditoria.
- `Index.html`: modal de pré-visualização.
- `Scripts.html`: seleção, prévia local, fila de upload, PDF.js, cache IndexedDB e modal persistente.
- `Styles.html`: identidade visual e responsividade.
- `tests/static-audit.mjs`: auditoria estática e regressão de interface.
- `tests/smoke.mjs`: integração simulada do Apps Script/Sheets/Drive.

## 3. Estrutura existente reutilizada

Não será criada a aba `DOCUMENTOS_PDF`, porque a aba normalizada `PROCESSO_DOCUMENTOS` já atende ao vínculo entre arquivo e processo. Ela registra:

- `ID_DOCUMENTO`, `ID_PROCESSO`, `PROTOCOLO`;
- tipo e nome documental;
- `ARQUIVO_ID`, nome, MIME e tamanho;
- hash SHA-256, versão e obrigatoriedade;
- usuário, contexto, datas, conferência, substituição, exclusão lógica e versão do registro.

O arquivo físico permanece no Drive; PDF, imagem e Base64 não são gravados em células. A pasta raiz existente e a subpasta idempotente por protocolo são preservadas.

Funções reutilizadas:

- `autStoreDocument_`;
- `autProcessFolder_`;
- `autResolveStoredDocumentFile_`;
- `apiPrepararDocumento`;
- `apiLerChunkDocumento`;
- `apiMiniaturaDocumento`;
- `apiBaixarDocumento`;
- `apiExcluirDocumento`;
- `autRequireAuth_`, `autRequireProcess_` e `autHasPermission_`;
- `autClaimRequest_`, `autAssertExpectedVersion_` e `LockService`;
- `autAudit_`;
- cache IndexedDB, `fetchStoredDocument`, `loadPdfJs` e `previewStoredDocument`.

## 4. Verificações estruturais

- 11 arquivos `.gs` e 251 funções globais auditadas.
- Nenhuma função global duplicada.
- 125 IDs HTML estáticos; nenhum ID duplicado.
- 50 APIs chamadas pela interface; nenhuma API ausente no servidor.
- Nenhuma chamada que torne arquivo/pasta público (`setSharing`, `ANYONE` ou equivalente).
- Nenhum `FILE_ID` arbitrário é aceito para leitura: a API recebe `ID_DOCUMENTO`, consulta os metadados e valida o processo.
- Escritas em planilha são realizadas por nome de cabeçalho.
- Upload usa arquivo físico no Drive e metadados no Sheets.
- Prévia persistente é sob demanda, por PDF.js, recebendo blocos autenticados de 384 KB.
- Cache do navegador é segmentado por usuário, limitado, possui TTL/LRU e verifica o hash antes de reutilizar o conteúdo.
- URLs locais são revogadas e o documento PDF.js é destruído ao fechar.
- A fila de upload limita a duas transferências simultâneas.
- A dependência PDF.js já existente é carregada por HTTPS do jsDelivr. Ela continuará isolada à visualização; falha da CDN não afeta login, processos, download ou uploads.

## 5. Riscos identificados

1. A prévia já existia, mas não possuía feature flag central.
2. O limite de PDF usava apenas o limite genérico de upload.
3. O backend validava MIME e assinatura `%PDF-`, mas não exigia extensão `.pdf`.
4. Não havia bloqueio por hash para PDF duplicado no mesmo processo.
5. A auditoria usava eventos documentais genéricos, sem os eventos `PDF_*` solicitados.
6. Miniaturas de PDF podiam ser solicitadas automaticamente mesmo que uma futura flag desativasse a prévia.
7. O modal não restaurava explicitamente o foco no controle que o abriu.
8. A listagem não expunha a exclusão lógica para os usuários já autorizados pela API.
9. A abertura em nova guia não estava disponível para o Blob autenticado já carregado.
10. O carregamento do PDF.js depende de CDN; em rede bloqueada a prévia falha, mas o download autenticado continua disponível.

## 6. Estratégia escolhida

- evolução incremental da versão 2.1.6;
- preservação de todas as assinaturas de API;
- nenhuma nova aba e nenhuma alteração destrutiva;
- configurações idempotentes `PDF_PREVIEW_ENABLED` e `MAX_PDF_SIZE_MB`;
- validação PDF específica no cliente e no servidor;
- detecção por hash antes da criação e nova checagem sob lock antes da gravação dos metadados;
- manutenção do arquivo privado no Drive;
- manutenção da transferência autenticada por chunks e cache IndexedDB;
- eventos `PDF_*` adicionais, preservando os eventos documentais existentes;
- feature flag aplicada no servidor e na interface;
- prévia e miniatura de PDF nunca carregadas automaticamente quando a flag estiver desligada;
- download continua disponível com a flag desligada;
- restauração de foco e abertura do Blob em nova guia;
- exclusão somente lógica, reaproveitando as regras existentes.

## 7. Arquivos previstos para modificação

- `Config.gs`
- `Setup.gs`
- `Utils.gs`
- `ProcessService.gs`
- `Index.html`
- `Scripts.html`
- `tests/static-audit.mjs`
- `tests/smoke.mjs`

## 8. Novos arquivos

- `AUDITORIA_PREVIEW_PDF.md`
- `ROLLBACK_PREVIEW_PDF.md`
- `RELATORIO_IMPLEMENTACAO_PREVIEW_PDF.md` (ao final)

## 9. Plano de testes

- repetir integralmente os testes existentes;
- validar flag ligada/desligada;
- PDF válido, vazio, falso, extensão incorreta, limite e duplicidade;
- nome sanitizado;
- sessão/permissão/processo inexistente;
- falhas simuladas de Drive e Sheets;
- idempotência, clique duplo e concorrência;
- leitura por chunks, arquivo inexistente/excluído/removido do Drive;
- auditoria de upload, visualização, download, remoção e acesso negado;
- abertura/fechamento do modal, limpeza e foco;
- ausência de carregamento automático quando a flag estiver desligada;
- regressão de login, bootstrap, painel, processos, imagens, contratos, filtros e auditoria.

## 10. Rollback

O rollback detalhado está em `ROLLBACK_PREVIEW_PDF.md`. O mecanismo imediato é definir `PDF_PREVIEW_ENABLED` como `NAO`; o download e o restante do sistema permanecem operacionais. Para reversão integral do código, restaurar a cópia verificada:

`C:\CODEX\AUDITORIA\autentiko_vistorias_codex\backup_autentiko_pdf_2026-07-24_1209`

Nenhuma implantação foi realizada durante esta auditoria.
