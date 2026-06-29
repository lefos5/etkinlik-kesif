// Frontend (vanilla, build yok). API ile konusur; tercihler localStorage'da.
import { getToken, onAuth, signUp, signIn, signOut, resetPassword, updatePassword, uploadAvatar } from './auth.js';

const API = (window.API_BASE || ''); // ayni origin'de Vercel serve eder

const CATEGORIES = [
  ['konser', 'Konser'], ['tiyatro', 'Tiyatro'], ['sahne', 'Sahne'],
  ['atolye', 'Atolye'], ['bulusma', 'Bulusma'], ['sergi', 'Sergi'],
  ['film', 'Film'], ['spor', 'Spor'], ['aile', 'Aile'], ['teknoloji', 'Teknoloji'],
];

const store = {
  get prefs() {
    try { return JSON.parse(localStorage.getItem('prefs')) || { interests: [], freeOnly: false }; }
    catch { return { interests: [], freeOnly: false }; }
  },
  set prefs(v) { localStorage.setItem('prefs', JSON.stringify(v)); },
  get saved() {
    try { return new Set(JSON.parse(localStorage.getItem('saved')) || []); }
    catch { return new Set(); }
  },
  set saved(set) { localStorage.setItem('saved', JSON.stringify([...set])); },
};

// ---- Kaydet / favoriler -----------------------------------------------------
const isSaved = (id) => store.saved.has(id);
function toggleSaved(id) {
  const s = store.saved;
  const on = !s.has(id);
  if (on) { s.add(id); track(id, 'save'); } else { s.delete(id); track(id, 'unsave'); }
  store.saved = s;
  updateSavedCount();
  // Kaydettiklerim ekrani aciksa listeyi tazele (cikarileni dusur)
  const sec = document.getElementById('savedSection');
  if (sec && !sec.hidden) loadSaved();
  return on;
}
function updateSavedCount() {
  const el = document.getElementById('savedCount');
  if (el) el.textContent = store.saved.size || '';
}

let activeFilter = null;
let searchQuery = '';
let currentUser = null;           // Supabase oturum kullanicisi (yoksa null)
let currentProfile = null;        // giris yapan kullanicinin profili
let browseFreeOnly = false;       // gozat'a ozel ucretsiz filtresi (prefs'ten bagimsiz)
let browseDistrict = '';          // gozat semt filtresi ('' = tum semtler)
const selectedDates = new Set();  // secili 'YYYY-MM-DD' gunler (cogul); bos = tum gunler

// ---- API yardimcilari -------------------------------------------------------
// Oturum varsa istege JWT ekler (sunucu getUser ile kullaniciyi tanir).
async function authHeaders(base = {}) {
  const token = await getToken();
  return token ? { ...base, authorization: `Bearer ${token}` } : base;
}
async function api(path, opts = {}) {
  const headers = await authHeaders(opts.headers || {});
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const b = await r.json(); if (b?.error) msg = b.error; } catch { /* govde JSON degil */ }
    throw new Error(msg);
  }
  return r.json();
}
async function track(event_id, kind) {
  const headers = await authHeaders({ 'content-type': 'application/json' });
  fetch(`${API}/api/track`, {
    method: 'POST', headers,
    body: JSON.stringify({ event_id, kind }),
  }).catch(() => {});
}

// ---- RSVP (etkinlik katilimi, v2) ------------------------------------------
async function getAttendance(eventId) {
  if (!currentUser) return null;
  try { const { attendance } = await api(`/api/attendance?event_id=${eventId}`); return attendance; }
  catch { return null; }
}
function setAttendance(eventId, status, wantCompany) {
  return api('/api/attendance', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, status, want_company: wantCompany }),
  }).then((r) => r.attendance);
}
function clearAttendance(eventId) {
  return api('/api/attendance', {
    method: 'DELETE', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId }),
  });
}

// ---- Render -----------------------------------------------------------------
const fmtDate = (iso) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', hour: '2-digit', minute: '2-digit' });

// Fiyat metni: ucretsiz / tek fiyat / aralik. null ise bos.
function fmtPrice(ev) {
  if (ev.is_free) return 'Ücretsiz';
  const min = ev.price_min, max = ev.price_max, cur = ev.currency === 'TRY' ? '₺' : (ev.currency || '');
  if (min == null && max == null) return '';
  if (min != null && max != null && min !== max) return `${cur}${Math.round(min)}–${Math.round(max)}`;
  const v = min ?? max;
  return v != null ? `${cur}${Math.round(v)}` : '';
}

// Kategoriye gore yedek emoji (gorsel yoksa).
function catEmoji(ev) {
  const c = (ev.category || [])[0];
  return { konser: '🎵', tiyatro: '🎭', sahne: '🎪', sergi: '🖼️', film: '🎬',
    atolye: '🛠️', bulusma: '💬', spor: '⚽', aile: '🧸', teknoloji: '💻' }[c] || (ev.is_free ? '🎟️' : '🎵');
}

// Kaynak id -> kullaniciya gosterilecek ad
const SOURCE_LABELS = { ticketmaster: 'Biletix', salt: 'SALT', goethe: 'Goethe-Institut', kultur: 'Kültür İstanbul', mock: 'Kaynak' };

// Baslangic (- bitis) tarih/saat. Ayni gunse yalniz bitis saati gosterilir.
function fmtDateRange(startIso, endIso) {
  const start = fmtDate(startIso);
  if (!endIso) return start;
  const s = new Date(startIso), e = new Date(endIso);
  const endStr = s.toDateString() === e.toDateString()
    ? e.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : fmtDate(endIso);
  return `${start} – ${endStr}`;
}

function eventCard(ev) {
  const card = document.createElement('div');
  card.className = 'card';
  // Rozetleri tekillestir: ayni etiket ( or. "ucretsiz") hem kategori/free hem
  // neden rozetinde tekrar etmesin.
  const shown = new Set();
  const cats = (ev.category || []).slice(0, 2)
    .filter((c) => !shown.has(c) && shown.add(c))
    .map((c) => `<span class="badge">${c}</span>`).join('');
  const free = ev.is_free && !shown.has('ucretsiz') && shown.add('ucretsiz')
    ? '<span class="badge free">ucretsiz</span>' : '';
  const reasons = (ev._reasons || [])
    .filter((r) => !shown.has(r) && shown.add(r))
    .slice(0, 1)
    .map((r) => `<span class="badge reason">${r}</span>`).join('');
  const venue = ev.venue?.name ? ` · ${ev.venue.name}` : '';
  const price = fmtPrice(ev);
  const emoji = catEmoji(ev);
  const thumb = ev.image_url
    ? `<img class="thumb" src="${escapeHtml(ev.image_url)}" alt="" loading="lazy">`
    : `<div class="thumb thumb-fallback">${emoji}</div>`;
  card.innerHTML = `
    <div class="thumb-wrap">
      ${thumb}
      <button class="save-btn${isSaved(ev.id) ? ' on' : ''}" type="button" aria-label="Kaydet" title="Kaydet">♥</button>
    </div>
    <div class="body">
      <h3>${escapeHtml(ev.title)}</h3>
      <div class="meta">${fmtDate(ev.start_at)}${escapeHtml(venue)}</div>
      <div class="cats">${cats}${free}${reasons}</div>
      ${price ? `<div class="price">${price}</div>` : ''}
    </div>`;
  // Gorsel yuklenemezse emoji yedegine dus.
  const img = card.querySelector('img.thumb');
  if (img) img.onerror = () => { img.outerHTML = `<div class="thumb thumb-fallback">${emoji}</div>`; };
  // Kaydet butonu (karta tiklamayi tetiklemesin)
  const saveBtn = card.querySelector('.save-btn');
  saveBtn.onclick = (e) => { e.stopPropagation(); saveBtn.classList.toggle('on', toggleSaved(ev.id)); };
  card.onclick = () => { track(ev.id, 'click'); openDetail(ev.id); };
  return card;
}

