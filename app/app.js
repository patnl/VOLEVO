// Gedeeld deel van de app voor telefoons: kop, onderbalk, teamkeuze en gegevens laden.
// De regels over wedstrijden (vervallen, velden, taken) komen uit ../shared/wedstrijden.js,
// dezelfde die de zaalschermen gebruiken.
var App = (function () {
  var NAV = [
    ['vandaag', 'index.html', '●', 'Vandaag'],
    ['programma', 'programma.html', '▣', 'Programma'],
    ['uitslagen', 'uitslagen.html', '✓', 'Uitslagen'],
    ['fluiten', 'fluiten.html', '♪', 'Fluiten/tellen']
  ];
  var TEAMSOORT = { DS: 'Dames', HS: 'Heren', MA: 'Meisjes A', MB: 'Meisjes B', MC: 'Meisjes C', JA: 'Jongens A', JB: 'Jongens B', JC: 'Jongens C' };
  var MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dagSleutel(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function tijd(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dagTekst(d) { return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function kort(d) { return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) + ' om ' + tijd(d); }

  // "VOLEVO MB 2" -> "Meisjes B 2 (MB 2)"; onbekende codes blijven zoals ze zijn
  function teamNaam(naam) {
    var code = Wedstrijden.teamCode(naam);
    if (!code) return naam;
    var m = /^([A-Z]{2})\s*(\d+)$/.exec(code);
    return m && TEAMSOORT[m[1]] ? TEAMSOORT[m[1]] + ' ' + m[2] + ' (' + code + ')' : code;
  }
  function routeUrl(w) {
    var q = (w.lat && w.lon) ? (w.lat + ',' + w.lon) : [w.hal, w.adres, w.postcode, w.plaats].filter(Boolean).join(', ');
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }
  function team(w, naam) { return w.thuis === naam || w.uit === naam; }

  // Een wedstrijdkaart: eerst tijd en thuis/uit, dan wie tegen wie, dan waar
  function wedstrijdKaart(w, D, opties) {
    opties = opties || {};
    var d = new Date(w.tijdstip), thuis = Wedstrijden.teamCode(w.thuis), uit = Wedstrijden.teamCode(w.uit);
    var eigenThuis = thuis !== null, eigen = eigenThuis ? w.thuis : (uit !== null ? w.uit : ''), tegen = eigenThuis ? w.uit : w.thuis;
    var veld = Wedstrijden.veldTekst(w, D.correcties), route = routeUrl(w);
    var adres = [w.adres, w.postcode, w.plaats].filter(Boolean).join(', ');
    var helpers = opties.helpers ? Wedstrijden.helpersBij(D.officials, w) : [];
    return '<article class="kaart"><div class="rij1"><span class="tijd">' + esc(opties.metDatum ? kort(d) : tijd(d)) + '</span>' +
      '<span class="label ' + (eigenThuis ? '' : 'uit') + '">' + (eigenThuis ? 'Thuis' : 'Uit') + '</span></div>' +
      '<p class="teams">' + esc(teamNaam(eigen || w.thuis)) + '<br><span class="tegen">tegen ' + esc(tegen) + '</span></p>' +
      '<p class="plek"><strong>' + esc(w.hal || 'Sporthal nog niet bekend') + '</strong>' + (veld ? ' · ' + esc(veld) : '') + (adres ? '<br>' + esc(adres) : '') + '</p>' +
      (helpers.length ? '<p class="officials">' + helpers.map(function (h) { return esc(h.soort + ': ' + h.team); }).join(' · ') + '</p>' : '') +
      (route && !opties.zonderRoute ? '<div class="acties"><a class="knop" target="_blank" rel="noopener" aria-label="Route naar ' + esc(w.hal || 'de sporthal') + '" href="' + esc(route) + '">Route naar sporthal</a></div>' : '') +
      '</article>';
  }

  function vervallenMeldingen(lijst) {
    var nu = new Date();
    return Wedstrijden.vervallen(lijst).filter(function (w) { return new Date(w.tijdstip) > nu; }).map(function (w) {
      return '<div class="melding"><strong>Vervallen</strong>' + esc(w.thuis) + ' – ' + esc(w.uit) + ' op ' + esc(kort(new Date(w.tijdstip))) + ' gaat niet door.</div>';
    }).join('');
  }

  // Uitleg om VOLEVO als icoon op de telefoon te zetten; weg als de app al zo geopend is.
  // De gewone link blijft altijd bruikbaar. De menunamen verschillen per toestel en versie.
  function beginschermKaart() {
    var alsApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    if (alsApp) return '';
    return '<h2>Zet VOLEVO op je beginscherm</h2><details class="kaart uitleg"><summary>Zo open je VOLEVO met één tik</summary>' +
      '<h3>iPhone (Safari)</h3><ol><li>Open deze pagina in Safari.</li><li>Tik op <strong>Deel</strong> (het vierkantje met een pijl). Die staat onderin of achter de drie puntjes.</li>' +
      '<li>Kies <strong>Zet op beginscherm</strong>.</li><li>Zet <strong>Open als webapp</strong> aan, als die keuze er staat.</li><li>Tik op <strong>Voeg toe</strong>.</li></ol>' +
      '<h3>Android (Chrome)</h3><ol><li>Open deze pagina in Chrome.</li><li>Tik op de drie puntjes rechtsboven.</li>' +
      '<li>Kies <strong>Installeren</strong> of <strong>App installeren</strong>, en tik op <strong>Installeren</strong>.</li>' +
      '<li>Staat die keuze er niet? Kies dan <strong>Toevoegen aan startscherm</strong> (of <strong>Snelkoppeling maken</strong>), noem hem VOLEVO en tik op <strong>Toevoegen</strong>.</li></ol>' +
      '<p class="sub">Lukt het niet? Je kunt VOLEVO ook gewoon via de link blijven gebruiken.</p></details>';
  }

  async function json(url) { var r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

  async function laadGegevens() {
    var m = await json('../data/matches.json');
    var over = null, off = {};
    try { over = await laadOverrides(); } catch (e) {}
    try { off = (await json('../data/officials.json')).perWedstrijd || {}; } catch (e) {}
    return { wedstrijden: m.wedstrijden || [], gegenereerd: m.gegenereerd || null, correcties: (over && over.velden) || {}, meldingen: (over && over.meldingen) || {}, officials: off };
  }

  function teamsUit(wedstrijden) {
    var s = {};
    wedstrijden.forEach(function (w) { [w.thuis, w.uit].forEach(function (n) { if (Wedstrijden.teamCode(n) !== null) s[n] = true; }); });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'nl', { numeric: true }); });
  }

  // Zet de pagina in elkaar. config: { pagina, titel, teamKeuze: 'optioneel'|'verplicht', toon(D, teamnaam) -> html }
  async function start(config) {
    var gekozen = '';
    try { gekozen = localStorage.getItem('volevo-team') || ''; } catch (e) {}
    document.body.innerHTML =
      '<header class="kop"><img src="../LOGO.png" alt="" onerror="this.style.visibility=\'hidden\'"><div><p class="merk">VOLEVO</p><h1>' + esc(config.titel) + '</h1></div>' +
      '<button id="vernieuw" aria-label="Gegevens vernieuwen" title="Gegevens vernieuwen">↻</button></header>' +
      '<main><div class="teamkeuze"><label for="team">Mijn team</label><select id="team"></select></div><div id="inhoud" aria-live="polite"></div><p class="stand" id="stand"></p></main>' +
      '<nav class="onderbalk" aria-label="Hoofdmenu">' + NAV.map(function (n) {
        return '<a href="' + n[1] + '"' + (n[0] === config.pagina ? ' aria-current="page"' : '') + '><span class="ico" aria-hidden="true">' + n[2] + '</span><span>' + n[3] + '</span></a>';
      }).join('') + '</nav>';
    var select = document.getElementById('team'), inhoud = document.getElementById('inhoud'), D = null;

    function toon() {
      if (!D) return;
      if (config.teamKeuze === 'verplicht' && !gekozen) {
        inhoud.innerHTML = '<div class="melding leeg"><strong>Kies je team</strong>Kies hierboven je team om te zien wat voor jullie geldt.</div>';
        return;
      }
      inhoud.innerHTML = config.toon(D, gekozen);
    }
    async function laad() {
      inhoud.innerHTML = '<div class="melding leeg">Wedstrijden ophalen…</div>';
      try {
        D = await laadGegevens();
        var teams = teamsUit(D.wedstrijden);
        if (gekozen && teams.indexOf(gekozen) === -1) gekozen = '';
        select.innerHTML = '<option value="">' + (config.teamKeuze === 'verplicht' ? 'Kies je team' : 'Alle VOLEVO-teams') + '</option>' +
          teams.map(function (t) { return '<option value="' + esc(t) + '"' + (t === gekozen ? ' selected' : '') + '>' + esc(teamNaam(t)) + '</option>'; }).join('');
        var g = D.gegenereerd ? new Date(D.gegenereerd) : null;
        document.getElementById('stand').textContent = g && !isNaN(g) ? 'Laatste wijziging in de wedstrijdgegevens: ' + g.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        toon();
      } catch (e) {
        D = null;
        inhoud.innerHTML = '<div class="melding fout"><strong>De wedstrijdgegevens kunnen nu niet worden opgehaald.</strong>Probeer het opnieuw.<div class="acties" style="margin-top:10px"><button class="knop vol" id="opnieuw">Opnieuw proberen</button></div></div>';
        document.getElementById('opnieuw').addEventListener('click', laad);
      }
    }
    App.hertoon = toon;
    select.addEventListener('change', function () {
      gekozen = select.value;
      try { localStorage.setItem('volevo-team', gekozen); } catch (e) {}
      toon();
    });
    document.getElementById('vernieuw').addEventListener('click', laad);
    await laad();
  }

  return { start: start, esc: esc, pad: pad, dagSleutel: dagSleutel, tijd: tijd, dagTekst: dagTekst, kort: kort, teamNaam: teamNaam, team: team,
           wedstrijdKaart: wedstrijdKaart, vervallenMeldingen: vervallenMeldingen, beginschermKaart: beginschermKaart };
})();
