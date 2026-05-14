// Agentic campaign planner: NL prompt → trucks / neighbourhoods / budget
// selection. Uses LLM with summarised inventory context.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function callOpenRouter(prompt, system) {
  const key = process.env.OPENROUTER_API_KEY; // TODO: configure credentials
  if (!key) return null;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.choices?.[0]?.message?.content;
}

// POST /api/agentic-campaign-planner/plan { brief, budget? }
router.post('/plan', aiRateLimiter, async (req, res) => {
  try {
    const { brief, budget } = req.body || {};
    if (!brief) return res.status(400).json({ error: 'brief required' });

    let trucks = [], hoods = [];
    try { trucks = (await pool.query(`SELECT id, name, status FROM trucks WHERE status='available' LIMIT 20`)).rows; } catch {}
    try { hoods = (await pool.query(`SELECT id, name FROM neighborhoods LIMIT 30`)).rows; } catch {}

    const system = 'You are an OOH (out-of-home) campaign planner. Given an NL brief and inventory, output JSON {"trucks":[ids],"neighborhoods":[ids],"daypart":"...","budget_breakdown":{"creative":n,"placement":n,"distribution":n},"rationale":"..."}.';
    const ctx = `Brief: ${brief}\nBudget: ${budget || 'unspecified'}\nAvailable trucks: ${JSON.stringify(trucks)}\nNeighborhoods: ${JSON.stringify(hoods)}`;
    const raw = await callOpenRouter(ctx, system);
    if (!raw) return res.status(503).json({ error: 'LLM not configured' });
    let plan;
    try { plan = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw); } catch { plan = { raw }; }
    return res.json({ brief, plan });
  } catch (e) {
    console.error('agentic-campaign error:', e);
    return res.status(500).json({ error: 'plan failed' });
  }
});

module.exports = router;
