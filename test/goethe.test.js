import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRSS } from '../lib/rss.js';
import { mapItem } from '../lib/connectors/goethe.js';
import { normalize } from '../lib/normalize.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
  <title>Konser : 25.06.2026-25.06.2026, Kaan Bulak Konseri</title>
  <link>https://www.goethe.de/ins/tr/tr/sta/ist/etkinlikler.cfm?fuseaction=events.detail&amp;event_id=27302090</link>
  <description><![CDATA[<p>Maison L&acirc;le sahnesinde, saat 20:00'da basliyor.</p>]]></description>
  <pubDate>Thu, 25 Jun 2026 00:00:00 +0200</pubDate>
</item>
<item>
  <title> Söyleşi : 01.07.2026, Felsefe Kulübü</title>
  <link>https://www.goethe.de/ins/tr/tr/sta/ist/etkinlikler.cfm?fuseaction=events.detail&amp;event_id=27295861</link>
  <description>1 Temmuz 2026, saat 19:00'da YouTube üzerinden canlı yayın online gerçekleşecek.</description>
  <pubDate>Wed, 01 Jul 2026 00:00:00 +0200</pubDate>
</item>
</channel></rss>`;

test('parseRSS: item sayisi + alanlar (CDATA/entity)', () => {
  const items = parseRSS(SAMPLE_RSS);
  assert.equal(items.length, 2);
  assert.match(items[0].link, /event_id=27302090/);
  assert.match(items[0].description, /Maison/);          // HTML etiketleri atildi
  assert.ok(!items[0].description.includes('<p>'));
});

test('mapItem: kategori + tarih + saat baslitan/aciklamadan cikarilir', () => {
  const [a] = parseRSS(SAMPLE_RSS);
  const ev = mapItem(a);
  assert.equal(ev.rawCategory, 'Konser');
  assert.equal(ev.title, 'Kaan Bulak Konseri');
  assert.equal(ev.startAt, '2026-06-25T20:00:00+03:00');  // saat aciklamadan
  assert.equal(ev.isFree, true);
  assert.equal(ev.sourceUid, '27302090');
  assert.match(ev.ticketUrl, /event_id=27302090/);
});

test('mapItem: online etkinlik mekani Online olur', () => {
  const items = parseRSS(SAMPLE_RSS);
  const ev = mapItem(items[1]);
  assert.equal(ev.venue.name, 'Online');
  assert.equal(ev.startAt, '2026-07-01T19:00:00+03:00');
});

test('mapItem + normalize: Konser -> konser, ucretsiz tag', async () => {
  const [a] = parseRSS(SAMPLE_RSS);
  const { event } = await normalize(mapItem(a));
  assert.ok(event.category.includes('konser'));
  assert.equal(event.is_free, true);
  assert.ok(event.tags.includes('ucretsiz'));
});

test('mapItem + normalize: Söyleşi -> bulusma', async () => {
  const items = parseRSS(SAMPLE_RSS);
  const { event } = await normalize(mapItem(items[1]));
  assert.ok(event.category.includes('bulusma'), `gelen: ${event.category}`);
});
