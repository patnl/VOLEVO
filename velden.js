// Velden van De Fluit voor pagina's die data/matches.json zelf inlezen.
// De Nevobo-veldnummers kloppen niet met de zaal. De correcties uit
// data/overrides.json krijgen voorrang, en de velden heten zoals in het
// zaalschema van de club: De Tas 1 t/m 3, De Bocht 4 t/m 7.
var Velden = (function() {
  var correcties = {};

  async function laad() {
    try {
      var r = await fetch('./data/overrides.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) correcties = (await r.json()).velden || {};
    } catch (e) {}
  }

  // Zet het gecorrigeerde veld in de wedstrijden zelf
  function corrigeer(lijst) {
    (lijst || []).forEach(function(w) {
      var o = correcties[(w.tijdstip || '') + '|' + (w.thuis || '') + '|' + (w.uit || '')];
      if (o !== undefined && o !== null && o !== '') { w.veld = String(o); w.veldUitSchema = true; }
    });
    return lijst;
  }

  // Weergavenaam: "Tas 1" of "Bocht 4" in De Fluit, elders "veld 3".
  // In De Fluit zegt het Nevobo-nummer niets; zonder zaalschema geen veld.
  function label(w) {
    if (!w || !w.veld) return '';
    if (w.hal !== 'De Fluit') return 'veld ' + w.veld;
    if (!w.veldUitSchema) return '';
    var n = parseInt(w.veld, 10);
    return n <= 3 ? 'Tas ' + n : 'Bocht ' + n;
  }

  return { laad: laad, corrigeer: corrigeer, label: label };
})();
