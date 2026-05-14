const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/headlines - list all with campaign/truck/neighborhood names (paginated)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT h.*,
          c.name AS campaign_name,
          t.name AS truck_name,
          n.name AS neighborhood_name
        FROM headlines h
        LEFT JOIN campaigns c ON h.campaign_id = c.id
        LEFT JOIN trucks t ON h.truck_id = t.id
        LEFT JOIN neighborhoods n ON h.neighborhood_id = n.id
        ORDER BY h.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*) FROM headlines')
    ]);
    const total = parseInt(countRes.rows[0].count);
    res.json({
      data: dataRes.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Get headlines error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/headlines/:id - single with full details
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT h.*,
        c.name AS campaign_name,
        t.name AS truck_name,
        n.name AS neighborhood_name
      FROM headlines h
      LEFT JOIN campaigns c ON h.campaign_id = c.id
      LEFT JOIN trucks t ON h.truck_id = t.id
      LEFT JOIN neighborhoods n ON h.neighborhood_id = n.id
      WHERE h.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Headline not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get headline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/headlines - create
router.post('/', async (req, res) => {
  try {
    const { campaign_id, truck_id, neighborhood_id, headline_text, ai_prompt, ai_response, style, tone, status } = req.body;
    const result = await pool.query(
      `INSERT INTO headlines (campaign_id, truck_id, neighborhood_id, headline_text, ai_prompt, ai_response, style, tone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [campaign_id || null, truck_id || null, neighborhood_id || null, headline_text, ai_prompt || null, ai_response || null, style || null, tone || null, status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create headline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/headlines/:id - update
router.put('/:id', async (req, res) => {
  try {
    const { campaign_id, truck_id, neighborhood_id, headline_text, ai_prompt, ai_response, style, tone, status, impressions } = req.body;
    const result = await pool.query(
      `UPDATE headlines SET campaign_id = $1, truck_id = $2, neighborhood_id = $3, headline_text = $4,
       ai_prompt = $5, ai_response = $6, style = $7, tone = $8, status = $9, impressions = $10, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [campaign_id || null, truck_id || null, neighborhood_id || null, headline_text, ai_prompt || null, ai_response || null, style || null, tone || null, status, impressions || 0, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Headline not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update headline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/headlines/:id - delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM headlines WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Headline not found' });
    }
    res.json({ message: 'Headline deleted', headline: result.rows[0] });
  } catch (err) {
    console.error('Delete headline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
