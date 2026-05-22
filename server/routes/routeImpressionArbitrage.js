const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({
  summary: { candidate_routes: 12, underpriced_zones: 5, projected_lift: '18%', risk_blocks: 2 },
  routes: [
    { route: 'Downtown lunch loop', cpm: 4.8, impressions: 42000, action: 'shift budget from evening route' },
    { route: 'Stadium ingress', cpm: 7.2, impressions: 68000, action: 'increase bid before event' },
    { route: 'Airport hotel corridor', cpm: 5.1, impressions: 31000, action: 'brand-safety review' },
  ],
}));

module.exports = router;
