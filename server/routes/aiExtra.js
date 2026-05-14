// Additional AI features:
//  - POST /api/ai-extra/brand-safety  (classify a headline against a brand-safety rubric)
//  - POST /api/ai-extra/weather-aware (generate headline based on weather context)
//  - POST /api/ai-extra/geofence-generate (auto-generate when truck enters a ZIP)
//  - POST /api/ai-extra/live-dispatch (push best matching headline to truck via WS)
//  - GET  /api/ai-extra/heatmap (impressions x demographics aggregation)
const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { parseAIJson } = require('../utils/parseAIJson');

router.use(authMiddleware);

const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';

async function callOpenRouter({ system, prompt, temperature = 0.4 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
      temperature,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI service error ${r.status}: ${t}`);
  }
  const data = await r.json();
  const content = data.choices && data.choices[0] ? data.choices[0].message.content : '';
  return { content, tokens: data.usage ? data.usage.total_tokens || 0 : 0 };
}

async function persistLog({ prompt, ai_results, raw_response, neighborhood_id, campaign_id, kind, latency_ms, tokens }) {
  try {
    let neighborhood = null;
    if (neighborhood_id) {
      const r = await pool.query('SELECT name FROM neighborhoods WHERE id = $1', [neighborhood_id]);
      if (r.rows[0]) neighborhood = r.rows[0].name;
    }
    await pool.query(
      `INSERT INTO ai_generation_logs (prompt, response, model, tokens_used, latency_ms, neighborhood, campaign_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [prompt, JSON.stringify({ kind, ai_results, raw_response }), MODEL, tokens, latency_ms, neighborhood, campaign_id || null]
    );
  } catch (e) {
    console.error('persistLog failed:', e.message);
  }
}

