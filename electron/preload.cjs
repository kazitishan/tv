const { contextBridge, ipcRenderer } = require('electron');

// The small API the React app can use to show websites inside the window.
contextBridge.exposeInMainWorld('tv', {
  openInApp: (url) => ipcRenderer.send('in-app:open', url),
  closeInApp: () => ipcRenderer.send('in-app:close'),
  onInAppClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('in-app:closed', listener);
    return () => ipcRenderer.removeListener('in-app:closed', listener);
  },

  // Phone remote: { url, qr, lanAvailable }, or null if it couldn't start.
  getRemoteInfo: () => ipcRenderer.invoke('remote:info'),
  onRemoteConnected: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('remote:connected', listener);
    return () => ipcRenderer.removeListener('remote:connected', listener);
  },
});
