const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// All A/B testing routes require auth
router.use(authMiddleware);

// POST /api/ab-tests - create A/B test for a campaign
router.post('/', async (req, res) => {
  try {
    const { campaign_id, test_name, headline_a, headline_b, start_date } = req.body;
    const errors = {};
    if (!campaign_id) errors.campaign_id = 'campaign_id is required';
    if (!test_name || !test_name.trim()) errors.test_name = 'test_name is required';
    if (!headline_a || !headline_a.trim()) errors.headline_a = 'headline_a is required';
    if (!headline_b || !headline_b.trim()) errors.headline_b = 'headline_b is required';
    if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Validation failed', errors });

    // Verify campaign exists
    const campaignRes = await pool.query('SELECT id FROM campaigns WHERE id = $1', [campaign_id]);
    if (campaignRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });

    const result = await pool.query(
      `INSERT INTO ab_tests (campaign_id, test_name, headline_a, headline_b, start_date, status,
         impressions_a, impressions_b, conversions_a, conversions_b)
       VALUES ($1, $2, $3, $4, $5, 'active', 0, 0, 0, 0) RETURNING *`,
      [campaign_id, test_name.trim(), headline_a.trim(), headline_b.trim(), start_date || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      // Table doesn't exist yet - return helpful message
      return res.status(503).json({
        error: 'A/B testing table not yet created. Run the schema migration to enable this feature.',
        hint: 'CREATE TABLE ab_tests (...)'
      });
    }
    console.error('Create AB test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ab-tests - list tests with pagination
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT t.*, c.name AS campaign_name
        FROM ab_tests t
        LEFT JOIN campaigns c ON t.campaign_id = c.id
        ORDER BY t.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*) FROM ab_tests')
    ]);
    const total = parseInt(countRes.rows[0].count);
    res.json({
      data: dataRes.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'A/B testing table not yet created.' });
    }
    console.error('List AB tests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ab-tests/:id - get test details with variants
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, c.name AS campaign_name
      FROM ab_tests t
      LEFT JOIN campaigns c ON t.campaign_id = c.id
      WHERE t.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'A/B test not found' });
    const test = result.rows[0];
    // Compute live conversion rates
    test.conversion_rate_a = test.impressions_a > 0
      ? ((test.conversions_a / test.impressions_a) * 100).toFixed(2)
      : '0.00';
    test.conversion_rate_b = test.impressions_b > 0
      ? ((test.conversions_b / test.impressions_b) * 100).toFixed(2)
      : '0.00';
    res.json(test);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'A/B testing table not yet created.' });
    }
    console.error('Get AB test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ab-tests/:id/record-impression - record which variant was shown
router.post('/:id/record-impression', async (req, res) => {
  try {
    const { variant } = req.body; // 'a' or 'b'
    if (!['a', 'b'].includes(variant)) {
      return res.status(400).json({ error: "variant must be 'a' or 'b'" });
    }
    const col = variant === 'a' ? 'impressions_a' : 'impressions_b';
    const result = await pool.query(
      `UPDATE ab_tests SET ${col} = ${col} + 1 WHERE id = $1 RETURNING id, impressions_a, impressions_b`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'A/B test not found' });
    res.json({ message: 'Impression recorded', ...result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'A/B testing table not yet created.' });
    }
    console.error('Record impression error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ab-tests/:id/record-conversion - record conversion for a variant
router.post('/:id/record-conversion', async (req, res) => {
  try {
    const { variant } = req.body; // 'a' or 'b'
    if (!['a', 'b'].includes(variant)) {
      return res.status(400).json({ error: "variant must be 'a' or 'b'" });
    }
    const col = variant === 'a' ? 'conversions_a' : 'conversions_b';
    const result = await pool.query(
      `UPDATE ab_tests SET ${col} = ${col} + 1 WHERE id = $1 RETURNING id, conversions_a, conversions_b`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'A/B test not found' });
    res.json({ message: 'Conversion recorded', ...result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'A/B testing table not yet created.' });
    }
    console.error('Record conversion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ab-tests/:id/results - compute winner by conversion rate with statistical summary
router.get('/:id/results', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, c.name AS campaign_name
      FROM ab_tests t
      LEFT JOIN campaigns c ON t.campaign_id = c.id
      WHERE t.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'A/B test not found' });
    const test = result.rows[0];

    const rateA = test.impressions_a > 0 ? test.conversions_a / test.impressions_a : 0;
    const rateB = test.impressions_b > 0 ? test.conversions_b / test.impressions_b : 0;

    let winner = 'insufficient_data';
    let confidence = 'low';
    let lift = null;

    const totalImpressions = test.impressions_a + test.impressions_b;
    if (totalImpressions >= 100) {
      if (rateA > rateB) {
        winner = 'A';
        lift = rateB > 0 ? (((rateA - rateB) / rateB) * 100).toFixed(1) : null;
      } else if (rateB > rateA) {
        winner = 'B';
        lift = rateA > 0 ? (((rateB - rateA) / rateA) * 100).toFixed(1) : null;
      } else {
        winner = 'tie';
      }
      confidence = totalImpressions >= 1000 ? 'high' : totalImpressions >= 300 ? 'medium' : 'low';
    }

    res.json({
      test_id: test.id,
      test_name: test.test_name,
      campaign: test.campaign_name,
      variants: {
        A: {
          headline: test.headline_a,
          impressions: test.impressions_a,
          conversions: test.conversions_a,
          conversion_rate: (rateA * 100).toFixed(2) + '%'
        },
        B: {
          headline: test.headline_b,
          impressions: test.impressions_b,
          conversions: test.conversions_b,
          conversion_rate: (rateB * 100).toFixed(2) + '%'
        }
      },
      winner,
      lift_percent: lift ? `${lift}%` : null,
      confidence,
      total_impressions: totalImpressions,
      status: test.status,
      note: totalImpressions < 100
        ? 'Need at least 100 total impressions for statistically meaningful results'
        : null
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'A/B testing table not yet created.' });
    }
    console.error('Get AB test results error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
