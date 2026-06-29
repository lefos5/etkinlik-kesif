import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDates } from '../lib/connectors/kultur.js';
import { enrich } from '../lib/enrich.js';

test('parseDates: "DD-MM-YYYY HH:MM" -> ISO (+03:00)', () => {
  const html = '<div>Tarih: 26-06-2026 20:00</div>';
  assert.deepEqual(parseDates(html), ['2026-06-26T20:00:00+03:00']);
});

test('parseDates: baslangic-bitis araligi iki tarih dondurur', () => {
  const html = 'Baslangic 26-06-2026 20:00 - Bitis 26-06-2026 22:30';
  assert.deepEqual(parseDates(html), ['2026-06-26T20:00:00+03:00', '2026-06-26T22:30:00+03:00']);
});

test('parseDates: saatsiz tarih 00:00 olur', () => {
  assert.deepEqual(parseDates('Tarih: 06-07-2026'), ['2026-07-06T00:00:00+03:00']);
});

test('parseDates: tarih yoksa bos', () => {
  assert.deepEqual(parseDates('<div>tarih yok</div>'), []);
});

test('enrich: kultur turleri kanonik kategoriye eslesir', async () => {
  assert.ok((await enrich({ title: 'X', rawCategory: 'Bale' })).category.includes('sahne'));
  assert.ok((await enrich({ title: 'X', rawCategory: 'Dinleti' })).category.includes('konser'));
  assert.ok((await enrich({ title: 'X', rawCategory: 'Film Gösterimi' })).category.includes('film'));
  assert.ok((await enrich({ title: 'X', rawCategory: 'Atölye & Eğitim' })).category.includes('atolye'));
});
