import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trigramSimilarity, isDuplicate, findMatchIndex } from '../lib/dedup.js';
import { buildDedupKey } from '../lib/normalize.js';

test('trigramSimilarity: ayni baslik ~1, alakasiz ~0', () => {
  assert.ok(trigramSimilarity('Kadikoy Indie Konseri', 'Kadikoy Indie Konseri') > 0.99);
  assert.ok(trigramSimilarity('Kadikoy Indie Konseri', 'JavaScript Meetup') < 0.2);
});

test('isDuplicate: ayni dedup_key -> kesin eslesme', () => {
  const k = buildDedupKey({ title: 'X Konseri', startAt: '2026-07-01T20:00:00Z', venueName: 'Dorock' });
  const a = { title: 'X Konseri', start_at: '2026-07-01T20:00:00Z', dedup_key: k };
  const b = { title: 'X Konseri farkli yazim', start_at: '2026-07-01T21:00:00Z', dedup_key: k };
  assert.equal(isDuplicate(a, b), true);
});

test('isDuplicate: ayni gun+mekan+benzer baslik -> eslesir', () => {
  const a = { title: 'Kadikoy Indie Konseri', start_at: '2026-07-01T20:00:00Z', venueName: 'Dorock XL Kadikoy' };
  const b = { title: 'Kadikoy Indie Konseri (Dorock XL)', start_at: '2026-07-01T20:30:00Z', venueName: 'Dorock XL Kadikoy' };
  assert.equal(isDuplicate(a, b), true);
});

test('isDuplicate: farkli gun -> eslesmez', () => {
  const a = { title: 'Ayni Konser', start_at: '2026-07-01T20:00:00Z', venueName: 'Dorock' };
  const b = { title: 'Ayni Konser', start_at: '2026-07-02T20:00:00Z', venueName: 'Dorock' };
  assert.equal(isDuplicate(a, b), false);
});

test('isDuplicate: ayni gun ama farkli mekan -> eslesmez', () => {
  const a = { title: 'Ayni Konser', start_at: '2026-07-01T20:00:00Z', venueName: 'Dorock' };
  const b = { title: 'Ayni Konser', start_at: '2026-07-01T21:00:00Z', venueName: 'Zorlu PSM' };
  assert.equal(isDuplicate(a, b), false);
});

test('findMatchIndex: listede eslesmeyi bulur', () => {
  const existing = [
    { title: 'JS Meetup', start_at: '2026-07-05T18:00:00Z', venueName: 'Kolektif' },
    { title: 'Kadikoy Indie Konseri', start_at: '2026-07-01T20:00:00Z', venueName: 'Dorock XL Kadikoy' },
  ];
  const cand = { title: 'Kadikoy Indie Konseri (Dorock)', start_at: '2026-07-01T20:30:00Z', venueName: 'Dorock XL Kadikoy' };
  assert.equal(findMatchIndex(cand, existing), 1);
});
