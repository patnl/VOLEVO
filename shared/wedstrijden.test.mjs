// Draai met:  node --test shared/wedstrijden.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const Wedstrijden = createRequire(import.meta.url)('./wedstrijden.js');
const echt = JSON.parse(readFileSync(new URL('../data/matches.json', import.meta.url), 'utf8')).wedstrijden;

test('een vervallen wedstrijd telt niet mee als speelbaar, een geplande en een gespeelde wel', () => {
  const lijst = [{ status: 'gepland' }, { status: 'vervallen' }, { status: 'gespeeld' }, {}];
  assert.deepEqual(Wedstrijden.speelbaar(lijst).length, 3);
  assert.deepEqual(Wedstrijden.vervallen(lijst), [{ status: 'vervallen' }]);
});

test('in de echte gegevens verdwijnen precies de vervallen wedstrijden uit de speelbare lijst', () => {
  const vervallen = echt.filter((w) => w.status === 'vervallen');
  assert.ok(vervallen.length > 0, 'de test verwacht minstens één vervallen wedstrijd in data/matches.json');
  const speelbaar = Wedstrijden.speelbaar(echt);
  assert.equal(speelbaar.length, echt.length - vervallen.length);
  assert.ok(speelbaar.every((w) => w.status !== 'vervallen'));
});

test('speelbaar en vervallen geven bij ontbrekende invoer een lege lijst', () => {
  assert.deepEqual(Wedstrijden.speelbaar(undefined), []);
  assert.deepEqual(Wedstrijden.vervallen(null), []);
});

// ── Velden, teams en taken ──
const officials = JSON.parse(readFileSync(new URL('../data/officials.json', import.meta.url), 'utf8')).perWedstrijd;

test('veldTekst: zaal en veld voluit, onbevestigd in De Fluit zonder zaalschema, en andere sporthallen houden hun nummer', () => {
  const w = (hal, veld) => ({ hal, veld, tijdstip: '2026-10-29T21:00:00+01:00', thuis: 'VOLEVO DS 3', uit: 'Zovoc DS 1' });
  const k = Wedstrijden.sleutel(w('De Fluit', '6'));
  assert.equal(Wedstrijden.veldTekst(w('De Fluit', '6'), { [k]: '2' }), 'De Tas · veld 2');
  assert.equal(Wedstrijden.veldTekst(w('De Fluit', '6'), { [k]: '4G' }), 'De Bocht · veld 4 groot');
  assert.equal(Wedstrijden.veldTekst(w('De Fluit', '6'), {}), 'Veld nog niet bevestigd');
  assert.equal(Wedstrijden.veldTekst(w('Sporthal X', '3'), {}), 'Veld 3');
  assert.equal(Wedstrijden.veldTekst(w('Sporthal X', null), {}), '');
});

test('teamCode haalt de teamnaam uit een VOLEVO-ploeg en laat andere clubs met rust', () => {
  assert.equal(Wedstrijden.teamCode('VOLEVO MB 2'), 'MB 2');
  assert.equal(Wedstrijden.teamCode('Inter Rijswijk MB 2'), null);
});

test('taken: taken van een team en de helpers bij een wedstrijd komen uit de echte gegevens en blijven gescheiden', () => {
  const sleutel = '2026-09-04T19:00:00+02:00|VOLEVO JA 1|Inter Rijswijk JA 1';
  const helpers = Wedstrijden.helpersBij(officials, { tijdstip: '2026-09-04T19:00:00+02:00', thuis: 'VOLEVO JA 1', uit: 'Inter Rijswijk JA 1' });
  assert.deepEqual(helpers.map((h) => h.soort + ' ' + h.team), ['Fluiten HS 1', 'Tellen DS 8']);
  const van = Wedstrijden.takenVanTeam(officials, 'DS 8');
  assert.ok(van.some((t) => t.sleutel === sleutel && t.soort === 'Tellen'));
  assert.ok(van.every((t) => t.team === 'DS 8'));
});

// ── Gelijk aan wat de zaalschermen tot nu toe zelf deden ──
// De schermen mogen door het delen van deze regels niets anders gaan tonen. Deze vergelijking
// houdt de oude eigen versies vast (zoals ze in volevo-zaalscherm.html stonden) en loopt alle echte gegevens langs.
const correcties = JSON.parse(readFileSync(new URL('../data/overrides.json', import.meta.url), 'utf8')).velden;

