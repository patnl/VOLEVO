// Gedeelde laadfunctie voor de handmatige correcties (velden, standen, meldingen).
// Staat VOLEVO_API ingesteld, dan komen ze van de beheer-API (daar werkt de
// wedstrijdsecretaris ze bij via volevo-schema.html). Is die er niet of niet
// bereikbaar, dan geldt data/overrides.json uit de repo.
var VOLEVO_API = 'https://volevo-beheer.volevo-zaal.workers.dev';   // bijvoorbeeld 'https://volevo-beheer.<account>.workers.dev'; leeg = alleen het bestand

// Pagina's in een submap (de app) zetten voor dit script: var VOLEVO_DATA = '../';
var VOLEVO_DATA = (typeof VOLEVO_DATA === 'string') ? VOLEVO_DATA : './';

// Een trage of onbereikbare beheer-API mag de pagina niet ophouden: na 4 seconden geldt het bestand
function wachtTijd() { return (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(4000) : undefined; }

async function laadOverrides() {
  var t = '?t=' + Date.now();
  if (VOLEVO_API) {
    try {
      var r = await fetch(VOLEVO_API + '/overrides' + t, { cache: 'no-store', signal: wachtTijd() });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  try {
    var r2 = await fetch(VOLEVO_DATA + 'data/overrides.json' + t, { cache: 'no-store' });
    if (r2.ok) return await r2.json();
  } catch (e) {}
  return null;
}

// Het trainingsschema (data/trainingen.json), op dezelfde manier: eerst de API, dan het bestand.
async function laadTrainingen() {
  var t = '?t=' + Date.now();
  if (VOLEVO_API) {
    try {
      var r = await fetch(VOLEVO_API + '/trainingen' + t, { cache: 'no-store', signal: wachtTijd() });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  try {
    var r2 = await fetch(VOLEVO_DATA + 'data/trainingen.json' + t, { cache: 'no-store' });
    if (r2.ok) return await r2.json();
  } catch (e) {}
  return null;
}
