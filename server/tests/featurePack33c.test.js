'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY;
const h = require('../services/featurePack33c');
test('filterRecords preserves false/0 and search', () => { assert.equal(h.filterRecords([{ name: 'Alpha', status: 'available' }, { name: 'Beta', status: 'sold' }], { search: 'alph', status: 'available' }).length, 1); assert.equal(h.filterRecords([{ name: 'A', v: 0, flag: false }], { search: '0' }).length, 1); });
test('toCSV preserves false/0/empty', () => { const csv = h.toCSV([{ a: 0, b: false, c: '' }]); assert.ok(csv.includes('0,false')); });
test('tasks create/update scoped', () => { const s = h.createTaskStore(); const t = s.create(7, { title: 'Follow up' }); assert.equal(s.list(7).length, 1); assert.equal(s.list(8).length, 0); assert.equal(s.update(7, t.id, { status: 'done' }).status, 'done'); assert.equal(s.update(8, t.id, { status: 'done' }), null); assert.throws(() => s.create(7, {}), /title/); });
test('fallback labelled not AI', () => { assert.equal(h.hasAIKey({}), false); });
test('domain fallback deterministic', () => { const a = h.budgetPacing([{ budget: 0 }]); assert.equal(a.totalBudget, 0); assert.equal(a.hasBudget, false); assert.ok(Array.isArray(a.sections)); const b = h.campaignStatusDigest([]); assert.equal(b.recordCount, 0); });
