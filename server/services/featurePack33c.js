'use strict';
// Feature pack 33C pure helpers — no DB/provider side effects.
function hasAIKey(env) { env = env || process.env; return Boolean(env.OPENROUTER_API_KEY || env.OPENAI_API_KEY); }
function filterRecords(records, opts) {
  opts = opts || {};
  const list = Array.isArray(records) ? records : [];
  const q = String(opts.search || opts.q || '').trim().toLowerCase();
  return list.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (opts.status !== undefined && opts.status !== '' && String(r.status ?? '') !== String(opts.status)) return false;
    if (opts.type !== undefined && opts.type !== '' && String(r.type ?? r.drug_class ?? r.matter_type ?? r.industry ?? '') !== String(opts.type)) return false;
    if (!q) return true;
    return Object.values(r).some((v) => (v === false || v === 0 ? String(v) === q : String(v ?? '').toLowerCase().includes(q)));
  });
}
function toCSV(records) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return '';
  const keys = [...new Set(list.flatMap((r) => Object.keys(r || {})))];
  const esc = (v) => { if (v === null || v === undefined) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [keys.join(','), ...list.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
function createTaskStore() {
  const tasks = new Map(); let seq = 1;
  return {
    list(ownerId) { return [...tasks.values()].filter((t) => String(t.ownerId) === String(ownerId)); },
    create(ownerId, body) {
      body = body || {};
      const title = String(body.title || '').trim(); if (!title) throw new Error('title is required');
      const status = ['todo', 'in_progress', 'done'].includes(body.status) ? body.status : 'todo';
      const task = { id: seq++, ownerId, title, notes: body.notes ?? '', status, dueDate: body.dueDate ?? null, createdAt: new Date().toISOString() };
      tasks.set(task.id, task); return task;
    },
    update(ownerId, id, patch) {
      patch = patch || {};
      const t = tasks.get(Number(id)); if (!t || String(t.ownerId) !== String(ownerId)) return null;
      if (patch.title !== undefined) { if (!String(patch.title).trim()) throw new Error('title is required'); t.title = String(patch.title).trim(); }
      if (patch.status !== undefined) { if (!['todo', 'in_progress', 'done'].includes(patch.status)) throw new Error('invalid status'); t.status = patch.status; }
      if (patch.notes !== undefined) t.notes = patch.notes;
      if (patch.dueDate !== undefined) t.dueDate = patch.dueDate;
      return t;
    },
    _clear() { tasks.clear(); seq = 1; }
  };
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function sections(pairs) { return pairs.map(([label, value]) => ({ label, value })); }

function budgetPacing(records) {
  const list = Array.isArray(records) ? records : [];
  const total = list.reduce((s, r) => s + num(r.budget), 0);
  const zero = list.filter((r) => num(r.budget) === 0).length;
  return { recordCount: list.length, totalBudget: total, averageBudget: list.length ? Math.round(total / list.length) : 0, zeroBudgetCount: zero, hasBudget: total > 0,
    sections: sections([['Campaigns reviewed', list.length], ['Total recorded budget', total], ['Campaigns with zero budget', zero]]),
    summary: 'Total recorded budget ' + total + ' across ' + list.length + ' campaigns' };
}
function campaignStatusDigest(records) {
  const list = Array.isArray(records) ? records : [];
  const byStatus = {}; list.forEach((r) => { const s = String(r.status ?? ''); byStatus[s] = (byStatus[s] || 0) + 1; });
  const active = list.filter((r) => String(r.status || '').toLowerCase() === 'active').length;
  return { recordCount: list.length, activeCount: active, byStatus, hasActive: active > 0,
    sections: sections([['Campaigns reviewed', list.length], ['Active', active], ['Statuses', Object.keys(byStatus).length]]),
    summary: active + ' of ' + list.length + ' campaigns active' };
}
function headlineCoverageCheck(records) {
  const list = Array.isArray(records) ? records : [];
  const withCount = list.filter((r) => num(r.headline_count ?? r.headlineCount) > 0).length;
  return { recordCount: list.length, withHeadlinesCount: withCount, withoutHeadlinesCount: list.length - withCount, allCovered: list.length > 0 && withCount === list.length,
    sections: sections([['Campaigns reviewed', list.length], ['With recorded headlines', withCount], ['Without headlines', list.length - withCount]]),
    summary: withCount + ' of ' + list.length + ' campaigns have recorded headlines' };
}
module.exports = { hasAIKey, filterRecords, toCSV, createTaskStore, budgetPacing, campaignStatusDigest, headlineCoverageCheck };
