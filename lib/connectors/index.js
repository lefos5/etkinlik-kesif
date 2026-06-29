// Connector registry. Yeni kaynak eklemek = modulu import edip listeye koymak.
import mock from './mock.js';
import ticketmaster from './ticketmaster.js';
import goethe from './goethe.js';
import kultur from './kultur.js';
import { makeIcalConnector } from './ical-factory.js';

// SALT — ucretsiz kultur etkinlikleri (konusma, sergi turu, gosterim, bulusma).
// SALT_ICAL_URL env'ine gercek .ics URL'si konunca otomatik calisir.
const salt = makeIcalConnector({
  id: 'salt', name: 'SALT', feedEnv: 'SALT_ICAL_URL',
  defaultVenue: 'SALT', defaultFree: true, defaultCategory: 'sergi',
});

const REGISTRY = { mock, ticketmaster, goethe, kultur, salt };

export function getConnector(id) {
  const c = REGISTRY[id];
  if (!c) throw new Error(`Bilinmeyen kaynak: '${id}'. Mevcut: ${Object.keys(REGISTRY).join(', ')}`);
  return c;
}

export function listConnectors() {
  return Object.values(REGISTRY);
}
