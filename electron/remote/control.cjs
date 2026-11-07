// Turns phone remote commands into input for the app window.
//
// The trackpad moves a virtual pointer (drawn in a transparent, click-through
// overlay window) and mouse/keyboard events are sent straight to the page under
// it, so no OS accessibility permissions or native modules are needed.
const { BrowserWindow } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

const KEYS = {
  Left: { keyCode: 'Left' },
  Right: { keyCode: 'Right' },
  Space: { keyCode: 'Space', char: ' ' },
  Enter: { keyCode: 'Return', char: '\r' },
  Backspace: { keyCode: 'Backspace' },
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const num = (n, limit) => (Number.isFinite(n) ? clamp(n, -limit, limit) : 0);

/* ---------- Volume ---------- */

// macOS: the system output volume (what a TV remote would change).
// Elsewhere: the volume of audio/video elements in the open page.
const useSystemVolume = process.platform === 'darwin';

const osascript = (script) =>
  new Promise((resolve) => execFile('osascript', ['-e', script], (err, out) => resolve(err ? null : out.trim())));

async function readSystemVolume() {
  const out = await osascript('get volume settings'); // "output volume:50, ..., output muted:false"
  const volume = Number(/output volume:(\d+)/.exec(out ?? '')?.[1]);
  const muted = /output muted:true/.test(out ?? '');
  return Number.isFinite(volume) ? { volume, muted } : null;
}

/** Runs osascript calls one at a time, keeping only the latest pending one. */
function serialRunner() {
  let running = false;
  let next = null;
  const run = async () => {
    running = true;
    while (next) {
      const script = next;
      next = null;
      await osascript(script);
    }
    running = false;
  };
  return (script) => {
    next = script;
    if (!running) run();
  };
}

/* ---------- Pointer overlay ---------- */

function createPointerOverlay(win) {
  let overlay = null;

  const sync = () => {
    if (overlay && !overlay.isDestroyed() && !win.isDestroyed()) overlay.setBounds(win.getContentBounds());
  };

  const ensure = () => {
    if (overlay && !overlay.isDestroyed()) return overlay;
    overlay = new BrowserWindow({
      parent: win,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    overlay.setIgnoreMouseEvents(true);
    overlay.loadFile(path.join(__dirname, 'pointer.html'));
    overlay.once('ready-to-show', () => {
      sync();
      overlay.showInactive();
    });
    return overlay;
  };

  for (const event of ['move', 'resize', 'enter-full-screen', 'leave-full-screen', 'restore']) win.on(event, sync);

  const call = (js) => {
    const o = ensure();
    if (!o.webContents.isLoading()) o.webContents.executeJavaScript(js).catch(() => {});
  };

  return {
    move: (x, y) => call(`movePointer(${x}, ${y})`),
    press: () => call('pressPointer()'),
  };
}

/* ---------- Control ---------- */

/**
 * `inApp.page()` returns { wc, htmlFullscreen } for the open website, or null.
 * `inApp.close()` returns to the home screen.
 */
function createRemoteControl({ win, inApp, topBarHeight, onStateChange }) {
  const pointer = createPointerOverlay(win);
  let cursor = null; // { x, y } in window content coordinates
  let volumeState = { volume: 100, muted: false };
  const runVolumeScript = serialRunner();

  // Where a mouse event at the cursor should go: the open website (below the
  // top bar) or the home screen renderer (which also draws the top bar).
  const mouseTarget = () => {
    const page = inApp.page();
    if (page) {
      const top = page.htmlFullscreen ? 0 : topBarHeight;
      if (cursor.y >= top) return { wc: page.wc, x: Math.round(cursor.x), y: Math.round(cursor.y - top) };
    }
    return { wc: win.webContents, x: Math.round(cursor.x), y: Math.round(cursor.y) };
  };

  // Keys and text go to the open website, or the home screen.
  const keyTarget = () => inApp.page()?.wc ?? win.webContents;

  const ensureCursor = () => {
    if (!cursor) {
      const [width, height] = win.getContentSize();
      cursor = { x: width / 2, y: height / 2 };
    }
  };

  const moveBy = (dx, dy) => {
    ensureCursor();
    const [width, height] = win.getContentSize();
    // Kept fractional so slow, small movements still add up.
    cursor.x = clamp(cursor.x + dx, 0, width - 1);
    cursor.y = clamp(cursor.y + dy, 0, height - 1);
    const t = mouseTarget();
    t.wc.sendInputEvent({ type: 'mouseMove', x: t.x, y: t.y });
    pointer.move(Math.round(cursor.x), Math.round(cursor.y));
  };

  const click = () => {
    ensureCursor();
    const t = mouseTarget();
    t.wc.focus();
    t.wc.sendInputEvent({ type: 'mouseDown', x: t.x, y: t.y, button: 'left', clickCount: 1 });
    t.wc.sendInputEvent({ type: 'mouseUp', x: t.x, y: t.y, button: 'left', clickCount: 1 });
    pointer.move(Math.round(cursor.x), Math.round(cursor.y));
    pointer.press();
  };

  const scroll = (dx, dy) => {
    ensureCursor();
    const t = mouseTarget();
    // Natural scrolling: fingers moving up scroll the page down. (Electron's
    // wheel deltas are positive for scrolling up.)
    t.wc.sendInputEvent({ type: 'mouseWheel', x: t.x, y: t.y, deltaX: dx, deltaY: dy, canScroll: true });
  };

  const pressKey = (name, repeat = 1) => {
    const key = KEYS[name];
    if (!key) return;
    const wc = keyTarget();
    wc.focus();
    for (let i = 0; i < repeat; i++) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: key.keyCode });
      if (key.char) wc.sendInputEvent({ type: 'char', keyCode: key.char });
      wc.sendInputEvent({ type: 'keyUp', keyCode: key.keyCode });
    }
  };

  // Typed text goes through the same input queue as key presses, so a
  // Backspace followed by new text (autocorrect) arrives in order.
  const typeText = (text) => {
    const wc = keyTarget();
    wc.focus();
    for (const char of text) {
      if (char === '\n') pressKey('Enter');
      else wc.sendInputEvent({ type: 'char', keyCode: char });
    }
  };

  const navigate = (action) => {
    const page = inApp.page();
    if (action === 'home') return inApp.close();
    if (action === 'refresh') return (page?.wc ?? win.webContents).reload();
    if (!page) return;
    const history = page.wc.navigationHistory;
    if (action === 'back') {
      // On the site's first page, Back returns to the home screen.
      if (history.canGoBack()) history.goBack();
      else inApp.close();
    } else if (action === 'forward' && history.canGoForward()) {
      history.goForward();
    }
  };

  const applyPageVolume = () => {
    const page = inApp.page();
    const level = volumeState.volume / 100;
    for (const wc of [win.webContents, page?.wc].filter(Boolean)) wc.setAudioMuted(volumeState.muted);
    page?.wc
      .executeJavaScript(`document.querySelectorAll('video, audio').forEach((m) => { m.volume = ${level}; }); 0`)
      .catch(() => {});
  };

  const setVolume = (volume) => {
    volumeState = { volume: clamp(Math.round(volume), 0, 100), muted: false };
    if (useSystemVolume) runVolumeScript(`set volume output volume ${volumeState.volume} without output muted`);
    else applyPageVolume();
    onStateChange?.(volumeState);
  };

  const setMuted = (muted) => {
    volumeState = { ...volumeState, muted: Boolean(muted) };
    if (useSystemVolume) runVolumeScript(`set volume ${volumeState.muted ? 'with' : 'without'} output muted`);
    else applyPageVolume();
    onStateChange?.(volumeState);
  };

  return {
    /** Current volume, read fresh from the system on macOS. */
    async state() {
      if (useSystemVolume) volumeState = (await readSystemVolume()) ?? volumeState;
      return volumeState;
    },

    handle(msg) {
      if (win.isDestroyed()) return;
      switch (msg.t) {
        case 'move':
          return moveBy(num(msg.dx, 400), num(msg.dy, 400));
        case 'click':
          return click();
        case 'scroll':
          return scroll(num(msg.dx, 2000), num(msg.dy, 2000));
        case 'key':
          return pressKey(msg.key, clamp(Math.floor(num(msg.repeat, 100)) || 1, 1, 100));
        case 'text':
          if (typeof msg.text === 'string' && msg.text) typeText(msg.text.slice(0, 500));
          return;
        case 'nav':
          return navigate(msg.action);
        case 'volume':
          return setVolume(num(msg.value, 100));
        case 'mute':
          return setMuted(msg.muted);
      }
    },
  };
}

module.exports = { createRemoteControl };
