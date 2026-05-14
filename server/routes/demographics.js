const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/demographics - list all with neighborhood names
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, n.name AS neighborhood_name
      FROM demographic_data d
      LEFT JOIN neighborhoods n ON d.neighborhood_id = n.id
      ORDER BY d.neighborhood_id, d.category
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get demographics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/demographics/:id - single
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, n.name AS neighborhood_name
      FROM demographic_data d
      LEFT JOIN neighborhoods n ON d.neighborhood_id = n.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Demographic record not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get demographic error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/demographics - create
router.post('/', async (req, res) => {
  try {
    const { neighborhood_id, category, metric_name, metric_value, data_source } = req.body;
    const result = await pool.query(
      `INSERT INTO demographic_data (neighborhood_id, category, metric_name, metric_value, data_source)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [neighborhood_id, category, metric_name, metric_value, data_source || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create demographic error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/demographics/:id - update
router.put('/:id', async (req, res) => {
  try {
    const { neighborhood_id, category, metric_name, metric_value, data_source } = req.body;
    const result = await pool.query(
      `UPDATE demographic_data SET neighborhood_id = $1, category = $2, metric_name = $3,
       metric_value = $4, data_source = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [neighborhood_id, category, metric_name, metric_value, data_source || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Demographic record not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update demographic error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/demographics/:id - delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM demographic_data WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Demographic record not found' });
    }
    res.json({ message: 'Demographic record deleted', record: result.rows[0] });
  } catch (err) {
    console.error('Delete demographic error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
