const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');
const { optionalAuth } = require('../middleware/auth');

// GPS may be posted by truck devices without auth, but we accept either auth state
router.use(optionalAuth);

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

// In-memory throttle for Nominatim free tier (1 req/sec)
let lastNominatimCallAt = 0;
async function throttledReverseGeocode(latitude, longitude) {
  const now = Date.now();
  const since = now - lastNominatimCallAt;
  if (since < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - since));
  }
  lastNominatimCallAt = Date.now();
  const geoResponse = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
    { headers: { 'User-Agent': 'DynamicAdsApp/1.0' } }
  );
  if (!geoResponse.ok) {
    throw new Error(`Nominatim ${geoResponse.status}`);
  }
  return geoResponse.json();
}

// Haversine distance (meters)
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// POST /api/gps/track - receive GPS coordinate, reverse geocode, save
// Also evaluates geofences and broadcasts via WebSocket
router.post('/track', async (req, res) => {
  try {
    const { truck_id, latitude, longitude, speed, heading } = req.body;
    if (!truck_id || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'truck_id, latitude, and longitude are required' });
    }

    let neighborhood = null;
    let city = null;
    let state = null;

    try {
      const geoData = await throttledReverseGeocode(latitude, longitude);
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

    // Geofence evaluation - if truck is within any geofence's radius, trigger event
    const geofencesTriggered = [];
    try {
      const fences = await pool.query(`
        SELECT g.*, n.name AS neighborhood_name
        FROM geofences g
        LEFT JOIN neighborhoods n ON g.neighborhood_id = n.id
      `);
      for (const f of fences.rows) {
        if (!f.center_latitude || !f.center_longitude) continue;
        const dist = haversineMeters(
          parseFloat(latitude), parseFloat(longitude),
          parseFloat(f.center_latitude), parseFloat(f.center_longitude)
        );
        if (dist <= (f.radius_meters || 500)) {
          await pool.query('UPDATE geofences SET last_triggered_at = NOW() WHERE id = $1', [f.id]);
          geofencesTriggered.push({ geofence_id: f.id, neighborhood_id: f.neighborhood_id, distance_m: Math.round(dist), neighborhood_name: f.neighborhood_name });
        }
      }
    } catch (fenceErr) {
      // geofences table may not exist yet
    }

    // Broadcast via WebSocket to subscribers of this truck
    try {
      const broker = req.app.get('wsBroker');
      if (broker) {
        broker.broadcast('truck:gps', {
          truck_id,
          latitude,
          longitude,
          neighborhood,
          city,
          state,
          recorded_at: result.rows[0].recorded_at,
          geofences_triggered: geofencesTriggered,
        });
      }
    } catch (e) {
      console.error('WS broadcast failed:', e.message);
    }

    res.status(201).json({ ...result.rows[0], geofences_triggered: geofencesTriggered });
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
