// Browser extensions: install from the Chrome Web Store (by page URL or ID),
// from a .crx/.zip file or an unpacked folder, and load them into the session.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { app, net } = require('electron');

const ID_RE = /^[a-p]{32}$/;

// ---------- package parsing ----------
function crxToZip(buf) {
  if (buf.length > 4 && buf.toString('latin1', 0, 2) === 'PK') return buf; // already a zip
  if (buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('This is not an extension package');
  const version = buf.readUInt32LE(4);
  if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8));
  if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw new Error('Unsupported extension package version');
}

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('The extension package is damaged');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('The extension package is damaged');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    off += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    if (method !== 0 && method !== 8) throw new Error('Unsupported compression in the extension package');
    files.push({ name, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
  }
  return files;
}

function extractTo(files, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const base = path.resolve(dir) + path.sep;
  for (const f of files) {
    const target = path.resolve(dir, f.name);
    if (!target.startsWith(base)) throw new Error('The extension package contains an unsafe path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error('manifest.json not found. Is this an extension?');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const msg = (text) => {
    const m = /^__MSG_(.+)__$/.exec(text || '');
    if (!m) return text;
    const locale = manifest.default_locale || 'en';
    for (const l of [locale, 'en', 'en_US']) {
      try {
        const messages = JSON.parse(fs.readFileSync(path.join(dir, '_locales', l, 'messages.json'), 'utf8').replace(/^﻿/, ''));
        const key = Object.keys(messages).find((k) => k.toLowerCase() === m[1].toLowerCase());
        if (key && messages[key].message) return messages[key].message;
      } catch (_) { /* try next */ }
    }
    return manifest.short_name || 'Extension';
  };
  return { name: msg(manifest.name) || 'Extension', version: manifest.version || '', description: msg(manifest.description) || '' };
}

function manifestOf(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, '')); } catch (_) { return {}; }
}
// toolbar icon of the extension as a data URL (best size near 32-48px)
function iconOf(dir, m) {
  const act = m.action || m.browser_action || {};
  const pool = typeof act.default_icon === 'string' ? { 32: act.default_icon } : (act.default_icon || m.icons || {});
  const sizes = Object.keys(pool).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const pick = sizes.find((n) => n >= 32) || sizes[sizes.length - 1];
  const rel = pick ? pool[pick] : null;
  if (!rel) return '';
  try {
    const file = path.resolve(dir, String(rel).replace(/^\//, ''));
    if (!file.startsWith(path.resolve(dir) + path.sep)) return '';
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + (ext || 'png');
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch (_) { return ''; }
}

function parseStoreId(text) {
  text = String(text || '').trim();
  if (ID_RE.test(text)) return text;
  try {
    const url = new URL(text);
    const hit = url.pathname.split('/').find((s) => ID_RE.test(s));
    if (hit) return hit;
  } catch (_) { /* not a URL */ }
  return null;
}

// ---------- manager ----------
function createExtensions({ getSession, dir, chromeVersion }) {
  const registryFile = path.join(dir, 'extensions.json');
  let registry = [];
  try { registry = JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch (_) { registry = []; }
  const save = () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(registryFile, JSON.stringify(registry));
  };

  async function load(entry) {
    if (entry.disabled) return null;
    const ses = getSession();
    const ext = await ses.loadExtension(entry.dir, { allowFileAccess: true });
    entry.runtimeId = ext.id;
    return ext;
  }

  async function loadAll() {
    const keep = [];
    for (const entry of registry) {
      if (!fs.existsSync(path.join(entry.dir, 'manifest.json'))) continue;
      try {
        await load(entry);
        keep.push(entry);
      } catch (_) {
        entry.error = true;
        keep.push(entry);
      }
    }
    registry = keep;
    save();
  }

  async function register(entryDir, source, storeId) {
    const info = readManifest(entryDir);
    const id = storeId || path.basename(entryDir);
    const existing = registry.find((e) => e.id === id);
    if (existing && existing.runtimeId) {
      try { await getSession().removeExtension(existing.runtimeId); } catch (_) { /* already gone */ }
    }
    const entry = { id, dir: entryDir, source, storeId: storeId || null, ...info, installedAt: Date.now(), pinned: true };
    await load(entry);
    registry = registry.filter((e) => e.id !== id);
    registry.unshift(entry);
    save();
    return list().find((e) => e.id === id);
  }

  async function installBuffer(buf, { storeId, source } = {}) {
    const files = readZip(crxToZip(buf));
    const target = path.join(dir, storeId || 'pkg-' + Date.now().toString(36));
    extractTo(files, target);
    try {
      return await register(target, source || 'file', storeId);
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      throw error;
    }
  }

  async function installFromStore(input) {
    const id = parseStoreId(input);
    if (!id) throw new Error('That is not a Chrome Web Store link or extension ID');
    const url = 'https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x64&os_arch=x86_64' +
      `&nacl_arch=x86-64&prod=chromecrx&prodchannel=&prodversion=${chromeVersion}&lang=en-US&acceptformat=crx2,crx3` +
      `&x=${encodeURIComponent(`id=${id}&installsource=ondemand&uc`)}`;
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(`Chrome Web Store answered HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error('The Chrome Web Store has no download for this extension');
    return installBuffer(buf, { storeId: id, source: 'store' });
  }

  async function installFile(file) {
    return installBuffer(fs.readFileSync(file), { source: 'file' });
  }

  async function installUnpacked(folder) {
    readManifest(folder);
    return register(folder, 'unpacked', null);
  }

  async function remove(id) {
    const entry = registry.find((e) => e.id === id);
    if (!entry) throw new Error('Extension not found');
    try { if (entry.runtimeId) await getSession().removeExtension(entry.runtimeId); } catch (_) { /* ignore */ }
    if (entry.source !== 'unpacked') fs.rmSync(entry.dir, { recursive: true, force: true });
    registry = registry.filter((e) => e.id !== id);
    save();
    return true;
  }

  const iconCache = new Map();
  const list = () => registry.map((e) => {
    const m = manifestOf(e.dir);
    const act = m.action || m.browser_action || {};
    if (!iconCache.has(e.id)) iconCache.set(e.id, iconOf(e.dir, m));
    return {
      id: e.id, name: e.name, version: e.version, description: e.description, source: e.source, storeId: e.storeId,
      error: !!e.error, enabled: !e.disabled, pinned: e.pinned !== false, icon: iconCache.get(e.id),
      hasPopup: !!act.default_popup, hasOptions: !!((m.options_ui && m.options_ui.page) || m.options_page)
    };
  });
  const find = (id) => {
    const e = registry.find((x) => x.id === id);
    if (!e) return null;
    const m = manifestOf(e.dir);
    const act = m.action || m.browser_action || {};
    return {
      runtimeId: e.runtimeId, disabled: !!e.disabled, name: e.name,
      popup: act.default_popup ? String(act.default_popup).replace(/^\//, '') : '',
      options: ((m.options_ui && m.options_ui.page) || m.options_page || '').replace(/^\//, '')
    };
  };
  async function setEnabled(id, on) {
    const entry = registry.find((x) => x.id === id);
    if (!entry) throw new Error('Extension not found');
    if (on) { entry.disabled = false; entry.error = false; await load(entry); }
    else {
      try { if (entry.runtimeId) await getSession().removeExtension(entry.runtimeId); } catch (_) { /* already gone */ }
      entry.disabled = true;
    }
    save();
    return list();
  }
  function setPinned(id, on) {
    const entry = registry.find((x) => x.id === id);
    if (!entry) throw new Error('Extension not found');
    entry.pinned = !!on;
    save();
    return list();
  }

  return { loadAll, installBuffer, installFromStore, installFile, installUnpacked, remove, list, find, setEnabled, setPinned, parseStoreId };
}

module.exports = { createExtensions, parseStoreId, readZip, crxToZip };
