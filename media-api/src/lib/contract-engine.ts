import {ApiError} from './errors';

type JsonMap = Record<string, unknown>;

export type ContractFinding = {
  code: string;
  severity: 'BLOCKER' | 'WARNING';
  message: string;
};

export type ContractValidation = {
  valid: boolean;
  findings: ContractFinding[];
};

function asMap(value: unknown): JsonMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonMap : {};
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value).trim();
    if (text) return text;
  }
  return '';
}

function htmlEscape(value: unknown): string {
  return asText(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] || character);
}

function normalizedKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function fieldMap(context: JsonMap, contractNumber: string): Record<string, string> {
  const process = asMap(context.process);
  const data = asMap(context.data);
  const property = asMap(context.property);
  const proposal = asMap(context.proposal);
  const company = asMap(context.company);
  const model = asMap(context.contractModel);
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const text = asText(value).trim();
    if (text) fields[normalizedKey(key)] = text;
  }
  Object.assign(fields, {
    PROTOCOLO_ID: firstText(process.protocol, process.PROTOCOLO),
    CONTRATO_ID: contractNumber,
    VERSAO: firstText(model.version, process.version, 1),
    TITULO_INSTRUMENTO: firstText(model.title, model.name, 'CONTRATO'),
    EMPRESA_RAZAO_SOCIAL: firstText(company.EMPRESA_NOME, company.empresaNome, company.name),
    EMPRESA_CNPJ: firstText(company.EMPRESA_CNPJ, company.empresaCnpj, company.document),
    EMPRESA_ENDERECO: firstText(company.EMPRESA_ENDERECO, company.empresaEndereco, company.address),
    EMPRESA_CONTATOS: firstText(company.EMPRESA_EMAIL_COMERCIAL, company.EMPRESA_EMAIL, company.email),
    EMPRESA_CRECI_JURIDICO: firstText(company.EMPRESA_CRECI, company.creci),
    IMOVEL_ID: firstText(property.id, process.propertyCode, process.IMOVEL_CODIGO),
    IMOVEL_ENDERECO_COMPLETO: firstText(property.address, process.propertyAddress, process.IMOVEL_ENDERECO),
    IMOVEL_MATRICULA: firstText(property.registration, property.matricula, data.imovel_matricula),
    ENERGIA_UC: firstText(data.energia_uc, data.uc, property.energyUc),
    ENERGIA_DISTRIBUIDORA: firstText(data.energia_distribuidora, data.distribuidora_energia),
    ALUGUEL_VALOR: firstText(proposal.acceptedValue, proposal.negotiatedValue, data.aluguel_valor),
    PRAZO_MESES: firstText(data.prazo_meses, data.locacao_prazo_meses),
    DATA_INICIO_EXTENSO: firstText(data.data_inicio_extenso, data.locacao_inicio),
    DATA_TERMINO_EXTENSO: firstText(data.data_termino_extenso, data.locacao_termino),
    VENCIMENTO_DIA: firstText(data.vencimento_dia, data.aluguel_vencimento_dia),
    PRIMEIRO_VENCIMENTO: firstText(data.primeiro_vencimento)
  });
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => Boolean(value)));
}

export function replaceContractPlaceholders(
  template: string,
  fields: Record<string, string>
): {text: string; missing: string[]} {
  const missing = new Set<string>();
  let output = template.replace(/\{\{#IF_([A-Z0-9_]+)\}\}([\s\S]*?)\{\{\/IF_\1\}\}/g, (_all, key: string, content: string) =>
    fields[key] ? content : '');
  output = output.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_all, key: string) => {
    if (!fields[key]) {
      missing.add(key);
      return `[DADO NÃO VALIDADO: ${key}]`;
    }
    return fields[key];
  });
  return {text: output, missing: [...missing].sort()};
}

export function validateContractContext(context: JsonMap, final: boolean): ContractValidation {
  const findings: ContractFinding[] = [];
  const process = asMap(context.process);
  const proposal = asMap(context.proposal);
  const model = asMap(context.contractModel);
  const participants = Array.isArray(context.participants) ? context.participants.map(asMap) : [];
  const clauses = Array.isArray(model.clauses) ? model.clauses.map(asMap) : [];
  if (!firstText(process.id, process.ID_PROCESSO)) {
    findings.push({code: 'PROCESS_ID_REQUIRED', severity: 'BLOCKER', message: 'O processo não possui identificador validado.'});
  }
  if (!firstText(process.protocol, process.PROTOCOLO)) {
    findings.push({code: 'PROTOCOL_REQUIRED', severity: 'BLOCKER', message: 'O protocolo não foi informado.'});
  }
  if (!firstText(proposal.id, proposal.ID_PROPOSTA)) {
    findings.push({code: 'ACCEPTED_PROPOSAL_REQUIRED', severity: 'BLOCKER', message: 'Não há proposta aceita vinculada.'});
  }
  const proposalStatus = firstText(proposal.status, proposal.STATUS).toUpperCase();
  if (proposalStatus && proposalStatus !== 'ACEITA') {
    findings.push({code: 'PROPOSAL_NOT_ACCEPTED', severity: 'BLOCKER', message: 'A proposta vinculada ainda não está aceita.'});
  }
  if (!participants.length) {
    findings.push({code: 'PARTICIPANTS_REQUIRED', severity: 'BLOCKER', message: 'As partes contratuais não foram sincronizadas.'});
  }
  if (!clauses.length) {
    findings.push({code: 'CLAUSES_REQUIRED', severity: 'BLOCKER', message: 'O modelo não possui cláusulas ativas sincronizadas.'});
  }
  if (final && firstText(model.legalStatus, model.STATUS_JURIDICO) !== 'APROVADO_JURIDICO') {
    findings.push({code: 'LEGAL_REVIEW_REQUIRED', severity: 'BLOCKER', message: 'O modelo ainda não possui aprovação jurídica.'});
  }
  if (final) {
    const witnesses = participants.filter((participant) => {
      const roles = Array.isArray(participant.roles) ? participant.roles :
        Array.isArray(participant.papeis) ? participant.papeis : [];
      return roles.map((role) => asText(role).toUpperCase()).includes('TESTEMUNHA');
    });
    if (witnesses.length < 2) {
      findings.push({code: 'WITNESSES_REQUIRED', severity: 'BLOCKER', message: 'A emissão final exige duas testemunhas.'});
    }
  }
  return {valid: !findings.some((finding) => finding.severity === 'BLOCKER'), findings};
}

