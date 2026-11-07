// Phone remote server: serves the remote page and receives its commands over
// a WebSocket. Phones join on the same Wi-Fi by scanning a QR code; the link
// carries a random per-launch token, and connections without it are refused.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PREFERRED_PORT = 8765;
const PUBLIC_DIR = path.join(__dirname, 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/remote.css': ['remote.css', 'text/css; charset=utf-8'],
  '/remote.js': ['remote.js', 'text/javascript; charset=utf-8'],
};

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

const tokensMatch = (given, token) =>
  typeof given === 'string' &&
  given.length === token.length &&
  crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

/**
 * Starts the server. `onMessage(msg, reply)` is called for every command from a
 * phone, `onConnect(reply)` when a phone connects and `onDisconnect()` when one
 * leaves. Resolves to { url, qr, lanAvailable, connectedCount(), broadcast(msg), close() }.
 */
async function startRemoteServer({ onMessage, onConnect, onDisconnect }) {
  const token = crypto.randomBytes(12).toString('base64url');
  const phones = new Set(); // open connections

  const server = http.createServer((req, res) => {
    const file = FILES[new URL(req.url, 'http://localhost').pathname];
    if (!file || req.method !== 'GET') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(PUBLIC_DIR, file[0])).pipe(res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws' || !tokensMatch(url.searchParams.get('t'), token)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    phones.add(ws);
    ws.on('close', () => {
      if (phones.delete(ws)) onDisconnect?.();
    });
    const reply = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg && typeof msg.t === 'string') onMessage(msg, reply);
    });
    onConnect?.(reply);
  });

  let port;
  try {
    port = await listen(server, PREFERRED_PORT);
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
    port = await listen(server, 0); // any free port
  }

  const host = lanAddress();
  const url = `http://${host ?? 'localhost'}:${port}/?t=${token}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 512 });

  return {
    url,
    qr,
    lanAvailable: host !== null,
    connectedCount: () => phones.size,
    broadcast(msg) {
      const data = JSON.stringify(msg);
      for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(data);
    },
    close() {
      phones.clear();
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { startRemoteServer };
