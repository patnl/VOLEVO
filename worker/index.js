// Beheer-API voor de schermen: bewaart de handmatige correcties (velden, standen,
// meldingen) die voorrang hebben op Nevobo. Lezen is openbaar (de schermen lezen
// het), schrijven kan alleen met het beheerwachtwoord.
//
//   GET  /overrides   -> opgeslagen correcties (404 zolang er niets is opgeslagen)
//   PUT  /overrides   -> bewaart nieuwe correcties; header Authorization: Bearer <wachtwoord>
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname !== '/overrides') return antwoord(env, 404, { fout: 'Niet gevonden.' });

    if (request.method === 'GET') {
      const bewaard = await env.OVERRIDES.get('overrides');
      return bewaard ? antwoord(env, 200, bewaard) : antwoord(env, 404, { fout: 'Nog niets opgeslagen.' });
    }

    if (request.method === 'PUT') {
      const wachtwoord = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!env.BEHEER_WACHTWOORD || !wachtwoord || !(await gelijk(wachtwoord, env.BEHEER_WACHTWOORD)))
        return antwoord(env, 401, { fout: 'Onjuist wachtwoord.' });

      const tekst = await request.text();
      if (tekst.length > MAX_BYTES) return antwoord(env, 413, { fout: 'Bestand te groot.' });
      let invoer;
      try { invoer = JSON.parse(tekst); } catch (e) { return antwoord(env, 400, { fout: 'Geen geldige JSON.' }); }
      const schoon = controleer(invoer);
      if (typeof schoon === 'string') return antwoord(env, 400, { fout: schoon });

      schoon.gewijzigd = new Date().toISOString();
      const vorige = await env.OVERRIDES.get('overrides');
      if (vorige) await env.OVERRIDES.put('overrides:vorig', vorige);   // een stap terug blijft bewaard
      await env.OVERRIDES.put('overrides', JSON.stringify(schoon));
      return antwoord(env, 200, { ok: true, gewijzigd: schoon.gewijzigd, velden: Object.keys(schoon.velden).length });
    }

    return antwoord(env, 405, { fout: 'Methode niet toegestaan.' });
  }
};
