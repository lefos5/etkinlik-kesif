// Istanbul'un 39 ilcesi + reverse-geocode ciktisini ilceye eslestiren yardimci.
// Nominatim address alanlari tutarsiz oldugundan, gelen tum degerleri BILINEN
// ilce listesine karsi kontrol ederiz (en saglam yontem).
import { slugifyTr } from './text.js';

export const ISTANBUL_DISTRICTS = [
  'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler',
  'Bakırköy', 'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü',
  'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt',
  'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane',
  'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer',
  'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şile', 'Şişli', 'Tuzla',
  'Ümraniye', 'Üsküdar', 'Zeytinburnu',
];

const BY_SLUG = new Map(ISTANBUL_DISTRICTS.map((d) => [slugifyTr(d), d]));
// "Eyüp" -> Eyupsultan gibi eski/alternatif adlar
BY_SLUG.set('eyup', 'Eyüpsultan');

/** Bir metni (Nominatim address degeri) bilinen ilceye esler; yoksa null. */
export function matchDistrict(value) {
  if (!value) return null;
  return BY_SLUG.get(slugifyTr(value)) || null;
}
