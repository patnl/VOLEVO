// Draai met:  node --test shared/zaal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Zaal = require('./zaal.js');
const Wedstrijden = require('./wedstrijden.js');
const tas = Zaal.definitie.zalen.find((z) => z.naam === 'De Tas');
const bocht = Zaal.definitie.zalen.find((z) => z.naam === 'De Bocht');
const bezet = (...nrs) => Object.fromEntries(nrs.map((n) => [n, [{}]]));

test('De Bocht staat in 4-deling zodra veld 7 in gebruik is, en gemengd bij drie wedstrijden zonder veld 7', () => {
  assert.equal(Zaal.stand(bocht, bezet('4', '5', '6', '7')).omschrijving, '4-deling · 2 bij 2');
  assert.equal(Zaal.stand(bocht, bezet('4', '5', '6')).omschrijving, 'veld 4 groot, 5 en 6');
  assert.equal(Zaal.stand(bocht, bezet('4', '5')).omschrijving, 'veld 4 groot, 5 en 6');
});

test('veld 4 groot (4G) zet De Bocht altijd gemengd, en een vaste stand uit de correcties wint', () => {
  assert.equal(Zaal.stand(bocht, bezet('4G', '5')).omschrijving, 'veld 4 groot, 5 en 6');
  assert.equal(Zaal.stand(bocht, bezet('4G'), 'vier').omschrijving, '4-deling · 2 bij 2');
});

test('De Tas heeft maar één indeling', () => {
  assert.equal(Zaal.stand(tas, bezet('1', '2')).omschrijving, '3-deling · verticaal');
});

test('een wedstrijd op veld "4" valt in het grote veld 4, en die op "4G" ook', () => {
  const gemengd = Zaal.stand(bocht, bezet('4G'));
  const groot = gemengd.velden.find((v) => Zaal.veldenVan(v).indexOf('4G') !== -1);
  assert.deepEqual(Zaal.zoekNummers(groot), ['4G', '4']);
});

test('echte gegevens: 17 oktober 15:00 staat De Bocht gemengd (zoals het bestuur het wil), De Tas in 3-deling', () => {
  const echt = JSON.parse(readFileSync(new URL('../data/matches.json', import.meta.url), 'utf8')).wedstrijden;
  const velden = JSON.parse(readFileSync(new URL('../data/overrides.json', import.meta.url), 'utf8')).velden;
  const perVeld = {};
  Wedstrijden.speelbaar(echt).filter((w) => w.hal === 'De Fluit' && w.tijdstip.startsWith('2026-10-17T15:00')).forEach((w) => {
    const v = Wedstrijden.veldNummer(w, velden); (perVeld[v] = perVeld[v] || []).push(w);
  });
  assert.equal(Zaal.stand(bocht, perVeld).omschrijving, 'veld 4 groot, 5 en 6');
  assert.equal(Zaal.stand(tas, perVeld).omschrijving, '3-deling · verticaal');
});
