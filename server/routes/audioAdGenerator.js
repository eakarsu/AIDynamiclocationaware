// Audio-ad generator: voice-over creation for radio cross-promotion.
// v0 uses ElevenLabs or OpenAI TTS when configured; otherwise returns the
// rendered script and TTS parameters.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function llmScript(brief) {
  const key = process.env.OPENROUTER_API_KEY; // TODO: configure credentials
  if (!key) return null;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: 'Write a 30-second radio ad script (~75 words) for the given brief. End with a strong CTA.' },
        { role: 'user', content: brief },
      ],
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.choices?.[0]?.message?.content;
}

async function tts(text, voice = 'alloy') {
  // TODO: configure credentials — ELEVENLABS_API_KEY or OPENAI_API_KEY
  const el = process.env.ELEVENLABS_API_KEY;
  const oai = process.env.OPENAI_API_KEY;
  if (oai) {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${oai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice, input: text.slice(0, 4000) }),
    });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      return { provider: 'openai', base64: buf.toString('base64'), mime: 'audio/mpeg' };
    }
  }
  if (el) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': el, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
    });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      return { provider: 'elevenlabs', base64: buf.toString('base64'), mime: 'audio/mpeg' };
    }
  }
  return null;
}

// POST /api/audio-ad-generator/render { brief, voice? }
router.post('/render', aiRateLimiter, async (req, res) => {
  try {
    const { brief, voice } = req.body || {};
    if (!brief) return res.status(400).json({ error: 'brief required' });
    const script = await llmScript(brief);
    if (!script) return res.status(503).json({ error: 'OPENROUTER_API_KEY missing' });
    const audio = await tts(script, voice);
    try {
      await pool.query(`INSERT INTO ai_generation_logs (campaign_id, type, output, created_at) VALUES (NULL,'audio_ad',$1,NOW())`, [JSON.stringify({ brief, script, audio_provider: audio?.provider })]);
    } catch {}
    return res.json({ brief, script, audio });
  } catch (e) {
    console.error('audio-ad error:', e);
    return res.status(500).json({ error: 'render failed' });
  }
});

module.exports = router;
