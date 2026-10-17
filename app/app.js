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
    var q = Wedstrijden.locatie(w).route;
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }
  function team(w, naam) { return w.thuis === naam || w.uit === naam; }

  // Waar kom je vandaan als je naar de zaalindeling gaat, en waar brengt Terug je naar toe
  var VAN = { vandaag: ['index.html', 'Vandaag'], programma: ['programma.html', 'Programma'], uitslagen: ['uitslagen.html', 'Uitslagen'], fluiten: ['fluiten.html', 'Fluiten en tellen'], team: ['team.html', 'Teamoverzicht'] };
  var huidigTeam = '', huidigePagina = '', paginaConfig = null, hersteld = false;

  // Link naar de zaalindeling (in dezelfde app) voor elke wedstrijd in De Fluit. Staat het veld in het zaalschema,
  // dan wordt dat veld gemarkeerd; anders opent de zaal voor die dag en ronde zonder markering (we verzinnen geen veld).
  // `van` zegt waar Terug naartoe gaat.
  function zaalLink(w, D, van) {
    if (w.hal !== 'De Fluit') return '';
    var d = new Date(w.tijdstip), v = van || huidigePagina, bekend = Wedstrijden.heeftCorrectie(w, D.correcties);
    return 'zaal.html?dag=' + dagSleutel(d) + '&ronde=' + tijd(d) + (bekend ? '&veld=' + encodeURIComponent(Wedstrijden.veldNummer(w, D.correcties)) : '') + (VAN[v] ? '&van=' + v : '');
  }
  function zaalLabel(w, D) { return Wedstrijden.heeftCorrectie(w, D.correcties) ? 'Bekijk veld in de zaal' : 'Bekijk zaalindeling'; }
  // Externe bronlink (Nevobo), herkenbaar als extern; alleen bekende https-adressen
  function bronKnop(url, label) {
    var u = Wedstrijden.bronLink(url);
    return u ? '<a class="knop bron" target="_blank" rel="noopener noreferrer" href="' + esc(u) + '">' + esc(label) + ' <span aria-hidden="true">↗</span><span class="alleen-lezer"> (opent Nevobo in een nieuw venster)</span></a>' : '';
  }

  function teamStand(D, naam) {
    var bron = D.teamstanden, t = bron && bron.teams && bron.teams[naam];
    if (!bron) return { tekst: 'Stand kon niet worden geladen', bron: '', datum: '', oud: false };
    var datum = new Date(bron.opgehaald), geldig = !isNaN(datum);
    return { beschikbaar: !!(t && t.stand), tekst: t && t.stand ? t.stand : 'Geen stand gepubliceerd door Nevobo', bron: t ? t.bron : '',
      seizoen: t ? t.seizoen : '', datum: geldig ? datum.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '',
      oud: !geldig || Date.now() - datum.getTime() > 48 * 60 * 60 * 1000 };
  }

  // Een wedstrijdkaart: eerst tijd en thuis/uit, dan wie tegen wie, dan waar. Met een gekozen team staat dat team vooraan.
  function wedstrijdKaart(w, D, opties) {
    opties = opties || {};
    var d = new Date(w.tijdstip), p = Wedstrijden.perspectief(w, opties.team !== undefined ? opties.team : huidigTeam);
    var veld = Wedstrijden.veldTekst(w, D.correcties), route = routeUrl(w);
    var adres = Wedstrijden.locatie(w).adres;
    var helpers = opties.helpers && D.officialsOk ? Wedstrijden.helpersBij(D.officials, w) : [];
    var zl = opties.zonderZaal ? '' : zaalLink(w, D, opties.van);
    var knoppen = (zl ? '<a class="knop vol" data-bewaar href="' + esc(zl) + '">' + zaalLabel(w, D) + '</a>' : '') +
      (route && !opties.zonderRoute ? '<a class="knop" target="_blank" rel="noopener" aria-label="Route naar ' + esc(w.hal || 'de sporthal') + '" href="' + esc(route) + '">Route naar sporthal</a>' : '') +
      (opties.metBron === false ? '' : bronKnop(w.dwf, 'Wedstrijdformulier'));
    return '<article class="kaart"><div class="rij1"><span class="tijd">' + esc(opties.metDatum ? kort(d) : tijd(d)) + '</span>' +
      '<span class="label ' + (p.eigenThuis ? '' : 'uit') + '">' + (p.eigenThuis ? 'Thuis' : 'Uit') + '</span></div>' +
      '<p class="teams">' + esc(teamNaam(p.eigen)) + '<br><span class="tegen">tegen ' + esc(p.tegen) + '</span></p>' +
      '<p class="plek"><strong>' + esc(w.hal || 'Sporthal nog niet bekend') + '</strong>' + (veld ? ' · ' + esc(veld) : '') + (adres ? '<br>' + esc(adres) : '') + '</p>' +
      (helpers.length ? '<p class="officials">' + helpers.map(function (h) { return esc(h.soort + ': ' + h.team); }).join(' · ') + '</p>' : '') +
      (opties.helpers && !D.officialsOk ? '<p class="officials">Fluit- en telbeurten konden niet worden geladen.</p>' : '') +
      (knoppen ? '<div class="acties">' + knoppen + '</div>' : '') +
      '</article>';
  }

  // Compacte dagkaart: wat het gekozen team vandaag doet, op tijd: eigen wedstrijden en fluit- of telbeurten.
  // Alleen roosterdata, geen gokwerk; "Je team" omdat de app niet weet wie de beurt uitvoert.
  function dagKaart(D, naam, dag) {
    if (!naam) return '';
    var rijen = [], code = Wedstrijden.teamCode(naam);
    Wedstrijden.speelbaar(D.wedstrijden).filter(function (w) { return team(w, naam) && dagSleutel(new Date(w.tijdstip)) === dag; }).forEach(function (w) {
      var p = Wedstrijden.perspectief(w, naam), veld = Wedstrijden.veldTekst(w, D.correcties), zl = zaalLink(w, D);
      rijen.push({ t: w.tijdstip, soort: 'Wedstrijd', kop: p.eigenThuis ? 'Eigen wedstrijd, thuis' : 'Eigen wedstrijd, uit',
        tekst: teamNaam(p.eigen) + ' tegen ' + p.tegen, plek: [w.hal, veld].filter(Boolean).join(' · '), link: zl, linkLabel: zaalLabel(w, D) });
    });
    if (D.officialsOk && code) {
      var perSleutel = {}; D.wedstrijden.forEach(function (w) { perSleutel[Wedstrijden.sleutel(w)] = w; });
      Wedstrijden.takenVanTeam(D.officials, code).filter(function (t) { return dagSleutel(new Date(t.tijdstip)) === dag; }).forEach(function (t) {
        var w = perSleutel[t.sleutel]; if (w && w.status === 'vervallen') return;
        var kop = t.soort === 'Fluiten' ? 'Je team fluit' : (t.soort === 'Tellen' ? 'Je team telt' : 'Je team doet: ' + t.soort);
        rijen.push({ t: t.tijdstip, soort: t.soort, kop: kop, tekst: 'bij ' + t.thuis + ' – ' + t.uit,
          plek: w ? [w.hal, Wedstrijden.veldTekst(w, D.correcties)].filter(Boolean).join(' · ') : '', link: w ? zaalLink(w, D) : '', linkLabel: w ? zaalLabel(w, D) : '' });
      });
    }
    rijen.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    var melding = !D.officialsOk ? '<p class="officials">Fluit- en telbeurten konden niet worden geladen. <a href="fluiten.html">Bekijk Fluiten/tellen</a>.</p>' : '';
    if (!rijen.length && !melding) return '';
    return '<section class="kaart dagkaart" aria-label="Jouw dag"><h2 style="margin:0 0 6px">Jouw dag</h2>' +
      '<p class="sub" style="margin:0 0 8px">Wat ' + esc(teamNaam(naam)) + ' vandaag doet, op volgorde van tijd.</p>' +
      (rijen.length ? '<ol class="dag-lijst">' + rijen.map(function (r) {
        return '<li><span class="dt">' + esc(tijd(new Date(r.t))) + '</span><div><strong>' + esc(r.kop) + '</strong><br>' + esc(r.tekst) +
          (r.plek ? '<br><span class="plek-klein">' + esc(r.plek) + '</span>' : '') +
          (r.link ? '<br><a data-bewaar href="' + esc(r.link) + '">' + esc(r.linkLabel) + '</a>' : '') + '</div></li>';
      }).join('') + '</ol>' : '') + melding +
      '<p style="margin:10px 0 0"><a class="knop" href="fluiten.html">Alle taken: Fluiten/tellen</a></p></section>';
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

  // Laadt alle gegevens. De wedstrijden zijn verplicht (anders een foutscherm). Correcties en officials kunnen
  // apart wegvallen: dat onthouden we in correctiesOk en officialsOk, zodat een pagina nooit "geen beurten" meldt
  // terwijl de beurten alleen niet geladen konden worden.
  async function laadGegevens() {
    var m = await json('../data/matches.json');
    var over = null, off = {}, officialsOk = false, teamstanden = null;
    try { over = await laadOverrides(); } catch (e) {}
    try {
      var o = await json('../data/officials.json');
      if (o && typeof o.perWedstrijd === 'object' && o.perWedstrijd !== null) { off = o.perWedstrijd; officialsOk = true; }
    } catch (e) {}
    try {
      var standen = await json('../data/teamstanden.json');
      if (standen && standen.teams && typeof standen.teams === 'object') teamstanden = standen;
    } catch (e) {}
    return { wedstrijden: m.wedstrijden || [], gegenereerd: m.gegenereerd || null,
      teamstanden: teamstanden,
      correctiesOk: !!over, correcties: (over && over.velden) || {}, meldingen: (over && over.meldingen) || {}, standen: (over && over.standen) || {},
      officialsOk: officialsOk, officials: off };
  }

  function teamsUit(wedstrijden) {
    var s = {};
    wedstrijden.forEach(function (w) { [w.thuis, w.uit].forEach(function (n) { if (Wedstrijden.teamCode(n) !== null) s[n] = true; }); });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'nl', { numeric: true }); });
  }

  // Scrollpositie en lijststand bewaren voordat je naar de zaalindeling gaat, en bij Terug herstellen
  function bewaarStaat() {
    try { sessionStorage.setItem('volevo-staat', JSON.stringify({ pagina: huidigePagina, y: window.scrollY, extra: paginaConfig && paginaConfig.bewaar ? paginaConfig.bewaar() : null, t: Date.now() })); } catch (e) {}
  }
  // Alleen herstellen als je terugkomt van de zaalindeling (of met de terugknop), niet bij een gewoon nieuw bezoek
  function komtTerug() {
    try {
      // De zaalpagina zet dit vlak voordat Terug werkt; zo werkt het ook als de browser de navigatietype niet meegeeft
      var vlag = parseInt(sessionStorage.getItem('volevo-terug') || '0', 10);
      if (vlag && Date.now() - vlag < 60e3) return true;
      var nav = performance.getEntriesByType('navigation')[0];
      return (nav && nav.type === 'back_forward') || (document.referrer || '').indexOf('/zaal.html') !== -1;
    } catch (e) { return false; }
  }
  function herstelStaat() {
    if (hersteld || !komtTerug()) return;
    try {
      var s = JSON.parse(sessionStorage.getItem('volevo-staat') || 'null');
      if (!s || s.pagina !== huidigePagina || Date.now() - s.t > 30 * 60e3) return;
      hersteld = true; sessionStorage.removeItem('volevo-staat'); sessionStorage.removeItem('volevo-terug');
      window.scrollTo(0, s.y || 0);
    } catch (e) {}
  }
  // Voor een pagina die zijn lijst pas later vult (uitslagen): staat van vóór het wegnavigeren ophalen
  function bewaardeExtra() {
    try {
      var s = JSON.parse(sessionStorage.getItem('volevo-staat') || 'null');
      return komtTerug() && s && s.pagina === huidigePagina && Date.now() - s.t <= 30 * 60e3 ? s.extra : null;
    } catch (e) { return null; }
  }

  // Zet de pagina in elkaar. config: { pagina, titel, teamKeuze: 'optioneel'|'verplicht', toon(D, teamnaam) -> html,
  //   bewaar() -> object met lijststand, herstel(object) }; pagina mag leeg zijn (dan is geen tab actief)
  async function start(config) {
    var gekozen = '';
    try { gekozen = localStorage.getItem('volevo-team') || ''; } catch (e) {}
    huidigTeam = gekozen; huidigePagina = config.pagina || ''; paginaConfig = config;
    var extra = bewaardeExtra();
    if (extra && config.herstel) config.herstel(extra);
    document.body.innerHTML =
      '<header class="kop"><img src="../LOGO.png" alt="" onerror="this.style.visibility=\'hidden\'"><div><p class="merk">VOLEVO</p><h1>' + esc(config.titel) + '</h1></div>' +
      '<button id="vernieuw" aria-label="Gegevens vernieuwen" title="Gegevens vernieuwen">↻</button></header>' +
      '<main><div class="teamkeuze"><label for="team">Mijn team</label><select id="team"></select></div>' +
      (config.zonderZaalKnop ? '' : '<p class="zaalingang"><a class="knop vol" data-bewaar href="zaal.html' + (VAN[config.pagina] ? '?van=' + config.pagina : '') + '">Zaalindeling De Fluit</a></p>') +
      '<div id="teamstand"></div>' +
      '<div id="waarschuwing"></div><div id="inhoud" aria-live="polite"></div>' +
      '<p class="stand" id="stand"></p>' +
      '<aside class="clubblok" aria-label="Club en bronnen"><a class="knop" target="_blank" rel="noopener" href="https://volevo.nl/">Clubwebsite volevo.nl <span aria-hidden="true">↗</span><span class="alleen-lezer"> (opent in een nieuw venster)</span></a>' +
      '<p class="sub" style="margin:8px 0 0">Wedstrijden en uitslagen komen van Nevobo. Veldindeling en meldingen komen van de club.</p></aside></main>' +
      '<nav class="onderbalk" aria-label="Hoofdmenu">' + NAV.map(function (n) {
        return '<a href="' + n[1] + '"' + (n[0] === config.pagina ? ' aria-current="page"' : '') + '><span class="ico" aria-hidden="true">' + n[2] + '</span><span>' + n[3] + '</span></a>';
      }).join('') + '</nav>';
    var select = document.getElementById('team'), inhoud = document.getElementById('inhoud'), waarschuw = document.getElementById('waarschuwing'), D = null;

    function toon() {
      if (!D) return;
      var info = document.getElementById('teamstand');
      if (gekozen && config.pagina !== 'team' && !config.zonderZaalKnop) {
        var stand = teamStand(D, gekozen);
        info.innerHTML = '<a class="teamoverzicht-link" href="team.html?van=' + encodeURIComponent(config.pagina) + '"><span class="sub">Stand volgens Nevobo</span><strong>' + esc(stand.tekst) + '</strong>' +
          (stand.oud ? '<span class="sub">Stand mogelijk verouderd</span>' : '') + '<span>Teamoverzicht: stand, uitslagen en programma →</span></a>';
      } else info.innerHTML = '';
      waarschuw.innerHTML = D.correctiesOk ? '' : '<div class="melding"><strong>Veldindeling niet gecontroleerd</strong>De actuele veldindeling en de meldingen van de club konden niet worden opgehaald. Velden en meldingen kunnen afwijken.' +
        '<div class="acties" style="margin-top:10px"><button class="knop" data-herlaad>Opnieuw proberen</button></div></div>';
      if (config.teamKeuze === 'verplicht' && !gekozen) {
        inhoud.innerHTML = '<div class="melding leeg"><strong>Kies je team</strong>Kies hierboven je team om te zien wat voor jullie geldt.</div>';
        return;
      }
      huidigTeam = gekozen;
      inhoud.innerHTML = config.toon(D, gekozen);
      herstelStaat();
    }
    async function laad() {
      inhoud.innerHTML = '<div class="melding leeg">Wedstrijden ophalen…</div>';
      try {
        D = await laadGegevens();
        var teams = teamsUit(D.wedstrijden);
        Object.keys((D.teamstanden && D.teamstanden.teams) || {}).forEach(function (naam) { if (teams.indexOf(naam) === -1) teams.push(naam); });
        teams.sort(function (a, b) { return a.localeCompare(b, 'nl', { numeric: true }); });
        if (gekozen && teams.indexOf(gekozen) === -1) gekozen = '';
        select.innerHTML = '<option value="">' + (config.teamKeuze === 'verplicht' ? 'Kies je team' : 'Alle VOLEVO-teams') + '</option>' +
          teams.map(function (t) { return '<option value="' + esc(t) + '"' + (t === gekozen ? ' selected' : '') + '>' + esc(teamNaam(t)) + '</option>'; }).join('');
        var g = D.gegenereerd ? new Date(D.gegenereerd) : null;
        document.getElementById('stand').textContent = g && !isNaN(g) ? 'Laatste wijziging in de wedstrijdgegevens: ' + g.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        toon();
      } catch (e) {
        D = null;
        inhoud.innerHTML = '<div class="melding fout"><strong>De wedstrijdgegevens kunnen nu niet worden opgehaald.</strong>Probeer het opnieuw.<div class="acties" style="margin-top:10px"><button class="knop vol" data-herlaad>Opnieuw proberen</button></div></div>';
      }
    }
    App.hertoon = toon; App.herlaad = laad;
    select.addEventListener('change', function () {
      gekozen = select.value;
      try { localStorage.setItem('volevo-team', gekozen); } catch (e) {}
      toon();
    });
    document.getElementById('vernieuw').addEventListener('click', laad);
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-herlaad]')) { laad(); return; }
      if (e.target.closest('a[data-bewaar]')) bewaarStaat();
    });
    // Uit de terug-vooruit-cache teruggehaald: de oude staat is dan al zichtbaar, niet bewaren voor een volgend bezoek
    window.addEventListener('pageshow', function (e) { if (e.persisted) { try { sessionStorage.removeItem('volevo-staat'); } catch (x) {} } });
    await laad();
  }

  return { start: start, esc: esc, pad: pad, dagSleutel: dagSleutel, tijd: tijd, dagTekst: dagTekst, kort: kort, teamNaam: teamNaam, team: team,
           wedstrijdKaart: wedstrijdKaart, vervallenMeldingen: vervallenMeldingen, beginschermKaart: beginschermKaart,
           dagKaart: dagKaart, zaalLink: zaalLink, zaalLabel: zaalLabel, bronKnop: bronKnop, teamStand: teamStand, herstelStaat: herstelStaat, VAN: VAN };
})();
