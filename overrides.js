// Gedeelde laadfunctie voor de handmatige correcties (velden, standen, meldingen).
// Staat VOLEVO_API ingesteld, dan komen ze van de beheer-API (daar werkt de
// wedstrijdsecretaris ze bij via volevo-schema.html). Is die er niet of niet
// bereikbaar, dan geldt data/overrides.json uit de repo.
var VOLEVO_API = 'https://volevo-beheer.volevo-zaal.workers.dev';   // bijvoorbeeld 'https://volevo-beheer.<account>.workers.dev'; leeg = alleen het bestand

async function laadOverrides() {
  var t = '?t=' + Date.now();
  if (VOLEVO_API) {
    try {
      var r = await fetch(VOLEVO_API + '/overrides' + t, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  try {
    var r2 = await fetch('./data/overrides.json' + t, { cache: 'no-store' });
    if (r2.ok) return await r2.json();
  } catch (e) {}
  return null;
}

// Het trainingsschema (data/trainingen.json), op dezelfde manier: eerst de API, dan het bestand.
async function laadTrainingen() {
  var t = '?t=' + Date.now();
  if (VOLEVO_API) {
    try {
      var r = await fetch(VOLEVO_API + '/trainingen' + t, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  try {
    var r2 = await fetch('./data/trainingen.json' + t, { cache: 'no-store' });
    if (r2.ok) return await r2.json();
  } catch (e) {}
  return null;
}
