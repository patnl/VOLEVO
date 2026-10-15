# Beheer-API voor de schermen

Een kleine Cloudflare Worker die de handmatige correcties (velden, standen, meldingen) bewaart. De wedstrijdsecretaris werkt ze bij via `volevo-schema.html`; de schermen lezen ze van deze API. Is de API niet ingesteld of niet bereikbaar, dan gelden de correcties uit `data/overrides.json` in de repo.

- `GET /overrides`: openbaar, geeft de opgeslagen correcties (404 zolang er niets is opgeslagen).
- `PUT /overrides`: alleen met `Authorization: Bearer <wachtwoord>`. Controleert de inhoud, bewaart hem en houdt de vorige versie als `overrides:vorig` apart.

## Eenmalig aanzetten

Nodig: een gratis Cloudflare-account en Node.js.

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create OVERRIDES     # toont een id; zet die in wrangler.toml
npx wrangler secret put BEHEER_WACHTWOORD      # kies een wachtwoord en geef het aan de secretaris
npx wrangler deploy                            # toont het adres, bijvoorbeeld https://volevo-beheer.<account>.workers.dev
```

Zet dat adres daarna in `overrides.js` bij `VOLEVO_API` (zonder slash aan het eind) en publiceer de site. Vanaf dat moment kan de secretaris op `volevo-schema.html` publiceren.

`ALLOWED_ORIGIN` in `wrangler.toml` is het adres van de site; alleen vanaf dat adres mag de API worden aangeroepen vanuit een browser.

## Testen

```bash
node --test worker/index.test.mjs
```

## Beperkingen

- Eén gedeeld wachtwoord, geen persoonlijke accounts en geen logboek van wie wat wijzigde.
- Geen limiet op pogingen om het wachtwoord te raden. Kies een lang wachtwoord, of zet in het Cloudflare-dashboard een rate-limit-regel op `PUT`.
- Een stap terug is bewaard (`overrides:vorig`) maar nog niet via de site terug te zetten.
