const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require('electron');
const path = require('path');

// Height of the renderer's top bar; in-app pages are placed below it.
const TOP_BAR_HEIGHT = 56;

const isWebUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const openExternal = (url) => {
  if (isWebUrl(url)) shell.openExternal(url);
};

// Present as plain Chrome so sites don't serve "unsupported browser" pages.
const chromeUserAgent = () => app.userAgentFallback.replace(/\s(Electron|tv)\/\S+/g, '');

/**
 * Shows a website inside the window, on top of the home screen, until closed.
 * The home screen stays loaded underneath so its state is kept.
 */
function createInAppController(win) {
  let current = null; // { view, htmlFullscreen }

  const layout = () => {
    if (!current) return;
    const [width, height] = win.getContentSize();
    const top = current.htmlFullscreen ? 0 : TOP_BAR_HEIGHT;
    current.view.setBounds({ x: 0, y: top, width, height: height - top });
  };

  const close = () => {
    if (!current) return;
    const { view, htmlFullscreen } = current;
    current = null;
    if (htmlFullscreen && win.isFullScreen()) win.setFullScreen(false);
    win.contentView.removeChildView(view);
    view.webContents.close();
    if (!win.isDestroyed()) {
      win.webContents.send('in-app:closed');
      win.webContents.focus();
    }
  };

  const open = (url) => {
    if (!isWebUrl(url)) return;
    close();

    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    view.setBackgroundColor('#000000');
    const wc = view.webContents;
    current = { view, htmlFullscreen: false };

    wc.setUserAgent(chromeUserAgent());
    wc.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });

    // Esc = "Menu" on a remote: go home (unless a video is fullscreen — then Esc exits that first).
    wc.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && current && !current.htmlFullscreen) {
        event.preventDefault();
        close();
      }
    });

    wc.on('enter-html-full-screen', () => {
      if (!current) return;
      current.htmlFullscreen = true;
      win.setFullScreen(true);
      layout();
    });
    wc.on('leave-html-full-screen', () => {
      if (!current) return;
      current.htmlFullscreen = false;
      win.setFullScreen(false);
      layout();
    });

    win.contentView.addChildView(view);
    layout();
    wc.loadURL(url);
    wc.focus();
  };

  win.on('resize', layout);
  win.on('closed', () => {
    current = null;
  });

  return { open, close };
}

const controllers = new Map(); // renderer webContents id -> in-app controller

ipcMain.on('in-app:open', (event, url) => controllers.get(event.sender.id)?.open(url));
ipcMain.on('in-app:close', (event) => controllers.get(event.sender.id)?.close());

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const id = win.webContents.id;
  controllers.set(id, createInAppController(win));
  win.on('closed', () => controllers.delete(id));

  // Any other window.open(url) from the home screen goes to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
