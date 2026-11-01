// Preload of the in-app Google sign-in window: Google refuses sign-in from embedded Chromium,
// so the page sees a Firefox-style browser (as other desktop apps do).
const { webFrame } = require('electron');
webFrame.executeJavaScript(`(() => {
  const FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
  const def = (k, v) => { try { Object.defineProperty(Navigator.prototype, k, { get: () => v, configurable: true }); } catch (e) {} };
  def('userAgent', FF); def('appVersion', '5.0 (Windows)'); def('vendor', ''); def('platform', 'Win32');
  def('productSub', '20100101'); def('userAgentData', undefined); def('webdriver', false);
  try { delete window.chrome; } catch (e) {}
})();`).catch(() => {});
