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
});
