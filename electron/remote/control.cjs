// Turns phone remote commands into input for the app window.
//
// The trackpad moves a virtual pointer (drawn in a transparent, click-through
// overlay window) and mouse/keyboard events are sent straight to the page under
// it, so no OS accessibility permissions or native modules are needed.
const { app, BrowserWindow } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

const KEYS = {
  Left: { keyCode: 'Left' },
  Right: { keyCode: 'Right' },
  Space: { keyCode: 'Space', char: ' ' },
  Enter: { keyCode: 'Return', char: '\r' },
  Backspace: { keyCode: 'Backspace' },
  // Lowercase: an uppercase letter keyCode would add Shift.
  F: { keyCode: 'f', char: 'f' }, // video players' fullscreen shortcut
  Escape: { keyCode: 'Escape' }, // leaves video fullscreen
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const num = (n, limit) => (Number.isFinite(n) ? clamp(n, -limit, limit) : 0);

/* ---------- Volume ---------- */

// Two modes:
// - "system": the Mac's output volume, when its output device has one (built-in
//   speakers, headphones, most Bluetooth speakers).
// - "app": the volume of audio and video in the app. Used on other systems, and on
//   a Mac sending sound over HDMI or DisplayPort (a TV or monitor): macOS turns its
//   volume off there, because the TV is meant to set the loudness. App volume can
//   only make sound quieter than the TV's own volume setting.
const canUseSystemVolume = process.platform === 'darwin';
const FULL_VOLUME = { volume: 100, muted: false };

const osascript = (script) =>
  new Promise((resolve) => execFile('osascript', ['-e', script], (err, out) => resolve(err ? null : out.trim())));

/** The Mac's output volume, or null if the output device has none (HDMI reports "missing value"). */
async function readSystemVolume() {
  const out = await osascript('get volume settings'); // "output volume:50, ..., output muted:false"
  const volume = Number(/output volume:(\d+)/.exec(out ?? '')?.[1]);
  const muted = /output muted:true/.test(out ?? '');
  return Number.isFinite(volume) ? { volume, muted } : null;
}

/** Runs async tasks one at a time, keeping only the latest pending one. */
function serialRunner() {
  let running = false;
  let next = null;
  const run = async () => {
    running = true;
    while (next) {
      const task = next;
      next = null;
      await task();
    }
    running = false;
  };
  return (task) => {
    next = task;
    if (!running) run();
  };
}

/**
 * Turns the remote's 0–100 into a signal level, so the number is how loud it
 * sounds: 50 sounds half as loud as 100, and 1 sounds 1% as loud. Ears hear
 * every 10 dB quieter as half as loud, which works out to level = fraction^1.66.
 * (A straight volume / 100 would make 50 sound almost as loud as 100.)
 */
const LOUDNESS_EXPONENT = 1 / (2 * Math.log10(2)); // ≈ 1.66
const loudnessToLevel = (volume) => Math.pow(clamp(volume, 0, 100) / 100, LOUDNESS_EXPONENT);

/**
 * Runs inside a web page: scales every audio/video element's volume by `level`.
 * The scaling goes on top of whatever volume the site sets itself, so the site's
 * own volume slider keeps working and a site resetting its volume (YouTube does
 * when a video loads) can't undo it.
 */
function scalePageVolume(level) {
  let tv = window.__tvVolume;
  if (!tv) {
    const proto = HTMLMediaElement.prototype;
    const native = Object.getOwnPropertyDescriptor(proto, 'volume');
    const siteVolume = new WeakMap(); // element -> the volume the site asked for
    tv = window.__tvVolume = {
      level: 1,
      apply(media) {
        if (!siteVolume.has(media)) siteVolume.set(media, native.get.call(media));
        native.set.call(media, siteVolume.get(media) * tv.level);
      },
    };
    Object.defineProperty(proto, 'volume', {
      configurable: true,
      enumerable: native.enumerable,
      get() {
        return siteVolume.has(this) ? siteVolume.get(this) : native.get.call(this);
      },
      set(value) {
        const v = Number(value);
        if (!(v >= 0 && v <= 1)) return native.set.call(this, value); // throws the usual error
        native.set.call(this, v * tv.level);
        siteVolume.set(this, v);
      },
    });
    // Elements the site never set a volume on would play at full volume; catch them as they start.
    for (const type of ['loadstart', 'play']) {
      document.addEventListener(type, (e) => e.target instanceof HTMLMediaElement && tv.apply(e.target), true);
    }
  }
  tv.level = level;
  document.querySelectorAll('video, audio').forEach((m) => tv.apply(m));
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
function createRemoteControl({ win, inApp, topBarHeight, onPointerOnPage, onStateChange }) {
  const pointer = createPointerOverlay(win);
  let cursor = null; // { x, y } in window content coordinates
  let volumeMode = null; // 'system' | 'app', set by checkVolumeMode()
  let volumeState = FULL_VOLUME; // what the phone shows
  let appVolume = FULL_VOLUME; // applied to the app's audio in "app" mode
  const runVolumeTask = serialRunner();

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
    onPointerOnPage?.(t.wc !== win.webContents);
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

  // Same as the top bar's buttons, except Refresh on the home screen reloads it.
  const navigate = (action) => {
    if (action === 'refresh' && !inApp.page()) return win.webContents.reload();
    if (['back', 'forward', 'home', 'refresh'].includes(action)) inApp.navigate(action);
  };

  // Applies a volume to the home screen and the open website (in every frame).
  const applyPageVolume = (state, page = inApp.page()) => {
    const level = loudnessToLevel(state.volume);
    for (const wc of [win.webContents, page?.wc].filter(Boolean)) wc.setAudioMuted(state.muted);
    for (const frame of page?.wc.mainFrame.framesInSubtree ?? []) {
      frame.executeJavaScript(`(${scalePageVolume})(${level}); 0`).catch(() => {});
    }
  };

  // Websites opened (or frames loaded) in "app" mode get the app volume too.
  const onWebContentsCreated = (_event, wc) => {
    const reapply = () => {
      const page = inApp.page();
      if (volumeMode === 'app' && page?.wc === wc) applyPageVolume(appVolume, page);
    };
    wc.on('dom-ready', reapply);
    wc.on('did-frame-finish-load', reapply);
  };
  app.on('web-contents-created', onWebContentsCreated);
  win.on('closed', () => app.off('web-contents-created', onWebContentsCreated));

  /**
   * Picks "system" mode if the Mac's output device has a volume, otherwise "app"
   * mode, and moves the volume between them when the output device changes.
   * Returns the system volume in "system" mode.
   */
  const checkVolumeMode = async () => {
    const system = canUseSystemVolume ? await readSystemVolume() : null;
    const mode = system ? 'system' : 'app';
    if (mode === 'app' && volumeMode !== 'app') applyPageVolume(appVolume);
    if (mode === 'system' && volumeMode === 'app') applyPageVolume(FULL_VOLUME); // undo the app volume
    volumeMode = mode;
    return system;
  };

  const setVolumeState = (next) => {
    volumeState = next;
    onStateChange?.(volumeState);
    runVolumeTask(async () => {
      if (await checkVolumeMode()) {
        await osascript(
          next.muted ? 'set volume with output muted' : `set volume output volume ${next.volume} without output muted`,
        );
      } else {
        appVolume = next;
        applyPageVolume(appVolume);
      }
    });
  };

  const setVolume = (volume) => setVolumeState({ volume: clamp(Math.round(volume), 0, 100), muted: false });
  const setMuted = (muted) => setVolumeState({ ...volumeState, muted: Boolean(muted) });

  return {
    /** Current volume: the Mac's, read fresh, or the app's when the Mac's can't be changed. */
    async state() {
      volumeState = (await checkVolumeMode()) ?? appVolume;
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
