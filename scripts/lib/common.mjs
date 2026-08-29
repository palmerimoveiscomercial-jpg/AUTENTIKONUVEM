import 'dotenv/config';
import {createHash, createSign} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

export const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: {persistSession: false, autoRefreshToken: false}
});

export function log(event, details = {}) {
  const safe = Object.fromEntries(Object.entries(details).filter(([key]) =>
    !/name|email|url|content|token|secret/i.test(key)
  ));
  console.log(JSON.stringify({time:new Date().toISOString(), event, ...safe}));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function safeSegment(value) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized) || normalized.includes('..')) {
    throw new Error('OBJECT_PATH_INVALID');
  }
  return normalized;
}

export function objectPath(row, hash, role, mimeType) {
  const extensions = {
    'application/pdf':'pdf',
    'image/jpeg':'jpg',
    'image/png':'png',
    'image/webp':'webp',
    'image/avif':'avif'
  };
  const extension = extensions[mimeType];
  if (!extension) throw new Error('MIME_NOT_ALLOWED');
  return [
    safeSegment(row.ID_PROCESSO),
    safeSegment(row.ID_DOCUMENTO),
    `v${Math.max(Number(row.MEDIA_VERSAO || row.VERSAO || 1), 1)}`,
    hash,
    `${role}.${extension}`
  ].join('/');
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

let googleTokenCache;

export async function googleAccessToken() {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60000) return googleTokenCache.token;
  const credentials = JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (!credentials.client_email || !credentials.private_key) throw new Error('GOOGLE_CREDENTIALS_INVALID');
  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = base64Url(JSON.stringify({alg:'RS256', typ:'JWT'}));
  const assertionPayload = base64Url(JSON.stringify({
    iss:credentials.client_email,
    scope:[
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ].join(' '),
    aud:credentials.token_uri || 'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now + 3600
  }));
  const unsigned = `${assertionHeader}.${assertionPayload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
  const response = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error('GOOGLE_AUTH_FAILED');
  googleTokenCache = {token:payload.access_token, expiresAt:Date.now() + Number(payload.expires_in || 3600) * 1000};
  return googleTokenCache.token;
}

export async function googleFetch(url, options = {}) {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    ...options,
    headers:{Authorization:`Bearer ${token}`, ...(options.headers || {})}
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GOOGLE_API_FAILED:${response.status}:${text.slice(0, 160)}`);
  }
  return response;
}

