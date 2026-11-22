// Gedeelde uitslagenbron en weergave voor Uitslagen en Teamoverzicht.
var Resultaten = (function () {
function parse(xml) {
  var lijst = [];
  if (xml.querySelector('parsererror') || !xml.querySelector('rss > channel')) throw new Error('Ongeldige uitslagenfeed');
  xml.querySelectorAll('item').forEach(function (item) {
    var titel = (item.querySelector('title') || {}).textContent || '', uitleg = (item.querySelector('description') || {}).textContent || '';
    var st = item.getElementsByTagNameNS('*', 'status')[0];
    if (st && Wedstrijden.isVervallen(st.textContent.trim())) return;
    var i = titel.indexOf(', Uitslag:'); if (i === -1) return;
    var paar = titel.substring(0, i).split(' - '); if (paar.length < 2) return;
    var sets = /Setstanden:\s*([^\r\n<]+)/i.exec(uitleg);
    var id = ((item.querySelector('guid') || {}).textContent || (item.querySelector('link') || {}).textContent || '').trim();
    lijst.push({ id: id, thuis: paar[0].trim(), uit: paar.slice(1).join(' - ').trim(), score: titel.substring(i + 10).trim(),
      sets: sets ? sets[1].trim() : '', tijd: new Date((item.querySelector('pubDate') || {}).textContent) });
  });
  // Een wedstrijd tussen twee VOLEVO-teams staat twee keer in de feed: één keer tonen
  return Wedstrijden.ontdubbel(lijst).sort(function (a, b) { return b.tijd - a.tijd; });
}
async function laad() {
  var r = await fetch('../data/resultaten.xml?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('resultaten ' + r.status);
  var lijst = parse(new DOMParser().parseFromString(await r.text(), 'text/xml'));
  // Verslagen zijn een extraatje: ontbreken of niet laden mag de uitslagen nooit blokkeren
  try {
    // Maximaal 4 seconden wachten: een trage verslagenbron mag de uitslagen niet ophouden
    var v = await Promise.race([fetch('../data/verslagen.json?t=' + Date.now(), { cache: 'no-store' }),
      new Promise(function (klaar) { if (typeof setTimeout === 'function') setTimeout(function () { klaar(null); }, 4000); })]);
    var verslagen = v && v.ok ? ((await v.json()).verslagen || {}) : {};
    lijst.forEach(function (u) { if (verslagen[u.id] && verslagen[u.id].tekst) u.verslag = verslagen[u.id].tekst; });
  } catch (e) {}
  return lijst;
}
// De letter voor de uitslag: W, V of = vanuit het gekozen team; zonder gekozen team vanuit het VOLEVO-team,
// en O als twee VOLEVO-teams tegen elkaar speelden. Staat er altijd in woorden bij voor de schermlezer.
function merk(u, naam) {
  var k = Wedstrijden.uitkomst(u.score), thuisV = Wedstrijden.teamCode(u.thuis) !== null, uitV = Wedstrijden.teamCode(u.uit) !== null;
  var eigen = naam && (u.thuis === naam || u.uit === naam) ? naam : (thuisV && uitV ? '' : (thuisV ? u.thuis : (uitV ? u.uit : '')));
  if (!naam && thuisV && uitV) return { klas: 'g', letter: 'O', woord: 'Onderling' };
  if (!eigen) return { klas: '', letter: '', woord: '' };
  var res = Wedstrijden.resultaatVoorTeam(u, eigen);
  if (!res) return { klas: 'v', letter: '?', woord: 'Uitslag onbekend' };
  return res === 'Gewonnen' ? { klas: 'w', letter: 'W', woord: 'Gewonnen' } : res === 'Verloren' ? { klas: 'v', letter: 'V', woord: 'Verloren' } : { klas: 'g', letter: '=', woord: 'Gelijk' };
}
function regels(u) {
  var k = Wedstrijden.uitkomst(u.score);
  function regel(team, punten, wint) {
    return '<div class="tm' + (wint ? ' win' : '') + '">' + App.esc(team) + (wint ? '<span class="alleen-lezer"> (winnaar)</span>' : '') + '</div><div class="s' + (wint ? ' win' : '') + '">' + App.esc(punten) + '</div>';
  }
  return regel(u.thuis, k.winnaar ? String(k.thuis) : '–', k.winnaar === 'thuis') + regel(u.uit, k.winnaar ? String(k.uit) : '–', k.winnaar === 'uit');
}
// Een uitslag als rij: de letter, twee regels met de stand per team (thuis boven), de sets en het verslag.
// Met een bekende Nevobo-link is de hele rij de link naar de wedstrijd bij Nevobo.
function kaart(u, naam, opties) {
  opties = opties || {};
  var k = Wedstrijden.uitkomst(u.score), m = merk(u, naam), url = Wedstrijden.bronLink(u.id);
  var onder = k.winnaar ? (u.sets || '') : 'Uitslag onvolledig of onbekend';
  return (url ? '<a class="uitslag bron" target="_blank" rel="noopener noreferrer" href="' + App.esc(url) + '">' : '<article class="uitslag">') +
    (m.letter ? '<span class="m ' + m.klas + '" role="img" aria-label="' + m.woord + '" title="' + m.woord + '">' + m.letter + '</span>' : '<span class="m"></span>') +
    regels(u) +
    '<div class="sets"><span>' + (opties.metDatum ? App.esc(App.dagKort(u.tijd)) + (onder ? ' · ' : '') : '') + App.esc(onder) + '</span>' +
    (url ? '<span aria-hidden="true">↗</span><span class="alleen-lezer"> Bekijk bij Nevobo (opent in een nieuw venster)</span>' : '') + '</div>' +
    (u.verslag ? '<p class="verslag">' + App.esc(u.verslag) + '</p>' : '') + (url ? '</a>' : '</article>');
}
// De uitslag van het eigen team, groot: wie won, de stand en elke set apart
function eigen(u, naam, kopTekst) {
  var m = merk(u, naam), thuisEigen = u.thuis === naam;
  var sets = (u.sets || '').split(',').map(function (s) { return /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(s); }).filter(Boolean);
  return '<section class="eigen-uitslag" aria-label="Jullie uitslag"><div class="sectiekop" style="margin:0"><h3>' + App.esc(kopTekst) + '</h3><strong>' + App.esc(m.woord) + '</strong></div>' +
    '<div class="stand">' + regels(u) + '</div>' +
    (Wedstrijden.uitkomst(u.score).winnaar ? '' : '<p>Uitslag onvolledig of onbekend</p>') +
    (sets.length ? '<div class="sets-rij" role="img" aria-label="Sets: ' + App.esc(u.sets) + '">' + sets.map(function (s, i) {
      var t = +s[1], ui = +s[2];
      return '<div class="set"><small>set ' + (i + 1) + '</small>' + (t > ui ? '<b>' + t + '</b><span>' + ui + '</span>' : '<span>' + t + '</span><b>' + ui + '</b>') + '</div>';
    }).join('') + '</div>' : '') +
    (u.verslag ? '<p>' + App.esc(u.verslag) + '</p>' : '') +
    (App.bronKnop(u.id, 'Bekijk bij Nevobo', 'tekstlink') ? '<div>' + App.bronKnop(u.id, 'Bekijk bij Nevobo', 'tekstlink') + '</div>' : '') + '</section>';
}
// De uitslagenfeed wordt vaker ververst dan de zaal-/programmabron.
// Een gepubliceerde uitslag is daarom ook leidend als die wedstrijd daar nog gepland staat.
function heeftUitslag(w, uitslagen) {
  return uitslagen.some(function (u) {
    return w.thuis === u.thuis && w.uit === u.uit && new Date(w.tijdstip).getTime() === u.tijd.getTime();
  });
}
return { parse: parse, laad: laad, kaart: kaart, eigen: eigen, merk: merk, heeftUitslag: heeftUitslag };
})();
