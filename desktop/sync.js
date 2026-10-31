// Google sign-in + history sync, shared with the DexBrowse phone app.
// Sign-in: OAuth 2.0 + PKCE in the system browser with a loopback redirect,
// exchanged for a Firebase session. Storage: Firestore users/{uid}/history/{sha1(url)}.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, safeStorage, shell } = require('electron');
const cfg = require('./config');

const FIRESTORE = 'https://firestore.googleapis.com/v1';
let state = null;
let memRefresh = null;
let idToken = null;
let idTokenExp = 0;

const statePath = () => path.join(app.getPath('userData'), 'sync.json');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');
const configured = () => !!(cfg.googleClientId && cfg.firebaseApiKey && cfg.firebaseProjectId);

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (_) {
    state = {};
  }
  return state;
}

function persist() {
  fs.writeFileSync(statePath(), JSON.stringify(state));
}

function seal(text) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(text).toString('base64');
}

function unseal(text) {
  try {
    return safeStorage.decryptString(Buffer.from(text, 'base64'));
  } catch (_) {
    return null;
  }
}

function refreshToken() {
  const s = load();
  return memRefresh || (s.refresh ? unseal(s.refresh) : null);
}

async function call(url, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(url, { method, body, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function explain(prefix, r) {
  let detail = '';
  if (r.json) {
    const e = r.json.error;
    detail = (e && typeof e === 'object' ? e.message : r.json.error_description || e) || '';
  }
  return `${prefix} (HTTP ${r.status}${detail ? ': ' + detail : ''})`;
}

function status() {
  const s = load();
  return {
    configured: configured(),
    signedIn: !!(s.uid && refreshToken()),
    email: s.email || ''
  };
}

function signOut() {
  state = {};
  memRefresh = null;
  idToken = null;
  idTokenExp = 0;
  try {
    fs.rmSync(statePath(), { force: true });
  } catch (_) {
    /* ignore */
  }
}

function page(message) {
  return (
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>DexBrowse</title></head>' +
    '<body style="font-family:sans-serif;background:#0B1220;color:#fff;text-align:center;padding:48px 24px">' +
    `<h2>DexBrowse</h2><p>${message}</p></body></html>`
  );
}

async function signIn() {
  if (!configured()) throw new Error('Google sync is not configured in this build');

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const expected = b64url(crypto.randomBytes(16));
  let redirect = '';

  const code = await new Promise((resolve, reject) => {
    let timer = null;
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const gotCode = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      if (!gotCode && !error) {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(error ? 'Sign-in was cancelled. You can close this tab.' : 'Signed in. You can close this tab and return to DexBrowse.'));
      clearTimeout(timer);
      server.close();
      if (server.closeAllConnections) server.closeAllConnections();
      if (error) reject(new Error('Google sign-in was cancelled'));
      else if (u.searchParams.get('state') !== expected) reject(new Error('Sign-in state did not match'));
      else resolve(gotCode);
    });
    timer = setTimeout(() => {
      server.close();
      if (server.closeAllConnections) server.closeAllConnections();
      reject(new Error('Sign-in timed out'));
    }, 180000);
    server.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${server.address().port}`;
      const url =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: cfg.googleClientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: 'openid email profile',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: expected,
          prompt: 'select_account'
        }).toString();
      shell.openExternal(url);
    });
  });

  const tokenRes = await call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.googleClientId,
      client_secret: cfg.googleClientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
      code_verifier: verifier
    }).toString()
  });
  if (!tokenRes.ok) throw new Error(explain('Google token exchange failed', tokenRes));

  const fb = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${cfg.firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(tokenRes.json.id_token)}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnIdpCredential: true,
      returnSecureToken: true
    })
  });
  if (!fb.ok) throw new Error(explain('Firebase sign-in failed', fb));

  const s = load();
  s.uid = fb.json.localId;
  s.email = fb.json.email || '';
  const sealed = seal(fb.json.refreshToken);
  memRefresh = fb.json.refreshToken;
  if (sealed) s.refresh = sealed;
  else delete s.refresh;
  persist();
  idToken = fb.json.idToken;
  idTokenExp = Date.now() + (Number(fb.json.expiresIn || 3600) - 60) * 1000;
  return s.email;
}

async function ensureToken() {
  if (idToken && Date.now() < idTokenExp) return idToken;
  const refresh = refreshToken();
  if (!refresh) return null;
  const r = await call(`https://securetoken.googleapis.com/v1/token?key=${cfg.firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }).toString()
  });
  if (!r.ok) return null;
  idToken = r.json.id_token;
  idTokenExp = Date.now() + (Number(r.json.expires_in || 3600) - 60) * 1000;
  if (r.json.refresh_token) {
    memRefresh = r.json.refresh_token;
    const sealed = seal(r.json.refresh_token);
    if (sealed) {
      load().refresh = sealed;
      persist();
    }
  }
  return idToken;
}

const root = () => `projects/${cfg.firebaseProjectId}/databases/(default)/documents`;

function deviceName() {
  const p = os.platform();
  return 'PC · ' + (p === 'win32' ? 'Windows' : p === 'darwin' ? 'Mac' : 'Linux');
}

function writeFor(uid, v) {
  return {
    update: {
      name: `${root()}/users/${uid}/history/${sha1(v.url)}`,
      fields: {
        url: { stringValue: v.url },
        title: { stringValue: v.title || '' },
        visitedAt: { integerValue: String(v.visitedAt || Date.now()) },
        device: { stringValue: deviceName() }
      }
    }
  };
}

async function commit(visits) {
  const s = load();
  if (!configured() || !s.uid || !visits.length) return;
  const token = await ensureToken();
  if (!token) return;
  for (let i = 0; i < visits.length; i += 200) {
    const writes = visits.slice(i, i + 200).map((v) => writeFor(s.uid, v));
    await call(`${FIRESTORE}/${root()}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ writes })
    });
  }
}

// Fire-and-forget single visit.
function pushVisit(v) {
  commit([v]).catch(() => {});
}

// Upload many (newest first); returns when finished.
async function pushMany(list) {
  const seen = new Set();
  const unique = list.filter((v) => (seen.has(v.url) ? false : seen.add(v.url))).slice(0, 400);
  await commit(unique);
}

async function fetchHistory() {
  const s = load();
  if (!s.uid) throw new Error('Not signed in');
  const token = await ensureToken();
  if (!token) throw new Error('Session expired, sign in again');
  const r = await call(
    `${FIRESTORE}/${root()}/users/${s.uid}/history?pageSize=300&orderBy=${encodeURIComponent('visitedAt desc')}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(explain('Could not read synced history', r));
  const docs = (r.json && r.json.documents) || [];
  return docs
    .map((d) => d.fields || {})
    .filter((f) => f.url && f.url.stringValue)
    .map((f) => ({
      url: f.url.stringValue,
      title: (f.title && f.title.stringValue) || '',
      visitedAt: Number((f.visitedAt && f.visitedAt.integerValue) || 0),
      device: (f.device && f.device.stringValue) || ''
    }));
}

module.exports = { status, signIn, signOut, pushVisit, pushMany, fetchHistory };
