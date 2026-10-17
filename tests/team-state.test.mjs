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
