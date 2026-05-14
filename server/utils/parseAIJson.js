// Robust 3-strategy JSON parser for AI responses
// 1) direct JSON.parse
// 2) strip ```json fences then parse
// 3) extract { ... } substring then parse
function parseAIJson(text) {
  if (text == null) return null;
  if (typeof text !== 'string') return text;

  // Strategy 1: direct parse
  try { return JSON.parse(text); } catch (e) {}

  // Strategy 2: strip markdown code fences
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}

  // Strategy 3: extract first {...} or [...] block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
  }
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch (e) {}
  }

  return null;
}

module.exports = { parseAIJson };
