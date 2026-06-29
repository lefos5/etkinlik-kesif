// Mock connector — test ve yerel gelistirme icin. Hicbir disa baglilik yok.
// `npm run ingest:mock` ile uctan uca pipeline'i (normalize→dedup→DB) calistirir.
import { assertRawEvent } from './base.js';

const now = Date.now();
const day = 86400000;
const iso = (ms) => new Date(ms).toISOString();

const FIXTURES = [
  {
    sourceUid: 'mock-1',
    title: 'Kadikoy Indie Konseri',
    description: 'Yerel indie gruplari sahne aliyor. Bilet kapida.',
    startAt: iso(now + 2 * day),
    endAt: iso(now + 2 * day + 3 * 3600000),
    venue: { name: 'Dorock XL Kadikoy', city: 'Istanbul', district: 'Kadikoy', lat: 40.99, lng: 29.03 },
    priceMin: 250, priceMax: 250, currency: 'TRY', isFree: false,
    imageUrl: null, organizer: 'Dorock', ticketUrl: 'https://example.com/bilet/mock-1',
    rawCategory: 'Live Music',
  },
  {
    // mock-2: mock-1 ile AYNI etkinligin baska kaynaktan hali gibi davranir
    // (dedup testini gormek icin baslik/tarih/mekan cok yakin).
    sourceUid: 'mock-2',
    title: 'Kadikoy Indie Konseri (Dorock XL)',
    description: 'Indie gece. Kapida bilet.',
    startAt: iso(now + 2 * day + 1800000),
    endAt: null,
    venue: { name: 'Dorock XL Kadikoy', city: 'Istanbul', district: 'Kadikoy' },
    priceMin: 240, priceMax: 260, currency: 'TRY', isFree: false,
    imageUrl: null, organizer: 'Dorock', ticketUrl: 'https://other.example/mock-2',
    rawCategory: 'Konser',
  },
  {
    sourceUid: 'mock-3',
    title: 'Ucretsiz Yaratici Yazarlik Atolyesi',
    description: 'Baslangic seviyesi, herkese acik ve ucretsiz buluşma.',
    startAt: iso(now + 5 * day),
    endAt: null,
    venue: { name: 'Caddebostan Kultur Merkezi', city: 'Istanbul', district: 'Kadikoy', lat: 40.96, lng: 29.06 },
    priceMin: 0, priceMax: 0, currency: 'TRY', isFree: true,
    imageUrl: null, organizer: 'CKM', ticketUrl: null,
    rawCategory: 'Workshop',
  },
  {
    sourceUid: 'mock-4',
    title: 'JavaScript Istanbul Meetup #42',
    description: 'Aylik teknoloji bulusmasi. Ucretsiz, kayit gerekli.',
    startAt: iso(now + 8 * day),
    endAt: null,
    venue: { name: 'Kolektif House Levent', city: 'Istanbul', district: 'Besiktas', lat: 41.08, lng: 29.01 },
    priceMin: 0, priceMax: 0, currency: 'TRY', isFree: true,
    imageUrl: null, organizer: 'JS Istanbul', ticketUrl: 'https://meetup.com/mock-4',
    rawCategory: 'Tech',
  },
];

export default {
  id: 'mock',
  name: 'Mock Kaynak',
  kind: 'manual',
  async fetchEvents({ since } = {}) {
    const cutoff = since ? Date.parse(since) : 0;
    return FIXTURES
      .filter((e) => Date.parse(e.startAt) >= cutoff)
      .map((e) => assertRawEvent({ ...e, payload: e }, 'mock'));
  },
};