function renderInto(el, events, emptyMsg) {
  el.innerHTML = '';
  if (!events?.length) { el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
  events.forEach((ev) => el.appendChild(eventCard(ev)));
}

// Veri gelene kadar gosterilen yer-tutucu kartlar.
function skeletonHTML(n) {
  return Array.from({ length: n }, () => `
    <div class="card skeleton">
      <div class="thumb sk"></div>
      <div class="body">
        <div class="sk-line sk" style="width:90%"></div>
        <div class="sk-line sk" style="width:60%"></div>
        <div class="sk-line sk" style="width:40%;margin-top:auto"></div>
      </div>
    </div>`).join('');
}
function renderSkeletons(el, n = 6) { el.innerHTML = skeletonHTML(n); }

// Gun bazli gruplama yardimcilari (Istanbul saati)
const trDate = (iso, opts) => new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', ...opts });
function dayKeyTr(iso) { return trDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function dayLabel(iso) {
  const now = Date.now();
  const k = dayKeyTr(iso);
  const dateStr = trDate(iso, { day: 'numeric', month: 'long' });           // "23 Haziran"
  if (k === dayKeyTr(new Date(now).toISOString())) return `Bugün · ${dateStr}`;
  if (k === dayKeyTr(new Date(now + 86400000).toISOString())) return `Yarın · ${dateStr}`;
  return `${trDate(iso, { weekday: 'long' })} · ${dateStr}`;                 // "Cumartesi · 27 Haziran"
}

// Etkinlikleri gune gore gruplayip baslikli bolumler halinde render eder.
function renderGrouped(el, events, emptyMsg) {
  el.innerHTML = '';
  if (!events?.length) { el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }

  const groups = new Map();                       // sirali geldigi icin gun sirasi korunur
  for (const ev of events) {
    const k = dayKeyTr(ev.start_at);
    (groups.get(k) || groups.set(k, []).get(k)).push(ev);
  }

  for (const evs of groups.values()) {
    const section = document.createElement('div');
    section.className = 'day-group';
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = dayLabel(evs[0].start_at);
    const grid = document.createElement('div');
    grid.className = 'grid';
    evs.forEach((ev) => grid.appendChild(eventCard(ev)));
    section.append(header, grid);
    el.appendChild(section);
  }
}

// İlgi alanlari tek kaynak: giris varsa hesap (profiles.interests), yoksa localStorage.
function currentInterests() {
  return (currentUser && currentProfile) ? (currentProfile.interests || []) : store.prefs.interests;
}
async function setInterests(interests) {
  store.prefs = { ...store.prefs, interests };          // ayna: anonim fallback + logout tutarliligi
  if (currentUser) {                                    // giris varsa hesap yetkili kaynak
    const { profile } = await api('/api/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interests }),
    });
    currentProfile = profile;
  }
}

// ---- Yukleme akislari -------------------------------------------------------
async function loadFeed() {
  const interests = currentInterests();
  const params = new URLSearchParams({ limit: '6' });
  if (interests.length) params.set('interests', interests.join(','));
  if (store.prefs.freeOnly) params.set('free', '1');
  const hint = document.getElementById('feedHint');
  renderSkeletons(document.getElementById('feed'), 6);
  try {
    const { feed, personalized } = await api(`/api/feed?${params}`);
    hint.textContent = personalized
      ? `İlgi alanlarına göre seçildi (${interests.join(', ') || 'genel'})`
      : 'İlgi alanı seç, sana özel önerelim →';
    renderInto(document.getElementById('feed'), feed, 'Henüz etkinlik yok. Ingest çalıştır: npm run ingest:mock');
  } catch (e) {
    hint.textContent = `Feed yuklenemedi: ${e.message} (API/DB ayakta mi?)`;
  }
}

let browseEvents = [];      // sayfalama birikimi
let browseOffset = 0;
let browseLoading = false;

async function loadBrowse(append = false) {
  if (browseLoading) return;
  browseLoading = true;
  if (!append) { browseEvents = []; browseOffset = 0; }

  const dayKeys = [...selectedDates].sort();
  const params = new URLSearchParams({ limit: '100', offset: String(browseOffset) });
  if (activeFilter) params.set('category', activeFilter);
  if (browseFreeOnly) params.set('free', '1');
  if (browseDistrict) params.set('district', browseDistrict);
  if (searchQuery) params.set('q', searchQuery);
  if (dayKeys.length) {
    // Secili gunler: min-max araligini cek, istemcide suz (sayfalama yok).
    params.set('from', new Date(`${dayKeys[0]}T00:00:00`).toISOString());
    params.set('to', new Date(`${dayKeys[dayKeys.length - 1]}T23:59:59`).toISOString());
  }
  // Normalde TUM gelecek (cap yok); offset ile "daha fazla" yuklenir.

  const el = document.getElementById('events');
  if (!append) el.innerHTML = `<div class="grid">${skeletonHTML(8)}</div>`;
  try {
    let { events } = await api(`/api/events?${params}`);
    const got = events.length;
    if (dayKeys.length) events = events.filter((e) => selectedDates.has(ymd(new Date(e.start_at))));
    browseEvents = append ? browseEvents.concat(events) : events;
    browseOffset += 100;
    const hasMore = got === 100 && !dayKeys.length;   // tarih secimi tek pencere -> sayfalama yok
    const empty = dayKeys.length ? 'Seçili günlerde etkinlik yok.'
      : searchQuery ? `"${searchQuery}" için sonuç yok.` : 'Etkinlik bulunamadı.';
    renderGrouped(el, browseEvents, empty);
    renderLoadMore(hasMore);
  } catch (e) {
    el.innerHTML = `<div class="empty">Yüklenemedi: ${e.message}</div>`;
  } finally {
    browseLoading = false;
  }
}

// Etkinligi olan semtleri dropdown'a doldur (bir kez).
async function populateDistricts() {
  const sel = document.getElementById('districtSelect');
  if (!sel) return;
  try {
    const { districts } = await api('/api/districts');
    for (const d of districts || []) {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      sel.appendChild(o);
    }
  } catch { /* dropdown bos kalir, sorun degil */ }
}

function renderLoadMore(hasMore) {
  const c = document.getElementById('loadMore');
  if (!c) return;
  if (!hasMore) { c.innerHTML = ''; return; }
  c.innerHTML = '<button id="loadMoreBtn" class="ghost" type="button">Daha fazla göster</button>';
  c.querySelector('#loadMoreBtn').onclick = () => loadBrowse(true);
}

async function openDetail(id) {
  const dlg = document.getElementById('detailDialog');
  const body = document.getElementById('detailBody');
  body.innerHTML = '<div class="muted">Yükleniyor…</div>';
  dlg.showModal();
  track(id, 'view');
  try {
    const { event: ev, sources } = await api(`/api/events/${id}`);

    // Aksiyon linki: biletliyse "Bilet al", ucretsizse "Kayit ol / Etkinlik sayfasi".
    const actionLabel = ev.is_free ? 'Etkinlik sayfası' : 'Bilet al';
    const linkedSource = (sources || []).find((s) => s.ticket_url);
    const srcLabel = linkedSource ? (SOURCE_LABELS[linkedSource.source_id] || linkedSource.source_id) : null;
    const links = (sources || []).filter((s) => s.ticket_url).map((s) => {
      const src = SOURCE_LABELS[s.source_id] || s.source_id;
      return `<a href="${escapeHtml(s.ticket_url)}" target="_blank" rel="noopener" data-src="${s.source_id}">${src} — ${actionLabel} →</a>`;
    }).join('');
    // Resmi link yoksa: yanlis link riski almadan, hazir bir internet aramasi sun.
    // (Bulunan bir URL'yi "resmi kayit linki" diye basmiyoruz — guven icin onemli.)
    const searchQ = encodeURIComponent(
      [ev.title, ev.venue?.name, ev.organizer, ev.is_free ? 'kayıt' : 'bilet'].filter(Boolean).join(' '));
    const fallback = `
      <a class="search-link" href="https://www.google.com/search?q=${searchQ}" target="_blank" rel="noopener">🔍 Bu etkinliği internette ara</a>
      <p class="muted note">${ev.is_free ? 'Resmi kayıt linki kaynakta belirtilmemiş' : 'Resmi bilet linki kaynakta belirtilmemiş'}${ev.organizer ? ` · Düzenleyen: ${escapeHtml(ev.organizer)}` : ''}.</p>`;

    // Durum uyarisi (ertelendi/iptal)
    const statusMap = { postponed: '⏳ Ertelendi', cancelled: '⚠️ İptal edildi' };
    const statusBadge = ev.status && statusMap[ev.status]
      ? `<div class="status-badge ${ev.status}">${statusMap[ev.status]}</div>` : '';

    // Bilgi satirlari (kontenjan yalniz veride varsa)
    const rows = [
      ['🗓️', 'Tarih', fmtDateRange(ev.start_at, ev.end_at)],
      ['📍', 'Yer', [ev.venue?.name, ev.venue?.district].filter(Boolean).join(', ') || '—'],
      ['💰', 'Fiyat', fmtPrice(ev) || 'Belirtilmemiş'],
      ev.capacity != null ? ['👥', 'Kontenjan', String(ev.capacity)] : null,
      ev.organizer ? ['🎤', 'Düzenleyen', ev.organizer] : null,
    ].filter(Boolean);
    const info = rows.map(([ic, k, v]) =>
      `<div class="info-row"><span class="ic">${ic}</span><span class="info-k">${k}</span><span class="info-v">${escapeHtml(v)}</span></div>`).join('');

    const hero = ev.image_url
      ? `<img class="detail-hero" src="${escapeHtml(ev.image_url)}" alt="" onerror="this.remove()">` : '';
    const cats = (ev.category || []).map((c) => `<span class="badge">${c}</span>`).join('')
      + (ev.is_free ? ' <span class="badge free">ücretsiz</span>' : '');

    body.innerHTML = `
      ${hero}
      ${statusBadge}
      <div class="detail-head">${escapeHtml(ev.title)}</div>
      <div class="cats">${cats}</div>
      <div class="detail-actions">
        <button id="detailSave" type="button" class="save-toggle${isSaved(id) ? ' on' : ''}">♥ <span>${isSaved(id) ? 'Kaydedildi' : 'Kaydet'}</span></button>
        <button id="rsvpGoing" type="button" class="save-toggle rsvp-going">✅ <span>Gideceğim</span></button>
        <button id="rsvpInterested" type="button" class="save-toggle rsvp-interested">⭐ <span>İlgileniyorum</span></button>
      </div>
      <label id="wantCompanyRow" class="want-company" hidden>
        <input type="checkbox" id="wantCompany" />
        <span>Eşlik arıyorum — bu etkinliğe birlikte gidecek biriyle eşleş</span>
      </label>
      <button id="findCompanions" type="button" class="ghost find-companions" hidden>🧑‍🤝‍🧑 Eşlik bul</button>
      <div class="detail-info">${info}</div>
      <div class="detail-desc">
        <h4>Etkinlik hakkında</h4>
        <p${ev.description ? '' : ' class="muted"'}>${ev.description
          ? escapeHtml(ev.description)
          : srcLabel ? `Bu etkinlik için açıklama ${srcLabel} sayfasında.` : 'Bu etkinlik için açıklama sağlanmamış.'}</p>
      </div>
      <div class="ticket-links">${links || fallback}</div>`;
    body.querySelectorAll('a[data-src]').forEach((a) => a.addEventListener('click', () => track(id, 'ticket_click')));
    const ds = body.querySelector('#detailSave');
    ds.onclick = () => {
      const on = toggleSaved(id);
      ds.classList.toggle('on', on);
      ds.querySelector('span').textContent = on ? 'Kaydedildi' : 'Kaydet';
    };

    // RSVP: Gideceğim / İlgileniyorum (+ eşlik arıyorum)
    const goingBtn = body.querySelector('#rsvpGoing');
    const interestedBtn = body.querySelector('#rsvpInterested');
    const wcRow = body.querySelector('#wantCompanyRow');
    const wcCheck = body.querySelector('#wantCompany');
    const findBtn = body.querySelector('#findCompanions');
    const paintRsvp = (att) => {
      goingBtn.classList.toggle('on', att?.status === 'going');
      interestedBtn.classList.toggle('on', att?.status === 'interested');
      wcRow.hidden = !att;
      wcCheck.checked = att ? att.want_company : false;
      findBtn.hidden = !(att && att.want_company);    // eslik arama acikken goster
    };
    findBtn.onclick = () => openCompanions(id);
    let att = await getAttendance(id);
    paintRsvp(att);
    const choose = async (status) => {
      if (!currentUser) { dlg.close(); openAuth('login'); return; }
      goingBtn.disabled = interestedBtn.disabled = true;
      try {
        if (att?.status === status) { await clearAttendance(id); att = null; }   // ayni butona tekrar -> kaldir
        else att = await setAttendance(id, status, att ? att.want_company : true);
        paintRsvp(att);
      } catch (e) { alert('İşlem başarısız: ' + e.message); }
      finally { goingBtn.disabled = interestedBtn.disabled = false; }
    };
    goingBtn.onclick = () => choose('going');
    interestedBtn.onclick = () => choose('interested');
    wcCheck.onchange = async () => {
      if (!att) return;
      try { att = await setAttendance(id, att.status, wcCheck.checked); }
      catch (e) { alert('İşlem başarısız: ' + e.message); wcCheck.checked = att.want_company; }
    };
  } catch (e) {
    body.innerHTML = `<div class="muted">Detay yüklenemedi: ${e.message}</div>`;
  }
}

// ---- Eşlik bul (eşleşme adayları, v2 M2) ------------------------------------
async function openCompanions(eventId) {
  const dlg = document.getElementById('companionsDialog');
  const body = document.getElementById('companionsBody');
  body.innerHTML = '<div class="muted">Yükleniyor…</div>';
  dlg.showModal();
  try {
    const { companions } = await api(`/api/events/${eventId}/companions`);
    if (!companions.length) {
      body.innerHTML = '<div class="empty">Şimdilik bu etkinlikte eşlik arayan başka kimse yok. Daha sonra tekrar bak.</div>';
      return;
    }
    body.innerHTML = companions.map(companionCard).join('');
  } catch (e) {
    body.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}
function companionCard(c) {
  const av = c.avatar_url
    ? `<img src="${escapeHtml(c.avatar_url)}" alt="">`
    : escapeHtml(initials(c.nickname || '?'));
  const statusLabel = c.status === 'going' ? 'Gidecek' : 'İlgileniyor';
  const meta = [statusLabel, c.district, c.age_band].filter(Boolean).map(escapeHtml).join(' · ');
  const badges = (c.reasons || []).map((r) => `<span class="badge reason">${escapeHtml(r)}</span>`).join('');
  return `
    <div class="companion">
      <div class="comp-avatar">${av}</div>
      <div class="comp-body">
        <div class="comp-top"><span class="comp-nick">@${escapeHtml(c.nickname || '—')}</span><span class="comp-score">%${c.score} uyum</span></div>
        <div class="comp-meta">${meta}</div>
        ${c.bio ? `<div class="comp-bio">${escapeHtml(c.bio)}</div>` : ''}
        <div class="comp-badges">${badges}</div>
      </div>
      <button class="ghost comp-connect" type="button" disabled title="Yakında">Eşlik isteği <span class="soon">(yakında)</span></button>
    </div>`;
}

// ---- Kaydettiklerim gorunumu ------------------------------------------------
function showHome() {
  document.getElementById('savedSection').hidden = true;
  document.getElementById('feedSection').hidden = false;
  document.getElementById('browseSection').hidden = false;
}
function showSaved() {
  document.getElementById('feedSection').hidden = true;
  document.getElementById('browseSection').hidden = true;
  document.getElementById('savedSection').hidden = false;
  window.scrollTo(0, 0);
  loadSaved();
}
async function loadSaved() {
  const ids = [...store.saved];
  const el = document.getElementById('saved');
  const hint = document.getElementById('savedHint');
  if (!ids.length) {
    el.innerHTML = '<div class="empty">Henüz etkinlik kaydetmedin. Kartlardaki ♥ ile kaydedebilirsin.</div>';
    hint.textContent = '';
    return;
  }
  renderSkeletons(el, Math.min(ids.length, 8));
  try {
    const { events } = await api(`/api/events?ids=${ids.join(',')}&limit=100`);
    hint.textContent = `${events.length} etkinlik`;
    renderInto(el, events, 'Kaydettiklerin görüntülenemedi.');
  } catch (e) {
    el.innerHTML = `<div class="empty">Yüklenemedi: ${e.message}</div>`;
  }
}

// ---- Takvim (tarih secimi) --------------------------------------------------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
let calMonth = new Date(); calMonth.setDate(1); calMonth.setHours(0, 0, 0, 0);

// O ayda etkinligi olan gunlerin kumesi (takvimde nokta isareti icin).
async function eventDaysOfMonth(y, m) {
  const from = new Date(y, m, 1).toISOString();
  const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
  try {
    const { events } = await api(`/api/events?from=${from}&to=${to}&limit=100`);
    return new Set(events.map((e) => ymd(new Date(e.start_at))));
  } catch { return new Set(); }
}

const eventDaysCache = new Map();   // "y-m" -> Set(gun) ; aylar arasi gezinme hizli olsun

// Takvimi ANINDA cizer (beklemeden). Etkinlik noktalari cache'te varsa hemen,
// yoksa arka planda cekilip eklenir.
function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  document.getElementById('calTitle').textContent = `${TR_MONTHS[m]} ${y}`;
  const now = new Date();
  document.getElementById('calPrev').disabled = new Date(y, m, 1) <= new Date(now.getFullYear(), now.getMonth(), 1);

  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7;   // Pzt=0
  const days = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cached = eventDaysCache.get(`${y}-${m}`);

  let html = '';
  for (let i = 0; i < firstWeekday; i++) html += '<span class="cal-cell"></span>';
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d);
    const key = ymd(date);
    const past = date < today;
    const cls = ['cal-cell', 'cal-day'];
    if (past) cls.push('past');
    if (cached?.has(key)) cls.push('has-event');
    if (selectedDates.has(key)) cls.push('selected');
    if (key === ymd(today)) cls.push('today');
    html += `<button type="button" class="${cls.join(' ')}" ${past ? 'disabled' : ''} data-d="${key}">${d}</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-day:not(.past)').forEach((b) => { b.onclick = () => toggleDay(b.dataset.d); });

  if (!cached) applyEventDots(y, m);   // arka planda etkinlik noktalarini ekle
}

async function applyEventDots(y, m) {
  const evDays = await eventDaysOfMonth(y, m);
  eventDaysCache.set(`${y}-${m}`, evDays);
  // data-d tam tarih oldugu icin stale risk yok: baska aya gecildiyse eslesmez.
  document.querySelectorAll('#calGrid .cal-day[data-d]').forEach((b) => {
    if (evDays.has(b.dataset.d)) b.classList.add('has-event');
  });
}

function openCalendar() {
  const keys = [...selectedDates].sort();
  if (keys.length) { const [yy, mm] = keys[0].split('-').map(Number); calMonth = new Date(yy, mm - 1, 1); }
  else { calMonth = new Date(); calMonth.setDate(1); calMonth.setHours(0, 0, 0, 0); }
  document.getElementById('calDialog').showModal();
  updateApplyBtn();
  renderCalendar();
}
function toggleDay(key) {
  if (selectedDates.has(key)) selectedDates.delete(key); else selectedDates.add(key);
  renderCalendar();        // sadece takvim gorseli guncellenir; arka plan Uygula'da yenilenir
  updateApplyBtn();
}
function updateApplyBtn() {
  const b = document.getElementById('calApply');
  if (b) b.textContent = selectedDates.size ? `Uygula (${selectedDates.size})` : 'Uygula';
}
function clearDate() {
  selectedDates.clear();
  updateDateChip();
  loadBrowse();
}
function updateDateChip() {
  const chip = document.getElementById('dateChip');
  const btn = document.getElementById('dateBtn');
  const n = selectedDates.size;
  if (n) {
    let label;
    if (n === 1) {
      const d = new Date(`${[...selectedDates][0]}T00:00:00`);
      label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
    } else {
      label = `${n} gün seçili`;
    }
    chip.hidden = false;
    chip.innerHTML = `📅 ${label} <button class="chip-x" type="button" aria-label="Temizle">✕</button>`;
    chip.querySelector('.chip-x').onclick = clearDate;
    btn.classList.add('active');
  } else {
    chip.hidden = true; chip.innerHTML = '';
    btn.classList.remove('active');
  }
}

// ---- Tercih paneli ----------------------------------------------------------
function buildPrefsDialog() {
  const wrap = document.getElementById('prefsChips');
  const interests = currentInterests();
  wrap.innerHTML = '';
  CATEGORIES.forEach(([slug, label]) => {
    const c = document.createElement('div');
    c.className = 'chip' + (interests.includes(slug) ? ' active' : '');
    c.textContent = label;
    c.onclick = () => c.classList.toggle('active');
    c.dataset.slug = slug;
    wrap.appendChild(c);
  });
  document.getElementById('freeOnly').checked = store.prefs.freeOnly;
}

function buildFilterChips() {
  const wrap = document.getElementById('filterChips');
  wrap.innerHTML = '';

  // Ucretsiz toggle (kategoriden bagimsiz; ayni anda kategori + ucretsiz secilebilir)
  const free = document.createElement('div');
  free.className = 'chip free-toggle' + (browseFreeOnly ? ' active' : '');
  free.textContent = 'Ücretsiz';
  free.onclick = () => { browseFreeOnly = !browseFreeOnly; buildFilterChips(); loadBrowse(); };
  wrap.appendChild(free);

  const all = document.createElement('div');
  all.className = 'chip' + (activeFilter == null ? ' active' : '');
  all.textContent = 'Tümü';
  all.onclick = () => { activeFilter = null; buildFilterChips(); loadBrowse(); };
  wrap.appendChild(all);
  CATEGORIES.forEach(([slug, label]) => {
    const c = document.createElement('div');
    c.className = 'chip' + (activeFilter === slug ? ' active' : '');
    c.textContent = label;
    c.onclick = () => { activeFilter = slug; buildFilterChips(); loadBrowse(); };
    wrap.appendChild(c);
  });
}

// ---- Olaylar ----------------------------------------------------------------
document.getElementById('prefsBtn').onclick = () => { buildPrefsDialog(); document.getElementById('prefsDialog').showModal(); };
document.getElementById('savedBtn').onclick = () => {
  const sec = document.getElementById('savedSection');
  if (sec.hidden) showSaved(); else showHome();
};
document.getElementById('brand').onclick = showHome;   // logoya tiklayinca ana ekran

// Takvim olaylari
document.getElementById('dateBtn').onclick = openCalendar;
document.getElementById('calPrev').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); };
document.getElementById('calNext').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); };
document.getElementById('calClear').onclick = () => { selectedDates.clear(); document.getElementById('calDialog').close(); };
document.getElementById('calApply').onclick = () => document.getElementById('calDialog').close();
// Takvim KAPANINCA uygula (Uygula / Tum gunler / dis tiklama / Esc — hepsi tek noktadan).
document.getElementById('calDialog').addEventListener('close', () => { updateDateChip(); loadBrowse(); });
document.getElementById('prefsForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'save') return;
  const interests = [...document.querySelectorAll('#prefsChips .chip.active')].map((c) => c.dataset.slug);
  store.prefs = { ...store.prefs, freeOnly: document.getElementById('freeOnly').checked };
  try { await setInterests(interests); }                // giris varsa hesaba da yazar
  catch (err) { console.warn('ilgi alanlari kaydedilemedi', err); }
  loadFeed(); loadBrowse();
});

function escapeHtml(s = '') { return s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

// Arama kutusu (debounce'lu)
const searchBox = document.getElementById('searchBox');
if (searchBox) {
  let t;
  searchBox.addEventListener('input', () => {
    clearTimeout(t);
    // Son tustan 0.5 sn sonra ara; bu sure icinde tekrar yazilirsa sifirlanir.
    t = setTimeout(() => { searchQuery = searchBox.value.trim(); loadBrowse(); }, 500);
  });
  // Enter'a basinca beklemeden hemen ara.
  searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(t); searchQuery = searchBox.value.trim(); loadBrowse(); }
  });
}

// Semt secimi
const districtSelect = document.getElementById('districtSelect');
if (districtSelect) {
  districtSelect.addEventListener('change', () => { browseDistrict = districtSelect.value; loadBrowse(); });
}

// ---- Auth + Profil ----------------------------------------------------------
function initials(name) {
  const p = (name || '').trim().split(/\s+/);
  if (!p[0]) return '?';
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
}
const GUEST_AVATAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>';
function updateAuthUI() {
  const btn = document.getElementById('authBtn');
  btn.classList.add('is-avatar');                                       // her zaman yuvarlak avatar butonu
  if (!currentUser) {
    btn.innerHTML = `<span class="avatar-sm guest">${GUEST_AVATAR}</span>`;   // giris yapilmamis: kisi ikonu
    btn.title = 'Giriş yap';
    return;
  }
  const name = currentProfile?.display_name || (currentUser.email || '').split('@')[0] || 'Hesabım';
  const av = currentProfile?.avatar_url
    ? `<img src="${escapeHtml(currentProfile.avatar_url)}" alt="">`
    : initials(name);
  btn.innerHTML = `<span class="avatar-sm">${av}</span>`;               // giris yapilmis: foto veya bas harf
  btn.title = name;
}
async function loadMyProfile() {
  try {
    const { profile } = await api('/api/profile');
    currentProfile = profile;
    // Senkron: hesapta ilgi yoksa ama anonimken secilmisse hesaba tasi (secimler kaybolmasin)
    if (!profile.interests?.length && store.prefs.interests.length) await setInterests(store.prefs.interests);
    else store.prefs = { ...store.prefs, interests: profile.interests || [] };   // hesap -> anasayfa aynasi
  } catch { currentProfile = null; }
  updateAuthUI();
}

let authMode = 'login';   // 'login' | 'signup'
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.getElementById('authTitle').textContent = signup ? 'Hesap oluştur' : 'Giriş yap';
  document.getElementById('authSubmit').textContent = signup ? 'Hesap oluştur' : 'Giriş yap';
  document.getElementById('authSwitchText').textContent = signup ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?';
  document.getElementById('authSwitchBtn').textContent = signup ? 'Giriş yap' : 'Kayıt ol';
  document.getElementById('nameField').hidden = !signup;
  document.getElementById('kvkkField').hidden = !signup;
  document.getElementById('authForgot').style.display = signup ? 'none' : 'inline';
  document.getElementById('authKvkk').checked = false;
  const pw = document.getElementById('authPassword');
  pw.autocomplete = signup ? 'new-password' : 'current-password';
  pw.minLength = 8;                                                // min 8 her zaman zorunlu
  pw.placeholder = signup ? 'Şifre (en az 8 karakter)' : 'Şifre';
  pw.value = '';                                                   // mod degisince sifreyi temizle
  pw.type = 'password';
  document.getElementById('pwToggle').textContent = '👁';
  document.getElementById('authMsg').textContent = '';
  updatePwMeter();   // login modunda gizle, signup'ta goster
}

// Supabase hata mesajlarini Turkce'ye cevir
function authErrorTr(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-posta veya şifre hatalı.';
  if (m.includes('email not confirmed')) return 'Önce e-postanı doğrulaman gerekiyor. Gelen kutunu kontrol et.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Bu e-posta zaten kayıtlı. Giriş yap.';
  if (m.includes('password should be at least')) return 'Şifre en az 6 karakter olmalı.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Geçerli bir e-posta gir.';
  return 'Hata: ' + msg;
}

function openAuth(mode) {
  setAuthMode(mode);
  document.getElementById('authScreen').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeAuth() {
  document.getElementById('authScreen').hidden = true;
  document.body.style.overflow = '';
}
document.getElementById('authBtn').onclick = () => {
  if (currentUser) openProfile();
  else openAuth('login');
};
document.getElementById('authClose').onclick = closeAuth;
document.getElementById('authSwitchBtn').onclick = () => setAuthMode(authMode === 'login' ? 'signup' : 'login');
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('authScreen').hidden) closeAuth();
  else if (!document.getElementById('profileScreen').hidden) closeProfile();
});

// Sifre goster/gizle
document.getElementById('pwToggle').onclick = () => {
  const inp = document.getElementById('authPassword');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  document.getElementById('pwToggle').textContent = show ? '🙈' : '👁';
};

// Parola gucu (NIST: uzunluk + cesitlilik + yaygin-degil). level: 0 zayif .. 3 cok guclu
const COMMON_PW = new Set(['12345678', '123456789', 'password', 'qwerty123', '11111111', 'iloveyou',
  'parola12', 'sifre123', 'admin123', 'qwertyui', 'password1', '12341234', 'baba1234', '1234567890']);
function passwordStrength(pw) {
  if (!pw) return { level: -1, label: '', hint: '' };
  if (pw.length < 8) return { level: 0, label: 'Zayıf', hint: 'en az 8 karakter' };
  if (COMMON_PW.has(pw.toLowerCase())) return { level: 0, label: 'Çok zayıf', hint: 'çok yaygın bir şifre' };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const score = variety + (pw.length >= 12 ? 1 : 0);
  if (score <= 2) return { level: 1, label: 'Orta', hint: 'büyük/küçük harf, rakam veya sembol ekle' };
  if (score === 3) return { level: 2, label: 'Güçlü', hint: '' };
  return { level: 3, label: 'Çok güçlü', hint: '' };
}
function updatePwMeter() {
  const el = document.getElementById('pwStrength');
  const pw = document.getElementById('authPassword').value;
  if (authMode !== 'signup' || !pw) { el.hidden = true; return; }
  const s = passwordStrength(pw);
  el.hidden = false;
  el.querySelector('.pw-bar').dataset.level = s.level;
  document.getElementById('pwHint').textContent = s.label + (s.hint ? ' · ' + s.hint : '');
}
document.getElementById('authPassword').addEventListener('input', updatePwMeter);

// Sifremi unuttum -> sifirlama e-postasi
document.getElementById('authForgot').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const msg = document.getElementById('authMsg');
  if (!email) { msg.className = 'note err'; msg.textContent = 'Önce e-posta adresini gir.'; return; }
  try {
    const { error } = await resetPassword(email);
    if (error) throw error;
    msg.className = 'note ok';
    msg.textContent = '✓ Şifre sıfırlama bağlantısı e-postana gönderildi.';
  } catch (err) {
    msg.className = 'note err';
    msg.textContent = authErrorTr(err.message || '');
  }
});

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const msg = document.getElementById('authMsg');
  const btn = document.getElementById('authSubmit');
  if (!email || !password) return;
  btn.disabled = true;
  msg.className = 'note muted';
  msg.textContent = authMode === 'signup' ? 'Kayıt yapılıyor…' : 'Giriş yapılıyor…';
  try {
    if (authMode === 'signup') {
      if (!document.getElementById('authKvkk').checked) {
        msg.className = 'note err';
        msg.textContent = 'Devam etmek için aydınlatma metnini onaylamalısın.';
        btn.disabled = false; return;
      }
      const s = passwordStrength(password);
      if (s.level < 1) {   // en az "Orta" (>=8 karakter, yaygin degil)
        msg.className = 'note err';
        msg.textContent = 'Daha güçlü bir şifre seç' + (s.hint ? ` (${s.hint}).` : '.');
        btn.disabled = false; return;
      }
      const name = document.getElementById('authName').value.trim();
      const { data, error } = await signUp(email, password, name);
      if (error) throw error;
      // Dogrulama acik ise session null doner -> giris ekranina dondur (bos kutular)
      if (!data.session) {
        setAuthMode('login');
        document.getElementById('authEmail').value = '';
        const lm = document.getElementById('authMsg');
        lm.className = 'note ok';
        lm.textContent = '✓ Doğrulama e-postası gönderildi. Onayladıktan sonra giriş yap.';
      } // onayli/oturum acildiysa onAuth ekrani kapatir
    } else {
      const { error } = await signIn(email, password);
      if (error) throw error;
      // basarili -> onAuth dialogu kapatir
    }
  } catch (err) {
    msg.className = 'note err';
    msg.textContent = authErrorTr(err.message || '');
  } finally {
    btn.disabled = false;
  }
});

const TR_DISTRICTS = ['Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şile', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu'];

function renderProfileAvatar(el, profile) {
  if (profile?.avatar_url) el.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="">`;
  else el.textContent = initials(profile?.display_name || '');
}
function setProfileNav() {
  document.getElementById('pfNavName').textContent = currentProfile?.display_name || 'Profilim';
  document.getElementById('pfNavNick').textContent = currentProfile?.nickname ? '@' + currentProfile.nickname : '';
  document.getElementById('pfNavEmail').textContent = currentUser?.email || '';
  document.getElementById('pfAccEmail').textContent = currentUser?.email || '';
  renderProfileAvatar(document.getElementById('pfNavAvatar'), currentProfile);
}
function showProfileSection(sec) {
  document.querySelectorAll('#profileScreen .pnav').forEach((b) => b.classList.toggle('active', b.dataset.sec === sec));
  document.querySelectorAll('#profileScreen .psec').forEach((s) => { s.hidden = s.dataset.sec !== sec; });
  if (sec === 'gidecekler') renderGoing();
}
async function renderGoing() {
  const el = document.getElementById('pfGoing');
  el.innerHTML = '<div class="muted">Yükleniyor…</div>';
  try {
    const { events } = await api('/api/attendance');
    renderInto(el, events, 'Henüz bir etkinliğe "Gideceğim/İlgileniyorum" demedin. Etkinlik detayından işaretleyebilirsin.');
  } catch (e) { el.innerHTML = `<div class="empty">Yüklenemedi: ${e.message}</div>`; }
}

