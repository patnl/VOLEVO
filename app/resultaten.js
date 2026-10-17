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
  return parse(new DOMParser().parseFromString(await r.text(), 'text/xml'));
}
function kaart(u, naam) {
  var k = Wedstrijden.uitkomst(u.score), res = Wedstrijden.resultaatVoorTeam(u, naam);
  var badge = '';
  if (naam && (u.thuis === naam || u.uit === naam)) {
    badge = res ? '<span class="uitslag-badge ' + res.toLowerCase() + '">' + res + '</span>' : '<span class="uitslag-badge onbekend">Uitslag onbekend</span>';
  }
  function regel(team, punten, wint) {
    return '<p class="teams" style="margin:4px 0 0;display:flex;justify-content:space-between;gap:10px"><span class="' + (wint ? 'winnaar' : '') + '">' + App.esc(team) + '</span><span class="score">' + App.esc(punten) + '</span></p>';
  }
  var winnaarTekst = k.winnaar === 'thuis' ? 'Winnaar: ' + u.thuis : (k.winnaar === 'uit' ? 'Winnaar: ' + u.uit : (k.winnaar === 'gelijk' ? 'Gelijkspel' : 'Uitslag onvolledig of onbekend'));
  return '<article class="kaart"><div class="rij1"><span class="sub" style="margin:0">' + App.esc(App.kort(u.tijd)) + '</span>' + badge + '</div>' +
    regel(u.thuis + ' (thuis)', k.winnaar ? String(k.thuis) : '–', k.winnaar === 'thuis') + regel(u.uit + ' (uit)', k.winnaar ? String(k.uit) : '–', k.winnaar === 'uit') +
    '<p class="plek" style="margin-top:8px"><strong>' + App.esc(winnaarTekst) + '</strong></p>' +
    (u.sets ? '<p class="sets">Setstanden (thuis–uit): ' + App.esc(u.sets) + '</p>' : '') +
    (App.bronKnop(u.id, 'Bekijk bij Nevobo') ? '<div class="acties">' + App.bronKnop(u.id, 'Bekijk bij Nevobo') + '</div>' : '') + '</article>';
}
// De uitslagenfeed wordt vaker ververst dan de zaal-/programmabron.
// Een gepubliceerde uitslag is daarom ook leidend als die wedstrijd daar nog gepland staat.
function heeftUitslag(w, uitslagen) {
  return uitslagen.some(function (u) {
    return w.thuis === u.thuis && w.uit === u.uit && new Date(w.tijdstip).getTime() === u.tijd.getTime();
  });
}
return { parse: parse, laad: laad, kaart: kaart, heeftUitslag: heeftUitslag };
})();
