// User agents, matching the phone app. "" means this browser's own Chrome UA.
function userAgents(v) {
  const chrome = `Chrome/${v}.0.0.0 Safari/537.36`;
  const webkit = 'AppleWebKit/537.36 (KHTML, like Gecko)';
  return {
    'Windows 10/11 · Chrome': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} ${chrome}`,
    'Windows 11 · Edge': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} ${chrome} Edg/${v}.0.0.0`,
    'Windows 10/11 · Firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Windows 10/11 · Opera': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} ${chrome} OPR/115.0.0.0`,
    'Windows 10/11 · Vivaldi': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} ${chrome} Vivaldi/7.0`,
    'Windows 7 · Chrome': `Mozilla/5.0 (Windows NT 6.1; Win64; x64) ${webkit} Chrome/109.0.0.0 Safari/537.36`,
    'Mac · Chrome': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${webkit} ${chrome}`,
    'Mac · Firefox': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mac · Edge': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${webkit} ${chrome} Edg/${v}.0.0.0`,
    'Mac · Safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Linux · Chrome': `Mozilla/5.0 (X11; Linux x86_64) ${webkit} ${chrome}`,
    'Linux · Firefox': 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Ubuntu · Chromium': `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) ${webkit} Ubuntu Chromium/${v}.0.0.0 Chrome/${v}.0.0.0 Safari/537.36`,
    'ChromeOS · Chrome': `Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) ${webkit} ${chrome}`,
    'iPhone · iOS Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'iPhone · Chrome': `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v}.0.0.0 Mobile/15E148 Safari/604.1`,
    'iPad · iPadOS Safari': 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Android · Chrome': `Mozilla/5.0 (Linux; Android 14; Pixel 8) ${webkit} Chrome/${v}.0.0.0 Mobile Safari/537.36`,
    'Android · Firefox': 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
    'Android · Samsung Internet': `Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) ${webkit} SamsungBrowser/26.0 Chrome/${v}.0.0.0 Mobile Safari/537.36`,
    'This browser (default)': ''
  };
}

// Client hints (Sec-CH-UA*, navigator.userAgentData) that match a Chrome-style UA string.
// Real Chrome always sends the "Google Chrome" brand; sites treat its absence as a bot signal.
function metadataFor(ua, fullVersion, platformFallback) {
  if (!/Chrome\//.test(ua) || /CriOS|Firefox|SamsungBrowser/.test(ua)) return null;
  const major = (/Chrome\/(\d+)/.exec(ua) || [])[1] || '130';
  const full = ua.includes(`Chrome/${major}.0.0.0`) ? `${major}.0.0.0` : fullVersion;
  const grease = { brand: 'Not?A_Brand', version: '99' };
  const brand = /Edg\//.test(ua) ? 'Microsoft Edge' : /OPR\//.test(ua) ? 'Opera' : /Vivaldi|Ubuntu Chromium/.test(ua) ? null : 'Google Chrome';
  const list = (ver) => [{ brand: 'Chromium', version: ver }, ...(brand ? [{ brand, version: ver }] : []), grease];
  let platform = platformFallback;
  let platformVersion = '';
  let navPlatform = 'Linux x86_64';
  let mobile = false;
  let model = '';
  if (/Windows NT 10/.test(ua)) { platform = 'Windows'; platformVersion = '15.0.0'; navPlatform = 'Win32'; }
  else if (/Windows NT 6/.test(ua)) { platform = 'Windows'; platformVersion = '0.1.0'; navPlatform = 'Win32'; }
  else if (/Macintosh/.test(ua)) { platform = 'macOS'; platformVersion = '14.6.1'; navPlatform = 'MacIntel'; }
  else if (/Android/.test(ua)) { platform = 'Android'; platformVersion = '14.0.0'; navPlatform = 'Linux armv81'; mobile = /Mobile/.test(ua); model = 'Pixel 8'; }
  else if (/CrOS/.test(ua)) { platform = 'Chrome OS'; platformVersion = '14541.0.0'; }
  else if (/Linux|X11/.test(ua)) { platform = 'Linux'; }
  return {
    navPlatform,
    metadata: {
      brands: list(major),
      fullVersionList: list(full),
      fullVersion: full,
      platform,
      platformVersion,
      architecture: mobile ? '' : 'x86',
      model,
      mobile,
      bitness: mobile ? '' : '64',
      wow64: false
    },
    headers: {
      'sec-ch-ua': list(major).map((b) => `"${b.brand}";v="${b.version}"`).join(', '),
      'sec-ch-ua-mobile': mobile ? '?1' : '?0',
      'sec-ch-ua-platform': `"${platform}"`
    }
  };
}

module.exports = userAgents;
module.exports.metadataFor = metadataFor;