let profileDictsBuilt = false;
function buildProfileDicts() {
  if (profileDictsBuilt) return; profileDictsBuilt = true;
  const wrap = document.getElementById('pfInterests');
  CATEGORIES.forEach(([slug, label]) => {
    const c = document.createElement('div');
    c.className = 'chip'; c.textContent = label; c.dataset.slug = slug;
    c.onclick = () => { c.classList.toggle('active'); updateProfileDirty(); };
    wrap.appendChild(c);
  });
  const by = document.getElementById('pfBirthYear');
  const now = new Date().getFullYear();
  for (let y = now - 13; y >= 1925; y--) by.appendChild(new Option(y, y));
  const ds = document.getElementById('pfDistrict');
  TR_DISTRICTS.forEach((d) => ds.appendChild(new Option(d, d)));
}
function fillProfileForm(p) {
  const parts = (p.display_name || '').trim().split(/\s+/);
  document.getElementById('pfFirst').value = parts.shift() || '';   // ilk kelime = ad
  document.getElementById('pfLast').value = parts.join(' ');        // gerisi = soyad
  document.getElementById('pfNick').value = p.nickname || '';
  document.getElementById('pfBio').value = p.bio || '';
  document.querySelectorAll('#pfInterests .chip').forEach((c) =>
    c.classList.toggle('active', (p.interests || []).includes(c.dataset.slug)));
  document.getElementById('pfGender').value = p.gender || '';
  document.getElementById('pfBirthYear').value = p.birth_year || '';
  document.getElementById('pfDistrict').value = p.district || '';
  document.getElementById('pfFirst').classList.remove('invalid');
  document.getElementById('pfLast').classList.remove('invalid');
  document.getElementById('pfNick').classList.remove('invalid');
  updateBioCount();
  snapshotProfileForms();
}

