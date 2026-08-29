import {required} from './common.mjs';

const API_BASE = 'https://pdf-services.adobe.io';

async function adobeToken() {
  const response = await fetch(`${API_BASE}/token`, {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:required('ADOBE_CLIENT_ID'),
      client_secret:required('ADOBE_CLIENT_SECRET')
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`ADOBE_AUTH_FAILED:${response.status}`);
  return payload.access_token;
}

function adobeHeaders(token) {
  return {
    Authorization:`Bearer ${token}`,
    'x-api-key':required('ADOBE_CLIENT_ID')
  };
}

async function createAsset(token) {
  const response = await fetch(`${API_BASE}/assets`, {
    method:'POST',
    headers:{...adobeHeaders(token), 'Content-Type':'application/json'},
    body:JSON.stringify({mediaType:'application/pdf'})
  });
  const payload = await response.json();
  if (!response.ok || !payload.assetID || !payload.uploadUri) {
    throw new Error(`ADOBE_ASSET_FAILED:${response.status}`);
  }
  return payload;
}

async function waitForResult(token, location) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(location, {headers:adobeHeaders(token), cache:'no-store'});
    const payload = await response.json();
    if (!response.ok) throw new Error(`ADOBE_STATUS_FAILED:${response.status}`);
    const status = String(payload.status || '').toLowerCase();
    if (status === 'done') {
      const downloadUri = payload.downloadUri || payload.asset?.downloadUri;
      if (!downloadUri) throw new Error('ADOBE_RESULT_MISSING');
      const downloaded = await fetch(downloadUri, {cache:'no-store'});
      if (!downloaded.ok) throw new Error(`ADOBE_DOWNLOAD_FAILED:${downloaded.status}`);
      return Buffer.from(await downloaded.arrayBuffer());
    }
    if (status === 'failed') throw new Error(`ADOBE_JOB_FAILED:${String(payload.error?.code || 'UNKNOWN').slice(0, 80)}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('ADOBE_JOB_TIMEOUT');
}

export async function compressPdfAdobe(buffer) {
  if (String(process.env.ADOBE_ENABLED || 'false').toLowerCase() !== 'true') {
    throw new Error('ADOBE_DISABLED');
  }
  const token = await adobeToken();
  const asset = await createAsset(token);
  const uploaded = await fetch(asset.uploadUri, {
    method:'PUT',
    headers:{'Content-Type':'application/pdf'},
    body:buffer
  });
  if (!uploaded.ok) throw new Error(`ADOBE_UPLOAD_FAILED:${uploaded.status}`);
  const job = await fetch(`${API_BASE}/operation/compresspdf`, {
    method:'POST',
    headers:{...adobeHeaders(token), 'Content-Type':'application/json'},
    body:JSON.stringify({assetID:asset.assetID, compressionLevel:'MEDIUM'})
  });
  const location = job.headers.get('location');
  if (job.status !== 201 || !location) throw new Error(`ADOBE_SUBMIT_FAILED:${job.status}`);
  return waitForResult(token, location);
}
