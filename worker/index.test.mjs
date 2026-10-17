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

// ── Trainingsschema ──
import { readFileSync } from 'node:fs';
const echt = JSON.parse(readFileSync(new URL('../data/trainingen.json', import.meta.url), 'utf8'));
const putT = (env, body, wachtwoord = 'geheim') => worker.fetch(new Request('https://x/trainingen', {
  method: 'PUT', headers: { Authorization: 'Bearer ' + wachtwoord }, body: JSON.stringify(body) }), env);

test('trainingsschema: fout wachtwoord bewaart niets', async () => {
  const env = omgeving();
  assert.equal((await putT(env, echt, 'fout')).status, 401);
  assert.equal(env.opslag.size, 0);
});

test('trainingsschema: het echte schema uit de repo wordt aanvaard en onveranderd teruggegeven', async () => {
  const env = omgeving();
  assert.equal((await worker.fetch(new Request('https://x/trainingen'), env)).status, 404);
  const r = await putT(env, echt);
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const terug = await (await worker.fetch(new Request('https://x/trainingen'), env)).json();
  assert.deepEqual(terug.dagen, echt.dagen);
  assert.equal(terug.versie, echt.versie);
  assert.equal(env.opslag.has('overrides'), false);       // raakt de veldcorrecties niet
});

test('trainingsschema: tweede versie bewaart de eerste als vorige', async () => {
  const env = omgeving();
  await putT(env, echt);
  await putT(env, { ...echt, versie: '1/1/2027' });
  assert.equal(JSON.parse(env.opslag.get('trainingen:vorig')).versie, echt.versie);
});

test('trainingsschema: ongeldige zaal, tijd of dag wordt geweigerd', async () => {
  const env = omgeving();
  const blok = (b) => ({ ...echt, dagen: { ma: [{ hal: 'Tas', van: '17:30', tot: '19:00', velden: { 1: { team: 'MC1' } }, ...b }] } });
  assert.equal((await putT(env, blok({ hal: 'Zolder' }))).status, 400);
  assert.equal((await putT(env, blok({ van: '25:99' }))).status, 400);
  assert.equal((await putT(env, { ...echt, dagen: { maandag: [] } })).status, 400);
  assert.equal((await putT(env, { ...echt, versie: '' })).status, 400);
  assert.equal(env.opslag.size, 0);
});

// ── Inloggen ──
const login = (env, wachtwoord) => worker.fetch(new Request('https://x/login', {
  headers: wachtwoord === undefined ? {} : { Authorization: 'Bearer ' + wachtwoord } }), env);

test('inloggen: juist wachtwoord geeft 200, fout of ontbrekend wachtwoord 401, en er wordt niets bewaard', async () => {
  const env = omgeving();
  assert.equal((await login(env, 'geheim')).status, 200);
  assert.equal((await login(env, 'fout')).status, 401);
  assert.equal((await login(env)).status, 401);
  assert.equal(env.opslag.size, 0);
});

test('inloggen: zonder ingesteld wachtwoord kom je er nooit in', async () => {
  assert.equal((await login(omgeving(''), '')).status, 401);
});
