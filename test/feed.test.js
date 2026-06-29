import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreEvent, rankEvents } from '../lib/feed.js';

const NOW = Date.parse('2026-06-21T12:00:00Z');
const inDays = (d) => new Date(NOW + d * 86400000).toISOString();

const konser = {
  id: 'a', title: 'Konser', category: ['konser'], is_free: false,
  start_at: inDays(2), popularity: 10, venue: { lat: 41.0, lng: 29.0 },
};
const atolyeUcretsiz = {
  id: 'b', title: 'Atolye', category: ['atolye'], is_free: true,
  start_at: inDays(3), popularity: 0, venue: { lat: 41.0, lng: 29.0 },
};

test('ilgi alani eslesmesi skoru yukseltir', () => {
  const withInterest = scoreEvent(konser, { interests: ['konser'] }, NOW).score;
  const without = scoreEvent(konser, { interests: ['tiyatro'] }, NOW).score;
  assert.ok(withInterest > without);
});

test('free_only ucretli etkinligi eler', () => {
  const r = scoreEvent(konser, { free_only: true }, NOW);
  assert.equal(r.score, -Infinity);
});

test('ucretsiz etkinlik bonus alir ve reason icerir', () => {
  const r = scoreEvent(atolyeUcretsiz, { interests: ['atolye'] }, NOW);
  assert.ok(r.reasons.includes('ucretsiz'));
});

test('yakin tarih, uzak tarihten yuksek recency skoru', () => {
  const near = scoreEvent({ ...konser, start_at: inDays(1) }, {}, NOW).score;
  const far = scoreEvent({ ...konser, start_at: inDays(13) }, {}, NOW).score;
  assert.ok(near > far);
});

test('konum yakinligi: yakin mekan daha yuksek', () => {
  const prefs = { home_lat: 41.0, home_lng: 29.0, max_distance_km: 25 };
  const near = scoreEvent(konser, prefs, NOW).score;
  const farEvent = { ...konser, venue: { lat: 41.5, lng: 29.5 } };
  const far = scoreEvent(farEvent, prefs, NOW).score;
  assert.ok(near > far);
});

test('rankEvents: limit uygular ve sirali doner', () => {
  const ranked = rankEvents([konser, atolyeUcretsiz], { interests: ['atolye'] }, { limit: 1, now: NOW });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].event.id, 'b'); // atolye ilgi alani eslesti
});

test('free_only filtresi rankEvents ciktisindan ucretliyi atar', () => {
  const ranked = rankEvents([konser, atolyeUcretsiz], { free_only: true }, { limit: 5, now: NOW });
  assert.ok(ranked.every((r) => r.event.is_free));
});
