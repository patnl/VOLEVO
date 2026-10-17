import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../app/team.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
function omgeving() {
  const pending = [], target = { innerHTML: '' };
  const context = vm.createContext({ URLSearchParams, location: { search: '' },
    App: { VAN: { vandaag: ['index.html', 'Vandaag'] }, start() {}, team: (u, name) => u.thuis === name || u.uit === name },
    Resultaten: { laad: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), kaart: (u) => u.thuis },
    document: { getElementById: () => target }
  });
  vm.runInContext(script, context);
  return { context, pending, target };
}

test('teamoverzicht houdt het laatst gekozen team vast bij late uitslagen', async () => {
  const { context, pending, target } = omgeving();
  context.teamVersie = 1;
  const first = context.toonGespeeld('VOLEVO MA 4', 1);
  context.teamVersie = 2;
  const last = context.toonGespeeld('VOLEVO DS 1', 2);
  pending[1].resolve([{ thuis: 'VOLEVO DS 1' }]); await last;
  pending[0].resolve([{ thuis: 'VOLEVO MA 4' }]); await first;
  assert.match(target.innerHTML, /VOLEVO DS 1/);
  assert.doesNotMatch(target.innerHTML, /VOLEVO MA 4/);
});

test('een storing in teamuitslagen krijgt een herstelknop', async () => {
  const { context, pending, target } = omgeving();
  context.teamVersie = 1;
  const result = context.toonGespeeld('VOLEVO MA 4', 1);
  pending[0].reject(new Error('offline')); await result;
  assert.match(target.innerHTML, /Opnieuw proberen/);
  assert.doesNotMatch(target.innerHTML, /geen uitslagen beschikbaar/);
});

test('een verse uitslag herkent een wedstrijd die in het oudere programma nog gepland staat', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../app/resultaten.js', import.meta.url), 'utf8'), context);
  const wedstrijd = { thuis: 'VOLEVO MB 4', uit: 'ZVH MB 2', tijdstip: '2026-10-17T12:30:00+02:00', status: 'gepland' };
  const uitslag = { thuis: 'VOLEVO MB 4', uit: 'ZVH MB 2', tijd: new Date('2026-10-17T10:30:00Z') };
  assert.equal(context.Resultaten.heeftUitslag(wedstrijd, [uitslag]), true);
  assert.equal(context.Resultaten.heeftUitslag({ ...wedstrijd, tijdstip: '2026-12-12T12:30:00+01:00' }, [uitslag]), false);
  assert.equal(context.Resultaten.heeftUitslag({ ...wedstrijd, thuis: 'Ander team' }, [uitslag]), false);
});
