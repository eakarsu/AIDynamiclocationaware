// Real-time fleet dashboard: live map with impressions / engagement /
// cost-per-mile data, aggregated from existing tables.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/fleet-dashboard/live — current state of all trucks with metrics
router.get('/live', async (req, res) => {
  try {
    let trucks = [];
    try {
      const r = await pool.query(`SELECT t.id, t.name, t.status, t.current_lat, t.current_lon FROM trucks t LIMIT 200`);
      trucks = r.rows;
    } catch {}

    const ids = trucks.map(t => t.id);
    let metrics = {};
    if (ids.length) {
      try {
        const r = await pool.query(`SELECT truck_id, SUM(impressions) AS imps, SUM(engagements) AS eng, SUM(miles) AS miles, SUM(cost_cents) AS cost FROM truck_metrics WHERE truck_id = ANY($1) AND ts > NOW() - INTERVAL '24 hours' GROUP BY truck_id`, [ids]);
        for (const row of r.rows) {
          metrics[row.truck_id] = {
            impressions: Number(row.imps || 0),
            engagements: Number(row.eng || 0),
            miles: Number(row.miles || 0),
            cost: Number(row.cost || 0) / 100,
            cpm_per_mile: row.miles > 0 ? (Number(row.cost || 0) / 100) / Number(row.miles) : null,
          };
        }
      } catch {}
    }
    const live = trucks.map(t => ({
      truck_id: t.id,
      name: t.name,
      status: t.status,
      lat: t.current_lat,
      lon: t.current_lon,
      metrics_24h: metrics[t.id] || null,
    }));
    return res.json({
      count: live.length,
      generated_at: new Date().toISOString(),
      trucks: live,
    });
  } catch (e) {
    console.error('fleet-dashboard error:', e);
    return res.status(500).json({ error: 'live failed' });
  }
});

module.exports = router;
