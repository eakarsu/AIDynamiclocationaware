const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');

// GET /api/ai/logs - list all AI generation logs
router.get('/logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.*, c.name AS campaign_name
      FROM ai_generation_logs al
      LEFT JOIN campaigns c ON al.campaign_id = c.id
      ORDER BY al.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get AI logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ai/logs/:id - single log detail
router.get('/logs/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.*, c.name AS campaign_name
      FROM ai_generation_logs al
      LEFT JOIN campaigns c ON al.campaign_id = c.id
      WHERE al.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'AI log not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get AI log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ai/generate - THE MAIN AI FEATURE
router.post('/generate', async (req, res) => {
  const startTime = Date.now();

  try {
    const { truck_id, campaign_id, neighborhood_id, style, tone, custom_prompt } = req.body;

    if (!campaign_id || !neighborhood_id) {
      return res.status(400).json({ error: 'campaign_id and neighborhood_id are required' });
    }

    // Look up neighborhood demographics/interests
    const neighborhoodResult = await pool.query('SELECT * FROM neighborhoods WHERE id = $1', [neighborhood_id]);
    if (neighborhoodResult.rows.length === 0) {
      return res.status(404).json({ error: 'Neighborhood not found' });
    }
    const neighborhood = neighborhoodResult.rows[0];

    // Look up campaign details
    const campaignResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const campaign = campaignResult.rows[0];

    // Look up demographic data for richer context
    const demoResult = await pool.query(
      'SELECT category, metric_name, metric_value FROM demographic_data WHERE neighborhood_id = $1',
      [neighborhood_id]
    );
    const demographicSummary = demoResult.rows.map(d => `${d.metric_name}: ${d.metric_value}`).join(', ');

    // Build interests/demographics string
    const interests = neighborhood.top_interests ? neighborhood.top_interests.join(', ') : 'general consumer interests';
    const demographics = neighborhood.demographic_tags ? neighborhood.demographic_tags.join(', ') : 'mixed demographics';
    const incomeInfo = neighborhood.median_income ? `median income $${neighborhood.median_income.toLocaleString()}` : '';
    const ageInfo = neighborhood.median_age ? `median age ${neighborhood.median_age}` : '';
    const contextDetails = [demographics, incomeInfo, ageInfo, demographicSummary].filter(Boolean).join(', ');

    // Build the prompt
    const prompt = custom_prompt || `You are a creative advertising copywriter. Create 5 witty billboard headlines (max 10 words each) for a ${campaign.description || campaign.name} targeting ${neighborhood.name} - a neighborhood known for ${interests}. Demographics: ${contextDetails}. Style: ${style || 'bold'}. Tone: ${tone || 'engaging'}. Return as JSON array with fields: headline, target_audience, emotional_appeal, confidence_score.`;

    // Call OpenRouter API
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenRouter API error:', aiResponse.status, errorText);
      return res.status(502).json({ error: 'AI service error', details: errorText });
    }

    const aiData = await aiResponse.json();
    const latencyMs = Date.now() - startTime;
    const tokensUsed = aiData.usage ? (aiData.usage.total_tokens || 0) : 0;
    const aiContent = aiData.choices && aiData.choices[0] ? aiData.choices[0].message.content : '';

    // Try to parse JSON from AI response
    let parsedHeadlines = [];
    try {
      // Extract JSON array from response (handle markdown code blocks)
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedHeadlines = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', parseErr.message);
      // Return raw content if parsing fails
    }

    // Save to ai_generation_logs
    const logResult = await pool.query(
      `INSERT INTO ai_generation_logs (prompt, response, model, tokens_used, latency_ms, truck_id, neighborhood, campaign_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        prompt,
        JSON.stringify(aiData),
        process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
        tokensUsed,
        latencyMs,
        truck_id || null,
        neighborhood.name,
        campaign_id,
      ]
    );

    // Create headline records for each parsed headline
    const createdHeadlines = [];
    if (parsedHeadlines.length > 0) {
      for (const h of parsedHeadlines) {
        const headlineText = h.headline || h.text || '';
        if (headlineText) {
          const hResult = await pool.query(
            `INSERT INTO headlines (campaign_id, truck_id, neighborhood_id, headline_text, ai_prompt, ai_response, style, tone, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING *`,
            [campaign_id, truck_id || null, neighborhood_id, headlineText, prompt, JSON.stringify(h), style || null, tone || null]
          );
          createdHeadlines.push(hResult.rows[0]);
        }
      }
    }

    res.status(201).json({
      log: logResult.rows[0],
      headlines: parsedHeadlines,
      created_headlines: createdHeadlines,
      raw_response: aiContent,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
    });
  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// DELETE /api/ai/logs/:id - delete log
router.delete('/logs/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM ai_generation_logs WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'AI log not found' });
    }
    res.json({ message: 'AI log deleted', log: result.rows[0] });
  } catch (err) {
    console.error('Delete AI log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
