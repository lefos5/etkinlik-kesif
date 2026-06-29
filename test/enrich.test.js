import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrich } from '../lib/enrich.js';
import { normalize, buildDedupKey } from '../lib/normalize.js';

test('enrich: ham kategoriyi kanonik slug ile esler', async () => {
  const r = await enrich({ title: 'X', description: '', rawCategory: 'Live Music' });
  assert.ok(r.category.includes('konser'));
});

test('enrich: ucretsiz metni tag + is_free uretir', async () => {
  const r = await enrich({ title: 'Ucretsiz Atolye', description: 'Herkese acik, bedava', rawCategory: 'Workshop', priceMin: 0, priceMax: 0 });
  assert.equal(r.isFree, true);
  assert.ok(r.tags.includes('ucretsiz'));
  assert.ok(r.category.includes('atolye'));
});

test('enrich: bilinmeyen kategori -> diger', async () => {
  const r = await enrich({ title: 'Bilinmeyen', description: '', rawCategory: 'zzz' });
  assert.deepEqual(r.category, ['diger']);
});

test('enrich: birlesik rawCategory (segment+genre) yine de eslesir', async () => {
  // Regresyon: basligi kategori kelimesi icermeyen ama rawCategory "Music Pop"
  // olan etkinlik konser olmali (eskiden "diger"e dusuyordu).
  const r = await enrich({ title: 'DJ Sercan Umut', description: '', rawCategory: 'Music Pop' });
  assert.ok(r.category.includes('konser'), `beklenen konser, gelen: ${r.category}`);
  assert.ok(!r.category.includes('diger'));
});

test('enrich: Arts & Theatre (Comedy) -> sahne/tiyatro', async () => {
  const r = await enrich({ title: 'Meksika Acmazi', description: '', rawCategory: 'Arts & Theatre Comedy' });
  assert.ok(r.category.includes('tiyatro') || r.category.includes('sahne'), `gelen: ${r.category}`);
});

test('enrich: uzun aciklama kategori kirliligi yapmaz', async () => {
  // Regresyon: aciklamada film/teknoloji/atolye gecse bile kategori sadece
  // rawCategory+baslik'tan gelmeli (konusma -> bulusma), 5 kategoriye dagilmamali.
  const r = await enrich({
    title: 'Konusma: Metni Gormek',
    description: 'Bu konusmada film gosterimi, teknoloji ve atolye konulari da anilacak.',
    rawCategory: 'Konusma',
  });
  assert.deepEqual(r.category, ['bulusma'], `gelen: ${r.category}`);
});

test('normalize: kanonik sekil + dedup_key uretir', async () => {
  const raw = {
    sourceUid: 'x1', title: '  Kadikoy Indie Konseri ', description: null,
    startAt: '2026-07-01T20:00:00Z', endAt: null,
    venue: { name: 'Dorock XL', city: 'Istanbul' },
    priceMin: 250, priceMax: 250, currency: 'TRY', isFree: false, rawCategory: 'Konser',
  };
  const { event, venue, sourceRef } = await normalize(raw);
  assert.equal(event.title, 'Kadikoy Indie Konseri'); // trim
  assert.equal(event.is_free, false);
  assert.equal(venue.name, 'Dorock XL');
  assert.equal(sourceRef.source_uid, 'x1');
  assert.equal(event.dedup_key, buildDedupKey({ title: raw.title, startAt: raw.startAt, venueName: 'Dorock XL' }));
});
