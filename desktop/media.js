'use strict';
// Finds videos and audio that a page loads (like a download manager does) and downloads them.
// Supported: direct files (mp4, webm, mp3 ...) and unprotected HLS (.m3u8) streams.
// Not possible: DRM-protected video (Netflix, ...) and blob: streams built in the page (YouTube).
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const { webContents } = require('electron');

const DIRECT_EXT = /\.(mp4|m4v|webm|mkv|mov|flv|avi|ogv|mp3|m4a|aac|ogg|oga|wav|opus)(?:$|[?#])/i;
const SEGMENT_EXT = /\.(ts|m4s|cmfv|cmfa|aac)(?:$|[?#])/i;
const MIN_FILE_BYTES = 150 * 1024; // smaller "videos" are ads, previews or fragments

const header = (headers, name) => {
  for (const k of Object.keys(headers || {})) {
    if (k.toLowerCase() === name) { const v = headers[k]; return Array.isArray(v) ? v[0] : v; }
  }
  return '';
};

function classify(details) {
  if (details.statusCode !== 200 && details.statusCode !== 206) return null;
  let u;
  try { u = new URL(details.url); } catch (_) { return null; }
  const type = String(header(details.responseHeaders, 'content-type')).toLowerCase().split(';')[0].trim();
  const path = u.pathname;
  if (/mpegurl/.test(type) || /\.m3u8$/i.test(path)) return { kind: 'hls', ext: 'mp4', mime: type, size: 0 };
  if (/dash\+xml/.test(type) || /\.mpd$/i.test(path)) return null; // not supported
  if (type === 'video/mp2t' || SEGMENT_EXT.test(path)) return null; // one piece of a stream
  const isMedia = type.startsWith('video/') || /^audio\/(mpeg|mp4|ogg|webm|aac|wav|x-m4a|flac|opus)/.test(type) ||
    (type === 'application/octet-stream' && DIRECT_EXT.test(path)) || (type === 'application/ogg');
  if (!isMedia) return null;
  let size = Number(header(details.responseHeaders, 'content-length')) || 0;
  const range = /\/(\d+)\s*$/.exec(String(header(details.responseHeaders, 'content-range')));
  if (range) size = Number(range[1]);
  if (size && size < MIN_FILE_BYTES) return null;
  const extMatch = /\.([a-z0-9]{2,4})$/i.exec(path);
  let ext = extMatch && DIRECT_EXT.test(path) ? extMatch[1].toLowerCase() : '';
  if (!ext) ext = type === 'video/webm' ? 'webm' : type.startsWith('audio/') ? (type.includes('mpeg') ? 'mp3' : 'm4a') : 'mp4';
  return { kind: 'file', ext, mime: type, size, audio: type.startsWith('audio/') };
}

function createMediaSniffer({ isEnabled, onChange }) {
  const store = new Map(); // webContents id -> Map(url -> item)
  let seq = 0;

  const forget = (wcId) => { if (store.delete(wcId)) onChange(wcId, 0); };
  const list = (wcId) => [...(store.get(wcId) || new Map()).values()];

  function watch(wc) {
    if (wc.__mediaWatched) return;
    wc.__mediaWatched = true;
    wc.on('did-start-navigation', (_e, _url, inPlace, isMainFrame) => { if (isMainFrame && !inPlace) forget(wc.id); });
    wc.once('destroyed', () => store.delete(wc.id));
  }

  function attach(ses) {
    ses.webRequest.onResponseStarted({ urls: ['http://*/*', 'https://*/*'] }, (details) => {
      try {
        if (!isEnabled() || !details.webContentsId) return;
        const found = classify(details);
        if (!found) return;
        const wc = webContents.fromId(details.webContentsId);
        if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return;
        watch(wc);
        let items = store.get(wc.id);
        if (!items) { items = new Map(); store.set(wc.id, items); }
        const key = details.url.replace(/#.*$/, '');
        const old = items.get(key);
        if (old) { if (found.size > old.size) old.size = found.size; return; }
        if (items.size >= 30) return;
        items.set(key, { id: ++seq, url: key, ...found, at: Date.now() });
        onChange(wc.id, items.size);
      } catch (_) { /* never break page loading */ }
    });
  }

  const find = (wcId, id) => list(wcId).find((x) => x.id === id) || null;
  return { attach, list, find, forget };
}

// ---------- HLS ----------
const resolve = (base, ref) => new URL(ref, base).href;
const attrs = (line) => {
  const out = {};
  for (const m of line.replace(/^[^:]*:/, '').matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) out[m[1]] = m[2].replace(/^"|"$/g, '');
  return out;
};

async function readPlaylist(fetchText, url, depth = 0) {
  const text = await fetchText(url);
  if (!/^#EXTM3U/.test(text.trim())) throw new Error('This is not a video playlist');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) {
    if (depth > 2) throw new Error('Unsupported playlist');
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
      const a = attrs(lines[i]);
      const next = lines.slice(i + 1).find((l) => !l.startsWith('#'));
      if (!next) continue;
      const bw = Number(a.BANDWIDTH) || 0;
      if (!best || bw > best.bw) best = { bw, url: resolve(url, next) };
    }
    if (!best) throw new Error('No video found in the playlist');
    return readPlaylist(fetchText, best.url, depth + 1);
  }
  if (!lines.some((l) => l.startsWith('#EXT-X-ENDLIST'))) throw new Error('Live streams cannot be downloaded');
  const plan = { segments: [], init: null, key: null, ext: 'ts' };
  let seqNo = 0;
  let key = null;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) seqNo = Number(line.split(':')[1]) || 0;
    else if (line.startsWith('#EXT-X-KEY')) {
      const a = attrs(line);
      if (a.METHOD === 'NONE') key = null;
      else if (a.METHOD === 'AES-128' && a.URI) key = { uri: resolve(url, a.URI), iv: a.IV || null };
      else throw new Error('This video is protected (DRM) and cannot be downloaded');
    } else if (line.startsWith('#EXT-X-MAP')) {
      const a = attrs(line);
      if (a.URI) { plan.init = resolve(url, a.URI); plan.ext = 'mp4'; }
    } else if (!line.startsWith('#')) {
      plan.segments.push({ url: resolve(url, line), seq: seqNo++, key });
      if (/\.(m4s|mp4|cmfv)(?:$|\?)/i.test(line)) plan.ext = 'mp4';
    }
  }
  if (!plan.segments.length) throw new Error('No video found in the playlist');
  return plan;
}

async function downloadHls({ fetchText, fetchBuf, url, outPathFor, signal, onProgress }) {
  const plan = await readPlaylist(fetchText, url);
  const outPath = outPathFor(plan.ext);
  const keys = new Map();
  const out = fs.createWriteStream(outPath);
  const write = (buf) => new Promise((ok, fail) => out.write(buf, (e) => (e ? fail(e) : ok())));
  let received = 0;
  const total = plan.segments.length;
  try {
    if (plan.init) { const b = await fetchBuf(plan.init); received += b.length; await write(b); }
    const fetchSegment = async (s) => {
      let buf = await fetchBuf(s.url);
      if (s.key) {
        if (!keys.has(s.key.uri)) keys.set(s.key.uri, await fetchBuf(s.key.uri));
        const iv = s.key.iv ? Buffer.from(s.key.iv.replace(/^0x/i, '').padStart(32, '0'), 'hex') : (() => { const b = Buffer.alloc(16); b.writeUInt32BE(s.seq >>> 0, 12); return b; })();
        const d = crypto.createDecipheriv('aes-128-cbc', keys.get(s.key.uri), iv);
        buf = Buffer.concat([d.update(buf), d.final()]);
      }
      return buf;
    };
    // fetch 4 segments ahead, write in order
    const pending = [];
    let next = 0;
    for (let done = 0; done < total; done++) {
      if (signal.aborted) throw new Error('Cancelled');
      while (pending.length < 4 && next < total) pending.push(fetchSegment(plan.segments[next++]));
      const buf = await pending.shift();
      received += buf.length;
      await write(buf);
      onProgress(received, Math.round((received / (done + 1)) * total));
    }
  } finally {
    await new Promise((ok) => out.end(ok));
  }
  return outPath;
}

async function downloadFile({ fetchRes, url, outPath, signal, onProgress }) {
  const res = await fetchRes(url);
  if (!res.ok && res.status !== 206) throw new Error('The site refused the download (' + res.status + ')');
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const out = fs.createWriteStream(outPath);
  const src = Readable.fromWeb(res.body);
  src.on('data', (c) => { received += c.length; onProgress(received, total); });
  signal.addEventListener('abort', () => src.destroy(new Error('Cancelled')));
  await new Promise((ok, fail) => { src.on('error', fail); out.on('error', fail); out.on('finish', ok); src.pipe(out); });
  return received;
}

module.exports = { createMediaSniffer, downloadHls, downloadFile, classify };
