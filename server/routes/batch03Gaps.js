// ============================================================
// === Batch 03 Gaps & Frontend Mounts ===
// Auto-generated Gap-feature endpoints (lean v0).
// TODO: configure credentials (set OPENROUTER_API_KEY).
// ============================================================
const express = require('express');
const router = express.Router();

let _gfReady = false;
async function ensureGapTable(pool) {
  if (_gfReady || !pool) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS gap_features (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(120) NOT NULL,
      user_id INT,
      input JSONB,
      output JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    _gfReady = true;
  } catch (_) { /* tolerant of missing DB */ }
}

async function callAI(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, status: 503, error: 'AI service unavailable. Set OPENROUTER_API_KEY (TODO: configure credentials).' };
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
      }),
    });
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return { ok: r.ok, status: r.status, text, raw: data };
  } catch (e) {
    return { ok: false, status: 500, error: String(e.message || e) };
  }
}

function buildHandler(slug, label, hint) {
  return async (req, res) => {
    const body = req.body || {};
    const userId = req.user?.id || null;
    const prompt = `Feature: ${label}\nContext hint: ${hint}\nUser input:\n${JSON.stringify(body, null, 2)}\n\nProduce a concise, actionable response.`;
    const ai = await callAI(prompt);
    try {
      const pool = req.app.locals.pool || req.app.get('pool') || null;
      if (pool) {
        await ensureGapTable(pool);
        await pool.query('INSERT INTO gap_features(slug, user_id, input, output) VALUES ($1,$2,$3,$4)',
          [slug, userId, body, { text: ai.text || ai.error || null }]);
      }
    } catch (_) { /* tolerant */ }
    if (!ai.ok) return res.status(ai.status || 500).json({ error: ai.error || ai.text || `Upstream error (${ai.status})`, slug });
    res.json({ slug, label, result: ai.text });
  };
}

router.post('/gap-no-vision-model-competitor-billboard-analysis', buildHandler('gap-ai-no-vision-model-competitor-billboard-analysis', 'No vision-model competitor-billboard analysis', 'No vision-model competitor-billboard analysis'));
router.post('/gap-no-weather-triggered-creative-selection', buildHandler('gap-ai-no-weather-triggered-creative-selection', 'No weather-triggered creative selection', 'No weather-triggered creative selection'));
router.post('/gap-no-voice-audio-ad-generation-for-radio-extension', buildHandler('gap-ai-no-voice-audio-ad-generation-for-radio-extension', 'No voice/audio ad generation for radio extension', 'No voice/audio ad generation for radio extension'));
router.post('/gap-no-webhooks-no-dsp-ssp-integration-callbacks', buildHandler('gap-non-no-webhooks-no-dsp-ssp-integration-callbacks', 'No webhooks (no DSP/SSP integration callbacks)', 'No webhooks (no DSP/SSP integration callbacks)'));
router.post('/gap-no-notification-system-no-driver-operator-alerts', buildHandler('gap-non-no-notification-system-no-driver-operator-alerts', 'No notification system (no driver/operator alerts)', 'No notification system (no driver/operator alerts)'));
router.post('/gap-no-external-integration-no-programmatic-ooh-marketplace-con', buildHandler('gap-non-no-external-integration-no-programmatic-ooh-marketplace-con', 'No external integration (no programmatic-OOH marketplace con', 'No external integration (no programmatic-OOH marketplace connector)'));
router.post('/gap-limited-campaign-scheduling-no-day-parting-ui-surfaced', buildHandler('gap-non-limited-campaign-scheduling-no-day-parting-ui-surfaced', 'Limited campaign scheduling (no day-parting UI surfaced)', 'Limited campaign scheduling (no day-parting UI surfaced)'));
router.post('/gap-no-qr-sms-capture-endpoint-for-response-tracking', buildHandler('gap-non-no-qr-sms-capture-endpoint-for-response-tracking', 'No QR/SMS capture endpoint for response tracking', 'No QR/SMS capture endpoint for response tracking'));
router.post('/gap-no-invoice-billing-module', buildHandler('gap-non-no-invoice-billing-module', 'No invoice/billing module', 'No invoice/billing module'));
router.post('/gap-no-driver-mobile-app-endpoints', buildHandler('gap-non-no-driver-mobile-app-endpoints', 'No driver mobile-app endpoints', 'No driver mobile-app endpoints'));

module.exports = router;
