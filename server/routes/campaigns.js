const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/campaigns - list all with headline count
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COUNT(h.id)::int AS headline_count
      FROM campaigns c
      LEFT JOIN headlines h ON h.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/campaigns/:id - single with all headlines
router.get('/:id', async (req, res) => {
  try {
    const campaign = await pool.query('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
    if (campaign.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const headlines = await pool.query(
      'SELECT * FROM headlines WHERE campaign_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ ...campaign.rows[0], headlines: headlines.rows });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/campaigns - create
router.post('/', async (req, res) => {
  try {
    const { name, client_name, budget, start_date, end_date, status, target_demographics, target_neighborhoods, description } = req.body;
    const result = await pool.query(
      `INSERT INTO campaigns (name, client_name, budget, start_date, end_date, status, target_demographics, target_neighborhoods, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, client_name, budget, start_date, end_date, status || 'active', target_demographics || null, target_neighborhoods || null, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/campaigns/:id - update
router.put('/:id', async (req, res) => {
  try {
    const { name, client_name, budget, start_date, end_date, status, target_demographics, target_neighborhoods, description } = req.body;
    const result = await pool.query(
      `UPDATE campaigns SET name = $1, client_name = $2, budget = $3, start_date = $4, end_date = $5,
       status = $6, target_demographics = $7, target_neighborhoods = $8, description = $9, updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [name, client_name, budget, start_date, end_date, status, target_demographics || null, target_neighborhoods || null, description, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/campaigns/:id - delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM campaigns WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ message: 'Campaign deleted', campaign: result.rows[0] });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
