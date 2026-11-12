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
});
