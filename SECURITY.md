# Segurança

## Credenciais

Uma senha com aparência real foi publicada anteriormente no histórico deste
repositório. Tornar o repositório privado não invalida cópias ou clones já
existentes. Essa credencial deve ser considerada comprometida e trocada em todos
os ambientes onde tenha sido reutilizada.

Não abra um incidente público contendo o valor. A rotação deve ser confirmada
internamente pela Palmer Imóveis.

## Comunicação de vulnerabilidades

Não registre dados pessoais, conteúdo de documentos, tokens, URLs assinadas ou
credenciais em issues, logs, commits ou mensagens de erro.

## Controles do módulo de mídia

- buckets privados e URLs com expiração;
- tickets HMAC sem o token de sessão do AUTENTIKO;
- chaves imutáveis por documento, versão e hash;
- validação de tamanho, MIME e SHA-256;
- original preservado; prévias e otimizados são objetos derivados;
- feature flags desligadas durante a implantação.
