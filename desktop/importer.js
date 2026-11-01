// Import bookmarks, history and passwords from other browsers installed on this computer.
// Chrome-family browsers and Firefox are read from their profile folders (a copy is read, nothing is changed).
// Saved passwords are imported from the CSV file that every browser can export.
const fs = require('fs');
const os = require('os');
const path = require('path');

let SQL = null;
async function sql() {
  if (!SQL) SQL = await require('sql.js')();
  return SQL;
}

function roots() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const mac = path.join(home, 'Library', 'Application Support');
  const cfg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const pick = (w, m, l) => (process.platform === 'win32' ? w : process.platform === 'darwin' ? m : l);
  return {
    chromium: [
      ['Google Chrome', pick(path.join(local, 'Google', 'Chrome', 'User Data'), path.join(mac, 'Google', 'Chrome'), path.join(cfg, 'google-chrome'))],
      ['Microsoft Edge', pick(path.join(local, 'Microsoft', 'Edge', 'User Data'), path.join(mac, 'Microsoft Edge'), path.join(cfg, 'microsoft-edge'))],
      ['Brave', pick(path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'), path.join(mac, 'BraveSoftware', 'Brave-Browser'), path.join(cfg, 'BraveSoftware', 'Brave-Browser'))],
      ['Vivaldi', pick(path.join(local, 'Vivaldi', 'User Data'), path.join(mac, 'Vivaldi'), path.join(cfg, 'vivaldi'))],
      ['Chromium', pick(path.join(local, 'Chromium', 'User Data'), path.join(mac, 'Chromium'), path.join(cfg, 'chromium'))]
    ],
    opera: [
      ['Opera', pick(path.join(roaming, 'Opera Software', 'Opera Stable'), path.join(mac, 'com.operasoftware.Opera'), path.join(cfg, 'opera'))],
      ['Opera GX', pick(path.join(roaming, 'Opera Software', 'Opera GX Stable'), path.join(mac, 'com.operasoftware.OperaGX'), path.join(cfg, 'opera-gx'))]
    ],
    firefox: pick(path.join(roaming, 'Mozilla', 'Firefox', 'Profiles'), path.join(mac, 'Firefox', 'Profiles'), path.join(home, '.mozilla', 'firefox'))
  };
}

const exists = (p) => { try { fs.accessSync(p); return true; } catch (_) { return false; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };

function detect() {
  const out = [];
  const r = roots();
  for (const [browser, dir] of r.chromium) {
    if (!exists(dir)) continue;
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { /* ignore */ }
    for (const n of names.filter((x) => x === 'Default' || /^Profile \d+$/.test(x))) {
      const pdir = path.join(dir, n);
      if (!exists(path.join(pdir, 'Bookmarks')) && !exists(path.join(pdir, 'History'))) continue;
      const prefs = readJson(path.join(pdir, 'Preferences'));
      const label = (prefs && prefs.profile && prefs.profile.name) || n;
      out.push({ id: `${browser}|${pdir}`, browser, kind: 'chromium', name: label, dir: pdir });
    }
  }
  for (const [browser, dir] of r.opera) {
    if (exists(path.join(dir, 'Bookmarks')) || exists(path.join(dir, 'History'))) {
      out.push({ id: `${browser}|${dir}`, browser, kind: 'chromium', name: 'Default', dir });
    }
  }
  if (exists(r.firefox)) {
    let names = [];
    try { names = fs.readdirSync(r.firefox); } catch (_) { /* ignore */ }
    for (const n of names) {
      const pdir = path.join(r.firefox, n);
      if (!exists(path.join(pdir, 'places.sqlite'))) continue;
      out.push({ id: `Firefox|${pdir}`, browser: 'Firefox', kind: 'firefox', name: n.replace(/^[a-z0-9]+\./i, ''), dir: pdir });
    }
  }
  return out.map(({ id, browser, kind, name }) => ({ id, browser, kind, name }));
}

function locate(id) {
  const entry = detect().find((e) => e.id === id);
  if (!entry) throw new Error('That browser profile was not found');
  const dir = id.slice(id.indexOf('|') + 1);
  return { ...entry, dir };
}

// Browsers lock their database while running, so work on a copy.
async function openDb(file, tmpDir) {
  const copy = path.join(tmpDir, 'import-' + Date.now() + '.db');
  try {
    fs.copyFileSync(file, copy);
  } catch (_) {
    throw new Error('Could not read the database. Close that browser and try again.');
  }
  try {
    const S = await sql();
    return new S.Database(fs.readFileSync(copy));
  } finally {
    fs.rmSync(copy, { force: true });
  }
}
function rows(db, query) {
  const stmt = db.prepare(query);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

const web = (u) => /^https?:\/\//i.test(u || '');

function chromiumBookmarks(dir) {
  const data = readJson(path.join(dir, 'Bookmarks'));
  if (!data || !data.roots) return [];
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'url' && web(node.url)) out.push({ title: node.name || node.url, url: node.url });
    for (const c of node.children || []) walk(c);
  };
  for (const key of Object.keys(data.roots)) walk(data.roots[key]);
  return out;
}

async function bookmarksFrom(entry, tmpDir) {
  if (entry.kind === 'chromium') return chromiumBookmarks(entry.dir);
  const db = await openDb(path.join(entry.dir, 'places.sqlite'), tmpDir);
  try {
    return rows(db, `SELECT b.title AS title, p.url AS url FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk WHERE b.type = 1`)
      .filter((r) => web(r.url)).map((r) => ({ title: r.title || r.url, url: r.url }));
  } finally { db.close(); }
}

async function historyFrom(entry, tmpDir, limit = 1000) {
  if (entry.kind === 'chromium') {
    const db = await openDb(path.join(entry.dir, 'History'), tmpDir);
    try {
      // WebKit time: microseconds since 1601-01-01
      return rows(db, `SELECT url, title, last_visit_time AS t FROM urls ORDER BY last_visit_time DESC LIMIT ${limit}`)
        .filter((r) => web(r.url))
        .map((r) => ({ url: r.url, title: r.title || '', visitedAt: Math.round(Number(r.t) / 1000 - 11644473600000) }));
    } finally { db.close(); }
  }
  const db = await openDb(path.join(entry.dir, 'places.sqlite'), tmpDir);
  try {
    return rows(db, `SELECT url, title, last_visit_date AS t FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT ${limit}`)
      .filter((r) => web(r.url)).map((r) => ({ url: r.url, title: r.title || '', visitedAt: Math.round(Number(r.t) / 1000) }));
  } finally { db.close(); }
}

// Netscape bookmark file (bookmarks.html) exported by any browser
function parseBookmarksHtml(text) {
  const out = [];
  const re = /<A\s+[^>]*HREF="([^"]+)"[^>]*>([\s\S]*?)<\/A>/gi;
  let m;
  while ((m = re.exec(text))) {
    if (web(m[1])) out.push({ title: m[2].replace(/<[^>]+>/g, '').trim() || m[1], url: m[1] });
  }
  return out;
}

// Password CSV exported by Chrome, Edge, Brave, Opera (name,url,username,password) or Firefox (url,username,password,...)
function parseCsv(text) {
  const rowsOut = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rowsOut.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rowsOut.push(row); }
  return rowsOut;
}
function passwordsFromCsv(text) {
  const all = parseCsv(text.replace(/^﻿/, '')).filter((r) => r.length > 1);
  if (!all.length) return [];
  const head = all[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iUrl = col('url', 'login_uri', 'website', 'origin');
  const iUser = col('username', 'login_username', 'user', 'login');
  const iPass = col('password', 'login_password');
  if (iUrl < 0 || iPass < 0) throw new Error('This file does not look like a password export (needs url, username and password columns)');
  const out = [];
  for (const r of all.slice(1)) {
    let origin = '';
    try { origin = new URL(r[iUrl]).origin; } catch (_) { continue; }
    if (!web(origin) || !r[iPass]) continue;
    out.push({ origin, username: iUser >= 0 ? r[iUser] || '' : '', password: r[iPass] });
  }
  return out;
}

module.exports = { detect, locate, bookmarksFrom, historyFrom, parseBookmarksHtml, passwordsFromCsv };