function oudTaakKort(t) { t = t || ''; if (/teller/i.test(t)) return 'teller'; if (/dwf/i.test(t)) return 'dwf'; if (/scheidsrechter/i.test(t)) return 'scheidsrechter'; return t; }
function oudOfficialsTekst(lijst) {
  const volgorde = { scheidsrechter: 0, teller: 1, dwf: 2 };
  const rang = (t) => { const k = oudTaakKort(t); return k in volgorde ? volgorde[k] : 9; };
  return lijst.slice().sort((a, b) => rang(a.taak) - rang(b.taak)).map((o) => oudTaakKort(o.taak) + ' ' + o.team);
}

test('officialsRegels geeft voor elke wedstrijd in de echte gegevens dezelfde tekst als de oude eigen versie van het scherm', () => {
  const sleutels = Object.keys(officials);
  assert.ok(sleutels.length > 100);
  for (const s of sleutels) {
    const [tijdstip, thuis, uit] = s.split('|');
    assert.deepEqual(Wedstrijden.officialsRegels(officials, { tijdstip, thuis, uit }), oudOfficialsTekst(officials[s]), s);
  }
});

test('veldNummer geeft voor elke echte wedstrijd hetzelfde veld als de oude eigen versie van het scherm', () => {
  for (const w of echt) {
    const o = correcties[w.tijdstip + '|' + w.thuis + '|' + w.uit];
    const oud = (o === undefined || o === null || o === '') ? w.veld : String(o);
    assert.equal(Wedstrijden.veldNummer(w, correcties), oud);
  }
});

test('isVervallen kijkt alleen naar de status vervallen', () => {
  assert.equal(Wedstrijden.isVervallen('vervallen'), true);
  assert.equal(Wedstrijden.isVervallen('gepland'), false);
  assert.equal(Wedstrijden.isVervallen(undefined), false);
});

test('heeftCorrectie is waar voor precies de wedstrijden met een correctie, net als de oude eigen versie van het scherm', () => {
  let met = 0;
  for (const w of echt) {
    const oud = correcties[w.tijdstip + '|' + w.thuis + '|' + w.uit] !== undefined;
    assert.equal(Wedstrijden.heeftCorrectie(w, correcties), oud);
    if (oud) met++;
  }
  assert.ok(met > 100, 'de test verwacht veel wedstrijden met een correctie');
});

// ── Gekozen team, uitslagen en dubbele uitslagen ──
test('perspectief: met een gekozen team staat dat team vooraan, ook als het uit speelt tegen een ander VOLEVO-team', () => {
  const w = { thuis: 'VOLEVO MA 3', uit: 'VOLEVO MA 4' };
  assert.deepEqual(Wedstrijden.perspectief(w, 'VOLEVO MA 4'), { eigen: 'VOLEVO MA 4', tegen: 'VOLEVO MA 3', eigenThuis: false });
  assert.deepEqual(Wedstrijden.perspectief(w, 'VOLEVO MA 3'), { eigen: 'VOLEVO MA 3', tegen: 'VOLEVO MA 4', eigenThuis: true });
});

test('perspectief: zonder teamkeuze, of een team dat niet meespeelt, blijft de thuisvolgorde gelden', () => {
  const w = { thuis: 'VOLEVO MA 3', uit: 'VOLEVO MA 4' };
  assert.deepEqual(Wedstrijden.perspectief(w, ''), { eigen: 'VOLEVO MA 3', tegen: 'VOLEVO MA 4', eigenThuis: true });
  assert.deepEqual(Wedstrijden.perspectief(w, 'VOLEVO DS 1'), { eigen: 'VOLEVO MA 3', tegen: 'VOLEVO MA 4', eigenThuis: true });
  // uitwedstrijd tegen een andere club: het VOLEVO-team staat vooraan
  assert.deepEqual(Wedstrijden.perspectief({ thuis: 'Kalinko MB 2', uit: 'VOLEVO MB 2' }, ''), { eigen: 'VOLEVO MB 2', tegen: 'Kalinko MB 2', eigenThuis: false });
});

