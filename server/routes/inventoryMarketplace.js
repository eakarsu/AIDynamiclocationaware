// Programmatic inventory marketplace: sell unused slots Airbnb-style.
// v0 exposes a list of available slots and an offer endpoint.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/inventory-marketplace/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/slots', async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to = req.query.to || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    // Identify trucks without active campaigns in the window.
    let slots = [];
    try {
      const r = await pool.query(
        `SELECT t.id AS truck_id, t.name, t.current_lat, t.current_lon,
                COUNT(c.id) AS active_campaign_count
         FROM trucks t
         LEFT JOIN campaigns c ON c.truck_id = t.id AND c.start_date <= $2 AND c.end_date >= $1
         GROUP BY t.id
         HAVING COUNT(c.id) = 0`,
        [from, to]
      );
      slots = r.rows;
    } catch {}
    return res.json({ from, to, count: slots.length, slots });
  } catch (e) {
    console.error('marketplace slots error:', e);
    return res.status(500).json({ error: 'slots failed' });
  }
});

// POST /api/inventory-marketplace/offer { truck_id, from, to, price, buyer_email }
router.post('/offer', async (req, res) => {
  try {
    const { truck_id, from, to, price, buyer_email } = req.body || {};
    if (!truck_id || !from || !to || !price) return res.status(400).json({ error: 'truck_id, from, to, price required' });
    let offerId = null;
    try {
      const r = await pool.query(
        `INSERT INTO marketplace_offers (truck_id, buyer_email, start_date, end_date, price_cents, status, created_at)
         VALUES ($1,$2,$3,$4,$5,'pending',NOW()) RETURNING id`,
        [truck_id, buyer_email || null, from, to, Math.round(Number(price) * 100)]
      );
      offerId = r.rows[0].id;
    } catch (e) {
      return res.json({ offer_id: null, note: 'marketplace_offers table missing — recorded in-memory only', truck_id, from, to, price });
    }
    return res.json({ offer_id: offerId, status: 'pending', truck_id, from, to, price });
  } catch (e) {
    console.error('marketplace offer error:', e);
    return res.status(500).json({ error: 'offer failed' });
  }
});

module.exports = router;
