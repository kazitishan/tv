const { app, BrowserWindow, WebContentsView, components, ipcMain, session, shell } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('fs');
const path = require('path');
const { createRemoteLink } = require('./remote/link.cjs');
const { createRemoteControl } = require('./remote/control.cjs');
const { createCursorHider } = require('./cursor.cjs');

// Unpacked uBlock Origin, downloaded by scripts/fetch-ublock.cjs (runs on npm install).
const UBLOCK_PATH = path.join(__dirname, '..', 'extensions', 'ublock-origin');

let extensions = null; // Chrome extension APIs for the default session

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
  // htmlFullscreen: a video on the page is fullscreen.
  // ownsWindowFullscreen: the window went fullscreen only for that video, so undo it after.
  let current = null; // { view, htmlFullscreen, ownsWindowFullscreen }

  const layout = () => {
    if (!current) return;
    const [width, height] = win.getContentSize();
    const top = current.htmlFullscreen ? 0 : TOP_BAR_HEIGHT;
    current.view.setBounds({ x: 0, y: top, width, height: height - top });
  };

  // Tells the top bar which of Back / Forward / Refresh-or-Stop to show.
  const sendNavState = () => {
    if (!current || win.isDestroyed()) return;
    const wc = current.view.webContents;
    if (wc.isDestroyed()) return;
    win.webContents.send('in-app:nav-state', {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
    });
  };

  /** Browser-style navigation, used by the top bar and the phone remote. */
  const navigate = (action) => {
    if (action === 'home') return close();
    if (!current) return;
    const wc = current.view.webContents;
    const history = wc.navigationHistory;
    if (action === 'back') {
      // On the site's first page, Back returns to the home screen.
      if (history.canGoBack()) history.goBack();
      else close();
    } else if (action === 'forward') {
      if (history.canGoForward()) history.goForward();
    } else if (action === 'refresh') {
      wc.reload();
    } else if (action === 'stop') {
      wc.stop();
    }
  };

  const close = () => {
    if (!current) return;
    const { view, ownsWindowFullscreen } = current;
    current = null;
    if (ownsWindowFullscreen && win.isFullScreen()) win.setFullScreen(false);
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
    current = { view, htmlFullscreen: false, ownsWindowFullscreen: false };

    wc.setUserAgent(chromeUserAgent());
    wc.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });

    for (const event of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) {
      wc.on(event, sendNavState);
    }

    wc.on('enter-html-full-screen', () => {
      if (!current) return;
      current.htmlFullscreen = true;
      if (!win.isFullScreen()) {
        current.ownsWindowFullscreen = true;
        win.setFullScreen(true);
      }
      layout();
    });
    wc.on('leave-html-full-screen', () => {
      if (!current) return;
      current.htmlFullscreen = false;
      if (current.ownsWindowFullscreen) {
        current.ownsWindowFullscreen = false;
        win.setFullScreen(false);
      }
      layout();
    });

    // Let extensions (uBlock Origin) see this page as the active tab.
    if (extensions) {
      extensions.addTab(wc, win);
      extensions.selectTab(wc);
    }

    win.contentView.addChildView(view);
    layout();
    wc.loadURL(url);
    wc.focus();
  };

  win.on('resize', layout);
  win.on('closed', () => {
    current = null;
  });

  // The open website, for the phone remote.
  const page = () =>
    current && !current.view.webContents.isDestroyed()
      ? { wc: current.view.webContents, htmlFullscreen: current.htmlFullscreen }
      : null;

  return { open, close, navigate, page };
}

const controllers = new Map(); // renderer webContents id -> in-app controller

