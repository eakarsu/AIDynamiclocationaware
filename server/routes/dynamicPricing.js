// Dynamic pricing engine: cost adjusts in real-time based on demand and
// demographics. v0 computes a price multiplier from current campaign load
// and a target neighbourhood profile.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// POST /api/dynamic-pricing/quote { neighborhood_id, base_rate, slot_minutes }
router.post('/quote', aiRateLimiter, async (req, res) => {
  try {
    const { neighborhood_id, base_rate, slot_minutes = 30 } = req.body || {};
    if (!neighborhood_id || !base_rate) return res.status(400).json({ error: 'neighborhood_id + base_rate required' });

    let occupancy = 0;
    let demoMultiplier = 1;
    try {
      const occ = await pool.query(`SELECT COUNT(*) FROM campaigns WHERE active = true AND neighborhood_id = $1`, [neighborhood_id]);
      occupancy = Number(occ.rows[0].count);
    } catch {}
    try {
      const demo = await pool.query(`SELECT median_income, density FROM demographics WHERE neighborhood_id = $1`, [neighborhood_id]);
      if (demo.rows[0]) {
        const inc = Number(demo.rows[0].median_income || 50000);
        demoMultiplier = Math.min(1.6, 0.8 + inc / 100000);
      }
    } catch {}

    const occMultiplier = 1 + Math.min(occupancy, 5) * 0.1;
    const total = Number(base_rate) * demoMultiplier * occMultiplier * (slot_minutes / 30);
    return res.json({
      neighborhood_id,
      base_rate,
      slot_minutes,
      multipliers: { demographics: demoMultiplier, occupancy: occMultiplier },
      total_price: Math.round(total * 100) / 100,
    });
  } catch (e) {
    console.error('dynamic-pricing error:', e);
    return res.status(500).json({ error: 'quote failed' });
  }
});

module.exports = router;
