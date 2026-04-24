require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount route files
app.use('/api/auth', require('./routes/auth'));
app.use('/api/trucks', require('./routes/trucks'));
app.use('/api/gps', require('./routes/gps'));
app.use('/api/neighborhoods', require('./routes/neighborhoods'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/headlines', require('./routes/headlines'));
app.use('/api/billboard', require('./routes/billboard'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/demographics', require('./routes/demographics'));
app.use('/api/ai', require('./routes/ai'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.API_PORT || 4001;

app.listen(PORT, () => {
  console.log(`\n  Dynamic Location-Aware Advertising Platform`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  App:  http://localhost:${PORT}`);
  console.log(`  API:  http://localhost:${PORT}/api`);
  console.log(`  Env:  ${process.env.NODE_ENV || 'development'}\n`);
});
