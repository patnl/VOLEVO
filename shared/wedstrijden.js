// Regels over wedstrijden die de app (telefoon) en de zaalschermen allebei gebruiken.
// Zo beslist één plek wat een wedstrijd is die echt gespeeld wordt; de pagina's
// leggen dat niet elk apart uit. Draait in de browser (window.Wedstrijden) en in node (tests).
(function (root) {
  var Wedstrijden = {
    // Wedstrijden die doorgaan of zijn gespeeld (alles behalve 'vervallen')
    speelbaar: function (lijst) {
      return (lijst || []).filter(function (w) { return w.status !== 'vervallen'; });
    },
    // Wedstrijden die niet doorgaan; de app meldt dat bij het team
    vervallen: function (lijst) {
      return (lijst || []).filter(function (w) { return w.status === 'vervallen'; });
    },

    // Sleutel van een wedstrijd, zoals data/overrides.json en data/officials.json die gebruiken
    sleutel: function (w) { return (w.tijdstip || '') + '|' + (w.thuis || '') + '|' + (w.uit || ''); },

    // Veld in woorden. In De Fluit zegt het Nevobo-nummer niets: alleen een veld uit het
    // zaalschema (correcties) telt. De Tas is veld 1 t/m 3, De Bocht 4 t/m 7, '4G' is veld 4 groot.
    veldTekst: function (w, correcties) {
      var o = (correcties || {})[Wedstrijden.sleutel(w)];
      var veld = (o !== undefined && o !== null && o !== '') ? String(o) : (w.hal === 'De Fluit' ? '' : (w.veld == null ? '' : String(w.veld)));
      if (w.hal !== 'De Fluit') return veld ? 'Veld ' + veld : '';
      if (!veld) return 'Veld nog niet bevestigd';
      var n = parseInt(veld, 10), groot = /g$/i.test(veld) ? ' groot' : '';
      return (n <= 3 ? 'De Tas' : 'De Bocht') + ' · veld ' + n + groot;
    },

    // 'VOLEVO MB 2' -> 'MB 2'; een andere club geeft null
    teamCode: function (naam) {
      var m = /^VOLEVO\s+(.+)$/i.exec(naam || '');
      return m ? m[1].trim() : null;
    },

    // Welk team staat vooraan op een kaart? Met een gekozen team dat meespeelt: dat team, ook als het uit speelt
    // tegen een ander VOLEVO-team. Anders: het VOLEVO-team dat thuis speelt, of het uitteam bij een uitwedstrijd.
    perspectief: function (w, team) {
      if (team && w.thuis === team) return { eigen: w.thuis, tegen: w.uit, eigenThuis: true };
      if (team && w.uit === team) return { eigen: w.uit, tegen: w.thuis, eigenThuis: false };
      var thuisVolevo = Wedstrijden.teamCode(w.thuis) !== null;
      return thuisVolevo ? { eigen: w.thuis, tegen: w.uit, eigenThuis: true }
        : (Wedstrijden.teamCode(w.uit) !== null ? { eigen: w.uit, tegen: w.thuis, eigenThuis: false } : { eigen: w.thuis, tegen: w.uit, eigenThuis: true });
    },

    // Uitkomst uit een score 'thuis-uit'. Alleen twee getallen tellen; 0-0 en alles wat onvolledig is geeft geen winnaar.
    uitkomst: function (score) {
      var m = /^(\d{1,2})-(\d{1,2})$/.exec(String(score == null ? '' : score).trim());
      if (!m) return { winnaar: null };
      var t = parseInt(m[1], 10), u = parseInt(m[2], 10);
      if (t === 0 && u === 0) return { winnaar: null };
      return { winnaar: t > u ? 'thuis' : (u > t ? 'uit' : 'gelijk'), thuis: t, uit: u };
    },

    // 'Gewonnen', 'Verloren' of 'Gelijk' vanuit het gekozen team; null als dat team niet meespeelde of de score niet klopt
    resultaatVoorTeam: function (u, team) {
      var k = Wedstrijden.uitkomst(u.score);
      if (!team || k.winnaar === null || (u.thuis !== team && u.uit !== team)) return null;
      if (k.winnaar === 'gelijk') return 'Gelijk';
      return (k.winnaar === 'thuis') === (u.thuis === team) ? 'Gewonnen' : 'Verloren';
    },

    // Dezelfde wedstrijd kan twee keer in de feed staan (beide VOLEVO-teams): een uitslag is uniek op het id van
    // de wedstrijd (guid/link in de feed), zonder id op tijd en teams. Twee verschillende wedstrijden met dezelfde
    // teams en score blijven dus allebei staan.
    ontdubbel: function (lijst) {
      var gezien = {};
      return (lijst || []).filter(function (u) {
        var k = u.id ? 'id:' + u.id : 'tt:' + (u.tijd instanceof Date ? u.tijd.getTime() : u.tijd) + '|' + u.thuis + '|' + u.uit;
        if (gezien[k]) return false;
        gezien[k] = true;
        return true;
      });
    },

    // Alleen een https-adres op nevobo.nl of volleybal.nl (of een subdomein daarvan) is een bronlink; anders ''
    bronLink: function (url) {
      var u;
      try { u = new URL(String(url == null ? '' : url)); } catch (e) { return ''; }
      if (u.protocol !== 'https:' || u.username || u.password) return '';
      var h = u.hostname.toLowerCase();
      var ok = ['nevobo.nl', 'volleybal.nl'].some(function (d) { return h === d || h.slice(-(d.length + 1)) === '.' + d; });
      return ok ? String(url) : '';
    },

    // Waar is de sporthal? Eén plek voor het getoonde adres en de routebestemming. De brondata van Nevobo
    // heeft voor Sporthal De Fluit (Leidschendam) nummer 1 en coördinaten van het zwembad ernaast; de club zegt
    // Fluitpolderplein 3 (https://volevo.nl/adres-en-contact/). Daarom gebruiken we daar het adres, niet de
    // coördinaten uit de brondata. Andere hallen houden hun bestaande routing (coördinaten, anders adres).
    locatie: function (w) {
      if (w.hal === 'De Fluit' && w.plaats === 'Leidschendam') {
        return { naam: 'Sporthal De Fluit', adres: 'Fluitpolderplein 3, 2262 ED Leidschendam',
          route: 'Sporthal De Fluit, Fluitpolderplein 3, 2262 ED Leidschendam' };
      }
      return { naam: w.hal || '', adres: [w.adres, w.postcode, w.plaats].filter(Boolean).join(', '),
        route: (w.lat && w.lon) ? (w.lat + ',' + w.lon) : [w.hal, w.adres, w.postcode, w.plaats].filter(Boolean).join(', ') };
    },

    // Statustekst uit een Nevobo-feed ('vervallen', 'gepland', 'gespeeld'): doorgaan of niet
    isVervallen: function (status) { return status === 'vervallen'; },

    // Veldnummer in het schema: de correctie als die er is, anders het nummer uit Nevobo
    veldNummer: function (w, correcties) {
      var o = (correcties || {})[Wedstrijden.sleutel(w)];
      return (o === undefined || o === null || o === '') ? w.veld : String(o);
    },

    // Staat er voor deze wedstrijd een veld uit het zaalschema (correctie)?
    heeftCorrectie: function (w, correcties) { return (correcties || {})[Wedstrijden.sleutel(w)] !== undefined; },

    // Korte taaknaam zoals de zaalschermen die tonen: 'scheidsrechter', 'teller', 'dwf'
    taakKort: function (taak) {
      taak = taak || '';
      if (/teller/i.test(taak)) return 'teller';
      if (/dwf/i.test(taak)) return 'dwf';
      if (/scheidsrechter/i.test(taak)) return 'scheidsrechter';
      return taak;
    },

    // 'scheidsrechter (spelregeltoets)' -> 'Fluiten', 'teller' -> 'Tellen' (woorden voor de app)
    taakSoort: function (taak) {
      var k = Wedstrijden.taakKort(taak);
      if (k === 'teller') return 'Tellen';
      if (k === 'dwf') return 'Digitaal wedstrijdformulier';
      if (k === 'scheidsrechter') return 'Fluiten';
      return taak || '';
    },

    // Zelfde beurten als helpersBij, in de korte schermtekst: ['scheidsrechter DS 4', 'teller ouders']
    officialsRegels: function (perWedstrijd, w) {
      var volgorde = { scheidsrechter: 0, teller: 1, dwf: 2 };
      var rang = function (t) { var k = Wedstrijden.taakKort(t); return k in volgorde ? volgorde[k] : 9; };
      return ((perWedstrijd || {})[Wedstrijden.sleutel(w)] || []).slice()
        .sort(function (a, b) { return rang(a.taak) - rang(b.taak); })
        .map(function (o) { return Wedstrijden.taakKort(o.taak) + ' ' + o.team; });
    },

    // Wie fluit, telt of doet het DWF bij deze wedstrijd (kunnen andere teams zijn)
    helpersBij: function (perWedstrijd, w) {
      return ((perWedstrijd || {})[Wedstrijden.sleutel(w)] || []).map(function (t) {
        return { soort: Wedstrijden.taakSoort(t.taak), taak: t.taak, team: t.team, opmerking: t.opmerking || null };
      }).sort(function (a, b) { return Wedstrijden._rang(a.soort) - Wedstrijden._rang(b.soort); });
    },
    _rang: function (soort) { var r = { Fluiten: 0, Tellen: 1, 'Digitaal wedstrijdformulier': 2 }; return soort in r ? r[soort] : 9; },

    // Taken die dit team zelf heeft (bij wedstrijden van andere teams, of van zichzelf), op tijd
    takenVanTeam: function (perWedstrijd, code) {
      var uit = [];
      Object.keys(perWedstrijd || {}).forEach(function (sleutel) {
        var d = sleutel.split('|');
        perWedstrijd[sleutel].forEach(function (t) {
          if (t.team === code) uit.push({ sleutel: sleutel, tijdstip: d[0], thuis: d[1], uit: d[2],
            soort: Wedstrijden.taakSoort(t.taak), taak: t.taak, team: t.team, opmerking: t.opmerking || null });
        });
      });
      return uit.sort(function (a, b) { return a.tijdstip < b.tijdstip ? -1 : a.tijdstip > b.tijdstip ? 1 : 0; });
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Wedstrijden;
  else root.Wedstrijden = Wedstrijden;
})(typeof window !== 'undefined' ? window : this);
