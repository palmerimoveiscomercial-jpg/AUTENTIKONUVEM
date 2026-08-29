# Rollback — pré-visualização persistente de PDFs

## Desativação imediata sem remover código

1. Na aba `CONFIGURACOES`, localizar `PDF_PREVIEW_ENABLED`.
2. Alterar `VALOR` para `NAO`.
3. Executar a rotina administrativa já existente que invalida o cache, ou aguardar até 60 segundos.
4. Recarregar o Web App.

Resultado esperado:

- botões de prévia de PDF ficam ocultos;
- miniaturas e chunks de PDF deixam de ser chamados pela interface;
- APIs de prévia de PDF recusam a operação;
- imagens, login, processos, uploads e downloads continuam funcionando;
- nenhum documento ou metadado é removido.

## Reversão integral antes de implantação

A cópia de segurança verificada está em:

`C:\CODEX\AUDITORIA\autentiko_vistorias_codex\backup_autentiko_pdf_2026-07-24_1209`

Para restaurar:

1. interromper qualquer edição no diretório atual;
2. guardar uma cópia do estado que será substituído;
3. copiar os 26 arquivos do backup para o diretório `autentiko-ok-nuvem`;
4. executar `node tests/static-audit.mjs`;
5. executar `node tests/smoke.mjs`;
6. confirmar que a versão voltou a 2.1.6.

## Reversão depois de uma implantação controlada

1. desativar primeiro `PDF_PREVIEW_ENABLED`;
2. selecionar no Apps Script a implantação estável imediatamente anterior;
3. não apagar linhas de `PROCESSO_DOCUMENTOS`, `AUDITORIA` ou arquivos do Drive;
4. manter as configurações novas — versões anteriores simplesmente as ignoram;
5. executar diagnóstico e teste de login;
6. somente depois, se necessário, publicar a versão anterior na mesma implantação.

As novas configurações e os eventos `PDF_*` são aditivos. Não é necessário excluir dados para voltar ao código anterior.

## Dados que nunca devem ser apagados no rollback

- arquivos físicos no Drive;
- registros de `PROCESSO_DOCUMENTOS`;
- cadeia da aba `AUDITORIA`;
- processos, participantes, propostas e contratos;
- IDs da planilha, pasta ou implantação.

## Validação pós-rollback

- login e recuperação;
- bootstrap e painel;
- abertura do processo;
- aba Documentos;
- download de PDF;
- upload de imagem e PDF;
- contratos;
- verificação da cadeia de auditoria.