ipcMain.on('in-app:open', (event, url) => controllers.get(event.sender.id)?.open(url));
ipcMain.on('in-app:close', (event) => controllers.get(event.sender.id)?.close());
ipcMain.on('in-app:navigate', (event, action) => controllers.get(event.sender.id)?.navigate(action));

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: '#000000',
    // Start in native fullscreen (same as the green button on macOS: its own Space).
    fullscreen: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const id = win.webContents.id;
  const inApp = createInAppController(win);
  controllers.set(id, inApp);

  mainWindow = win;
  remoteControl = createRemoteControl({
    win,
    inApp,
    topBarHeight: TOP_BAR_HEIGHT,
    onStateChange: (state) => remote?.broadcast({ t: 'state', ...state }),
  });
  // Hides the computer's mouse cursor after 5 seconds still, while a phone is connected.
  cursorHider = createCursorHider({
    win,
    pages: () => [win.webContents, inApp.page()?.wc].filter(Boolean),
  });
  cursorHider.setEnabled(remoteStatus().connected);
  // A phone that turned the TV on is already connected: give it the volume.
  if (remoteStatus().connected) sendVolumeState();

  win.on('closed', () => {
    controllers.delete(id);
    if (mainWindow === win) {
      mainWindow = null;
      remoteControl = null;
      cursorHider = null;
    }
  });

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

/* ---------- Phone remote ---------- */

// The remote server (electron/remote/server.cjs) is a separate process that
// starts this app, and keeps running when the remote's Power button quits it.

let mainWindow = null;
let remoteControl = null; // controls mainWindow
let cursorHider = null; // for mainWindow
let remote = null; // link to the remote server

function startRemote() {
  remote = createRemoteLink({
    url: process.env.TV_REMOTE_LINK,
    onCommand: (msg) => remoteControl?.handle(msg),
    onPhoneConnected: sendVolumeState,
    onStatusChange: sendRemoteStatus, // closes the QR code popup and shows the green dot
    onQuit: () => app.quit(), // Power button
  });
}

async function sendVolumeState() {
  if (remoteControl) remote?.broadcast({ t: 'state', ...(await remoteControl.state()) });
}

/** Whether at least one phone is connected (`available` is false without the remote server). */
const remoteStatus = () => ({ available: Boolean(remote?.info()), connected: remote?.connected() ?? false });

function sendRemoteStatus() {
  cursorHider?.setEnabled(remoteStatus().connected);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('remote:status', remoteStatus());
}

ipcMain.handle('remote:status', async () => {
  await remote?.ready;
  return remoteStatus();
});

ipcMain.handle('remote:info', async () => (await remote?.ready) ?? null);

app.on('before-quit', () => remote?.close());

/* ---------- Ad blocker ---------- */

async function loadAdBlocker() {
  if (!fs.existsSync(path.join(UBLOCK_PATH, 'manifest.json'))) {
    console.warn('uBlock Origin not found; run `npm run fetch:ublock`. Continuing without it.');
    return;
  }
  try {
    const ses = session.defaultSession;
    // Must be registered before ElectronChromeExtensions adds its own preload.
    ses.registerPreloadScript({
      type: 'frame',
      filePath: path.join(__dirname, 'extension-shim.preload.cjs'),
    });
    extensions = new ElectronChromeExtensions({ session: ses });
    await ses.extensions.loadExtension(UBLOCK_PATH);
  } catch (err) {
    console.error('Failed to load uBlock Origin:', err);
  }
}

/* ---------- DRM (Widevine) ---------- */

// Streaming services (Prime Video, Netflix, Disney+, ...) need the Widevine CDM.
// Only castLabs' Electron for Content Security provides it, through the
// `components` API; on stock Electron this does nothing and DRM video won't play.
async function loadWidevine() {
  if (!components) {
    console.warn('Widevine unavailable: stock Electron is installed. See "DRM video" in README.md.');
    return;
  }
  try {
    await components.whenReady(); // downloads/updates the CDM on first launch
    console.log('Widevine ready:', JSON.stringify(components.status()));
  } catch (err) {
    console.error('Widevine failed to load; DRM video will not play:', err);
  }
}

app.whenReady().then(async () => {
  startRemote();
  // Before any page opens: uBO starts filtering once its lists are ready (a few
  // seconds), and Widevine must be installed before DRM video can play.
  await Promise.all([loadAdBlocker(), loadWidevine()]);
  createWindow();
  // Come to the front when turned on from the phone (the server starts the app in the background).
  if (process.platform === 'darwin') app.focus({ steal: true });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit on every platform (not just Windows/Linux) so the phone remote sees the TV
// as off and its Power button turns it back on.
app.on('window-all-closed', () => app.quit());
