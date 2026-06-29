import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEvent } from '../lib/connectors/ticketmaster.js';
import { normalize } from '../lib/normalize.js';

// Discovery API v2 event seklini taklit eden gercekci ornek (biletix url'li).
const SAMPLE = {
  id: 'Z698xZ',
  name: 'Duman Konseri',
  info: 'Duman sahnede.',
  url: 'https://www.biletix.com/performance/ABCD/TURKIYE/tr',
  dates: { start: { dateTime: '2026-07-15T18:00:00Z', localDate: '2026-07-15', localTime: '21:00:00' } },
  classifications: [{ segment: { name: 'Music' }, genre: { name: 'Rock' } }],
  priceRanges: [{ min: 750, max: 1500, currency: 'TRY' }],
  images: [
    { ratio: '16_9', width: 1024, url: 'https://img/large.jpg' },
    { ratio: '4_3', width: 305, url: 'https://img/small.jpg' },
  ],
  promoter: { name: 'Pasion Turca' },
  _embedded: {
    venues: [{
      name: 'Volkswagen Arena',
      address: { line1: 'Maslak' },
      city: { name: 'Istanbul' },
      location: { latitude: '41.10', longitude: '29.01' },
    }],
  },
};

test('mapEvent: temel alanlari dogru cikarir', () => {
  const r = mapEvent(SAMPLE);
  assert.equal(r.sourceUid, 'Z698xZ');
  assert.equal(r.title, 'Duman Konseri');
  assert.equal(r.startAt, '2026-07-15T18:00:00Z');
  assert.equal(r.venue.name, 'Volkswagen Arena');
  assert.equal(r.venue.lat, 41.10);
  assert.equal(r.priceMin, 750);
  assert.equal(r.isFree, false);
  assert.equal(r.imageUrl, 'https://img/large.jpg'); // 16_9 en genis
  assert.match(r.ticketUrl, /biletix\.com/);
  assert.equal(r.rawCategory, 'Music Rock');
});

test('mapEvent + normalize: Music segmenti konser kategorisine eslesir', async () => {
  const raw = mapEvent(SAMPLE);
  const { event } = await normalize(raw);
  assert.ok(event.category.includes('konser'));
  assert.equal(event.is_free, false);
});

test('mapEvent: localDate fallback (dateTime yoksa) ISO uretir', () => {
  const ev = { ...SAMPLE, dates: { start: { localDate: '2026-08-01', localTime: '20:00:00' } } };
  const r = mapEvent(ev);
  assert.ok(!Number.isNaN(Date.parse(r.startAt)));
});

test('mapEvent: ucretsiz (min 0) is_free true', () => {
  const ev = { ...SAMPLE, priceRanges: [{ min: 0, max: 0, currency: 'TRY' }] };
  assert.equal(mapEvent(ev).isFree, true);
});

test('mapEvent: durum kodu -> status (cancelled/postponed/scheduled)', () => {
  const mk = (code) => mapEvent({ ...SAMPLE, dates: { ...SAMPLE.dates, status: { code } } });
  assert.equal(mk('cancelled').status, 'cancelled');
  assert.equal(mk('postponed').status, 'postponed');
  assert.equal(mk('rescheduled').status, 'postponed');
  assert.equal(mk('onsale').status, 'scheduled');
  assert.equal(mapEvent(SAMPLE).status, 'scheduled'); // status alani yoksa
});

test('BILETIX_AFFILIATE_ID set ise ticketUrl aff parametresi alir', () => {
  process.env.BILETIX_AFFILIATE_ID = 'test123';
  const r = mapEvent(SAMPLE);
  assert.match(r.ticketUrl, /aff=test123/);
  delete process.env.BILETIX_AFFILIATE_ID;
});
