// kultur.istanbul connector — IBB Kultur A.S. (kamu) kultur-sanat portali.
// Generic WP Event Manager fabrikasini kullanir; tum mantik wp-event-factory.js'te.
import { makeWpEventConnector, parseDates } from './wp-event-factory.js';

export { parseDates };   // testler icin

export default makeWpEventConnector({
  id: 'kultur',
  name: 'Kültür İstanbul',
  baseUrl: 'https://kultur.istanbul',
  defaultFree: true,
});