// ---- Profil formu: karakter sayaci + dogrulama + kaydedilmemis degisiklik takibi ----
function fullName() {                         // ad + soyad -> tek display_name
  const f = document.getElementById('pfFirst').value.trim();
  const l = document.getElementById('pfLast').value.trim();
  return [f, l].filter(Boolean).join(' ');
}
function nickValue() { return document.getElementById('pfNick').value.trim().toLowerCase(); }
function nickValid() { return /^[a-z0-9_]{3,20}$/.test(nickValue()); }   // zorunlu: bos gecersiz
function profilFormState() {
  return JSON.stringify({
    display_name: fullName(),
    nickname: nickValue(),
    bio: document.getElementById('pfBio').value.trim(),
    interests: [...document.querySelectorAll('#pfInterests .chip.active')].map((c) => c.dataset.slug).sort(),
  });
}
function eslesFormState() {
  return JSON.stringify({
    gender: document.getElementById('pfGender').value,
    birth_year: document.getElementById('pfBirthYear').value,
    district: document.getElementById('pfDistrict').value,
  });
}
let profilBaseline = '', eslesBaseline = '';
function snapshotProfileForms() {            // kayitli durumu referans al
  profilBaseline = profilFormState();
  eslesBaseline = eslesFormState();
  updateProfileDirty();
}
function updateProfileDirty() {              // zorunlular eksik/gecersizse veya degisiklik yoksa Kaydet pasif
  const nameOk = document.getElementById('pfFirst').value.trim().length > 0
    && document.getElementById('pfLast').value.trim().length > 0;
  document.getElementById('pfSaveProfil').disabled = !nameOk || !nickValid() || profilFormState() === profilBaseline;
  document.getElementById('pfSaveEsles').disabled = eslesFormState() === eslesBaseline;
}
function updateBioCount() {
  const n = document.getElementById('pfBio').value.length;
  const el = document.getElementById('pfBioCount');
  el.textContent = `${n}/280`;
  el.classList.toggle('warn', n >= 260);
}