export async function sheetRows() {
  const spreadsheetId = required('AUTENTIKO_SPREADSHEET_ID');
  const range = encodeURIComponent('PROCESSO_DOCUMENTOS!A:AZ');
  const response = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS`);
  const payload = await response.json();
  const values = payload.values || [];
  const headers = values[0] || [];
  return {
    headers,
    rows:values.slice(1).map((values, index) => ({
      _row:index + 2,
      ...Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']))
    }))
  };
}

function columnLetters(column) {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export async function updateSheetRow(headers, rowNumber, patch) {
  const spreadsheetId = required('AUTENTIKO_SPREADSHEET_ID');
  const data = [];
  for (const [key, value] of Object.entries(patch)) {
    const index = headers.indexOf(key);
    if (index < 0) continue;
    data.push({
      range:`PROCESSO_DOCUMENTOS!${columnLetters(index + 1)}${rowNumber}`,
      values:[[value]]
    });
  }
  if (!data.length) return;
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({valueInputOption:'RAW', data})
  });
}

export async function driveDownload(fileId) {
  const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  return Buffer.from(await response.arrayBuffer());
}

export async function driveFindOrCreateFolder(parentId, folderName) {
  const escaped = String(folderName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = encodeURIComponent(`'${parentId}' in parents and name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const foundResponse = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`);
  const found = await foundResponse.json();
  if (found.files?.[0]?.id) return found.files[0].id;
  const createdResponse = await googleFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      name:String(folderName).slice(0, 120),
      mimeType:'application/vnd.google-apps.folder',
      parents:[parentId]
    })
  });
  return (await createdResponse.json()).id;
}

export async function driveUpload(parentId, fileName, mimeType, buffer) {
  const boundary = `autentiko-${Date.now()}`;
  const metadata = Buffer.from(JSON.stringify({
    name:String(fileName).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180),
    parents:[parentId]
  }));
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    metadata,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const response = await googleFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method:'POST',
    headers:{'Content-Type':`multipart/related; boundary=${boundary}`},
    body
  });
  return (await response.json()).id;
}

export async function storageObjectExists(bucket, key) {
  const slash = key.lastIndexOf('/');
  const prefix = key.slice(0, slash);
  const name = key.slice(slash + 1);
  const {data, error} = await supabase.storage.from(bucket).list(prefix, {search:name, limit:10});
  if (error) throw error;
  return Boolean(data?.some((item) => item.name === name));
}

export async function uploadImmutable(bucket, key, buffer, mimeType) {
  if (await storageObjectExists(bucket, key)) return;
  const {error} = await supabase.storage.from(bucket).upload(key, buffer, {
    contentType:mimeType,
    cacheControl:bucket === 'autentiko-thumbnails' ? '604800' : '3600',
    upsert:false
  });
  if (error) throw error;
}

export async function downloadStorage(bucket, key) {
  const {data, error} = await supabase.storage.from(bucket).download(key);
  if (error || !data) throw error || new Error('STORAGE_DOWNLOAD_FAILED');
  return Buffer.from(await data.arrayBuffer());
}

async function boundedThumbnail(input) {
  let width = 360;
  let quality = 82;
  let best;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = await sharp(input, {failOn:'none'})
      .rotate()
      .resize({width, height:270, fit:'inside', withoutEnlargement:true})
      .flatten({background:'#ffffff'})
      .webp({quality, smartSubsample:true})
      .toBuffer();
    if (!best || candidate.length < best.length) best = candidate;
    if (candidate.length <= 80 * 1024) return candidate;
    if (quality > 48) quality -= 7;
    else width = Math.max(120, Math.floor(width * .82));
  }
  if (best?.length <= 80 * 1024) return best;
  throw new Error('THUMBNAIL_TOO_LARGE');
}

export async function makeThumbnail(buffer, mimeType) {
  if (mimeType !== 'application/pdf') return boundedThumbnail(buffer);
  const directory = await mkdtemp(path.join(tmpdir(), 'autentiko-thumb-'));
  const input = path.join(directory, 'input.pdf');
  const output = path.join(directory, 'page');
  try {
    await writeFile(input, buffer);
    await execFileAsync('pdftoppm', [
      '-f','1','-singlefile','-scale-to-x','720','-scale-to-y','540','-png',input,output
    ], {timeout:60000, windowsHide:true});
    return await boundedThumbnail(await readFile(`${output}.png`));
  } finally {
    await rm(directory, {recursive:true, force:true});
  }
}

export async function registerMedia(row, original, thumbnail) {
  const version = Math.max(Number(row.MEDIA_VERSAO || row.VERSAO || 1), 1);
  const {error:documentError} = await supabase.from('media_documents').upsert({
    document_id:row.ID_DOCUMENTO,
    process_id:row.ID_PROCESSO,
    version,
    mime_type:row.MIME_TYPE,
    size_bytes:original.buffer.length,
    sha256:original.hash,
    drive_file_id:row.ARQUIVO_ID || null,
    media_status:'READY',
    sync_state:'SYNCHRONIZED',
    last_error_code:null,
    updated_at:new Date().toISOString()
  }, {onConflict:'document_id,version'});
  if (documentError) throw documentError;
  const objects = [{
    document_id:row.ID_DOCUMENTO,
    process_id:row.ID_PROCESSO,
    version,
    role:'original',
    bucket:'autentiko-originals',
    object_key:original.key,
    mime_type:row.MIME_TYPE,
    size_bytes:original.buffer.length,
    sha256:original.hash,
    state:'READY',
    updated_at:new Date().toISOString()
  }];
  if (thumbnail) objects.push({
    document_id:row.ID_DOCUMENTO,
    process_id:row.ID_PROCESSO,
    version,
    role:'thumbnail',
    bucket:'autentiko-thumbnails',
    object_key:thumbnail.key,
    mime_type:'image/webp',
    size_bytes:thumbnail.buffer.length,
    sha256:thumbnail.hash,
    state:'READY',
    updated_at:new Date().toISOString()
  });
  const {error:objectsError} = await supabase.from('media_objects').upsert(objects, {
    onConflict:'document_id,version,role'
  });
  if (objectsError) throw objectsError;
}

export async function checkpointExists(requestId) {
  const {data, error} = await supabase.from('media_events').select('id').eq('request_id', requestId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function checkpoint(requestId, row, eventType, result, details = {}) {
  const {error} = await supabase.from('media_events').upsert({
    request_id:requestId,
    document_id:row.ID_DOCUMENTO,
    process_id:row.ID_PROCESSO,
    version:Number(row.MEDIA_VERSAO || row.VERSAO || 1),
    event_type:eventType,
    result,
    actor_id:'MAINTENANCE',
    details
  }, {onConflict:'request_id'});
  if (error) throw error;
}

export async function linearizePdf(buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), 'autentiko-linearize-'));
  const input = path.join(directory, 'input.pdf');
  const output = path.join(directory, 'output.pdf');
  try {
    await writeFile(input, buffer);
    await execFileAsync('qpdf', ['--linearize', input, output], {timeout:60000, windowsHide:true});
    return await readFile(output);
  } catch {
    return buffer;
  } finally {
    await rm(directory, {recursive:true, force:true});
  }
}
