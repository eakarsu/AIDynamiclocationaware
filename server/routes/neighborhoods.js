const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/neighborhoods - list all
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM neighborhoods ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get neighborhoods error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/neighborhoods/:id - single with demographic_data joined
router.get('/:id', async (req, res) => {
  try {
    const neighborhood = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [req.params.id]);
    if (neighborhood.rows.length === 0) {
      return res.status(404).json({ error: 'Neighborhood not found' });
    }

    const demographics = await pool.query(
      'SELECT * FROM demographic_data WHERE neighborhood_id = $1 ORDER BY category',
      [req.params.id]
    );

    res.json({ ...neighborhood.rows[0], demographic_data: demographics.rows });
  } catch (err) {
    console.error('Get neighborhood error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/neighborhoods - create
router.post('/', async (req, res) => {
  try {
    const { name, city, state, zipcode, latitude, longitude, population, median_age, median_income, description, top_interests, demographic_tags } = req.body;
    const result = await pool.query(
      `INSERT INTO neighborhoods (name, city, state, zipcode, latitude, longitude, population, median_age, median_income, description, top_interests, demographic_tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [name, city, state, zipcode, latitude, longitude, population, median_age, median_income, description, top_interests || null, demographic_tags || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create neighborhood error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/neighborhoods/:id - update
router.put('/:id', async (req, res) => {
  try {
    const { name, city, state, zipcode, latitude, longitude, population, median_age, median_income, description, top_interests, demographic_tags } = req.body;
    const result = await pool.query(
      `UPDATE neighborhoods SET name = $1, city = $2, state = $3, zipcode = $4, latitude = $5, longitude = $6,
       population = $7, median_age = $8, median_income = $9, description = $10, top_interests = $11,
       demographic_tags = $12, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [name, city, state, zipcode, latitude, longitude, population, median_age, median_income, description, top_interests || null, demographic_tags || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Neighborhood not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update neighborhood error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/neighborhoods/:id - delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM neighborhoods WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Neighborhood not found' });
    }
    res.json({ message: 'Neighborhood deleted', neighborhood: result.rows[0] });
  } catch (err) {
    console.error('Delete neighborhood error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