async function openProfile() {
  buildProfileDicts();
  showProfileSection('profil');
  setProfileNav();
  if (currentProfile) fillProfileForm(currentProfile);
  else { updateBioCount(); snapshotProfileForms(); }   // yeni profil: bos formu referans al
  document.getElementById('profileScreen').hidden = false;
  document.body.style.overflow = 'hidden';
  try {
    const { profile } = await api('/api/profile');
    currentProfile = profile;
    fillProfileForm(profile);
    setProfileNav();
  } catch { /* yeni profil; alanlar bos kalir */ }
}
function closeProfile() {
  document.getElementById('profileScreen').hidden = true;
  document.body.style.overflow = '';
}

document.querySelectorAll('#profileScreen .pnav').forEach((b) => { b.onclick = () => showProfileSection(b.dataset.sec); });
document.getElementById('pfClose').onclick = closeProfile;
function onNameInput() {
  const name = fullName();
  document.getElementById('pfNavName').textContent = name || 'Profilim';
  if (!currentProfile?.avatar_url) document.getElementById('pfNavAvatar').textContent = initials(name);
  const first = document.getElementById('pfFirst');
  const last = document.getElementById('pfLast');
  first.classList.toggle('invalid', !first.value.trim());
  last.classList.toggle('invalid', !last.value.trim());
  updateProfileDirty();
}
document.getElementById('pfFirst').addEventListener('input', onNameInput);
document.getElementById('pfLast').addEventListener('input', onNameInput);
document.getElementById('pfNick').addEventListener('input', (e) => {
  document.getElementById('pfNavNick').textContent = nickValue() ? '@' + nickValue() : '';
  e.target.classList.toggle('invalid', !nickValid());
  updateProfileDirty();
});
document.getElementById('pfBio').addEventListener('input', () => { updateBioCount(); updateProfileDirty(); });
['pfGender', 'pfBirthYear', 'pfDistrict'].forEach((id) =>
  document.getElementById(id).addEventListener('change', updateProfileDirty));

