import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOgMeta } from '../lib/ogmeta.js';

function stubFetch(html, ok = true) {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok, text: async () => html });
  return () => { globalThis.fetch = orig; };
}

test('og:description ve og:image cikarir, entity coz', async () => {
  const html = `<html><head>
    <meta property="og:description" content="Duman&#39;in efsane konseri &amp; daha fazlasi.">
    <meta property="og:image" content="https://img/poster.jpg">
  </head></html>`;
  const restore = stubFetch(html);
  try {
    const m = await fetchOgMeta('https://example/etkinlik');
    assert.equal(m.description, "Duman'in efsane konseri & daha fazlasi.");
    assert.equal(m.image, 'https://img/poster.jpg');
  } finally { restore(); }
});

test('content-once siralama da calisir', async () => {
  const html = `<meta content="Aciklama metni butrada yeterince uzun." name="description">`;
  const restore = stubFetch(html);
  try {
    const m = await fetchOgMeta('https://example/x');
    assert.equal(m.description, 'Aciklama metni butrada yeterince uzun.');
  } finally { restore(); }
});

test('twitter:description fallback', async () => {
  const html = `<meta name="twitter:description" content="Twitter aciklamasi burada.">`;
  const restore = stubFetch(html);
  try {
    const m = await fetchOgMeta('https://example/x');
    assert.equal(m.description, 'Twitter aciklamasi burada.');
  } finally { restore(); }
});

test('meta yoksa bos doner', async () => {
  const restore = stubFetch('<html><head><title>x</title></head></html>');
  try {
    const m = await fetchOgMeta('https://example/x');
    assert.equal(m.description, null);
    assert.equal(m.image, null);
  } finally { restore(); }
});

test('HTTP hatasinda bos nesne', async () => {
  const restore = stubFetch('', false);
  try {
    const m = await fetchOgMeta('https://example/x');
    assert.deepEqual(m, {});
  } finally { restore(); }
});
