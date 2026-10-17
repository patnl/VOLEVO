# Bijdragen

De repositoryafspraken staan in
[ict-docs-repo-conventies](https://github.com/tbi-ssc/ict-docs-repo-conventies).
Lees de actuele README en relevante documentatie voordat je een repositorywijziging doet.

Beschrijf bij wijzigingen in de mobiele app welk probleem voor clubleden wordt opgelost
en hoe de wijziging is gecontroleerd. Controleer zowel een kleine telefoonbreedte als
de route naar en terug van de zaalindeling. Houd app- en zaalschermwijzigingen gericht.

Na wijzigingen aan app-scripts of stylesheets: voer `python3 scripts/version_app_assets.py`
uit en commit de bijgewerkte HTML-verwijzingen mee. Zo laden bestaande bezoekers geen
oude code bij een nieuwe pagina. Controleer met `python3 scripts/version_app_assets.py --check`
en `node --test tests/app-assets.test.mjs tests/uitslagen-state.test.mjs`.
