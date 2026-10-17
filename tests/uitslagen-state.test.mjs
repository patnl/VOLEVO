import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Wedstrijden = require('../shared/wedstrijden.js');
const html = readFileSync(new URL('../app/uitslagen.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

function omgeving() {
  const pending = [];
  const inhoud = { innerHTML: '' };
  let config;
  // Alleen de DOMParser-grens is nagebootst: de echte renderer en asynchrone paginalogica draaien hieronder.
  class Parser {
    parseFromString(text) {
      const invalid = text === 'kapotte xml';
      const rows = invalid ? [] : JSON.parse(text);
      return {
        querySelector: (name) => name === 'parsererror' ? (invalid ? {} : null) : (invalid ? null : {}),
        querySelectorAll: () => rows.map((r) => ({
          querySelector: (name) => ({ textContent: r[name] || '' }),
          getElementsByTagNameNS: () => [{ textContent: 'gespeeld' }]
        }))
      };
    }
  }
  const scope = vm.createContext({
    Date, URL, DOMParser: Parser, Wedstrijden,
    fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    document: { getElementById: (id) => id === 'inhoud' ? inhoud : null },
    App: { start: (c) => { config = c; }, esc: String, kort: () => 'datum', teamNaam: String,
      bronKnop: () => '', herstelStaat: () => {} }
  });
  vm.runInContext(script, scope);
  const resolve = (index, text) => pending[index].resolve({ ok: true, text: async () => text });
  return { scope, pending, inhoud, config, resolve };
}
function feed(team, tegen = 'Andere club MA 1') {
  return JSON.stringify([{ title: team + ' - ' + tegen + ', Uitslag: 3-1',
    guid: team, pubDate: 'Sat, 03 Oct 2026 15:00:00 +0200', description: 'Setstanden: 25-20' }]);
}

test('een tragere aanvraag voor het vorige team overschrijft de huidige uitslagen niet', async () => {
  const e = omgeving();
  const oud = e.scope.teken('VOLEVO MA 3');
  const nieuw = e.scope.teken('VOLEVO MA 4');
  e.resolve(1, feed('VOLEVO MA 4'));
  await nieuw;
  assert.match(e.inhoud.innerHTML, /Uitslagen VOLEVO MA 4/);
  e.resolve(0, feed('VOLEVO MA 3'));
  await oud;
  assert.match(e.inhoud.innerHTML, /Uitslagen VOLEVO MA 4/);
  assert.doesNotMatch(e.inhoud.innerHTML, /Uitslagen VOLEVO MA 3/);
  await e.scope.teken('VOLEVO MA 4');
  assert.match(e.inhoud.innerHTML, /Winnaar: VOLEVO MA 4/);
  assert.doesNotMatch(e.inhoud.innerHTML, /Geen uitslagen/);
});

test('een late fout van een vorige teamkeuze verbergt de geslaagde huidige uitslag niet', async () => {
  const e = omgeving();
  const oud = e.scope.teken('VOLEVO MA 3');
  const nieuw = e.scope.teken('VOLEVO MA 4');
  e.resolve(1, feed('VOLEVO MA 4'));
  await nieuw;
  e.pending[0].reject(new Error('netwerkfout'));
  await oud;
  assert.match(e.inhoud.innerHTML, /Uitslagen VOLEVO MA 4/);
  assert.doesNotMatch(e.inhoud.innerHTML, /kunnen nu niet worden opgehaald/);
});

test('ongeldige XML wordt gemeld als laadfout, niet als geen uitslagen', async () => {
  const e = omgeving();
  const render = e.scope.teken('VOLEVO MA 4');
  e.resolve(0, 'kapotte xml');
  await render;
  assert.match(e.inhoud.innerHTML, /kunnen nu niet worden opgehaald/);
  assert.doesNotMatch(e.inhoud.innerHTML, /Geen uitslagen/);
});

test('een geldig leeg uitslagenoverzicht toont wel de lege toestand', async () => {
  const e = omgeving();
  const render = e.scope.teken('VOLEVO MA 4');
  e.resolve(0, '[]');
  await render;
  assert.match(e.inhoud.innerHTML, /Geen uitslagen/);
});
