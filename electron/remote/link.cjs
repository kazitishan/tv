// The TV app's connection to the phone remote server (server.cjs), which runs
// as a separate process and starts this app. The server passes the address in
// TV_REMOTE_LINK. Over it the app receives phone commands, phone connection
// status and "quit" (the remote's Power button), and sends its volume state.
const WebSocket = require('ws');

const RETRY_MS = 1000;
const READY_TIMEOUT_MS = 3000; // give up waiting for the server's first message

/**
 * Connects to the remote server. Callbacks: `onCommand(msg)` for each phone
 * command, `onPhoneConnected()` when a phone connects (reply with the volume
 * state), `onStatusChange()` when phones connect or leave, `onQuit()` on Power.
 * Returns { ready, info(), connected(), broadcast(msg), close() }; `ready`
 * resolves to info() once the server has said hello, or null if it can't.
 */
function createRemoteLink({ url, onCommand, onPhoneConnected, onStatusChange, onQuit }) {
  let ws = null;
  let info = null; // { url, qr, lanAvailable } of the phone remote
  let phonesConnected = false;
  let closed = false;
  let retryTimer = null;

  let resolveReady;
  const ready = new Promise((resolve) => (resolveReady = resolve));

  if (!url) {
    console.warn('Phone remote unavailable: start the app with `npm start` or `npm run dev`.');
    resolveReady(null);
  } else {
    setTimeout(() => resolveReady(info), READY_TIMEOUT_MS);
    connect();
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(url);
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        info = { url: msg.url, qr: msg.qr, lanAvailable: msg.lanAvailable };
        phonesConnected = Boolean(msg.connected);
        resolveReady(info);
        onStatusChange?.();
      } else if (msg.t === 'status') {
        phonesConnected = Boolean(msg.connected);
        onStatusChange?.();
      } else if (msg.t === 'phone-connected') {
        onPhoneConnected?.();
      } else if (msg.t === 'command' && msg.msg && typeof msg.msg.t === 'string') {
        onCommand?.(msg.msg);
      } else if (msg.t === 'quit') {
        onQuit?.();
      }
    });
    ws.on('error', () => {}); // followed by 'close'
    ws.on('close', () => {
      ws = null;
      if (closed) return;
      if (phonesConnected) {
        phonesConnected = false;
        onStatusChange?.();
      }
      retryTimer = setTimeout(connect, RETRY_MS);
    });
  }

  return {
    ready,
    info: () => info,
    connected: () => phonesConnected,
    /** Sends a message to every connected phone. */
    broadcast(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'broadcast', msg }));
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      ws?.close();
    },
  };
}

module.exports = { createRemoteLink };
