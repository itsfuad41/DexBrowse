// Preload of the in-app Google sign-in window: gives the page the same window.chrome objects a real Chrome has,
// and reports when Google refuses the sign-in so DexBrowse can switch to the default browser.
const { webFrame } = require('electron');
webFrame.executeJavaScript(`(() => {
    // A real Chrome page has these; an embedded Chromium has an empty window.chrome, which Google treats as "not a browser".
    const w = window;
    if (!w.chrome) w.chrome = {};
    const c = w.chrome;
    const nat = (fn, name) => { try { Object.defineProperty(fn, 'name', { value: name }); fn.toString = () => 'function ' + name + '() { [native code] }'; } catch (e) {} return fn; };
    if (!c.app) c.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: nat(function () { return null; }, 'getDetails'),
      getIsInstalled: nat(function () { return false; }, 'getIsInstalled'),
      installState: nat(function (cb) { if (typeof cb === 'function') cb('not_installed'); }, 'installState'),
      runningState: nat(function () { return 'cannot_run'; }, 'runningState')
    };
    if (!c.csi) c.csi = nat(function () {
      const t = performance.timing;
      return { onloadT: t.domContentLoadedEventEnd, startE: t.navigationStart, pageT: Date.now() - t.navigationStart, tran: 15 };
    }, 'csi');
    if (!c.loadTimes) c.loadTimes = nat(function () {
      const t = performance.timing;
      return {
        requestTime: t.navigationStart / 1000, startLoadTime: t.navigationStart / 1000, commitLoadTime: t.responseStart / 1000,
        finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000, finishLoadTime: t.loadEventEnd / 1000,
        firstPaintTime: t.responseEnd / 1000, firstPaintAfterLoadTime: 0, navigationType: 'Other',
        wasFetchedViaSpdy: true, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2'
      };
    }, 'loadTimes');
})();`).catch(() => {});
