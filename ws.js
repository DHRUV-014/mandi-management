const WebSocket = require('ws');

let wss = null;
const clientsByMandi = new Map(); // mandi_id -> Set<ws>

function addClient(ws) {
  if (ws.mandiId == null) return;
  if (!clientsByMandi.has(ws.mandiId)) clientsByMandi.set(ws.mandiId, new Set());
  clientsByMandi.get(ws.mandiId).add(ws);
}

function removeClient(ws) {
  if (ws.mandiId == null) return;
  const set = clientsByMandi.get(ws.mandiId);
  if (set) { set.delete(ws); if (!set.size) clientsByMandi.delete(ws.mandiId); }
}

function attachWS(server, sessionMiddleware) {
  wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') { socket.destroy(); return; }

    sessionMiddleware(req, {}, () => {
      if (!req.session || !req.session.user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.userId  = req.session.user.id;
        ws.mandiId = req.session.current_mandi_id != null
          ? req.session.current_mandi_id
          : (req.session.user.mandi_id || null);
        ws.level   = req.session.user.level;
        addClient(ws);

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'set_mandi') {
              removeClient(ws);
              ws.mandiId = msg.mandi_id || null;
              addClient(ws);
            } else if (msg.type === 'ping') {
              try { ws.send(JSON.stringify({ type: 'pong' })); } catch (_) {}
            }
          } catch (_) { /* ignore malformed */ }
        });

        ws.on('close', () => removeClient(ws));
        ws.on('error', () => removeClient(ws));

        try { ws.send(JSON.stringify({ type: 'connected', mandi_id: ws.mandiId })); } catch (_) {}
      });
    });
  });

  // Heartbeat: drop dead clients
  setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      try { client.ping(); } catch (_) {}
    }
  }, 30000);
}

function broadcastToMandi(mandiId, payload) {
  if (mandiId == null) return;
  const clients = clientsByMandi.get(Number(mandiId));
  if (!clients) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch (_) {}
    }
  }
}

module.exports = { attachWS, broadcastToMandi };
