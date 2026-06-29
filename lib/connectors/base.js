// Connector arayuzu (sozlesme).
//
// Her kaynak modulu su sekli export eder:
//
//   export default {
//     id: 'meetup',                 // sources.id ile esit, benzersiz
//     name: 'Meetup',
//     kind: 'api',                  // api | feed | affiliate | manual
//     async fetchEvents({ since, city }) { ... return RawEvent[] }
//   }
//
// fetchEvents, kaynagin kendi auth/rate-limit/pagination'ini yonetir ve
// asagidaki RawEvent yapisinda nesneler dondurur. Normalize/dedup connector'in
// isi DEGILDIR — o islem lib/normalize.js + lib/dedup.js icinde yapilir.
//
// RawEvent (connector ciktisi — kanonik DEGIL, mumkun oldugunca ham):
//   {
//     sourceUid:   string,          // kaynagin kendi etkinlik id'si (zorunlu)
//     title:       string,          // (zorunlu)
//     description: string|null,
//     startAt:     string,          // ISO 8601 (zorunlu)
//     endAt:       string|null,
//     venue:       { name, address?, city?, district?, lat?, lng? } | null,
//     priceMin:    number|null,
//     priceMax:    number|null,
//     currency:    string|null,     // varsayilan TRY
//     isFree:      boolean|null,
//     imageUrl:    string|null,
//     organizer:   string|null,
//     ticketUrl:   string|null,     // affiliate deep-link (varsa)
//     rawCategory: string|null,     // kaynagin ham kategorisi (enrich map'ler)
//     payload:     object           // tum ham JSON (denetim/yeniden isleme icin)
//   }

/** RawEvent'in minimum gecerliligini dogrular. Eksikse atar. */
export function assertRawEvent(e, sourceId) {
  for (const f of ['sourceUid', 'title', 'startAt']) {
    if (!e || e[f] == null || e[f] === '') {
      throw new Error(`[${sourceId}] gecersiz RawEvent: '${f}' eksik`);
    }
  }
  if (Number.isNaN(Date.parse(e.startAt))) {
    throw new Error(`[${sourceId}] gecersiz startAt: ${e.startAt}`);
  }
  return e;
}
