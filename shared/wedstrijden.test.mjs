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