export function renderContractHtml(context: JsonMap, contractNumber: string, final: boolean): {
  html: string;
  findings: ContractFinding[];
} {
  const validation = validateContractContext(context, final);
  if (!validation.valid) {
    throw new ApiError(409, 'CONTRACT_VALIDATION_FAILED', validation.findings.map((item) => item.message).join(' '));
  }
  const process = asMap(context.process);
  const company = asMap(context.company);
  const model = asMap(context.contractModel);
  const participants = Array.isArray(context.participants) ? context.participants.map(asMap) : [];
  const clauses = Array.isArray(model.clauses) ? model.clauses.map(asMap) : [];
  const fields = fieldMap(context, contractNumber);
  const findings = [...validation.findings];
  const renderedClauses = clauses.map((clause, index) => {
    const rendered = replaceContractPlaceholders(firstText(clause.text, clause.TEXTO), fields);
    for (const key of rendered.missing) {
      findings.push({code: `FIELD_MISSING_${key}`, severity: final ? 'BLOCKER' : 'WARNING', message: `O campo ${key} não foi validado.`});
    }
    return `<article class="clause"><h2>CLÁUSULA ${index + 1}ª — ${htmlEscape(firstText(clause.title, clause.TITULO))}</h2><p>${htmlEscape(rendered.text)}</p></article>`;
  }).join('');
  if (final && findings.some((finding) => finding.severity === 'BLOCKER')) {
    throw new ApiError(409, 'CONTRACT_FIELDS_MISSING', 'A versão final possui campos obrigatórios não validados.');
  }
  const partyRows = participants.map((participant) => `<tr><td>${htmlEscape(firstText(participant.name, participant.nome, participant.NOME_RAZAO_SOCIAL))}</td><td>${htmlEscape(firstText(participant.document, participant.documento, participant.CPF_CNPJ))}</td><td>${htmlEscape((Array.isArray(participant.roles) ? participant.roles : []).join(', '))}</td></tr>`).join('');
  const title = firstText(model.title, model.name, 'Contrato');
  const draftBanner = final ? '' : '<div class="draft">MINUTA — NÃO ASSINAR COMO VERSÃO FINAL</div>';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>@page{size:A4;margin:20mm 16mm 22mm}*{box-sizing:border-box}body{color:#172033;font:11pt/1.45 "Times New Roman",serif;margin:0}.draft{background:#b42318;color:#fff;font:bold 9pt Arial;padding:6px;text-align:center}header{border-bottom:2px solid #155eef;margin-bottom:7mm;padding:5mm 0;text-align:center}header h1{font-size:13pt;margin:0;text-transform:uppercase}header p{font-size:9pt;margin:2mm 0 0}.section-title,.clause h2{background:#eef4ff;border-left:3px solid #155eef;font-size:11pt;padding:2mm 3mm;text-transform:uppercase}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cfd6e4;padding:2mm}.clause{break-inside:avoid;margin:0 0 4mm;text-align:justify}.clause p{white-space:pre-wrap}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:15mm 10mm;margin-top:20mm}.signature{border-top:1px solid #172033;padding-top:2mm;text-align:center}footer{border-top:1px solid #cfd6e4;color:#667085;font-size:8pt;margin-top:10mm;padding-top:2mm;text-align:center}</style></head><body>${draftBanner}<header><h1>${htmlEscape(title)}</h1><p>${htmlEscape(firstText(company.EMPRESA_NOME, company.name))} · Protocolo ${htmlEscape(firstText(process.protocol, process.PROTOCOLO))} · ${htmlEscape(contractNumber)}</p></header><h2 class="section-title">Partes</h2><table><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Papel</th></tr></thead><tbody>${partyRows}</tbody></table><h2 class="section-title">Cláusulas contratuais</h2>${renderedClauses}<h2 class="section-title">Assinaturas</h2><div class="signatures">${participants.map((participant) => `<div class="signature">${htmlEscape(firstText(participant.name, participant.nome, participant.NOME_RAZAO_SOCIAL))}</div>`).join('')}</div><footer>${htmlEscape(firstText(company.EMPRESA_NOME, company.name))} · ${htmlEscape(firstText(company.EMPRESA_ENDERECO, company.address))}</footer></body></html>`;
  return {html, findings};
}
