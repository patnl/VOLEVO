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
