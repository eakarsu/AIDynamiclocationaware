// Lightweight WebSocket pub/sub broker for live billboard dispatch
// Clients subscribe to channels (e.g. truck:42) by sending {action:'subscribe', channel:'truck:42'}.
// Server broadcasts {type, payload, channel} to all sockets that subscribed to the channel.

const WebSocket = require('ws');

function createWsBroker(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.subscriptions = new Set();
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.action === 'subscribe' && typeof msg.channel === 'string') {
        ws.subscriptions.add(msg.channel);
        ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
      } else if (msg.action === 'unsubscribe' && typeof msg.channel === 'string') {
        ws.subscriptions.delete(msg.channel);
        ws.send(JSON.stringify({ type: 'unsubscribed', channel: msg.channel }));
      } else if (msg.action === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
      }
    });

    ws.send(JSON.stringify({ type: 'welcome', t: Date.now() }));
  });

  // Heartbeat
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  function broadcast(type, payload, channel = null) {
    // If channel given, only deliver to subscribers; otherwise broadcast to all
    const message = JSON.stringify({ type, payload, channel, t: Date.now() });
    wss.clients.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (channel && !ws.subscriptions.has(channel)) return;
      try { ws.send(message); } catch {}
    });
  }

  // For convenience: broadcast to a channel based on payload.truck_id when present
  function broadcastTruckEvent(type, payload) {
    if (payload && payload.truck_id != null) {
      broadcast(type, payload, `truck:${payload.truck_id}`);
    }
    // Also broadcast on global firehose channel
    broadcast(type, payload, 'all');
  }

  return {
    wss,
    broadcast: (type, payload, channel) => {
      if (!channel && payload && payload.truck_id != null) {
        broadcastTruckEvent(type, payload);
      } else {
        broadcast(type, payload, channel);
      }
    },
    broadcastTruckEvent,
    clientCount: () => wss.clients.size,
  };
}

module.exports = { createWsBroker };