// Foto yukleme
document.getElementById('pfAvatarBtn').onclick = () => document.getElementById('pfAvatarInput').click();
document.getElementById('pfAvatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const url = await uploadAvatar(file);
    const { profile } = await api('/api/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avatar_url: url }),
    });
    currentProfile = profile;
    renderProfileAvatar(document.getElementById('pfNavAvatar'), profile);
    updateAuthUI();
  } catch (err) { alert('Fotoğraf yüklenemedi: ' + err.message); }
  finally { e.target.value = ''; }
});

async function saveProfile(patch, msgId) {
  const msg = document.getElementById(msgId);
  msg.className = 'note muted'; msg.textContent = 'Kaydediliyor…';
  try {
    const { profile } = await api('/api/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
    });
    currentProfile = profile;
    store.prefs = { ...store.prefs, interests: profile.interests || [] };   // anasayfa ile senkron
    setProfileNav(); updateAuthUI();
    snapshotProfileForms();              // kaydedildi -> yeni referans, Kaydet tekrar pasif
    loadFeed();                          // ilgi alanlari degismis olabilir -> akisi tazele
    msg.className = 'note ok'; msg.textContent = '✓ Kaydedildi.';
  } catch (e) { msg.className = 'note err'; msg.textContent = 'Kaydedilemedi: ' + e.message; }
}
document.getElementById('pfSaveProfil').onclick = () => saveProfile({
  display_name: fullName(),
  nickname: nickValue() || null,
  bio: document.getElementById('pfBio').value.trim(),
  interests: [...document.querySelectorAll('#pfInterests .chip.active')].map((c) => c.dataset.slug),
}, 'pfProfilMsg');
document.getElementById('pfSaveEsles').onclick = () => saveProfile({
  gender: document.getElementById('pfGender').value || null,
  birth_year: document.getElementById('pfBirthYear').value ? parseInt(document.getElementById('pfBirthYear').value, 10) : null,
  district: document.getElementById('pfDistrict').value || null,
}, 'pfEslesMsg');

