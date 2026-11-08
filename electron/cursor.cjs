// Hides the computer's own mouse cursor after it sits still for a while, so it
// doesn't sit on top of a video. Only used while a phone remote is connected.
//
// The real mouse is watched by polling its screen position. The phone remote
// sends mouse events straight to the pages and never moves the real cursor, so
// remote use doesn't count as movement.
const { app, screen } = require('electron');

const IDLE_MS = 5000;
const POLL_MS = 250;

// Runs in each frame. A constructed stylesheet is used because a page's Content
// Security Policy can block an injected <style> element, but not this.
const HIDE_JS = `(() => {
  const sheet = (window.__tvHideCursor ??= new CSSStyleSheet());
  sheet.replaceSync('*, *::before, *::after { cursor: none !important; }');
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
})(); 0`;
const SHOW_JS = `(() => {
  const sheet = window.__tvHideCursor;
  if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
})(); 0`;

/** `pages()` returns the webContents to hide the cursor in (the home screen and the open website). */
function createCursorHider({ win, pages }) {
  let enabled = false;
  let hidden = false;
  let timer = null;
  let lastPoint = null;
  let lastMoveAt = 0;

  const run = (js) => {
    for (const wc of pages()) {
      if (wc.isDestroyed()) continue;
      for (const frame of wc.mainFrame.framesInSubtree) frame.executeJavaScript(js).catch(() => {});
    }
  };

  const setHidden = (value) => {
    if (hidden === value) return;
    hidden = value;
    run(hidden ? HIDE_JS : SHOW_JS);
  };

  const tick = () => {
    const point = screen.getCursorScreenPoint();
    if (!lastPoint || point.x !== lastPoint.x || point.y !== lastPoint.y) {
      lastPoint = point;
      lastMoveAt = Date.now();
      setHidden(false);
    } else if (Date.now() - lastMoveAt >= IDLE_MS) {
      setHidden(true);
    }
  };

  // Pages and frames that load while the cursor is hidden need hiding too.
  const onWebContentsCreated = (_event, wc) => {
    const reapply = () => {
      if (hidden && pages().includes(wc)) run(HIDE_JS);
    };
    wc.on('dom-ready', reapply);
    wc.on('did-frame-finish-load', reapply);
  };
  app.on('web-contents-created', onWebContentsCreated);
  onWebContentsCreated(null, win.webContents); // created before this listener

  const setEnabled = (value) => {
    if (enabled === value || win.isDestroyed()) return;
    enabled = value;
    if (enabled) {
      lastPoint = null; // counts as a move, so the 5 seconds start now
      tick();
      timer = setInterval(tick, POLL_MS);
    } else {
      clearInterval(timer);
      timer = null;
      setHidden(false);
    }
  };

  win.on('closed', () => {
    clearInterval(timer);
    app.off('web-contents-created', onWebContentsCreated);
  });

  return { setEnabled };
}

module.exports = { createCursorHider };
