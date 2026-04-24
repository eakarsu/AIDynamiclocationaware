const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');

// GET /api/gps - list all GPS records with truck name
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*, t.name AS truck_name
      FROM gps_locations g
      LEFT JOIN trucks t ON g.truck_id = t.id
      ORDER BY g.recorded_at DESC
      LIMIT 500
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get GPS records error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/gps/truck/:truckId - GPS history for a truck
router.get('/truck/:truckId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM gps_locations WHERE truck_id = $1 ORDER BY recorded_at DESC LIMIT 200',
      [req.params.truckId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get truck GPS error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/gps/track - receive GPS coordinate, reverse geocode, save
router.post('/track', async (req, res) => {
  try {
    const { truck_id, latitude, longitude, speed, heading } = req.body;
    if (!truck_id || !latitude || !longitude) {
      return res.status(400).json({ error: 'truck_id, latitude, and longitude are required' });
    }

    // Reverse geocoding via Nominatim
    let neighborhood = null;
    let city = null;
    let state = null;

    try {
      const geoResponse = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { 'User-Agent': 'DynamicAdsApp/1.0' } }
      );
      const geoData = await geoResponse.json();

      if (geoData && geoData.address) {
        neighborhood = geoData.address.neighbourhood || geoData.address.suburb || geoData.address.quarter || null;
        city = geoData.address.city || geoData.address.town || geoData.address.village || null;
        state = geoData.address.state || null;
      }
    } catch (geoErr) {
      console.error('Geocoding error (continuing without location data):', geoErr.message);
    }

    const result = await pool.query(
      `INSERT INTO gps_locations (truck_id, latitude, longitude, speed, heading, neighborhood, city, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [truck_id, latitude, longitude, speed || null, heading || null, neighborhood, city, state]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Track GPS error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/gps/:id - delete a GPS record
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM gps_locations WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'GPS record not found' });
    }
    res.json({ message: 'GPS record deleted', record: result.rows[0] });
  } catch (err) {
    console.error('Delete GPS error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