// Hesap: sifre goster/gizle + degistir
function bindPwToggle(toggleId, inputId) {
  document.getElementById(toggleId).onclick = () => {
    const inp = document.getElementById(inputId);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    document.getElementById(toggleId).textContent = show ? '🙈' : '👁';
  };
}
bindPwToggle('pfCurPwToggle', 'pfCurPw');
bindPwToggle('pfNewPwToggle', 'pfNewPw');
bindPwToggle('pfNewPw2Toggle', 'pfNewPw2');
document.getElementById('pfChangePw').onclick = async () => {
  const cur = document.getElementById('pfCurPw').value;
  const pw = document.getElementById('pfNewPw').value;
  const pw2 = document.getElementById('pfNewPw2').value;
  const msg = document.getElementById('pfPwMsg');
  if (!cur) { msg.className = 'note err'; msg.textContent = 'Mevcut şifreni gir.'; return; }
  const s = passwordStrength(pw);
  if (s.level < 1) { msg.className = 'note err'; msg.textContent = 'Daha güçlü bir şifre' + (s.hint ? ` (${s.hint}).` : '.'); return; }
  if (pw !== pw2) { msg.className = 'note err'; msg.textContent = 'Yeni şifreler eşleşmiyor.'; return; }
  msg.className = 'note muted'; msg.textContent = 'Güncelleniyor…';
  try {
    const { error: authErr } = await signIn(currentUser.email, cur);   // mevcut sifreyi dogrula
    if (authErr) { msg.className = 'note err'; msg.textContent = 'Mevcut şifren yanlış.'; return; }
    const { error } = await updatePassword(pw);
    if (error) throw error;
    document.getElementById('pfCurPw').value = '';
    document.getElementById('pfNewPw').value = '';
    document.getElementById('pfNewPw2').value = '';
    msg.className = 'note ok'; msg.textContent = '✓ Şifren güncellendi.';
  } catch (e) { msg.className = 'note err'; msg.textContent = authErrorTr(e.message || ''); }
};
document.getElementById('pfSignOut').onclick = async () => {
  await signOut(); currentProfile = null; closeProfile();
};
document.getElementById('pfDelete').onclick = async () => {
  if (!confirm('Hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.')) return;
  const msg = document.getElementById('pfDelMsg');
  msg.className = 'note muted'; msg.textContent = 'Siliniyor…';
  try {
    await api('/api/account', { method: 'DELETE' });
    await signOut(); currentProfile = null; closeProfile();
    alert('Hesabın silindi.');
  } catch (e) { msg.className = 'note err'; msg.textContent = 'Silinemedi: ' + e.message; }
};

