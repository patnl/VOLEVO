// Beheer-API voor de schermen: bewaart de handmatige correcties (velden, standen,
// meldingen) die voorrang hebben op Nevobo, en het trainingsschema. Lezen is
// openbaar (de pagina's lezen het), schrijven kan alleen met het beheerwachtwoord.
//
//   GET  /overrides   -> opgeslagen correcties (404 zolang er niets is opgeslagen)
//   PUT  /overrides   -> bewaart nieuwe correcties; header Authorization: Bearer <wachtwoord>
//   GET  /trainingen  -> opgeslagen trainingsschema (404 zolang er niets is opgeslagen)
//   PUT  /trainingen  -> bewaart een nieuw trainingsschema; zelfde wachtwoord
//   GET  /login       -> 200 bij het juiste wachtwoord, anders 401; bewaart niets
//
// Instellingen (zie README.md): KV-opslag `OVERRIDES`, geheim `BEHEER_WACHTWOORD`,
// variabele `ALLOWED_ORIGIN` (adres van de site, zonder slash aan het eind).

const MAX_BYTES = 256 * 1024;
const VELD = /^[1-7]G?$/;                    // 1..7, of 4G (veld 4 groot)
const SLEUTEL = /^\d{4}-\d{2}-\d{2}T[\d:+.-]+\|.{1,120}\|.{1,120}$/;

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://patnl.github.io',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

function antwoord(env, status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(env) }
  });
}

