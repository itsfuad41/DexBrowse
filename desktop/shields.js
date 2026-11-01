// Shields: tracker/ad blocking, HTTPS upgrades, third-party cookie blocking,
// per-site overrides and blocked counters. Works on any Electron session.
const { ads, trackers } = require('./shieldlists');

const TWO_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.kr',
  'co.in', 'net.in', 'org.in', 'com.bd', 'net.bd', 'org.bd', 'com.br', 'com.mx', 'com.ar', 'com.tr',
  'com.cn', 'com.hk', 'com.sg', 'com.my', 'com.pk', 'co.za', 'com.ng', 'com.eg', 'com.sa'
]);

function regDomain(host) {
  const parts = (host || '').split('.');
  if (parts.length <= 2 || /^\d+(\.\d+){3}$/.test(host)) return host;
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL.has(last2) ? parts.slice(-3).join('.') : last2;
}

function inList(set, host) {
  let h = host;
  while (h) {
    if (set.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
  return false;
}

const isLocalHost = (h) =>
  h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') ||
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '::1' || h === '[::1]';

const safeUrl = (u) => { try { return new URL(u); } catch (_) { return null; } };

// api: { getSettings(), getSiteRules(), onBlocked({ id, kind, host }), onUpgrade() }
function createShields(api) {
  const upgraded = new Map(); // https url -> original http url
  const noUpgrade = new Set(); // hosts that failed over https

  function effective(host) {
    const s = api.getSettings().shields;
    const site = api.getSiteRules()[host] || {};
    if (!s.enabled || site.off) return { up: false };
    return {
      up: true,
      ads: site.ads !== undefined ? site.ads : s.ads,
      https: site.https !== undefined ? site.https : s.https,
      cookies: site.cookies !== undefined ? site.cookies : s.cookies,
      scripts: !!site.scripts,
      gpc: s.gpc
    };
  }

  function topHostOf(details, reqUrl) {
    if (details.resourceType === 'mainFrame') return reqUrl.hostname;
    const wc = details.webContents;
    const top = wc && !wc.isDestroyed() ? safeUrl(wc.getURL()) : null;
    return top ? top.hostname : '';
  }

  function attach(ses) {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      const reqUrl = safeUrl(details.url);
      if (!reqUrl) return callback({});
      const host = reqUrl.hostname;
      const topHost = topHostOf(details, reqUrl);
      const rule = effective(topHost);
      if (!rule.up) return callback({});

      if (
        rule.https && reqUrl.protocol === 'http:' && !isLocalHost(host) && !noUpgrade.has(host) &&
        (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame')
      ) {
        reqUrl.protocol = 'https:';
        if (reqUrl.port === '80') reqUrl.port = '';
        upgraded.set(reqUrl.toString(), details.url);
        if (api.onUpgrade) api.onUpgrade();
        return callback({ redirectURL: reqUrl.toString() });
      }

      if (details.resourceType === 'mainFrame') return callback({});

      if (rule.scripts && details.resourceType === 'script') {
        api.onBlocked({ id: details.webContentsId, kind: 'script', host });
        return callback({ cancel: true });
      }

      if (rule.ads && topHost && regDomain(host) !== regDomain(topHost)) {
        const isAd = inList(ads, host);
        if (isAd || inList(trackers, host)) {
          api.onBlocked({ id: details.webContentsId, kind: isAd ? 'ad' : 'tracker', host });
          return callback({ cancel: true });
        }
      }
      callback({});
    });

    // If an upgraded https request fails, fall back to the original http page.
    ses.webRequest.onErrorOccurred({ urls: ['https://*/*'] }, (details) => {
      const original = upgraded.get(details.url);
      if (!original) return;
      upgraded.delete(details.url);
      const host = safeUrl(original) && safeUrl(original).hostname;
      if (host) noUpgrade.add(host);
      const wc = details.webContents;
      if (wc && !wc.isDestroyed() && details.resourceType === 'mainFrame') wc.loadURL(original);
    });

    ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const reqUrl = safeUrl(details.url);
      const headers = details.requestHeaders;
      if (reqUrl) {
        const topHost = topHostOf(details, reqUrl);
        const rule = effective(topHost);
        if (rule.up) {
          if (rule.gpc) { headers['Sec-GPC'] = '1'; headers['DNT'] = '1'; }
          if (rule.cookies && details.resourceType !== 'mainFrame' && topHost &&
              regDomain(reqUrl.hostname) !== regDomain(topHost)) {
            for (const k of Object.keys(headers)) if (k.toLowerCase() === 'cookie') delete headers[k];
          }
        }
      }
      callback({ requestHeaders: headers });
    });

    ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const reqUrl = safeUrl(details.url);
      const headers = details.responseHeaders || {};
      if (reqUrl && details.resourceType !== 'mainFrame') {
        const topHost = topHostOf(details, reqUrl);
        const rule = effective(topHost);
        if (rule.up && rule.cookies && topHost && regDomain(reqUrl.hostname) !== regDomain(topHost)) {
          for (const k of Object.keys(headers)) if (k.toLowerCase() === 'set-cookie') delete headers[k];
        }
      }
      callback({ responseHeaders: headers });
    });
  }

  return { attach, effective, regDomain };
}

module.exports = { createShields, regDomain, inList };
