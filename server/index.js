require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const { createWsBroker } = require('./services/wsBroker');
const { validateRuntime } = require('./config/runtime');

validateRuntime();

const app = express();

// Security headers (helmet) — relaxed CSP for inline SPA app.js usage
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configurable via env (CORS_ORIGINS=https://a.com,https://b.com)
// Default: only same-origin (no wildcard) unless explicitly opted in
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api', (req,res,next) => {
  const supported=['/auth','/governed-delivery','/health'];
  if(supported.some(prefix=>req.path.startsWith(prefix))) return next();
  if(process.env.ENABLE_LEGACY_AD_SURFACES==='true'&&process.env.NODE_ENV!=='production') return next();
  return res.status(404).json({error:'Legacy generated endpoint is outside the consent-governed product boundary'});
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount route files
app.use('/api/auth', require('./routes/auth'));
app.use('/api/governed-delivery', require('./routes/governedDelivery'));
app.use('/api/trucks', require('./routes/trucks'));
app.use('/api/gps', require('./routes/gps'));
app.use('/api/neighborhoods', require('./routes/neighborhoods'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/headlines', require('./routes/headlines'));
app.use('/api/billboard', require('./routes/billboard'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/demographics', require('./routes/demographics'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ai', require('./routes/aiNew'));
app.use('/api/ab-tests', require('./routes/abTesting'));
app.use('/api/geofences', require('./routes/geofences'));
app.use('/api/ai-extra', require('./routes/aiExtra'));
app.use('/api/dynamic-pricing', require('./routes/dynamicPricing'));
app.use('/api/agentic-campaign-planner', require('./routes/agenticCampaignPlanner'));
app.use('/api/weather-triggered', require('./routes/weatherTriggered'));
app.use('/api/fleet-dashboard', require('./routes/fleetDashboard'));
app.use('/api/inventory-marketplace', require('./routes/inventoryMarketplace'));
app.use('/api/audio-ad-generator', require('./routes/audioAdGenerator'));
app.use('/api/route-impression-arbitrage', require('./routes/routeImpressionArbitrage'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.API_PORT || 4001;

// Wrap in HTTP server so WebSocket can share the port
const server = http.createServer(app);
const wsBroker = process.env.ENABLE_LEGACY_AD_SURFACES === 'true' && process.env.NODE_ENV !== 'production'
  ? createWsBroker(server)
  : { broadcast: () => {}, clientCount: () => 0, wss: null };
app.set('wsBroker', wsBroker);

server.listen(PORT, () => {
  console.log(`\n  Dynamic Location-Aware Advertising Platform`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  App:  http://localhost:${PORT}`);
  console.log(`  API:  http://localhost:${PORT}/api`);
  console.log(`  WS:   ${wsBroker.wss ? `ws://localhost:${PORT}/ws` : 'disabled'}`);
  console.log(`  Env:  ${process.env.NODE_ENV || 'development'}\n`);
});
