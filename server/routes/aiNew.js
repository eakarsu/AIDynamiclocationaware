const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { parseAIJson } = require('../utils/parseAIJson');

// All AI routes require auth
router.use(authMiddleware);

// Shared helper: call OpenRouter AI
async function callAI(prompt, systemPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI service error ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  return data.choices && data.choices[0] ? data.choices[0].message.content : '';
}

// Robust JSON parser: tries direct parse, markdown blocks, then raw object/array extraction
function parseJsonResponse(content) {
  // Strategy 1: direct parse
  try { return JSON.parse(content); } catch {}
  // Strategy 2: markdown code block
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }
  // Strategy 3: extract first JSON array
  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }
  // Strategy 4: extract first JSON object
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

// POST /api/ai/seasonal-headlines
// Accepts: { neighborhood_id, season, holiday (optional) }
// Returns 5 themed seasonal billboard headlines
router.post('/seasonal-headlines', aiRateLimiter, async (req, res) => {
  try {
    const { neighborhood_id, season, holiday } = req.body;
    if (!neighborhood_id || !season) {
      return res.status(400).json({ error: 'neighborhood_id and season are required' });
    }

    const neighborhoodRes = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
    if (neighborhoodRes.rows.length === 0) return res.status(404).json({ error: 'Neighborhood not found' });
    const neighborhood = neighborhoodRes.rows[0];

    const demoRes = await pool.query(
      'SELECT category, metric_name, metric_value FROM demographic_data WHERE neighborhood_id = $1',
      [neighborhood_id]
    );
    const demoSummary = demoRes.rows.map(d => `${d.metric_name}: ${d.metric_value}`).join(', ');

    const interests = neighborhood.top_interests ? neighborhood.top_interests.join(', ') : 'general consumer interests';
    const demographics = neighborhood.demographic_tags ? neighborhood.demographic_tags.join(', ') : 'mixed demographics';

    const prompt = `Create 5 themed seasonal billboard headlines for ${neighborhood.name}.

Season: ${season}
${holiday ? `Holiday: ${holiday}` : ''}
Neighborhood demographics: ${demographics}
Key interests: ${interests}
${demoSummary ? `Detailed metrics: ${demoSummary}` : ''}

Requirements:
- Each headline max 10 words
- Tie themes to the season/holiday and local demographic character
- Make headlines compelling for outdoor/truck advertising

Return a JSON array with 5 objects:
[
  {
    "headline": "<string>",
    "theme": "<string>",
    "target_emotion": "<string>",
    "seasonal_element": "<string>"
  }
]`;

    const aiContent = await callAI(prompt, 'You are a creative advertising copywriter specializing in seasonal campaigns. Always respond with valid JSON only.');
    const parsed = parseJsonResponse(aiContent);

    if (!parsed) {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: aiContent });
    }

    res.json({
      neighborhood_id,
      neighborhood: neighborhood.name,
      season,
      holiday: holiday || null,
      headlines: parsed
    });
  } catch (err) {
    console.error('Seasonal headlines error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/ai/sentiment-tone
// Accepts: { neighborhood_id }
// Returns recommended tone based on demographic analysis
router.post('/sentiment-tone', aiRateLimiter, async (req, res) => {
  try {
    const { neighborhood_id } = req.body;
    if (!neighborhood_id) return res.status(400).json({ error: 'neighborhood_id is required' });

    const neighborhoodRes = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
    if (neighborhoodRes.rows.length === 0) return res.status(404).json({ error: 'Neighborhood not found' });
    const neighborhood = neighborhoodRes.rows[0];

    const demoRes = await pool.query(
      'SELECT category, metric_name, metric_value FROM demographic_data WHERE neighborhood_id = $1',
      [neighborhood_id]
    );
    const demoSummary = demoRes.rows.map(d => `${d.metric_name}: ${d.metric_value}`).join(', ');

    const interests = neighborhood.top_interests ? neighborhood.top_interests.join(', ') : 'general consumer interests';
    const demographics = neighborhood.demographic_tags ? neighborhood.demographic_tags.join(', ') : 'mixed demographics';
    const incomeInfo = neighborhood.median_income ? `Median income: $${neighborhood.median_income.toLocaleString()}` : '';
    const ageInfo = neighborhood.median_age ? `Median age: ${neighborhood.median_age}` : '';

    const prompt = `Analyze the demographics of ${neighborhood.name} and recommend the optimal advertising tone.

Demographics: ${demographics}
${incomeInfo}
${ageInfo}
Interests: ${interests}
${demoSummary ? `Additional metrics: ${demoSummary}` : ''}

Return a JSON object:
{
  "recommended_tone": "<string e.g. aspirational, playful, professional, warm, bold>",
  "primary_tone": "<one word>",
  "secondary_tone": "<one word>",
  "voice_style": "<string>",
  "language_level": "<simple|conversational|professional|sophisticated>",
  "emotional_triggers": ["<string>", ...],
  "avoid": ["<string - tones/approaches to avoid>", ...],
  "example_phrases": ["<string>", ...],
  "rationale": "<2-3 sentence explanation>"
}`;

    const aiContent = await callAI(prompt, 'You are an expert in demographic analysis and advertising psychology. Always respond with valid JSON only.');
    const parsed = parseJsonResponse(aiContent);

    if (!parsed) {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: aiContent });
    }

    res.json({
      neighborhood_id,
      neighborhood: neighborhood.name,
      ...parsed
    });
  } catch (err) {
    console.error('Sentiment tone error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/ai/multilingual
// Accepts: { neighborhood_id, headline, target_languages: [] }
// Translates headline with cultural adaptation notes
router.post('/multilingual', aiRateLimiter, async (req, res) => {
  try {
    const { neighborhood_id, headline, target_languages } = req.body;
    const errors = {};
    if (!neighborhood_id) errors.neighborhood_id = 'neighborhood_id is required';
    if (!headline || !headline.trim()) errors.headline = 'headline is required';
    if (!Array.isArray(target_languages) || target_languages.length === 0) {
      errors.target_languages = 'target_languages must be a non-empty array';
    }
    if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Validation failed', errors });
    if (target_languages.length > 10) return res.status(400).json({ error: 'Maximum 10 languages per request' });

    const neighborhoodRes = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
    if (neighborhoodRes.rows.length === 0) return res.status(404).json({ error: 'Neighborhood not found' });
    const neighborhood = neighborhoodRes.rows[0];

    const demographics = neighborhood.demographic_tags ? neighborhood.demographic_tags.join(', ') : 'mixed demographics';

    const prompt = `Translate and culturally adapt this billboard headline for the ${neighborhood.name} neighborhood.

Original headline (English): "${headline.trim()}"
Neighborhood demographics: ${demographics}
Target languages: ${target_languages.join(', ')}

For each language, provide a culturally adapted translation that:
- Preserves the advertising intent
- Adapts idioms/expressions naturally
- Notes any cultural sensitivities

Return a JSON array with one object per language:
[
  {
    "language": "<language name>",
    "language_code": "<ISO 639-1 code>",
    "translated_headline": "<string>",
    "literal_back_translation": "<string>",
    "cultural_adaptation_notes": "<string>",
    "cultural_sensitivities": "<string or null>",
    "confidence": "<high|medium|low>"
  }
]`;

    const aiContent = await callAI(prompt, 'You are a professional multilingual advertising translator with expertise in cultural adaptation. Always respond with valid JSON only.');
    const parsed = parseJsonResponse(aiContent);

    if (!parsed) {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: aiContent });
    }

    res.json({
      neighborhood_id,
      neighborhood: neighborhood.name,
      original_headline: headline.trim(),
      translations: parsed
    });
  } catch (err) {
    console.error('Multilingual error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ============================================
// POST /api/ai/route-performance-predictor (NEW)
// Predicts expected impressions/CTR/conversions per neighborhood for a planned route
// Persists structured result into ai_generation_logs.response (JSONB)
// ============================================
router.post('/route-performance-predictor', aiRateLimiter, async (req, res) => {
  const start = Date.now();
  try {
    const { campaign_id, neighborhood_ids, hours_per_neighborhood, day_part } = req.body;
    const errors = {};
    if (!campaign_id) errors.campaign_id = 'campaign_id is required';
    if (!Array.isArray(neighborhood_ids) || neighborhood_ids.length === 0) {
      errors.neighborhood_ids = 'neighborhood_ids must be a non-empty array';
    }
    if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Validation failed', errors });

    const campaignRes = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
    if (campaignRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const campaign = campaignRes.rows[0];

    const nbsRes = await pool.query('SELECT * FROM neighborhoods WHERE id = ANY($1::int[])', [neighborhood_ids]);
    if (nbsRes.rows.length === 0) return res.status(404).json({ error: 'No neighborhoods found' });

    const nbSummary = nbsRes.rows.map((n) => ({
      id: n.id,
      name: n.name,
      median_income: n.median_income || null,
      median_age: n.median_age || null,
      tags: n.demographic_tags || [],
      interests: n.top_interests || [],
    }));

    const prompt = `You are a billboard media-planning analyst. Predict per-neighborhood performance for a planned truck route.

Campaign: ${campaign.name} - ${campaign.description || ''}
Hours per neighborhood: ${hours_per_neighborhood || 2}
Day part: ${day_part || 'mid-day'}

Neighborhoods:
${JSON.stringify(nbSummary, null, 2)}

Return ONLY a JSON object with this structure:
{
  "per_neighborhood": [
    {
      "neighborhood_id": <id>,
      "neighborhood_name": "<name>",
      "expected_impressions": <integer>,
      "expected_ctr_pct": <number 0-100>,
      "expected_conversions": <integer>,
      "confidence": "<low|medium|high>",
      "rationale": "<short reason>"
    }
  ],
  "totals": {
    "expected_impressions": <integer>,
    "expected_ctr_pct": <number>,
    "expected_conversions": <integer>
  },
  "recommended_optimizations": ["<string>", ...]
}`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a quantitative outdoor-media analyst. Return only strict JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return res.status(502).json({ error: 'AI service error', details: txt });
    }
    const aiData = await aiRes.json();
    const content = aiData.choices && aiData.choices[0] ? aiData.choices[0].message.content : '';
    const parsed = parseAIJson(content);
    if (!parsed) return res.status(500).json({ error: 'Failed to parse AI response', raw: content });

    const tokensUsed = aiData.usage ? aiData.usage.total_tokens || 0 : 0;
    const latencyMs = Date.now() - start;

    // Persist into ai_generation_logs.response (JSONB)
    const logRes = await pool.query(
      `INSERT INTO ai_generation_logs (prompt, response, model, tokens_used, latency_ms, campaign_id, neighborhood)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        prompt,
        JSON.stringify({ kind: 'route-performance-predictor', input: { neighborhood_ids, hours_per_neighborhood, day_part }, ai_results: parsed }),
        process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
        tokensUsed,
        latencyMs,
        campaign_id,
        nbsRes.rows.map((n) => n.name).join(' | '),
      ]
    );

    res.json({
      campaign_id,
      campaign_name: campaign.name,
      neighborhood_count: nbsRes.rows.length,
      predictions: parsed,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
      log_id: logRes.rows[0].id,
    });
  } catch (err) {
    console.error('Route performance predictor error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/ai/budget-allocate
// Accepts: { campaign_id (optional), total_budget, neighborhood_ids (optional) }
// Returns AI-proposed spend split across trucks/neighborhoods with rationale
router.post('/budget-allocate', aiRateLimiter, async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ error: 'OPENROUTER_API_KEY is not configured' });
    }
    const { campaign_id, total_budget, neighborhood_ids } = req.body || {};
    if (!total_budget || isNaN(parseFloat(total_budget))) {
      return res.status(400).json({ error: 'total_budget (number) is required' });
    }

    let campaign = null;
    if (campaign_id) {
      const cRes = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
      if (cRes.rows.length > 0) campaign = cRes.rows[0];
    }

    const trucksRes = await pool.query('SELECT id, name, status FROM trucks LIMIT 50');
    const trucks = trucksRes.rows;

    let nbsRes;
    if (Array.isArray(neighborhood_ids) && neighborhood_ids.length > 0) {
      nbsRes = await pool.query('SELECT * FROM neighborhoods WHERE id = ANY($1::int[])', [neighborhood_ids]);
    } else {
      nbsRes = await pool.query('SELECT * FROM neighborhoods LIMIT 25');
    }
    const neighborhoods = nbsRes.rows;
    if (neighborhoods.length === 0) return res.status(404).json({ error: 'No neighborhoods found' });

    const nbSummary = neighborhoods.map((n) => ({
      id: n.id,
      name: n.name,
      median_income: n.median_income || null,
      median_age: n.median_age || null,
      tags: n.demographic_tags || [],
      interests: n.top_interests || [],
    }));

    const prompt = `You are an outdoor-media budget planner. Propose how to allocate a campaign budget.

${campaign ? `Campaign: ${campaign.name} - ${campaign.description || ''}` : 'No specific campaign provided.'}
Total budget (USD): ${total_budget}
Trucks available: ${trucks.length}
Neighborhoods:
${JSON.stringify(nbSummary, null, 2)}

Return ONLY a JSON object:
{
  "per_neighborhood": [
    {"neighborhood_id": <id>, "neighborhood_name": "<name>", "allocated_usd": <number>, "share_pct": <number>, "rationale": "<short>"}
  ],
  "per_truck_hint": [
    {"truck_id": <id|null>, "suggested_neighborhood_ids": [<id>], "rationale": "<short>"}
  ],
  "totals": {"allocated_usd": <number>, "unallocated_usd": <number>},
  "strategy_summary": "<short>"
}`;

    const aiContent = await callAI(prompt, 'You are an analytics-driven media-spend allocator. Return only valid JSON.');
    const parsed = parseJsonResponse(aiContent);
    if (!parsed) return res.status(500).json({ error: 'Failed to parse AI response', raw: aiContent });

    res.json({
      campaign_id: campaign ? campaign.id : null,
      campaign_name: campaign ? campaign.name : null,
      total_budget: parseFloat(total_budget),
      neighborhood_count: neighborhoods.length,
      truck_count: trucks.length,
      allocation: parsed,
    });
  } catch (err) {
    console.error('Budget allocate error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/ai/demand-forecast
// Accepts: { neighborhood_id (optional), horizon_hours (optional, default 24) }
// Reads recent gps points to compute density, then asks model for a short-horizon projection.
router.post('/demand-forecast', aiRateLimiter, async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ error: 'OPENROUTER_API_KEY is not configured' });
    }
    const { neighborhood_id, horizon_hours } = req.body || {};
    const horizon = Math.max(1, Math.min(168, parseInt(horizon_hours) || 24));

    let neighborhoods;
    if (neighborhood_id) {
      const nRes = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
      if (nRes.rows.length === 0) return res.status(404).json({ error: 'Neighborhood not found' });
      neighborhoods = nRes.rows;
    } else {
      const nRes = await pool.query('SELECT * FROM neighborhoods LIMIT 25');
      neighborhoods = nRes.rows;
    }

    // Gather recent GPS density (last 7 days) — best-effort, skip if table absent
    let densityRows = [];
    try {
      const gpsRes = await pool.query(
        `SELECT COUNT(*)::int AS samples, MAX(timestamp) AS last_sample FROM gps_locations
         WHERE timestamp >= NOW() - INTERVAL '7 days'`
      );
      densityRows = gpsRes.rows;
    } catch (_e) { densityRows = []; }

    const nbSummary = neighborhoods.map((n) => ({
      id: n.id,
      name: n.name,
      median_income: n.median_income || null,
      median_age: n.median_age || null,
      tags: n.demographic_tags || [],
      interests: n.top_interests || [],
    }));

    const prompt = `You are a foot-traffic / demand forecaster for outdoor advertising.

Horizon (hours): ${horizon}
Recent GPS density (7d): ${JSON.stringify(densityRows)}
Neighborhoods (target):
${JSON.stringify(nbSummary, null, 2)}

Project foot-traffic / impression demand for each neighborhood over the next ${horizon} hours.

Return ONLY a JSON object:
{
  "horizon_hours": ${horizon},
  "per_neighborhood": [
    {
      "neighborhood_id": <id>,
      "neighborhood_name": "<name>",
      "expected_traffic_index": <number 0-100>,
      "expected_impressions": <integer>,
      "peak_window": "<e.g. 17:00-19:00 local>",
      "confidence": "<low|medium|high>",
      "drivers": ["<short reason>", ...]
    }
  ],
  "global_notes": "<short>"
}`;

    const aiContent = await callAI(prompt, 'You are a quantitative outdoor-media demand forecaster. Return only strict JSON.');
    const parsed = parseJsonResponse(aiContent);
    if (!parsed) return res.status(500).json({ error: 'Failed to parse AI response', raw: aiContent });

    res.json({
      horizon_hours: horizon,
      neighborhood_count: neighborhoods.length,
      forecast: parsed,
    });
  } catch (err) {
    console.error('Demand forecast error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/ai/dynamic-pricing
// PRODUCT-DECISION: This is an *advisory* dynamic-pricing endpoint, not a billing engine.
// Cost basis defaults to a base CPM of $5 (typical OOH lower bound) when `base_cpm` is not
// provided. Multipliers ranged 0.5x-3x to avoid spec-busting price spikes. Wire to invoicing
// only after a human operator approves the suggestion.
// Required env: OPENROUTER_API_KEY (returns 503 if missing).
router.post('/dynamic-pricing', aiRateLimiter, async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured', missing: 'OPENROUTER_API_KEY' });
    }
    const { campaign_id, base_cpm, neighborhood_id, time_window } = req.body || {};
    const baseCpm = Number.isFinite(parseFloat(base_cpm)) ? parseFloat(base_cpm) : 5.0;

    let campaign = null;
    if (campaign_id) {
      try {
        const r = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
        campaign = r.rows[0] || null;
      } catch (_e) {}
    }
    let neighborhood = null;
    if (neighborhood_id) {
      try {
        const r = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
        neighborhood = r.rows[0] || null;
      } catch (_e) {}
    }

    let trucksCount = 0;
    try {
      const r = await pool.query('SELECT COUNT(*)::int AS c FROM trucks');
      trucksCount = r.rows[0].c || 0;
    } catch (_e) {}

    const prompt = `You are an outdoor-advertising dynamic-pricing strategist.

Base CPM (USD): ${baseCpm.toFixed(2)}
Time Window: ${time_window || 'unspecified'}
Active fleet size: ${trucksCount}
Campaign: ${campaign ? JSON.stringify({ id: campaign.id, name: campaign.name, budget: campaign.budget, advertiser: campaign.advertiser_name }) : 'unspecified'}
Neighborhood: ${neighborhood ? JSON.stringify({ id: neighborhood.id, name: neighborhood.name, median_income: neighborhood.median_income, tags: neighborhood.demographic_tags }) : 'unspecified'}

Recommend a CPM multiplier (0.5x..3x) and effective CPM. Constrain multiplier to [0.5, 3.0].
Return ONLY strict JSON:
{
  "multiplier": <number 0.5..3>,
  "effective_cpm": <number>,
  "demand_signal": "low|medium|high|peak",
  "supply_signal": "abundant|balanced|scarce",
  "factors": [{ "name": string, "weight": number, "direction": "up|down|neutral" }],
  "rationale": string,
  "guardrails_applied": [string],
  "confidence": "low|medium|high"
}`;

    const aiContent = await callAI(prompt, 'You are a quantitative pricing strategist. Return only strict JSON.');
    const parsed = parseJsonResponse(aiContent);
    if (!parsed) return res.status(500).json({ error: 'Failed to parse AI response', raw: aiContent });

    // Clamp multiplier defensively per PRODUCT-DECISION
    if (typeof parsed.multiplier === 'number') {
      parsed.multiplier = Math.max(0.5, Math.min(3.0, parsed.multiplier));
      parsed.effective_cpm = Math.round(baseCpm * parsed.multiplier * 100) / 100;
    }

    res.json({ base_cpm: baseCpm, recommendation: parsed });
  } catch (err) {
    console.error('Dynamic pricing error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
