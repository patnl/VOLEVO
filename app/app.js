// Gedeeld deel van de app voor telefoons: kop met teamkeuze, menu onderaan, gegevens laden en de
// bouwstenen die elk scherm gebruikt (rijen, knoppen, het blauwe vlak met je wedstrijd).
// De regels over wedstrijden (vervallen, velden, taken) komen uit ../shared/wedstrijden.js,
// dezelfde die de zaalschermen gebruiken.
var App = (function () {
  var ICOON = {
    vandaag: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
    wedstrijden: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    zaal: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M12 6v12M3 12h3M18 12h3"/>',
    kaart: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    omlaag: '<path d="M6 9l6 6 6-6"/>', verder: '<path d="M9 6l6 6-6 6"/>', terug: '<path d="M15 6l-6 6 6 6"/>',
    omhoog: '<path d="M12 19V6M6 12l6-6 6 6"/>',
    fluit: '<circle cx="9" cy="14" r="5"/><path d="M13 11l8-3v4l-7.5 2M9 9V6h3"/>'
  };
  function icoon(naam, klas) { return '<svg class="ic' + (klas ? ' ' + klas : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICOON[naam] + '</svg>'; }

  // Het menu: vijf vaste plekken. Programma en uitslagen horen bij Wedstrijden; beurten, wijzigingen en trainingen bij Mijn team.
  var NAV = [
    ['vandaag', 'index.html', 'Vandaag'],
    ['wedstrijden', 'programma.html', 'Wedstrijden'],
    ['zaal', 'zaal.html', 'Zaal'],
    ['kaart', 'kaart.html', 'Kaart'],
    ['team', 'team.html', 'Mijn team']
  ];
  var TAB = { vandaag: 'vandaag', programma: 'wedstrijden', uitslagen: 'wedstrijden', zaal: 'zaal', kaart: 'kaart', team: 'team', fluiten: 'team', wijzigingen: 'team', training: 'team' };
  var TEAMSOORT = { DS: 'Dames', HS: 'Heren', MA: 'Meisjes A', MB: 'Meisjes B', MC: 'Meisjes C', JA: 'Jongens A', JB: 'Jongens B', JC: 'Jongens C' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dagSleutel(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function tijd(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dagTekst(d) { return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function dagKort(d) { return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); }
  function kort(d) { return dagKort(d) + ' om ' + tijd(d); }
  // ['a', 'b', 'c'] -> 'a, b en c'
  function opsomming(lijst) { return lijst.length < 2 ? lijst.join('') : lijst.slice(0, -1).join(', ') + ' en ' + lijst[lijst.length - 1]; }

  // "VOLEVO MB 2" -> "Meisjes B 2"; onbekende codes blijven zoals ze zijn
  function teamNaam(naam) {
    var code = Wedstrijden.teamCode(naam);
    if (!code) return naam;
    var m = /^([A-Z]{2})\s*(\d+)$/.exec(code);
    return m && TEAMSOORT[m[1]] ? TEAMSOORT[m[1]] + ' ' + m[2] : code;
  }
  // "VOLEVO MB 2" -> "MB 2"; een andere club houdt zijn naam
  function kortTeam(naam) { var c = Wedstrijden.teamCode(naam); return c === null ? naam : c; }
  function routeUrl(w) {
    var q = Wedstrijden.locatie(w).route;
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }
  function team(w, naam) { return w.thuis === naam || w.uit === naam; }

  // Het veld in De Fluit zoals je het zegt: "Tas 3", "Bocht 4 groot". Leeg zolang het zaalschema het veld niet noemt.
  function veldKort(w, D) {
    if (w.hal !== 'De Fluit' || !Wedstrijden.heeftCorrectie(w, D.correcties)) return '';
    var v = String(Wedstrijden.veldNummer(w, D.correcties) || ''), n = parseInt(v, 10);
    if (!n) return '';
    return (n <= 3 ? 'Tas ' : 'Bocht ') + n + (/g$/i.test(v) ? ' groot' : '');
  }
  // Waar de wedstrijd is, in één regel
  function plek(w, D) {
    if (w.hal === 'De Fluit') return 'De Fluit, ' + (veldKort(w, D) || 'veld nog niet bevestigd');
    return [w.hal || 'Sporthal nog niet bekend', w.plaats].filter(Boolean).join(', ');
  }

  // Waar kom je vandaan als je naar de zaal gaat, en waar brengt Terug je naar toe
  var VAN = { vandaag: ['index.html', 'Vandaag'], programma: ['programma.html', 'Programma'], uitslagen: ['uitslagen.html', 'Uitslagen'],
    fluiten: ['fluiten.html', 'Fluiten en tellen'], team: ['team.html', 'Mijn team'], kaart: ['kaart.html', 'Kaart'] };
  var huidigTeam = '', huidigePagina = '', paginaConfig = null, hersteld = false;

  // Link naar de zaal voor elke wedstrijd in De Fluit. Staat het veld in het zaalschema, dan wordt dat veld
  // gemarkeerd; anders opent de zaal voor die dag en ronde zonder markering (we verzinnen geen veld).
  function zaalLink(w, D, van) {
    if (w.hal !== 'De Fluit') return '';
    var d = new Date(w.tijdstip), v = van || huidigePagina, bekend = Wedstrijden.heeftCorrectie(w, D.correcties);
    return 'zaal.html?dag=' + dagSleutel(d) + '&ronde=' + tijd(d) + (bekend ? '&veld=' + encodeURIComponent(Wedstrijden.veldNummer(w, D.correcties)) : '') + (VAN[v] ? '&van=' + v : '');
  }
  function zaalLabel(w, D) { return Wedstrijden.heeftCorrectie(w, D.correcties) ? 'Bekijk veld in de zaal' : 'Bekijk zaalindeling'; }
  // Externe bronlink (Nevobo), herkenbaar als extern; alleen bekende https-adressen
  function bronKnop(url, label, klas) {
    var u = Wedstrijden.bronLink(url);
    return u ? '<a class="' + (klas || 'knop') + ' bron" target="_blank" rel="noopener noreferrer" href="' + esc(u) + '">' + esc(label) + ' <span aria-hidden="true">↗</span><span class="alleen-lezer"> (opent Nevobo in een nieuw venster)</span></a>' : '';
  }

  function teamStand(D, naam) {
    var bron = D.teamstanden, t = bron && bron.teams && bron.teams[naam];
    if (!bron) return { tekst: 'Stand kon niet worden geladen', bron: '', datum: '', oud: false };
    var datum = new Date(bron.opgehaald), geldig = !isNaN(datum);
    return { beschikbaar: !!(t && t.stand), tekst: t && t.stand ? t.stand : 'Geen stand gepubliceerd door Nevobo', bron: t ? t.bron : '',
      seizoen: t ? t.seizoen : '', datum: geldig ? datum.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '',
      oud: !geldig || Date.now() - datum.getTime() > 48 * 60 * 60 * 1000 };
  }
  // "7e in Dames Derde Divisie B" -> { plaats: '7e', poule: 'Dames Derde Divisie B' }
  function standDelen(tekst) {
    var m = /^(\d+e)\s+in\s+(.+)$/.exec(tekst || '');
    return m ? { plaats: m[1], poule: m[2] } : null;
  }
  // Teams die nu bovenaan staan in hun poule
  function bovenaan(D) {
    var teams = (D.teamstanden && D.teamstanden.teams) || {};
    return Object.keys(teams).filter(function (n) { return /^1e\s+in\s/.test(teams[n].stand || ''); })
      .sort(function (a, b) { return a.localeCompare(b, 'nl', { numeric: true }); })
      .map(function (n) { return { naam: n, poule: standDelen(teams[n].stand).poule }; });
  }

  // Wie fluit en telt, in een zin: "DS 6 fluit, MC 5 telt". Een team met twee taken staat er één keer:
  // "JA 2 telt en doet het wedstrijdformulier". `zelf` is de teamcode van het gekozen team; dat heet dan "Jullie".
  function helpersZin(helpers, zelf) {
    var perTeam = [], plek = {};
    helpers.forEach(function (h) {
      if (!(h.team in plek)) { plek[h.team] = perTeam.length; perTeam.push({ team: h.team, soorten: [] }); }
      perTeam[plek[h.team]].soorten.push(h.soort);
    });
    var zin = perTeam.map(function (t) {
      var jullie = !!zelf && t.team === zelf, meer = jullie || /^ouders/i.test(t.team);
      return (jullie ? 'jullie' : t.team) + ' ' + opsomming(t.soorten.map(function (s) {
        return s === 'Fluiten' ? (meer ? 'fluiten' : 'fluit') : s === 'Tellen' ? (meer ? 'tellen' : 'telt')
          : s === 'Digitaal wedstrijdformulier' ? (meer ? 'doen' : 'doet') + ' het wedstrijdformulier' : (meer ? 'doen' : 'doet') + ': ' + s;
      }));
    }).join(', ');
    return zin.charAt(0).toUpperCase() + zin.slice(1);
  }
  function helpersTekst(D, w, zelf) {
    return D.officialsOk ? helpersZin(Wedstrijden.helpersBij(D.officials, w), zelf) : '';
  }

  // Reistijd en vertrektijd naar een uitwedstrijd (schatting, zie Wedstrijden.reis)
  function reisRegel(w) {
    var r = Wedstrijden.reis(w);
    if (!r) return '';
    return '<p class="reis">Reis ongeveer ' + r.minuten + ' min (' + r.km + ' km). Vertrek rond <strong>' + esc(tijd(r.vertrek)) + '</strong> om 45 minuten voor de aanvang in de zaal te zijn. Dit is een schatting.</p>';
  }

  // Een wedstrijd als rij die openklapt. Dicht: tijd, wie tegen wie en waar. Open: adres, reistijd, wie fluit en telt, en de knoppen.
  // Met een gekozen team dat meespeelt staat er "Thuis tegen ..." of "Uit tegen ...".
  function wedstrijdRij(w, D, opties) {
    opties = opties || {};
    var d = new Date(w.tijdstip), naam = opties.team !== undefined ? opties.team : huidigTeam;
    var p = Wedstrijden.perspectief(w, naam), eigen = !!naam && team(w, naam);
    var kop = eigen ? (p.eigenThuis ? 'Thuis' : 'Uit') + ' tegen ' + p.tegen : kortTeam(p.eigen) + ' tegen ' + p.tegen;
    var adres = Wedstrijden.locatie(w).adres, route = routeUrl(w), zl = opties.zonderZaal ? '' : zaalLink(w, D, opties.van);
    var helpers = helpersTekst(D, w, eigen ? Wedstrijden.teamCode(naam) : null);
    var onder = opties.metDatum ? dagKort(d) : (eigen ? '' : (p.eigenThuis ? 'thuis' : 'uit'));
    var knoppen = (zl ? '<a class="knop vol" data-bewaar href="' + esc(zl) + '">' + zaalLabel(w, D) + '</a>' : '') +
      (route ? '<a class="knop" target="_blank" rel="noopener" aria-label="Route naar ' + esc(w.hal || 'de sporthal') + '" href="' + esc(route) + '">Route</a>' : '') +
      bronKnop(w.dwf, 'Wedstrijdformulier');
    return '<details class="rij wedstrijd' + (opties.jij ? ' jij' : '') + '"><summary><div><div class="t">' + esc(tijd(d)) + '</div>' + (onder ? '<div class="d">' + esc(onder) + '</div>' : '') + '</div>' +
      '<div><div class="w">' + esc(kop) + '</div><div class="o">' + esc(plek(w, D)) + '</div></div>' + icoon('omlaag') + '</summary>' +
      '<div class="meer">' + (adres ? '<p>' + esc(adres) + '</p>' : '') + reisRegel(w) +
      (helpers ? '<p>' + esc(helpers) + '.</p>' : '') +
      (!D.officialsOk ? '<p>Fluit- en telbeurten konden niet worden geladen.</p>' : '') +
      (knoppen ? '<div class="acties">' + knoppen + '</div>' : '') + '</div></details>';
  }

  function vervallenMeldingen(lijst) {
    var nu = new Date();
    return Wedstrijden.vervallen(lijst).filter(function (w) { return new Date(w.tijdstip) > nu; }).map(function (w) {
      return '<div class="melding"><strong>Vervallen</strong>' + esc(w.thuis) + ' tegen ' + esc(w.uit) + ' op ' + esc(kort(new Date(w.tijdstip))) + ' gaat niet door.</div>';
    }).join('');
  }

  // Wat het team op een dag doet, op tijd: eigen wedstrijden en fluit- of telbeurten. Alleen roostergegevens.
  function dagVanTeam(D, naam, dag) {
    var rijen = [], code = Wedstrijden.teamCode(naam);
    Wedstrijden.speelbaar(D.wedstrijden).filter(function (w) { return w.tijdstip && team(w, naam) && dagSleutel(new Date(w.tijdstip)) === dag; }).forEach(function (w) {
      rijen.push({ t: w.tijdstip, wedstrijd: w });
    });
    takenVan(D, code).filter(function (t) { return dagSleutel(new Date(t.tijdstip)) === dag; }).forEach(function (t) { rijen.push({ t: t.tijdstip, taak: t }); });
    return rijen.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (a.taak ? -1 : 1); });
  }
  // Beurten van een team, zonder vervallen wedstrijden; elke beurt krijgt zijn wedstrijd mee als die bekend is
  function takenVan(D, code) {
    if (!D.officialsOk || !code) return [];
    var perSleutel = {}; D.wedstrijden.forEach(function (w) { perSleutel[Wedstrijden.sleutel(w)] = w; });
    return Wedstrijden.takenVanTeam(D.officials, code).filter(function (t) { t.wedstrijd = perSleutel[t.sleutel] || null; return !(t.wedstrijd && t.wedstrijd.status === 'vervallen'); });
  }
  // "Fluiten op Tas 1", "Tellen in De Fluit"
  function taakKop(t, D) {
    var v = t.wedstrijd ? veldKort(t.wedstrijd, D) : '';
    return t.soort + (v ? ' op ' + v : (t.wedstrijd && t.wedstrijd.hal ? ' in ' + t.wedstrijd.hal : ''));
  }
  // Een beurt als rij: tijd, wat en waar, bij welke wedstrijd, en de waarschuwing uit het schema
  function taakRij(t, D, opties) {
    opties = opties || {};
    var d = new Date(t.tijdstip), w = t.wedstrijd, zl = w ? zaalLink(w, D, opties.van) : '';
    var andere = w ? Wedstrijden.helpersBij(D.officials, w).filter(function (h) { return h.team !== t.team; }) : [];
    return '<div class="rij beurtrij' + (opties.klaar ? ' klaar' : '') + (opties.jij ? ' jij' : '') + '"><div><div class="t">' + esc(tijd(d)) + '</div><div class="d">' + esc(opties.onder || dagKort(d)) + '</div></div>' +
      '<div><div class="w">' + esc(taakKop(t, D)) + '</div><div class="o">' + esc(t.thuis) + ' tegen ' + esc(t.uit) +
      (andere.length ? '. ' + esc(helpersZin(andere)) + '.' : '') + '</div>' +
      (t.opmerking ? '<span class="let">' + esc(t.opmerking) + '</span>' : '') +
      (zl && !opties.klaar ? '<div><a class="tekstlink" data-bewaar href="' + esc(zl) + '">' + (Wedstrijden.heeftCorrectie(w, D.correcties) ? 'Bekijk het veld' : 'Bekijk de zaal') + '</a></div>' : '') + '</div></div>';
  }

  // Keuze tussen het eigen team en alle teams, als twee knoppen naast elkaar. De keuze staat in het adres (?alle=1).
  function bereik(naam, pagina) {
    var alle = !naam || new URLSearchParams(location.search).get('alle') === '1';
    var html = naam ? '<div class="segment" role="group" aria-label="Welke teams"><a href="' + pagina + '"' + (alle ? '' : ' aria-current="true"') + '>' + esc(teamNaam(naam)) + '</a>' +
      '<a href="' + pagina + '?alle=1"' + (alle ? ' aria-current="true"' : '') + '>Alle teams</a></div>' : '';
    return { alle: alle, html: html, zoek: alle && naam ? '?alle=1' : '' };
  }
  // Programma of uitslagen, de twee helften van Wedstrijden
  function wedstrijdenKeuze(actief, zoek) {
    return '<div class="segment" role="group" aria-label="Programma of uitslagen">' +
      '<a href="programma.html' + zoek + '"' + (actief === 'programma' ? ' aria-current="true"' : '') + '>Programma</a>' +
      '<a href="uitslagen.html' + zoek + '"' + (actief === 'uitslagen' ? ' aria-current="true"' : '') + '>Uitslagen</a></div>';
  }
  function kop(titel, onder, rechts) {
    return '<div class="titel"><div><h1>' + esc(titel) + '</h1>' + (onder ? '<div class="onder">' + esc(onder) + '</div>' : '') + '</div>' + (rechts || '') + '</div>';
  }
  function door(href, sterk, onder, extra) {
    return '<a class="door" href="' + esc(href) + '"' + (extra || '') + '><span><strong>' + esc(sterk) + '</strong>' + (onder ? '<span>' + esc(onder) + '</span>' : '') + '</span>' + icoon('verder') + '</a>';
  }
  function kiesTeam(tekst) {
    return '<section class="held" aria-label="Kies je team"><h2>Kies je team</h2><p>' + esc(tekst) + '</p>' +
      '<div class="acties"><button type="button" class="knop vol" data-kies-team>Kies je team</button></div></section>';
  }

  // Uitleg om VOLEVO als icoon op de telefoon te zetten; weg als de app al zo geopend is.
  // De gewone link blijft altijd bruikbaar. De menunamen verschillen per toestel en versie.
  function beginscherm() {
    var alsApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    if (alsApp) return '';
    return '<details class="door-blok"><summary class="door laag">Zet de app op je beginscherm' + icoon('verder') + '</summary><div class="binnen">' +
      '<h3>iPhone (Safari)</h3><ol><li>Open deze pagina in Safari.</li><li>Tik op <strong>Deel</strong> (het vierkantje met een pijl). Die staat onderin of achter de drie puntjes.</li>' +
      '<li>Kies <strong>Zet op beginscherm</strong>.</li><li>Zet <strong>Open als webapp</strong> aan, als die keuze er staat.</li><li>Tik op <strong>Voeg toe</strong>.</li></ol>' +
      '<h3 style="margin-top:14px">Android (Chrome)</h3><ol><li>Open deze pagina in Chrome.</li><li>Tik op de drie puntjes rechtsboven.</li>' +
      '<li>Kies <strong>Installeren</strong> of <strong>App installeren</strong>, en tik op <strong>Installeren</strong>.</li>' +
      '<li>Staat die keuze er niet? Kies dan <strong>Toevoegen aan startscherm</strong> (of <strong>Snelkoppeling maken</strong>), noem hem VOLEVO en tik op <strong>Toevoegen</strong>.</li></ol>' +
      '<p class="klein" style="margin-top:10px">Lukt het niet? Je kunt VOLEVO ook gewoon via de link blijven gebruiken.</p></div></details>';
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

  // Scrollpositie, lijststand en opengeklapte rijen bewaren voordat je naar de zaal gaat, en bij Terug herstellen
  function bewaarStaat() {
    try {
      var open = []; document.querySelectorAll('#inhoud details').forEach(function (d, i) { if (d.open) open.push(i); });
      sessionStorage.setItem('volevo-staat', JSON.stringify({ pagina: huidigePagina, y: window.scrollY, open: open, extra: paginaConfig && paginaConfig.bewaar ? paginaConfig.bewaar() : null, t: Date.now() }));
    } catch (e) {}
  }
  // Alleen herstellen als je terugkomt van de zaal (of met de terugknop), niet bij een gewoon nieuw bezoek
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
      var rijen = document.querySelectorAll('#inhoud details');
      (s.open || []).forEach(function (i) { if (rijen[i]) rijen[i].open = true; });   // de rij die open stond staat weer open
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

  // Zet de pagina in elkaar. config: { pagina, titel, teamKeuze: 'optioneel'|'verplicht', kiesTekst, toon(D, teamnaam) -> html,
  //   bewaar() -> object met lijststand, herstel(object), na(D, teamnaam) -> wordt aangeroepen nadat de html in de pagina staat }
  async function start(config) {
    var gekozen = '';
    try { gekozen = localStorage.getItem('volevo-team') || ''; } catch (e) {}
    huidigTeam = gekozen; huidigePagina = config.pagina || ''; paginaConfig = config;
    var extra = bewaardeExtra(), tab = TAB[config.pagina] || '';
    if (extra && config.herstel) config.herstel(extra);
    document.body.innerHTML =
      '<header class="kop"><a class="logo" href="index.html" aria-label="VOLEVO, naar Vandaag"><img src="../LOGO.png" alt="" onerror="this.style.visibility=\'hidden\'"></a>' +
      '<div class="teamkeuze"><label class="alleen-lezer" for="team">Mijn team</label><select id="team"></select>' + icoon('omlaag', 'klein') + '</div></header>' +
      '<main><div id="waarschuwing"></div><div id="inhoud" aria-live="polite"></div>' +
      '<footer class="voet"><p>Wedstrijden en uitslagen komen van Nevobo. Veldindeling en meldingen komen van de club.</p><p id="stand"></p>' +
      '<div class="links"><a class="clubsite" target="_blank" rel="noopener" href="https://volevo.nl/">Clubwebsite volevo.nl <span aria-hidden="true">&nbsp;↗</span><span class="alleen-lezer"> (opent in een nieuw venster)</span></a>' +
      '<a href="#" id="vernieuw" role="button">Gegevens vernieuwen</a><a href="../schermen.html">Zaalschermen</a></div></footer></main>' +
      '<nav class="onderbalk" aria-label="Hoofdmenu"><div>' + NAV.map(function (n) {
        return '<a href="' + n[1] + '"' + (n[0] === tab ? ' aria-current="page"' : '') + '>' + icoon(n[0]) + '<span>' + n[2] + '</span></a>';
      }).join('') + '</div></nav>';
    var select = document.getElementById('team'), inhoud = document.getElementById('inhoud'), waarschuw = document.getElementById('waarschuwing'), D = null, geladen = 0;

    function vulKeuze(teams) {
      select.innerHTML = '<option value="">' + (gekozen ? 'Geen team kiezen' : 'Kies je team') + '</option>' +
        teams.map(function (t) { return '<option value="' + esc(t) + '"' + (t === gekozen ? ' selected' : '') + '>' + esc(teamNaam(t)) + '</option>'; }).join('');
      select.parentNode.classList.toggle('leeg', !gekozen);
    }
    function toon() {
      if (!D) return;
      waarschuw.innerHTML = D.correctiesOk ? '' : '<div class="melding"><strong>Veldindeling niet gecontroleerd</strong>De actuele veldindeling en de meldingen van de club konden niet worden opgehaald. Velden en meldingen kunnen afwijken.' +
        '<div><button class="knop" data-herlaad>Opnieuw proberen</button></div></div>';
      huidigTeam = gekozen;
      if (config.teamKeuze === 'verplicht' && !gekozen) {
        inhoud.innerHTML = kop(config.titel) + kiesTeam(config.kiesTekst || 'Kies je team om te zien wat voor jullie geldt.');
        return;
      }
      inhoud.innerHTML = config.toon(D, gekozen);
      if (config.na) config.na(D, gekozen);
      herstelStaat();
    }
    async function laad() {
      if (!D) inhoud.innerHTML = '<div class="melding leeg">Wedstrijden ophalen…</div>';
      try {
        D = await laadGegevens(); geladen = Date.now();
        var teams = teamsUit(D.wedstrijden);
        Object.keys((D.teamstanden && D.teamstanden.teams) || {}).forEach(function (naam) { if (teams.indexOf(naam) === -1) teams.push(naam); });
        teams.sort(function (a, b) { return a.localeCompare(b, 'nl', { numeric: true }); });
        if (gekozen && teams.indexOf(gekozen) === -1) gekozen = '';
        start.teams = teams; vulKeuze(teams);
        var g = D.gegenereerd ? new Date(D.gegenereerd) : null;
        document.getElementById('stand').textContent = g && !isNaN(g) ? 'Laatste wijziging in de wedstrijdgegevens: ' + g.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) + '.' : '';
        toon();
      } catch (e) {
        D = null;
        inhoud.innerHTML = '<div class="melding fout"><strong>De wedstrijdgegevens kunnen nu niet worden opgehaald.</strong>Probeer het opnieuw.<div><button class="knop vol" data-herlaad>Opnieuw proberen</button></div></div>';
      }
    }
    App.hertoon = toon; App.herlaad = laad;
    select.addEventListener('change', function () {
      gekozen = select.value;
      try { localStorage.setItem('volevo-team', gekozen); } catch (e) {}
      vulKeuze(start.teams || []);
      toon();
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#vernieuw')) { e.preventDefault(); laad().then(function () { window.scrollTo(0, 0); }); return; }
      if (e.target.closest('[data-herlaad]')) { laad(); return; }
      if (e.target.closest('[data-kies-team]')) { select.focus(); try { select.showPicker(); } catch (x) {} return; }
      if (e.target.closest('a[data-bewaar]')) bewaarStaat();
    });
    // Uit de terug-vooruit-cache teruggehaald: de oude staat is dan al zichtbaar, niet bewaren voor een volgend bezoek
    window.addEventListener('pageshow', function (e) { if (e.persisted) { try { sessionStorage.removeItem('volevo-staat'); } catch (x) {} } });
    // De app blijft vaak open staan op het beginscherm: bij terugkomst na een kwartier de gegevens opnieuw halen
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && geladen && Date.now() - geladen > 15 * 60e3) laad(); });
    await laad();
  }

  return { start: start, esc: esc, pad: pad, dagSleutel: dagSleutel, tijd: tijd, dagTekst: dagTekst, dagKort: dagKort, kort: kort, opsomming: opsomming,
           teamNaam: teamNaam, kortTeam: kortTeam, team: team, icoon: icoon, veldKort: veldKort, plek: plek, routeUrl: routeUrl,
           wedstrijdRij: wedstrijdRij, vervallenMeldingen: vervallenMeldingen, beginscherm: beginscherm, helpersTekst: helpersTekst, helpersZin: helpersZin, reisRegel: reisRegel,
           dagVanTeam: dagVanTeam, takenVan: takenVan, taakKop: taakKop, taakRij: taakRij, bereik: bereik, wedstrijdenKeuze: wedstrijdenKeuze, kop: kop, door: door, kiesTeam: kiesTeam,
           zaalLink: zaalLink, zaalLabel: zaalLabel, bronKnop: bronKnop, teamStand: teamStand, standDelen: standDelen, bovenaan: bovenaan, herstelStaat: herstelStaat, VAN: VAN };
})();
