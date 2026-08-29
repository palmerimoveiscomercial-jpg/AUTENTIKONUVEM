const baseUrl = process.argv[2] || process.env.AUT_DATA_PUBLIC_URL || 'https://autentikonuvem.vercel.app';
const apiKey = process.env.AUT_DATA_API_KEY || '';

async function readResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {raw: text.slice(0, 1000)};
  }
}

async function testHealth() {
  const response = await fetch(`${baseUrl}/api/health?deep=1`, {
    headers: {Accept: 'application/json'},
    signal: AbortSignal.timeout(30_000)
  });
  const body = await readResponse(response);
  console.log(`HEALTH HTTP ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exitCode = 1;
}

async function testAi(provider) {
  const response = await fetch(`${baseUrl}/api/v1/ai/analyze`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Autentiko-Api-Key': apiKey
    },
    body: JSON.stringify({
      requestId: `powershell-${provider.toLowerCase()}-${Date.now()}`,
      provider,
      requestedBy: 'powershell-test',
      instruction: 'Analise os fatos e responda com um resumo curto em JSON.',
      facts: {
        tipo: 'teste de integração',
        valor: 1000,
        prazo_dias: 30,
        observacao: 'Teste controlado sem dados pessoais.'
      }
    }),
    signal: AbortSignal.timeout(60_000)
  });
  const body = await readResponse(response);
  console.log(`\n${provider} HTTP ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exitCode = 1;
}

if (!apiKey) {
  console.error('AUT_DATA_API_KEY não foi carregada do Vercel.');
  process.exit(1);
}

await testHealth();
await testAi('GEMINI');
await testAi('OPENROUTER');
