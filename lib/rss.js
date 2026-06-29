// Minimal RSS 2.0 ayristirici (bagimlilik yok). <item> bloklarini cikarir.
// CDATA ve temel HTML entity'lerini cozer, description'daki HTML etiketlerini atar.

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function tagText(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return null;
  let v = m[1].trim();
  v = v.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  return decodeEntities(v);
}

function stripTags(s = '') {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** parseRSS(xml) -> [{ title, link, description, pubDate }] */
export function parseRSS(xml) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => ({
    title: tagText(b, 'title'),
    link: tagText(b, 'link'),
    description: stripTags(tagText(b, 'description') || ''),
    pubDate: tagText(b, 'pubDate'),
  }));
}
