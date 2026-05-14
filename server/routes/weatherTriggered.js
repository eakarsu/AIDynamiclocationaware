// Weather-triggered campaigns: e.g., "rainy Sunday = hardware-store ads".
// v0 evaluates current weather via OpenWeatherMap and picks a creative.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function getWeather(lat, lon) {
  // TODO: configure credentials — OPENWEATHER_API_KEY
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`);
  if (!r.ok) return null;
  return await r.json();
}

function pickCreativeForWeather(weather) {
  const code = weather?.weather?.[0]?.main?.toLowerCase() || '';
  if (code.includes('rain')) return { category: 'rain', headline: 'Stay dry — hardware deals today' };
  if (code.includes('snow')) return { category: 'snow', headline: 'Salt + shovels in stock' };
  if (weather?.main?.temp >= 28) return { category: 'hot', headline: 'Cool off — iced drinks nearby' };
  if (weather?.main?.temp <= 5) return { category: 'cold', headline: 'Warm up — hot meals close by' };
  return { category: 'default', headline: 'Today\'s featured deals' };
}

// POST /api/weather-triggered/evaluate { truck_id }
router.post('/evaluate', aiRateLimiter, async (req, res) => {
  try {
    const { truck_id } = req.body || {};
    if (!truck_id) return res.status(400).json({ error: 'truck_id required' });
    let coords;
    try {
      const r = await pool.query(`SELECT current_lat, current_lon FROM trucks WHERE id = $1`, [truck_id]);
      coords = r.rows[0];
    } catch {}
    if (!coords?.current_lat) return res.status(404).json({ error: 'no current GPS for truck' });

    const wx = await getWeather(coords.current_lat, coords.current_lon);
    if (!wx) return res.status(503).json({ error: 'OPENWEATHER_API_KEY missing' });
    const choice = pickCreativeForWeather(wx);

    try {
      await pool.query(`INSERT INTO ai_generation_logs (campaign_id, type, output, created_at) VALUES (NULL,'weather_trigger',$1,NOW())`, [JSON.stringify({ truck_id, wx: wx.weather, choice })]);
    } catch {}
    return res.json({ truck_id, weather: { main: wx.weather?.[0]?.main, temp: wx.main?.temp }, choice });
  } catch (e) {
    console.error('weather-trigger error:', e);
    return res.status(500).json({ error: 'eval failed' });
  }
});

module.exports = router;
