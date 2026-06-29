import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, ageBand } from '../lib/match.js';

const NOW = new Date('2026-06-21T12:00:00Z');

test('ortak ilgi skoru ve sebebi uretir', () => {
  const me = { interests: ['konser', 'tiyatro'], district: null, birth_year: null };
  const them = { interests: ['konser', 'tiyatro'], district: null, birth_year: null };
  const r = scoreCandidate(me, them, NOW);
  assert.equal(r.score, 50);                       // tam ortusme -> W_INTEREST
  assert.deepEqual(r.shared.sort(), ['konser', 'tiyatro']);
  assert.ok(r.reasons.some((x) => x.includes('ortak ilgi')));
});

test('hic ortak nokta yoksa dusuk skor, sebep yok', () => {
  const me = { interests: ['konser'], district: 'Kadıköy', birth_year: 2000 };
  const them = { interests: ['spor'], district: 'Beşiktaş', birth_year: 1980 };
  const r = scoreCandidate(me, them, NOW);
  assert.equal(r.shared.length, 0);
  assert.ok(r.score < 10);                         // sadece kismi yas puani olabilir
});

test('ayni semt +30 ve sebep', () => {
  const me = { interests: [], district: 'Kadıköy', birth_year: null };
  const them = { interests: [], district: 'Kadıköy', birth_year: null };
  const r = scoreCandidate(me, them, NOW);
  assert.equal(r.score, 30);
  assert.ok(r.reasons.some((x) => x.includes('Aynı semt')));
});

test('yas yakinligi: yasit (<=3 fark) ve azalan puan', () => {
  const me = { interests: [], district: null, birth_year: 2000 };       // 26
  const yasit = scoreCandidate(me, { interests: [], district: null, birth_year: 2000 }, NOW);
  assert.ok(yasit.reasons.includes('Yaşıt'));
  assert.equal(yasit.score, 20);                   // fark 0 -> tam yas puani

  const yakin = scoreCandidate(me, { interests: [], district: null, birth_year: 2002 }, NOW); // 2 fark
  assert.ok(yakin.reasons.includes('Yaşıt') && yakin.score < 20);

  const uzak = scoreCandidate(me, { interests: [], district: null, birth_year: 1985 }, NOW); // 15 fark
  assert.equal(uzak.score, 0);                     // AGE_SPAN'da sifir
});

test('skor 0..100 araliginda ve butun sinyaller toplanir', () => {
  const me = { interests: ['konser', 'tiyatro'], district: 'Kadıköy', birth_year: 2000 };
  const them = { interests: ['konser', 'tiyatro'], district: 'Kadıköy', birth_year: 2000 };
  const r = scoreCandidate(me, them, NOW);
  assert.equal(r.score, 100);                      // 50 + 30 + 20
});

test('ageBand: 5lik bant, alt sinir 18', () => {
  assert.equal(ageBand(1999, NOW), '25-29');       // 27
  assert.equal(ageBand(2008, NOW), '18-22');       // 18 -> alt sinir kenetli
  assert.equal(ageBand(null, NOW), null);
});