test('uitkomst: winnaar uit een geldige score, zonder claim bij een onvolledige of ongeldige score', () => {
  assert.deepEqual(Wedstrijden.uitkomst('3-1'), { winnaar: 'thuis', thuis: 3, uit: 1 });
  assert.deepEqual(Wedstrijden.uitkomst('0-3'), { winnaar: 'uit', thuis: 0, uit: 3 });
  assert.equal(Wedstrijden.uitkomst('2-2').winnaar, 'gelijk');
  for (const slecht of ['', '3-', '-1', 'x-y', '3-1-2', '0-0', null, undefined, '3 - 1 extra']) {
    assert.equal(Wedstrijden.uitkomst(slecht).winnaar, null, String(slecht));
  }
});

test('resultaatVoorTeam: Gewonnen of Verloren vanuit het gekozen team, ook bij onderlinge clubwedstrijden', () => {
  const u = { thuis: 'VOLEVO MA 4', uit: 'VOLEVO MA 3', score: '3-1' };
  assert.equal(Wedstrijden.resultaatVoorTeam(u, 'VOLEVO MA 4'), 'Gewonnen');
  assert.equal(Wedstrijden.resultaatVoorTeam(u, 'VOLEVO MA 3'), 'Verloren');
  assert.equal(Wedstrijden.resultaatVoorTeam({ thuis: 'SKC DS 2', uit: 'VOLEVO DS 4', score: '4-0' }, 'VOLEVO DS 4'), 'Verloren');
  assert.equal(Wedstrijden.resultaatVoorTeam({ thuis: 'SKC DS 2', uit: 'VOLEVO DS 4', score: '1-3' }, 'VOLEVO DS 4'), 'Gewonnen');
  assert.equal(Wedstrijden.resultaatVoorTeam({ thuis: 'A', uit: 'VOLEVO DS 4', score: '2-2' }, 'VOLEVO DS 4'), 'Gelijk');
  assert.equal(Wedstrijden.resultaatVoorTeam({ thuis: 'A', uit: 'VOLEVO DS 4', score: '3-' }, 'VOLEVO DS 4'), null);
  assert.equal(Wedstrijden.resultaatVoorTeam(u, 'VOLEVO HS 1'), null);   // team speelde niet mee
});

// Leest de uitslagen zoals app/uitslagen.html ze uit de feed haalt, maar dan zonder browser
function leesFeed() {
  const xml = readFileSync(new URL('../data/resultaten.xml', import.meta.url), 'utf8');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const titel = /<title><!\[CDATA\[([\s\S]*?)\]\]>/.exec(m[1])[1];
    const i = titel.indexOf(', Uitslag:');
    if (i === -1) return null;
    const [thuis, ...rest] = titel.slice(0, i).split(' - ');
    return { id: /<guid>(.*?)<\/guid>/.exec(m[1])[1], thuis: thuis.trim(), uit: rest.join(' - ').trim(), score: titel.slice(i + 10).trim(),
             tijd: new Date(/<pubDate>(.*?)<\/pubDate>/.exec(m[1])[1]) };
  }).filter(Boolean);
}

test('ontdubbel: dezelfde wedstrijd twee keer in de feed (beide VOLEVO-teams) telt één keer', () => {
  const feed = leesFeed();
  const slim = Wedstrijden.ontdubbel(feed);
  assert.equal(feed.filter((u) => u.thuis === 'VOLEVO MA 4' && u.uit === 'VOLEVO MA 3' && u.score === '3-1').length, 2, 'de feed bevat deze wedstrijd echt dubbel');
  assert.equal(slim.filter((u) => u.thuis === 'VOLEVO MA 4' && u.uit === 'VOLEVO MA 3' && u.score === '3-1').length, 1);
  assert.equal(slim.length, new Set(feed.map((u) => u.id)).size);
});

test('ontdubbel: twee verschillende wedstrijden met dezelfde teams en dezelfde score blijven allebei staan', () => {
  const a = { id: 'wedstrijd/1', thuis: 'VOLEVO MA 4', uit: 'Kalinko MA 1', score: '3-0', tijd: new Date('2026-10-03T15:00:00+02:00') };
  const b = { id: 'wedstrijd/2', thuis: 'VOLEVO MA 4', uit: 'Kalinko MA 1', score: '3-0', tijd: new Date('2026-11-14T15:00:00+01:00') };
  assert.equal(Wedstrijden.ontdubbel([a, b, { ...a }]).length, 2);
});

