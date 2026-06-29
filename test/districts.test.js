import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchDistrict, ISTANBUL_DISTRICTS } from '../lib/istanbul-districts.js';

test('matchDistrict: bilinen ilceyi esler (Turkce karakter toleransli)', () => {
  assert.equal(matchDistrict('Kadıköy'), 'Kadıköy');
  assert.equal(matchDistrict('kadikoy'), 'Kadıköy');
  assert.equal(matchDistrict('BEŞİKTAŞ'), 'Beşiktaş');
  assert.equal(matchDistrict('Sisli'), 'Şişli');
});

test('matchDistrict: eski ad Eyup -> Eyüpsultan', () => {
  assert.equal(matchDistrict('Eyüp'), 'Eyüpsultan');
});

test('matchDistrict: ilce olmayan deger null', () => {
  assert.equal(matchDistrict('Caddebostan'), null);   // mahalle, ilce degil
  assert.equal(matchDistrict('Istanbul'), null);
  assert.equal(matchDistrict(''), null);
  assert.equal(matchDistrict(null), null);
});

test('39 ilce tanimli', () => {
  assert.equal(ISTANBUL_DISTRICTS.length, 39);
});
