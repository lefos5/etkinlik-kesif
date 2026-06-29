// Resmi etkinlik sayfasindan paylasim meta verisini ceker (og:description, og:image).
// Amac: eksik aciklamayi RESMI kaynaktan doldurmak (uydurma degil). Sadece kendi
// DB'mizdeki connector kaynakli ticket_url'ler icin cagrilir (SSRF riski yok).
// HTML'i regex ile ayikla — head meta'lari icin yeterli; tam parser gerekmez.

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Bir meta degerini iki olasi siralama icin dener (property/name once veya content once).
function metaValue(html, attr, key) {
  const a = `${attr}=["']${key}["']`;
  const patterns = [
    new RegExp(`<meta[^>]+${a}[^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${a}`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

/**
 * fetchOgMeta(url) -> { description?, image? }
 * Hata/zaman asimi durumunda bos nesne doner (cagiran sessizce gecmeli).
 */
export async function fetchOgMeta(url, { timeoutMs = 5000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Tarayici benzeri header'lar: bazi siteler eksik/yabanci UA'ya 401/403 doner.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return {};
    const html = (await res.text()).slice(0, 200_000); // head icin ilk 200KB yeter
    const description =
      metaValue(html, 'property', 'og:description') ||
      metaValue(html, 'name', 'twitter:description') ||
      metaValue(html, 'name', 'description') || null;
    const image = metaValue(html, 'property', 'og:image') || null;
    return { description, image };
  } catch {
    return {};
  } finally {
    clearTimeout(t);
  }
}