test('ontdubbel zonder id valt terug op tijd en teams', () => {
  const a = { thuis: 'X', uit: 'Y', score: '3-0', tijd: new Date('2026-10-03T15:00:00+02:00') };
  assert.equal(Wedstrijden.ontdubbel([a, { ...a }, { ...a, tijd: new Date('2026-10-10T15:00:00+02:00') }]).length, 2);
});

test('bronLink laat alleen https-adressen van Nevobo en volleybal.nl door en verzint niets', () => {
  const goed = ['https://api.nevobo.nl/permalink/wedstrijd/2026238', 'https://dwf.nevobo.nl/results/a/scoresheets/b', 'https://www.volleybal.nl/x', 'https://nevobo.nl/'];
  goed.forEach((u) => assert.equal(Wedstrijden.bronLink(u), u));
  for (const slecht of ['http://api.nevobo.nl/x', 'https://nevobo.nl.evil.com/x', 'https://evilnevobo.nl/x', 'https://evil.com/?https://nevobo.nl',
                        'javascript:alert(1)', '//nevobo.nl/x', 'api.nevobo.nl/x', '', null, undefined, 'https://user@evil.com@nevobo.nl/x']) {
    assert.equal(Wedstrijden.bronLink(slecht), '', String(slecht));
  }
});

test('in de echte gegevens zijn alle wedstrijdformulieren en uitslag-links bruikbare bronlinks', () => {
  for (const w of echt.filter((x) => x.dwf)) assert.equal(Wedstrijden.bronLink(w.dwf), w.dwf);
  for (const u of leesFeed()) assert.notEqual(Wedstrijden.bronLink(u.id), '', u.id);
});

// ── Locatie: Sporthal De Fluit ligt aan Fluitpolderplein 3, niet bij het zwembad ──
test('De Fluit: route en adres zijn Sporthal De Fluit, Fluitpolderplein 3, zonder de oude zwembadcoördinaten of nummer 1', () => {
  const fluit = echt.filter((w) => w.hal === 'De Fluit');
  assert.ok(fluit.length > 100);
  assert.ok(fluit.every((w) => w.lat === 52.09332 && w.adres === 'Fluitpolderplein 1'), 'de brondata bevat nog de oude gegevens; de correctie moet daar bovenop');
  for (const w of fluit) {
    const l = Wedstrijden.locatie(w);
    assert.equal(l.route, 'Sporthal De Fluit, Fluitpolderplein 3, 2262 ED Leidschendam');
    assert.equal(l.adres, 'Fluitpolderplein 3, 2262 ED Leidschendam');
    assert.doesNotMatch(l.route + ' ' + l.adres, /52\.09332|4\.39517|Fluitpolderplein 1\b/);
    assert.equal(l.naam, 'Sporthal De Fluit');
  }
});

test('andere sporthallen houden hun bestaande routing (coördinaten) en adres', () => {
  const w = echt.find((x) => x.hal !== 'De Fluit' && x.lat && x.lon);
  const l = Wedstrijden.locatie(w);
  assert.equal(l.route, w.lat + ',' + w.lon);
  assert.equal(l.adres, [w.adres, w.postcode, w.plaats].filter(Boolean).join(', '));
  assert.equal(l.naam, w.hal);
  // zonder coördinaten: adres, zoals voorheen
  assert.equal(Wedstrijden.locatie({ hal: 'Sporthal X', adres: 'Weg 1', postcode: '1234AB', plaats: 'Dorp' }).route, 'Sporthal X, Weg 1, 1234AB, Dorp');
  assert.equal(Wedstrijden.locatie({ hal: '' }).route, '');
});

test('een andere hal die ook De Fluit heet, in een andere plaats, wordt niet gecorrigeerd', () => {
  const l = Wedstrijden.locatie({ hal: 'De Fluit', plaats: 'Ergens Anders', adres: 'Straat 5', postcode: '9999ZZ', lat: 51.1, lon: 5.2 });
  assert.equal(l.route, '51.1,5.2');
});
