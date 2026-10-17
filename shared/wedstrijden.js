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
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Wedstrijden;
  else root.Wedstrijden = Wedstrijden;
})(typeof window !== 'undefined' ? window : this);
