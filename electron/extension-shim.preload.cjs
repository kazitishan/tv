// Workarounds that let uBlock Origin (a Manifest V2 extension) run in Electron 45.
// Runs in extension pages without context isolation (uBO's background page),
// before electron-chrome-extensions' own preload.
//
// 1. electron-chrome-extensions adds the chrome.* APIs Electron lacks
//    (browserAction, webNavigation, contextMenus, ...) to the page's `chrome`
//    object. Electron then replaces `window.chrome` with a fresh object before
//    the extension's scripts run, so those APIs disappear and uBO crashes on
//    startup. We record the original APIs, catch Electron's replacement, and
//    copy over whatever the library added or overrode.
//
// 2. Electron's chrome.storage.managed is the same object as
//    chrome.storage.local. uBO reads "managed" (admin) settings and caches them
//    back into storage.local, so every launch nests the whole store inside
//    itself: hundreds of MB per launch and startup that gets slower each time.
//    Removing storage.managed makes uBO use its built-in "no admin settings"
//    path, as on browsers without managed storage.
if (location.protocol === 'chrome-extension:' && !process.contextIsolated && globalThis.chrome) {
  const removeManagedStorage = (chrome) => {
    const storage = chrome && chrome.storage;
    if (!storage || storage.managed === undefined || storage.managed !== storage.local) return;
    try {
      delete storage.managed;
    } catch {}
    if (storage.managed !== undefined) {
      try {
        Object.defineProperty(storage, 'managed', { value: undefined, configurable: true });
      } catch {}
    }
  };

  const patched = globalThis.chrome; // the library modifies this same object
  const original = { ...patched };
  let current = patched;
  removeManagedStorage(patched);

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (next) => {
      if (next && next !== patched && !Object.isFrozen(next)) {
        for (const key of Object.keys(patched)) {
          if (patched[key] !== original[key]) {
            Object.defineProperty(next, key, { value: patched[key], enumerable: true, configurable: true });
          }
        }
      }
      removeManagedStorage(next);
      current = next;
    },
  });
}
