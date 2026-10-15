// Zelfherstel voor de zaalschermen. Een scherm dat dagen aan staat ververst zijn
// gegevens wel, maar laadt de pagina zelf nooit opnieuw: nieuwe code komt dan niet
// binnen, en een scherm dat op een verkeerde pagina is beland (bijvoorbeeld via
// een doorverwijzing) blijft daar hangen. Daarom laadt elke tv-pagina zichzelf
// ongeveer elk uur opnieuw, op een willekeurig moment zodat de schermen niet
// allemaal tegelijk verversen.
(function () {
  var uur = 60 * 60 * 1000;
  setTimeout(function () { location.reload(); }, uur + Math.round(Math.random() * 10 * 60 * 1000));
})();
