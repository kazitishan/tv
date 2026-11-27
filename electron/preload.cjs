const { contextBridge, ipcRenderer } = require('electron');

// The small API the React app can use to show websites inside the window.
contextBridge.exposeInMainWorld('tv', {
  openInApp: (url) => ipcRenderer.send('in-app:open', url),
  closeInApp: () => ipcRenderer.send('in-app:close'),
  // 'back' | 'forward' | 'refresh' | 'stop' on the open website.
  navigateInApp: (action) => ipcRenderer.send('in-app:navigate', action),
  // { canGoBack, canGoForward, loading } for the open website, whenever it changes.
  onInAppNavState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('in-app:nav-state', listener);
    return () => ipcRenderer.removeListener('in-app:nav-state', listener);
  },
  onInAppClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('in-app:closed', listener);
    return () => ipcRenderer.removeListener('in-app:closed', listener);
  },

  // Phone remote: { url, qr, lanAvailable }, or null if it couldn't start.
  getRemoteInfo: () => ipcRenderer.invoke('remote:info'),
  // { available, connected }: whether a phone is connected right now.
  getRemoteStatus: () => ipcRenderer.invoke('remote:status'),
  onRemoteStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('remote:status', listener);
    return () => ipcRenderer.removeListener('remote:status', listener);
  },

  // Updates (gear button). checkForUpdates() resolves to
  // { app: { behind, commits } | { error }, ublock: { installed, latest, available } | null,
  //   canInstall, lastError }.
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  // Turns the TV off, updates and turns it back on. Resolves to false if it can't.
  installUpdates: () => ipcRenderer.invoke('update:install'),

  // Turns the TV app off (the gear menu's Quit), like the phone's Power button.
  quit: () => ipcRenderer.send('app:quit'),

  // About popup (gear menu). getAppInfo(): { version, commit, date, electron, ublock }.
  // getWifi(): { name } (null when not on Wi-Fi); takes a few seconds on a Mac.
  getAppInfo: () => ipcRenderer.invoke('about:info'),
  getWifi: () => ipcRenderer.invoke('about:wifi'),
  // DRM video setup (castLabs EVS). getDrmStatus(): { toolInstalled, signed, daysLeft,
  //   needsRestart, accountName, widevine }. The steps resolve to { ok: true } or
  //   { ok: false, error, code?, needsSignIn? }.
  getDrmStatus: () => ipcRenderer.invoke('drm:status'),
  drm: {
    installTool: () => ipcRenderer.invoke('drm:install'),
    sign: () => ipcRenderer.invoke('drm:sign'),
    signUp: (details) => ipcRenderer.invoke('drm:signup', details), // { accountName, password, email, firstName, lastName }
    resendCode: (details) => ipcRenderer.invoke('drm:resend', details), // { accountName }
    confirm: (details) => ipcRenderer.invoke('drm:confirm', details), // { accountName, password, code }
    signIn: (details) => ipcRenderer.invoke('drm:signin', details), // { accountName, password }
    // Has the remote server turn the app off and on; false if it can't.
    restart: () => ipcRenderer.invoke('drm:restart'),
  },

  // A text field on the home screen got focus (true) or lost it (false), or the
  // pointer moved onto or off one: opens the phone remote's keyboard.
  reportTextFocus: (open) => ipcRenderer.send('home:text-focus', open),
  reportTextHover: (over) => ipcRenderer.send('home:text-hover', over),
});
