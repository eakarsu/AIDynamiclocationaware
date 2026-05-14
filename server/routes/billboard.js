const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// Use optionalAuth - billboard display devices may not be authenticated users
router.use(optionalAuth);

// GET /api/billboard - list all displays with truck/headline info
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bd.*,
        t.name AS truck_name,
        h.headline_text
      FROM billboard_displays bd
      LEFT JOIN trucks t ON bd.truck_id = t.id
      LEFT JOIN headlines h ON bd.headline_id = h.id
      ORDER BY bd.displayed_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get billboard displays error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/billboard/:id - single display detail
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bd.*,
        t.name AS truck_name,
        h.headline_text
      FROM billboard_displays bd
      LEFT JOIN trucks t ON bd.truck_id = t.id
      LEFT JOIN headlines h ON bd.headline_id = h.id
      WHERE bd.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billboard display not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get billboard display error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/billboard - create display record
router.post('/', async (req, res) => {
  try {
    const { truck_id, headline_id, neighborhood, latitude, longitude, duration_seconds, status } = req.body;
    const result = await pool.query(
      `INSERT INTO billboard_displays (truck_id, headline_id, neighborhood, latitude, longitude, duration_seconds, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [truck_id || null, headline_id || null, neighborhood || null, latitude || null, longitude || null, duration_seconds || null, status || 'displayed']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create billboard display error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/billboard/:id - delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM billboard_displays WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billboard display not found' });
    }
    res.json({ message: 'Billboard display deleted', display: result.rows[0] });
  } catch (err) {
    console.error('Delete billboard display error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
