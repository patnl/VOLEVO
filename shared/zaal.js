// De zaal van De Fluit: waar de velden liggen en hoe de zalen zijn ingedeeld.
// Eén plek voor de app en de zaalschermen. Draait in de browser (window.Zaal) en in node (tests).
//
// Veldnummers volgen het zaalschema van de wedstrijdsecretaris: De Tas 1 t/m 3, De Bocht 4 t/m 7.
// De Nevobo-veldnummers kloppen niet met de zaal; de juiste velden komen via data/overrides.json.
// `veld` = nummer in het schema, `hal` = nummer op de bordjes. Vlakken staan in breukdelen van de zaal
// (fx/fy = linkerbovenhoek, fw/fh = breedte en hoogte), net: 'h' = net horizontaal, 'v' = verticaal.
(function (root) {
  var definitie = {
    naam: 'De Fluit',
    viewBox: '0 0 1240 660',
    zalen: [
      { naam: 'De Tas', x: 30, y: 80, w: 560, h: 520,
        drie: { omschrijving: '3-deling · verticaal', velden: [
          { veld: '3', hal: '3', fx: 0,   fy: 0, fw: 1 / 3, fh: 1, net: 'h' },
          { veld: '2', hal: '2', fx: 1 / 3, fy: 0, fw: 1 / 3, fh: 1, net: 'h' },
          { veld: '1', hal: '1', fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1, net: 'h' } ] } },

      { naam: 'De Bocht', x: 620, y: 80, w: 590, h: 520,
        vier: { omschrijving: '4-deling · 2 bij 2', velden: [
          { veld: '7', hal: '7', fx: 0,   fy: 0,   fw: 1 / 2, fh: 1 / 2, net: 'v' },
          { veld: '6', hal: '6', fx: 1 / 2, fy: 0,   fw: 1 / 2, fh: 1 / 2, net: 'v' },
          { veld: '4', hal: '4', fx: 0,   fy: 1 / 2, fw: 1 / 2, fh: 1 / 2, net: 'v' },
          { veld: '5', hal: '5', fx: 1 / 2, fy: 1 / 2, fw: 1 / 2, fh: 1 / 2, net: 'v' } ] },
        // Bij 3 wedstrijden staat veld 4 groot: de halve zaal links, in de lengte vanaf de tribune.
        // Rechts blijven 6 (achter) en 5 (bij de tribune).
        gemengd: { omschrijving: 'veld 4 groot, 5 en 6', velden: [
          { veld: ['4G'], hal: '4', fx: 0,   fy: 0,   fw: 1 / 2, fh: 1,   net: 'h' },
          { veld: '6',    hal: '6', fx: 1 / 2, fy: 0,   fw: 1 / 2, fh: 1 / 2, net: 'v' },
          { veld: '5',    hal: '5', fx: 1 / 2, fy: 1 / 2, fw: 1 / 2, fh: 1 / 2, net: 'v' } ] } }
    ],
    // Beide zalen hebben een eigen ingang aan de tribunekant.
    ingangen: [
      { x: 370, y: 616, w: 220, h: 30, tekst: 'Ingang De Tas' },
      { x: 620, y: 616, w: 220, h: 30, tekst: 'Ingang De Bocht' }
    ]
  };

  // Alle schemanummers van een vlak, als lijst
  function veldenVan(v) {
    if (!v.veld) return [];
    return Array.isArray(v.veld) ? v.veld : [v.veld];
  }
  // Het grote veld 4 ('4G') is ook veld 4 in het schema: wedstrijden op "4" horen er dus ook op
  function zoekNummers(v) {
    var n = veldenVan(v);
    return n.indexOf('4G') !== -1 && n.indexOf('4') === -1 ? n.concat('4') : n;
  }
  function halVan(v) {
    return (Array.isArray(v.hal) ? v.hal : [v.hal]).join(' / ');
  }
  function labelVan(v) {
    var l = veldenVan(v).filter(function (nr) { return String(nr).charAt(0) !== 'h'; });
    return l.length ? l.map(function (nr) { return /g$/i.test(nr) ? nr.replace(/g$/i, ' groot') : nr; }).join(' of ') : '–';
  }

  // Welke indeling staat deze speelronde in deze zaal?
  //  perVeld: veldnummer -> wedstrijden van die ronde; vast: 'drie'|'vier'|'gemengd' uit de correcties;
  //  keuze: dezelfde, maar gekozen met een knopje op de pagina.
  function stand(zaal, perVeld, vast, keuze) {
    perVeld = perVeld || {};
    if (keuze && zaal[keuze]) return zaal[keuze];
    if (vast && zaal[vast]) return zaal[vast];
    var gebruikt = function (nr) { return (perVeld[nr] || []).length > 0; };
    // Veld 4 groot ('4G') bestaat alleen in de gemengde stand
    if (zaal.gemengd && Object.keys(perVeld).some(function (nr) { return /g$/i.test(nr) && gebruikt(nr); })) return zaal.gemengd;
    // Bocht met drie velden: geen wedstrijd op veld 7 maar wel op 4, 5 of 6. Het bestuur zet dan veld 4
    // groot (links, met 5 en 6 rechts), ook als er gewoon "veld 4" in het schema staat.
    if (zaal.gemengd && zaal.vier && !zaal.drie && !gebruikt('7') && ['4', '5', '6'].some(gebruikt)) return zaal.gemengd;
    if (!zaal.vier) return zaal.drie;
    if (!zaal.drie) return zaal.vier;
    // Een veld in gebruik dat alleen in de 4-deling bestaat: de zaal staat gekanteld
    var alleenInVier = [];
    zaal.vier.velden.forEach(function (v) {
      veldenVan(v).forEach(function (nr) {
        if (!zaal.drie.velden.some(function (d) { return veldenVan(d).indexOf(nr) !== -1; })) alleenInVier.push(nr);
      });
    });
    return alleenInVier.some(gebruikt) ? zaal.vier : zaal.drie;
  }

  var Zaal = { definitie: definitie, veldenVan: veldenVan, zoekNummers: zoekNummers, halVan: halVan, labelVan: labelVan, stand: stand };
  if (typeof module !== 'undefined' && module.exports) module.exports = Zaal;
  else root.Zaal = Zaal;
})(typeof window !== 'undefined' ? window : this);
