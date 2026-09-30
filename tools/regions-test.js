/* Only the places on the list exist: grouped by region, named in three languages, validated by the
   server, and old saved values mapped onto the list or dropped.   node tools/regions-test.js */
import { REGIONS, TOWN_IDS, isTown, regionOf, townName, regionName, normTown } from '../client/shared/regions.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const WANT = {
  hawler: ['Hawler (Erbil)', 'Soran', 'Shaqlawa', 'Rawanduz', 'Koya', 'Ankawa', 'Choman', 'Mergasur', 'Khabat', 'Haji Omeran'],
  slemani: ['Slemani', 'Ranya', 'Qaladiza', 'Chamchamal', 'Kalar', 'Darbandikhan', 'Penjwen', 'Dukan', 'Said Sadiq', 'Qaradagh', 'Mawat'],
  duhok: ['Duhok', 'Zakho', 'Akre', 'Amedi', 'Simele', 'Batifa', 'Bamarni', 'Bardarash'],
  halabja: ['Halabja'],
  kirkuk: ['Kirkuk (Kerkûk)', 'Dibis', 'Altun Kupri (Pirdê)', 'Daquq', 'Qara Hanjir', 'Shwan', 'Laylan', 'Yaychi'],
};
ok(REGIONS.map(r => r.id).join() === Object.keys(WANT).join(), 'exactly five regions, in order: ' + REGIONS.map(r => r.id).join(', '));
for (const r of REGIONS) {
  const names = r.towns.map(([id]) => townName(id, 'en'));
  ok(JSON.stringify(names) === JSON.stringify(WANT[r.id]), `${r.id}: exactly the listed places (${names.length})`);
}
ok(TOWN_IDS.length === 38, `38 places in all (${TOWN_IDS.length})`);
ok(new Set(TOWN_IDS).size === TOWN_IDS.length, 'no place appears twice');
for (const id of TOWN_IDS) {
  const n = ['en', 'ar', 'ku'].map(l => townName(id, l));
  if (!n.every(x => x && x.trim())) { ok(false, `${id} is missing a name`); }
}
ok(TOWN_IDS.every(id => ['en', 'ar', 'ku'].every(l => townName(id, l))), 'every place is named in English, Arabic and Kurdish');
ok(REGIONS.every(r => ['en', 'ar', 'ku'].every(l => regionName(r.id, l))), 'and so is every region');
ok(regionOf('zakho') === 'duhok' && regionOf('ankawa') === 'hawler' && regionOf('dibis') === 'kirkuk', 'each town knows its region');
for (const bad of ['baghdad', 'Baghdad', 'mosul', 'Basra', 'Other', 'Paris', '<script>', '']) ok(normTown(bad) === '', `"${bad}" is not a place in the game`);
ok(normTown('Hawler') === 'hawler' && normTown('Silemani') === 'slemani' && normTown('Zakho') === 'zakho', 'old saved names map onto the list');
ok(!isTown('baghdad') && isTown('penjwen'), 'isTown only accepts listed places');
console.log(fails ? `\nFAILED: ${fails}` : '\nALL REGION TESTS PASS');
process.exit(fails ? 1 : 0);
