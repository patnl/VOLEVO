// Draai met:  node --test worker/index.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

function omgeving(wachtwoord = 'geheim') {
  const opslag = new Map();
  return { BEHEER_WACHTWOORD: wachtwoord, ALLOWED_ORIGIN: 'https://patnl.github.io',
    OVERRIDES: { get: async (k) => opslag.get(k) ?? null, put: async (k, v) => { opslag.set(k, v); } }, opslag };
}
const sleutel = '2026-10-29T21:00:00+01:00|VOLEVO DS 3|Zovoc DS 1';
const put = (env, body, wachtwoord = 'geheim') => worker.fetch(new Request('https://x/overrides', {
  method: 'PUT', headers: { Authorization: 'Bearer ' + wachtwoord }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);

test('zonder wachtwoord of met een fout wachtwoord wordt niets bewaard', async () => {
  const env = omgeving();
  assert.equal((await put(env, { velden: { [sleutel]: '4G' } }, 'fout')).status, 401);
  assert.equal(env.opslag.size, 0);
});

test('een geldige wijziging wordt bewaard, gelezen en de vorige blijft bewaard', async () => {
  const env = omgeving();
  assert.equal((await worker.fetch(new Request('https://x/overrides'), env)).status, 404);
  assert.equal((await put(env, { velden: { [sleutel]: '4G' } })).status, 200);
  assert.equal((await put(env, { velden: { [sleutel]: '5' } })).status, 200);
  const gelezen = await (await worker.fetch(new Request('https://x/overrides'), env)).json();
  assert.equal(gelezen.velden[sleutel], '5');
  assert.equal(JSON.parse(env.opslag.get('overrides:vorig')).velden[sleutel], '4G');
});

test('een ongeldig veld of sleutel wordt geweigerd', async () => {
  const env = omgeving();
  assert.equal((await put(env, { velden: { [sleutel]: '9' } })).status, 400);
  assert.equal((await put(env, { velden: { 'rommel': '1' } })).status, 400);
  assert.equal((await put(env, 'geen json')).status, 400);
  assert.equal(env.opslag.size, 0);
});

test('zonder ingesteld wachtwoord is schrijven altijd geweigerd', async () => {
  const env = omgeving('');
  assert.equal((await put(env, { velden: {} }, '')).status, 401);
});
