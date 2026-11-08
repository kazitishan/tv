#!/usr/bin/env node
// Phone remote server. Runs in plain Node (not Electron) and keeps running until
// it's stopped in the terminal. It serves the remote page at a fixed address,
// receives the phones' commands over a WebSocket, and starts and stops the TV
// app (Electron) as a child process when a phone presses Power. The TV app
// connects back to it over a private loopback WebSocket (/app) to receive
// commands and send its volume state to the phones.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.TV_REMOTE_PORT) || 8765;
const ROOT = path.join(__dirname, '..', '..'); // the Electron app (package.json "main")
const PUBLIC_DIR = path.join(__dirname, 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/remote.css': ['remote.css', 'text/css; charset=utf-8'],
  '/remote.js': ['remote.js', 'text/javascript; charset=utf-8'],
};
const QUIT_TIMEOUT_MS = 10_000; // force-kill the TV app if it hasn't quit by then

/** This computer's IPv4 address on the local network, or null if offline. */
function lanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      candidates.push({ name, address: a.address });
    }
  }
  // Prefer Wi-Fi / Ethernet over VPN and virtual adapters.
  const rank = ({ name }) => (/^(en|eth|wl|Wi-?Fi|Ethernet)/i.test(name) ? 0 : 1);
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0]?.address ?? null;
}

const keysMatch = (given, key) =>
  typeof given === 'string' &&
  given.length === key.length &&
  crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));

const isLoopback = (address) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

const parse = (data) => {
  try {
    const msg = JSON.parse(data);
    return msg && typeof msg.t === 'string' ? msg : null;
  } catch {
    return null;
  }
};

const sendTo = (ws, msg) => ws && ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

/* ---------- State ---------- */

// Only the TV app this server started knows this, so phones can't pose as it.
const appKey = crypto.randomBytes(16).toString('base64url');
const phones = new Set(); // open phone connections
let appSocket = null; // the running TV app's connection
let remoteInfo = null; // { url, qr, lanAvailable }, sent to the TV app for its QR popup
let port = PORT;

// The TV app process. state: 'off' | 'starting' | 'on' | 'stopping'
const tv = { child: null, state: 'off', killTimer: null };
let exiting = false;

const broadcast = (msg) => {
  for (const ws of phones) sendTo(ws, msg);
};
const sendToApp = (msg) => sendTo(appSocket, msg);
const phoneStatus = () => ({ t: 'status', connected: phones.size > 0 });

function setTvState(state) {
  tv.state = state;
  broadcast({ t: 'tv', state });
}

/* ---------- TV app (Electron) ---------- */

function startTv() {
  if (tv.child || exiting) return;
  let electron;
  try {
    electron = require('electron'); // in plain Node: the path to the Electron binary
  } catch (err) {
    console.error('Could not find Electron:', err.message);
    return;
  }
  console.log('Turning the TV on');
  const child = spawn(electron, [ROOT], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, TV_REMOTE_LINK: `ws://127.0.0.1:${port}/app?k=${appKey}` },
  });
  tv.child = child;
  setTvState('starting');

  const onGone = () => {
    if (tv.child !== child) return;
    tv.child = null;
    clearTimeout(tv.killTimer);
    appSocket = null;
    if (exiting) process.exit(0);
    console.log('The TV is off. Press Power on the phone remote to turn it on.');
    setTvState('off');
  };
  child.on('exit', onGone);
  child.on('error', (err) => {
    console.error('Could not start the TV app:', err.message);
    onGone();
  });
}

function stopTv() {
  const { child } = tv;
  if (!child) return;
  console.log('Turning the TV off');
  setTvState('stopping');
  // Ask the app to quit cleanly; kill it if it can't be asked or doesn't listen.
  if (appSocket) sendToApp({ t: 'quit' });
  else child.kill('SIGTERM');
  clearTimeout(tv.killTimer);
  tv.killTimer = setTimeout(() => child.kill('SIGKILL'), QUIT_TIMEOUT_MS);
}

function togglePower() {
  if (tv.state === 'off') startTv();
  else if (tv.state === 'starting' || tv.state === 'on') stopTv();
  // 'stopping': already turning off; ignore
}

/* ---------- HTTP + WebSocket ---------- */

const server = http.createServer((req, res) => {
  const file = FILES[new URL(req.url, 'http://localhost').pathname];
  if (!file || req.method !== 'GET') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(PUBLIC_DIR, file[0])).pipe(res);
});

const phoneWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const appWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/ws') {
    phoneWss.handleUpgrade(req, socket, head, (ws) => phoneWss.emit('connection', ws));
  } else if (
    url.pathname === '/app' &&
    isLoopback(req.socket.remoteAddress) &&
    keysMatch(url.searchParams.get('k'), appKey)
  ) {
    appWss.handleUpgrade(req, socket, head, (ws) => appWss.emit('connection', ws));
  } else {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
  }
});

phoneWss.on('connection', (ws) => {
  phones.add(ws);
  sendTo(ws, { t: 'tv', state: tv.state });
  sendToApp(phoneStatus());
  sendToApp({ t: 'phone-connected' }); // the app replies with its volume state

  ws.on('message', (data) => {
    const msg = parse(data);
    if (!msg) return;
    if (msg.t === 'power') togglePower();
    else sendToApp({ t: 'command', msg });
  });
  ws.on('close', () => {
    if (phones.delete(ws)) sendToApp(phoneStatus());
  });
});

appWss.on('connection', (ws) => {
  appSocket?.terminate(); // only one TV app at a time
  appSocket = ws;
  sendToApp({ t: 'hello', ...remoteInfo, connected: phones.size > 0 });
  if (phones.size > 0) sendToApp({ t: 'phone-connected' });
  if (tv.state === 'starting') setTvState('on');

  ws.on('message', (data) => {
    const msg = parse(data);
    if (msg?.t === 'broadcast' && msg.msg) broadcast(msg.msg);
  });
  ws.on('close', () => {
    if (appSocket === ws) appSocket = null;
  });
});

/* ---------- Start and stop ---------- */

function exit() {
  if (exiting) return;
  exiting = true;
  console.log('\nStopping the remote server');
  for (const ws of [...phones, appSocket]) ws?.terminate();
  server.closeAllConnections();
  server.close();
  if (!tv.child) process.exit(0);
  tv.child.kill('SIGTERM'); // exits this process once the app is gone (see startTv)
  setTimeout(() => {
    tv.child?.kill('SIGKILL');
    process.exit(0);
  }, 5000);
}
process.on('SIGINT', exit);
process.on('SIGTERM', exit);
process.on('exit', () => tv.child?.kill('SIGKILL'));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is the TV already running in another terminal?`);
  } else {
    console.error('Could not start the remote server:', err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', async () => {
  port = server.address().port;
  const host = lanAddress();
  const url = `http://${host ?? 'localhost'}:${port}/`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 512 });
  remoteInfo = { url, qr, lanAvailable: host !== null };
  console.log(`Phone remote: ${url}`);
  console.log('Press Ctrl+C to stop the remote server.');
  startTv();
});
