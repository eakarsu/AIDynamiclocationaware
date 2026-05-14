const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/analytics/summary - aggregate stats (must be before /:id)
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(impressions), 0)::int AS total_impressions,
        COALESCE(SUM(miles_driven), 0)::float AS total_miles_driven,
        COALESCE(SUM(neighborhoods_covered), 0)::int AS total_neighborhoods_covered,
        COALESCE(SUM(headlines_generated), 0)::int AS total_headlines_generated,
        COALESCE(AVG(engagement_score), 0)::float AS avg_engagement_score,
        COUNT(*)::int AS total_records
      FROM analytics
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get analytics summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics - list all with campaign names
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, c.name AS campaign_name, t.name AS truck_name
      FROM analytics a
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      LEFT JOIN trucks t ON a.truck_id = t.id
      ORDER BY a.date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/:id - single
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, c.name AS campaign_name, t.name AS truck_name
      FROM analytics a
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      LEFT JOIN trucks t ON a.truck_id = t.id
      WHERE a.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analytics record not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get analytics record error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/analytics - create
router.post('/', async (req, res) => {
  try {
    const { campaign_id, truck_id, date, impressions, neighborhoods_covered, miles_driven, headlines_generated, engagement_score } = req.body;
    const result = await pool.query(
      `INSERT INTO analytics (campaign_id, truck_id, date, impressions, neighborhoods_covered, miles_driven, headlines_generated, engagement_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [campaign_id || null, truck_id || null, date || new Date(), impressions || 0, neighborhoods_covered || 0, miles_driven || 0, headlines_generated || 0, engagement_score || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/analytics/:id - update
router.put('/:id', async (req, res) => {
  try {
    const { campaign_id, truck_id, date, impressions, neighborhoods_covered, miles_driven, headlines_generated, engagement_score } = req.body;
    const result = await pool.query(
      `UPDATE analytics SET campaign_id = $1, truck_id = $2, date = $3, impressions = $4,
       neighborhoods_covered = $5, miles_driven = $6, headlines_generated = $7, engagement_score = $8
       WHERE id = $9 RETURNING *`,
      [campaign_id || null, truck_id || null, date, impressions, neighborhoods_covered, miles_driven, headlines_generated, engagement_score, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analytics record not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/analytics/:id - delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM analytics WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analytics record not found' });
    }
    res.json({ message: 'Analytics record deleted', record: result.rows[0] });
  } catch (err) {
    console.error('Delete analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
