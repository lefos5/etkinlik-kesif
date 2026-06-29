import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseICS } from '../lib/ical.js';
import { makeIcalConnector } from '../lib/connectors/ical-factory.js';
import { normalize } from '../lib/normalize.js';

// SALT tarzi gercekci .ics ornegi: satir katlama, TZID, kacis, tarih-sadece dahil.
const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SALT//Agenda//TR
BEGIN:VEVENT
UID:salt-evt-1@saltonline.org
SUMMARY:Konusma: Metni Gormek
DESCRIPTION:Tasarim uzerine bir konusma\\, herkese acik.
DTSTART;TZID=Europe/Istanbul:20260626T190000
DTEND;TZID=Europe/Istanbul:20260626T210000
LOCATION:Salt Beyoglu
URL:https://saltonline.org/tr/2861
CATEGORIES:Konusma
END:VEVENT
BEGIN:VEVENT
UID:salt-evt-2@saltonline.org
SUMMARY:Sergi Turu: Barajdan Sizanlar bu cok uzun bir baslik oldugu
 icin katlanmis satir testi
DTSTART;VALUE=DATE:20260706
LOCATION:Salt Galata
CATEGORIES:Sergi Turu
END:VEVENT
END:VCALENDAR`;

test('parseICS: VEVENT sayisi ve temel alanlar', () => {
  const evs = parseICS(SAMPLE_ICS);
  assert.equal(evs.length, 2);
  assert.equal(evs[0].uid, 'salt-evt-1@saltonline.org');
  assert.equal(evs[0].summary, 'Konusma: Metni Gormek');
  assert.match(evs[0].description, /herkese acik/);
});

test('parseICS: TZID Istanbul -> +03:00 ISO', () => {
  const evs = parseICS(SAMPLE_ICS);
  assert.equal(evs[0].start, '2026-06-26T19:00:00+03:00');
  assert.equal(evs[0].end, '2026-06-26T21:00:00+03:00');
});

test('parseICS: satir katlama (folding) acilir', () => {
  const evs = parseICS(SAMPLE_ICS);
  assert.match(evs[1].summary, /katlanmis satir testi$/);
  assert.ok(!evs[1].summary.includes('\n'));
});

test('parseICS: tarih-sadece (VALUE=DATE) gun basina ayarlanir', () => {
  const evs = parseICS(SAMPLE_ICS);
  assert.equal(evs[1].start, '2026-07-06T00:00:00+03:00');
});

test('iCal connector: gecmis etkinlikleri eler, RawEvent uretir', async () => {
  const connector = makeIcalConnector({ id: 'salt', name: 'SALT', feedEnv: 'TEST_ICS_URL', defaultFree: true });
  // fetch'i sahte feed ile degistir
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => SAMPLE_ICS });
  process.env.TEST_ICS_URL = 'https://example/feed.ics';
  try {
    const raws = await connector.fetchEvents({ since: '2026-06-01T00:00:00Z' });
    assert.equal(raws.length, 2);
    assert.equal(raws[0].isFree, true);
    assert.equal(raws[0].venue.name, 'Salt Beyoglu');
    assert.equal(raws[0].ticketUrl, 'https://saltonline.org/tr/2861');
  } finally {
    globalThis.fetch = orig;
    delete process.env.TEST_ICS_URL;
  }
});

test('iCal -> normalize: Konusma kategorisi bulusma olur, ucretsiz', async () => {
  const evs = parseICS(SAMPLE_ICS);
  const raw = {
    sourceUid: evs[0].uid, title: evs[0].summary, description: evs[0].description,
    startAt: evs[0].start, endAt: evs[0].end,
    venue: { name: evs[0].location, city: 'Istanbul' },
    isFree: true, rawCategory: evs[0].categories,
  };
  const { event } = await normalize(raw);
  assert.ok(event.category.includes('bulusma'), `gelen: ${event.category}`);
  assert.equal(event.is_free, true);
  assert.ok(event.tags.includes('ucretsiz'));
});