// Yeni sifre belirleme (sifre sifirlama linkinden donunce)
document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('resetPassword').value;
  const msg = document.getElementById('resetMsg');
  const btn = document.getElementById('resetSubmit');
  if (!password) return;
  btn.disabled = true; msg.className = 'note muted'; msg.textContent = 'Güncelleniyor…';
  try {
    const { error } = await updatePassword(password);
    if (error) throw error;
    msg.className = 'note ok'; msg.textContent = '✓ Şifren güncellendi.';
    setTimeout(() => document.getElementById('resetDialog').close(), 900);
  } catch (err) {
    msg.className = 'note err'; msg.textContent = authErrorTr(err.message || '');
  } finally { btn.disabled = false; }
});

// Oturum durumu degisince UI guncelle (giris/dogrulama donunce de tetiklenir)
onAuth((user, event) => {
  currentUser = user;
  if (!user) currentProfile = null;
  updateAuthUI();
  if (event === 'PASSWORD_RECOVERY') {
    document.getElementById('resetDialog').showModal();   // yeni sifre iste
    return;
  }
  if (user) {
    loadMyProfile().then(loadFeed);                        // adi goster + akisi hesap ilgi alanlarina gore tazele
    closeAuth();                                           // giris/dogrulama basariliysa ekrani kapat
  } else {
    loadFeed();                                            // cikista anonim akisa don
  }
});

// Backdrop'a (kutu disina) tiklayinca kapat. (Esc zaten native kapatir.)
['detailDialog', 'prefsDialog', 'calDialog', 'companionsDialog'].forEach((dlgId) => {
  const dlg = document.getElementById(dlgId);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});

// ---- Baslat -----------------------------------------------------------------
updateSavedCount();
buildFilterChips();
populateDistricts();
loadFeed();
loadBrowse();
