// Geofence CRUD - used by GPS tracker to auto-trigger AI re-generation
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/geofences - paginated list
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT g.*, n.name AS neighborhood_name
        FROM geofences g
        LEFT JOIN neighborhoods n ON g.neighborhood_id = n.id
        ORDER BY g.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*) FROM geofences'),
    ]);
    const total = parseInt(countRes.rows[0].count);
    res.json({ data: dataRes.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    if (err.code === '42P01') return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    console.error('List geofences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/geofences/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT g.*, n.name AS neighborhood_name
      FROM geofences g
      LEFT JOIN neighborhoods n ON g.neighborhood_id = n.id
      WHERE g.id = $1
    `, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Geofence not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Get geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/geofences
router.post('/', async (req, res) => {
  try {
    const { neighborhood_id, name, center_latitude, center_longitude, radius_meters, auto_generate } = req.body;
    const errors = {};
    if (!neighborhood_id) errors.neighborhood_id = 'neighborhood_id is required';
    if (center_latitude == null) errors.center_latitude = 'center_latitude is required';
    if (center_longitude == null) errors.center_longitude = 'center_longitude is required';
    if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Validation failed', errors });

    const r = await pool.query(
      `INSERT INTO geofences (neighborhood_id, name, center_latitude, center_longitude, radius_meters, auto_generate)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [neighborhood_id, name || null, center_latitude, center_longitude, radius_meters || 500, auto_generate !== false]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Create geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/geofences/:id
router.put('/:id', async (req, res) => {
  try {
    const { neighborhood_id, name, center_latitude, center_longitude, radius_meters, auto_generate } = req.body;
    const r = await pool.query(
      `UPDATE geofences SET neighborhood_id = $1, name = $2, center_latitude = $3, center_longitude = $4,
       radius_meters = $5, auto_generate = $6 WHERE id = $7 RETURNING *`,
      [neighborhood_id, name || null, center_latitude, center_longitude, radius_meters || 500, auto_generate !== false, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Geofence not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Update geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/geofences/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM geofences WHERE id = $1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Geofence not found' });
    res.json({ message: 'Geofence deleted', geofence: r.rows[0] });
  } catch (err) {
    console.error('Delete geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
