const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/trucks - list all trucks with latest GPS location
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        g.latitude AS last_latitude,
        g.longitude AS last_longitude,
        g.neighborhood AS last_neighborhood,
        g.city AS last_city,
        g.recorded_at AS last_seen
      FROM trucks t
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, neighborhood, city, recorded_at
        FROM gps_locations
        WHERE truck_id = t.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) g ON true
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get trucks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/trucks/:id - single truck with recent GPS locations
router.get('/:id', async (req, res) => {
  try {
    const truck = await pool.query('SELECT * FROM trucks WHERE id = $1', [req.params.id]);
    if (truck.rows.length === 0) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const gps = await pool.query(
      'SELECT * FROM gps_locations WHERE truck_id = $1 ORDER BY recorded_at DESC LIMIT 50',
      [req.params.id]
    );

    res.json({ ...truck.rows[0], recent_locations: gps.rows });
  } catch (err) {
    console.error('Get truck error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trucks - create truck
router.post('/', async (req, res) => {
  try {
    const { name, plate_number, driver_name, status, billboard_size, route_name, image_url } = req.body;
    const result = await pool.query(
      `INSERT INTO trucks (name, plate_number, driver_name, status, billboard_size, route_name, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, plate_number, driver_name, status || 'active', billboard_size, route_name, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create truck error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Plate number already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/trucks/:id - update truck
router.put('/:id', async (req, res) => {
  try {
    const { name, plate_number, driver_name, status, billboard_size, route_name, image_url } = req.body;
    const result = await pool.query(
      `UPDATE trucks SET name = $1, plate_number = $2, driver_name = $3, status = $4,
       billboard_size = $5, route_name = $6, image_url = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, plate_number, driver_name, status, billboard_size, route_name, image_url, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Truck not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update truck error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/trucks/:id - delete truck (cascades GPS, displays)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM trucks WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Truck not found' });
    }
    res.json({ message: 'Truck deleted', truck: result.rows[0] });
  } catch (err) {
    console.error('Delete truck error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