// Vergelijk twee teksten zonder dat de duur verraadt hoeveel tekens kloppen
async function gelijk(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let verschil = 0;
  for (let i = 0; i < u.length; i++) verschil |= u[i] ^ v[i];
  return verschil === 0;
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Geeft de schone correcties terug, of een tekst met wat er mis is
function controleer(d) {
  if (!isObject(d)) return 'Verwacht een JSON-object.';
  const velden = d.velden || {}, standen = d.standen || {}, meldingen = d.meldingen || {};
  if (!isObject(velden) || !isObject(standen) || !isObject(meldingen)) return 'velden, standen en meldingen moeten objecten zijn.';
  for (const [k, v] of Object.entries(velden)) {
    if (!SLEUTEL.test(k)) return 'Ongeldige wedstrijdsleutel: ' + k.slice(0, 80);
    if (typeof v !== 'string' || !VELD.test(v)) return 'Ongeldig veld voor ' + k.slice(0, 80) + ': ' + String(v).slice(0, 10);
  }
  for (const [k, v] of Object.entries(standen)) {
    if (!isObject(v) || !Object.values(v).every((s) => ['drie', 'vier', 'gemengd'].includes(s))) return 'Ongeldige stand bij ' + k.slice(0, 40);
  }
  for (const [k, v] of Object.entries(meldingen)) {
    if (typeof v !== 'string' || v.length > 500) return 'Ongeldige melding bij ' + k.slice(0, 40);
  }
  return { toelichting: String(d.toelichting || '').slice(0, 300), standen, velden, meldingen };
}

const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
const kort = (s, n) => typeof s === 'string' && s.length <= n;

// Het trainingsschema zoals scripts/import_trainingsschema.py en volevo-schema.html het maken
function controleerTrainingen(d) {
  if (!isObject(d)) return 'Verwacht een JSON-object.';
  if (!kort(d.versie, 40) || !d.versie) return 'versie ontbreekt of is te lang.';
  if (!isObject(d.dagen)) return 'dagen moet een object zijn.';
  const duur = d.wedstrijdDuurMinuten === undefined ? 120 : d.wedstrijdDuurMinuten;
  if (!Number.isInteger(duur) || duur < 30 || duur > 240) return 'wedstrijdDuurMinuten moet tussen 30 en 240 liggen.';
  const dagen = {};
  for (const [dag, blokken] of Object.entries(d.dagen)) {
    if (!['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].includes(dag)) return 'Onbekende dag: ' + dag.slice(0, 10);
    if (!Array.isArray(blokken) || blokken.length > 12) return 'Te veel blokken op ' + dag + '.';
    dagen[dag] = [];
    for (const b of blokken) {
      if (!isObject(b) || !['Tas', 'Bocht'].includes(b.hal)) return 'Ongeldige zaal op ' + dag + '.';
      if (!TIJD.test(b.van) || !TIJD.test(b.tot)) return 'Ongeldige tijd op ' + dag + '.';
      if (!isObject(b.velden) || Object.keys(b.velden).length > 8) return 'Ongeldige velden op ' + dag + '.';
      const velden = {};
      for (const [nr, c] of Object.entries(b.velden)) {
        if (!/^[1-9]$/.test(nr) || !isObject(c)) return 'Ongeldig veld ' + nr.slice(0, 5) + ' op ' + dag + '.';
        if (!(c.team === null || kort(c.team, 60))) return 'Ongeldige teamnaam op ' + dag + '.';
        if ((c.van !== undefined && !TIJD.test(c.van)) || (c.tot !== undefined && !TIJD.test(c.tot))) return 'Ongeldige celtijd op ' + dag + '.';
        if (c.opm !== undefined && !kort(c.opm, 120)) return 'Te lange opmerking op ' + dag + '.';
        const schoon = { team: c.team };
        if (c.van) schoon.van = c.van;
        if (c.tot) schoon.tot = c.tot;
        if (c.wedstrijd === true) schoon.wedstrijd = true;
        if (c.opm) schoon.opm = c.opm;
        velden[nr] = schoon;
      }
      dagen[dag].push({ hal: b.hal, van: b.van, tot: b.tot, velden });
    }
  }
  const velden = {};
  for (const hal of ['Tas', 'Bocht']) {
    const v = isObject(d.velden) && isObject(d.velden[hal]) ? d.velden[hal] : {};
    velden[hal] = Object.fromEntries(Object.entries(v).filter(([k, n]) => /^[1-9]$/.test(k) && kort(n, 30)));
  }
  const opmerkingen = Array.isArray(d.opmerkingen) ? d.opmerkingen.filter((o) => kort(o, 200)).slice(0, 10) : [];
  return { versie: d.versie, toelichting: String(d.toelichting || '').slice(0, 400), opmerkingen, wedstrijdDuurMinuten: duur, velden, dagen };
}

async function wachtwoordKlopt(request, env) {
  const wachtwoord = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(env.BEHEER_WACHTWOORD && wachtwoord && (await gelijk(wachtwoord, env.BEHEER_WACHTWOORD)));
}

// Per pad: onder welke sleutel het bewaard wordt en hoe het gecontroleerd wordt
const ONDERDELEN = {
  '/overrides': { sleutel: 'overrides', controleer: controleer, nieuw: (s) => { s.gewijzigd = new Date().toISOString(); } },
  '/trainingen': { sleutel: 'trainingen', controleer: controleerTrainingen, nieuw: (s) => { s.gewijzigd = new Date().toISOString(); } }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname === '/login' && request.method === 'GET')
      return (await wachtwoordKlopt(request, env)) ? antwoord(env, 200, { ok: true }) : antwoord(env, 401, { fout: 'Onjuist wachtwoord.' });
    const onderdeel = ONDERDELEN[url.pathname];
    if (!onderdeel) return antwoord(env, 404, { fout: 'Niet gevonden.' });

    if (request.method === 'GET') {
      const bewaard = await env.OVERRIDES.get(onderdeel.sleutel);
      return bewaard ? antwoord(env, 200, bewaard) : antwoord(env, 404, { fout: 'Nog niets opgeslagen.' });
    }

    if (request.method === 'PUT') {
      if (!(await wachtwoordKlopt(request, env)))
        return antwoord(env, 401, { fout: 'Onjuist wachtwoord.' });

      const tekst = await request.text();
      if (tekst.length > MAX_BYTES) return antwoord(env, 413, { fout: 'Bestand te groot.' });
      let invoer;
      try { invoer = JSON.parse(tekst); } catch (e) { return antwoord(env, 400, { fout: 'Geen geldige JSON.' }); }
      const schoon = onderdeel.controleer(invoer);
      if (typeof schoon === 'string') return antwoord(env, 400, { fout: schoon });

      onderdeel.nieuw(schoon);
      const vorige = await env.OVERRIDES.get(onderdeel.sleutel);
      if (vorige) await env.OVERRIDES.put(onderdeel.sleutel + ':vorig', vorige);   // een stap terug blijft bewaard
      await env.OVERRIDES.put(onderdeel.sleutel, JSON.stringify(schoon));
      return antwoord(env, 200, { ok: true, gewijzigd: schoon.gewijzigd,
        velden: schoon.velden && !schoon.dagen ? Object.keys(schoon.velden).length : undefined,
        versie: schoon.versie });
    }

    return antwoord(env, 405, { fout: 'Methode niet toegestaan.' });
  }
};
