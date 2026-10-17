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