// ========== BRAND SAFETY CLASSIFIER ==========
router.post('/brand-safety', aiRateLimiter, async (req, res) => {
  const start = Date.now();
  try {
    const { headline_id, headline_text, rubric } = req.body;
    let text = headline_text;
    let h = null;
    if (headline_id) {
      const r = await pool.query('SELECT * FROM headlines WHERE id = $1', [headline_id]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Headline not found' });
      h = r.rows[0];
      text = h.headline_text;
    }
    if (!text || !text.trim()) return res.status(400).json({ error: 'headline_text or headline_id required' });

    const defaultRubric = [
      'No profanity or vulgar language',
      'No discriminatory or offensive content (race, religion, gender, sexuality, disability)',
      'No misleading or deceptive claims',
      'No promotion of illegal activities',
      'No targeting minors with adult content',
      'Compliance with FTC truth-in-advertising guidelines',
    ];
    const useRubric = Array.isArray(rubric) && rubric.length > 0 ? rubric : defaultRubric;

    const prompt = `Evaluate this billboard headline against a brand-safety / legal-compliance rubric.

Headline: "${text}"

Rubric items:
${useRubric.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Return ONLY a JSON object:
{
  "overall_score": <number 0-100, 100 = fully safe>,
  "risk_level": "<low|medium|high|critical>",
  "passed": <boolean - true if safe to display>,
  "issues": [
    {"rubric_item": "<text>", "violation": "<description>", "severity": "<low|medium|high>"}
  ],
  "recommended_changes": ["<string>", ...],
  "rationale": "<short reason>"
}`;

    const { content, tokens } = await callOpenRouter({
      system: 'You are a brand-safety and advertising-compliance expert. Return only strict JSON.',
      prompt,
      temperature: 0.2,
    });
    const parsed = parseAIJson(content);
    if (!parsed) return res.status(500).json({ error: 'Failed to parse AI response', raw: content });

    const latency = Date.now() - start;

    // Persist score row if headline_id supplied
    let scoreRow = null;
    if (headline_id) {
      try {
        const r = await pool.query(
          `INSERT INTO brand_safety_scores (headline_id, overall_score, risk_level, issues, ai_results, raw_response, model, tokens_used, latency_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [headline_id, parsed.overall_score || null, parsed.risk_level || null, JSON.stringify(parsed.issues || []), JSON.stringify(parsed), content, MODEL, tokens, latency]
        );
        scoreRow = r.rows[0];

        // If unsafe, push headline to needs-review status (don't allow active)
        if (parsed.passed === false || (parsed.risk_level === 'high' || parsed.risk_level === 'critical')) {
          await pool.query("UPDATE headlines SET status = 'needs_review' WHERE id = $1", [headline_id]);
        }
      } catch (dbErr) {
        console.error('brand_safety_scores insert failed:', dbErr.message);
      }
    }

    await persistLog({ prompt, ai_results: parsed, raw_response: content, neighborhood_id: h?.neighborhood_id, campaign_id: h?.campaign_id, kind: 'brand-safety', latency_ms: latency, tokens });

    res.json({ headline_id: headline_id || null, headline_text: text, evaluation: parsed, score_row: scoreRow, latency_ms: latency, tokens_used: tokens });
  } catch (err) {
    console.error('brand-safety error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ========== WEATHER-AWARE HEADLINE ==========
// Free Open-Meteo forecast (no API key needed)
async function fetchWeather(latitude, longitude) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&temperature_unit=fahrenheit`);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

function summarizeWeatherCode(code) {
  // WMO weather codes
  if (code === 0) return 'Clear sky';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rainy';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snowing';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Mixed weather';
}

router.post('/weather-aware', aiRateLimiter, async (req, res) => {
  const start = Date.now();
  try {
    const { neighborhood_id, campaign_id, event } = req.body;
    if (!neighborhood_id || !campaign_id) {
      return res.status(400).json({ error: 'neighborhood_id and campaign_id are required' });
    }

    const nbRes = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
    if (nbRes.rows.length === 0) return res.status(404).json({ error: 'Neighborhood not found' });
    const nb = nbRes.rows[0];

    const cRes = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const campaign = cRes.rows[0];

    let weatherSummary = 'unknown';
    let weatherData = null;
    if (nb.latitude && nb.longitude) {
      weatherData = await fetchWeather(nb.latitude, nb.longitude);
      if (weatherData && weatherData.current) {
        const w = weatherData.current;
        weatherSummary = `${summarizeWeatherCode(w.weather_code)}, ${w.temperature_2m}°F, wind ${w.wind_speed_10m}mph`;
        try {
          await pool.query(
            'INSERT INTO weather_contexts (neighborhood_id, weather_summary, weather_data) VALUES ($1, $2, $3)',
            [neighborhood_id, weatherSummary, JSON.stringify(weatherData)]
          );
        } catch {}
      }
    }

    const interests = nb.top_interests ? nb.top_interests.join(', ') : 'general consumer interests';

    const prompt = `Generate 5 weather-aware billboard headlines (max 10 words each) for a ${campaign.description || campaign.name} campaign.

Location: ${nb.name}
Current weather: ${weatherSummary}
Local interests: ${interests}
${event ? `Local event happening now: ${event}` : ''}

Headlines must reference the current weather/event context naturally and be compelling for a passing truck billboard.

Return ONLY a JSON array of 5 objects:
[{"headline": "<string>", "weather_hook": "<how it ties to weather>", "urgency": "<low|medium|high>", "confidence": 0-1}]`;

    const { content, tokens } = await callOpenRouter({
      system: 'You are a creative outdoor advertising copywriter expert at contextual / situational copy. Return only strict JSON.',
      prompt,
      temperature: 0.8,
    });
    const parsed = parseAIJson(content);
    if (!parsed) return res.status(500).json({ error: 'Failed to parse AI response', raw: content });

    const latency = Date.now() - start;
    await persistLog({ prompt, ai_results: parsed, raw_response: content, neighborhood_id, campaign_id, kind: 'weather-aware', latency_ms: latency, tokens });

    res.json({
      neighborhood: nb.name,
      campaign: campaign.name,
      weather: weatherSummary,
      weather_raw: weatherData,
      headlines: parsed,
      latency_ms: latency,
      tokens_used: tokens,
    });
  } catch (err) {
    console.error('weather-aware error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ========== GEOFENCE AUTO-GENERATE ==========
// Called when a truck enters a geofenced ZIP without a fresh headline
router.post('/geofence-generate', aiRateLimiter, async (req, res) => {
  try {
    const { truck_id, neighborhood_id, campaign_id } = req.body;
    if (!truck_id || !neighborhood_id || !campaign_id) {
      return res.status(400).json({ error: 'truck_id, neighborhood_id, campaign_id required' });
    }

    // Check freshness - if a headline for this combo exists in last 24h, return it
    const fresh = await pool.query(
      `SELECT * FROM headlines
       WHERE truck_id = $1 AND neighborhood_id = $2 AND campaign_id = $3 AND status = 'active'
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [truck_id, neighborhood_id, campaign_id]
    );
    if (fresh.rows.length > 0) {
      return res.json({ source: 'cache', headline: fresh.rows[0] });
    }

    // Otherwise call existing AI generate logic - delegate to the main /ai/generate by reusing same code path
    // For simplicity, we re-implement minimally here
    const nbRes = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
    if (nbRes.rows.length === 0) return res.status(404).json({ error: 'Neighborhood not found' });
    const nb = nbRes.rows[0];
    const cRes = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const campaign = cRes.rows[0];

    const interests = nb.top_interests ? nb.top_interests.join(', ') : 'general consumer interests';
    const prompt = `Geofence auto-generate. Create 1 hyper-local billboard headline (max 10 words) for ${campaign.name} as a truck enters ${nb.name} (interests: ${interests}). Return JSON: {"headline": "<string>", "rationale": "<short>"}`;

    const { content, tokens } = await callOpenRouter({
      system: 'You are an outdoor-media copywriter. Return strict JSON.',
      prompt,
      temperature: 0.7,
    });
    const parsed = parseAIJson(content);
    if (!parsed || !parsed.headline) return res.status(500).json({ error: 'Failed to parse AI response', raw: content });

    const ins = await pool.query(
      `INSERT INTO headlines (campaign_id, truck_id, neighborhood_id, headline_text, ai_prompt, ai_response, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING *`,
      [campaign_id, truck_id, neighborhood_id, parsed.headline, prompt, JSON.stringify(parsed)]
    );

    // Broadcast new headline to truck channel
    try {
      const broker = req.app.get('wsBroker');
      if (broker) broker.broadcast('headline:auto-generated', { truck_id, headline: ins.rows[0] });
    } catch {}

    res.status(201).json({ source: 'generated', headline: ins.rows[0], tokens_used: tokens });
  } catch (err) {
    console.error('geofence-generate error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ========== LIVE DISPATCH ==========
// Push the current best matching headline to a truck's display via WS
router.post('/live-dispatch', async (req, res) => {
  try {
    const { truck_id, headline_id } = req.body;
    if (!truck_id) return res.status(400).json({ error: 'truck_id is required' });

    let headline = null;
    if (headline_id) {
      const r = await pool.query('SELECT * FROM headlines WHERE id = $1', [headline_id]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Headline not found' });
      headline = r.rows[0];
    } else {
      // Find the latest active headline for the truck's current neighborhood
      const gpsRes = await pool.query(
        'SELECT * FROM gps_locations WHERE truck_id = $1 ORDER BY recorded_at DESC LIMIT 1',
        [truck_id]
      );
      if (gpsRes.rows.length === 0) return res.status(400).json({ error: 'No GPS data for truck' });
      const lastGps = gpsRes.rows[0];

      const matchRes = await pool.query(
        `SELECT h.* FROM headlines h
         LEFT JOIN neighborhoods n ON h.neighborhood_id = n.id
         WHERE h.status = 'active'
           AND (h.truck_id = $1 OR h.truck_id IS NULL)
           AND ($2::text IS NULL OR LOWER(n.name) = LOWER($2))
         ORDER BY h.created_at DESC LIMIT 1`,
        [truck_id, lastGps.neighborhood]
      );
      if (matchRes.rows.length === 0) return res.status(404).json({ error: 'No active headline matches truck location' });
      headline = matchRes.rows[0];
    }

    // Record display
    const dispRes = await pool.query(
      `INSERT INTO billboard_displays (truck_id, headline_id, neighborhood, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, 'displayed') RETURNING *`,
      [truck_id, headline.id, headline.neighborhood_name || null, null, null]
    );

    // Broadcast to WS subscribers
    try {
      const broker = req.app.get('wsBroker');
      if (broker) broker.broadcast('billboard:dispatch', { truck_id, headline, display: dispRes.rows[0] });
    } catch {}

    res.json({ message: 'Dispatched', truck_id, headline, display: dispRes.rows[0] });
  } catch (err) {
    console.error('live-dispatch error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ========== HEATMAP ==========
// Aggregate impressions per neighborhood weighted by demographics
router.get('/heatmap', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        n.id AS neighborhood_id,
        n.name,
        n.latitude,
        n.longitude,
        n.median_income,
        n.median_age,
        COALESCE(SUM(a.impressions), 0)::int AS impressions,
        COALESCE(COUNT(DISTINCT a.campaign_id), 0)::int AS campaign_count,
        COALESCE(COUNT(h.id), 0)::int AS headline_count
      FROM neighborhoods n
      LEFT JOIN headlines h ON h.neighborhood_id = n.id
      LEFT JOIN analytics a ON a.campaign_id = h.campaign_id
      GROUP BY n.id
      ORDER BY impressions DESC
    `);
    const points = r.rows.map((row) => ({
      neighborhood_id: row.neighborhood_id,
      name: row.name,
      lat: row.latitude ? parseFloat(row.latitude) : null,
      lng: row.longitude ? parseFloat(row.longitude) : null,
      impressions: row.impressions,
      median_income: row.median_income,
      median_age: row.median_age,
      // Weight = impressions normalized * income tier (poor proxy for ROI)
      weight: row.impressions > 0
        ? row.impressions * (row.median_income ? Math.log10(row.median_income) : 1)
        : 0,
      campaign_count: row.campaign_count,
      headline_count: row.headline_count,
    }));
    const maxWeight = Math.max(1, ...points.map((p) => p.weight));
    points.forEach((p) => { p.intensity = maxWeight ? p.weight / maxWeight : 0; });
    res.json({ points, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('heatmap error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== BRAND SAFETY SCORES LIST ==========
router.get('/brand-safety/scores', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [d, c] = await Promise.all([
      pool.query(`
        SELECT s.*, h.headline_text
        FROM brand_safety_scores s
        LEFT JOIN headlines h ON s.headline_id = h.id
        ORDER BY s.created_at DESC LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*) FROM brand_safety_scores'),
    ]);
    const total = parseInt(c.rows[0].count);
    res.json({ data: d.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    if (err.code === '42P01') return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    console.error('brand-safety scores list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WS broker stats
router.get('/ws-stats', (req, res) => {
  const broker = req.app.get('wsBroker');
  res.json({ connected_clients: broker ? broker.clientCount() : 0 });
});

module.exports = router;
