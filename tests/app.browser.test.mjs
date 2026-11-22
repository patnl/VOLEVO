// Browsertests voor de app in app/. Draai met:  node --test tests/app.browser.test.mjs
// Vereist Playwright met Chromium (npm root -g, of NODE_PATH); zonder die worden de tests overgeslagen.
// De tests starten zelf een kleine webserver op de repo en bootsen storingen na met route-mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let playwright = null;
for (const pad of ['playwright', (() => { try { return join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'); } catch (e) { return ''; } })()]) {
  if (!pad) continue;
  try { playwright = require(pad); break; } catch (e) { /* volgende */ }
}
const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find((p) => p && existsSync(p));
const KLAAR = Boolean(playwright);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'text/xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const pad = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const bestand = join(ROOT, pad);
  if (!bestand.startsWith(ROOT) || !existsSync(bestand) || statSync(bestand).isDirectory()) { res.writeHead(404); res.end('niet gevonden'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(bestand)] || 'application/octet-stream' });
  res.end(readFileSync(bestand));
});
let basis, browser;
test.before(async () => {
  if (!KLAAR) return;
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  basis = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await playwright.chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
});
test.after(async () => { if (browser) await browser.close(); server.close(); });

const KLOK = '2026-10-17T11:30:00+02:00';
const MA4 = 'VOLEVO MA 4';

// Maakt een pagina met vaste klok en team; `mocks` zijn route-handlers per url-patroon
async function pagina({ breedte = 390, team = MA4, mocks = {}, klok = KLOK } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breedte, height: 800 }, timezoneId: 'Europe/Amsterdam' });
  const p = await ctx.newPage();
  p.fouten = [];
  p.on('pageerror', (e) => p.fouten.push(e.message));
  await p.clock.install({ time: new Date(klok) });
  await p.route(/workers\.dev|google|gstatic|cdnjs|arcgisonline|nevobo\.nl\/(?!.*\.xml)/, (r) => r.abort());
  for (const [patroon, handler] of Object.entries(mocks)) await p.route(new RegExp(patroon), handler);
  await p.addInitScript((t) => { try { if (t) localStorage.setItem('volevo-team', t); else localStorage.removeItem('volevo-team'); } catch (e) {} }, team);
  p.ga = async (naam, zoek = '') => { await p.goto(basis + 'app/' + naam + zoek); await p.waitForSelector('#inhoud :not(.leeg)', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400); };
  p.sluit = () => ctx.close();
  return p;
}
const tekst = (p, sel = '#inhoud') => p.textContent(sel).then((t) => t.replace(/\s+/g, ' ').trim());
const SKIP = { skip: KLAAR ? false : 'Playwright is niet beschikbaar' };

const RIJ = '#inhoud details.wedstrijd';
// Een rij openklappen en dan op de link erin tikken
async function openEnTik(rij, linkTekst) { await rij.locator('summary').click(); await rij.locator('a', { hasText: linkTekst }).click(); }

// ── P1: een storing mag nooit als "geen beurten" of "alles in orde" verschijnen ──
test('officials.json onbereikbaar: Fluiten en tellen meldt dat taken niet geladen konden worden, nooit "geen beurten"', SKIP, async () => {
  for (const mock of [(r) => r.abort(), (r) => r.fulfill({ status: 500, body: 'fout' }), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"bron":"x"}' }), (r) => r.fulfill({ status: 200, body: 'geen json' })]) {
    const p = await pagina({ mocks: { 'data/officials\\.json': mock } });
    for (const naam of ['fluiten.html', 'team.html']) {
      await p.ga(naam);
      const t = await tekst(p);
      assert.match(t, /Taken konden niet worden geladen/, naam);
      assert.match(t, /Dit betekent niet dat er geen beurten zijn/, naam);
      assert.doesNotMatch(t, /Geen beurten gevonden/, naam);
      assert.equal(await p.locator('[data-herlaad]').count() >= 1, true, 'er is een knop Opnieuw proberen');
    }
    await p.sluit();
  }
});

test('officials.json herstelt: Opnieuw proberen laat de taken zien', SKIP, async () => {
  let stuk = true;
  const p = await pagina({ mocks: { 'data/officials\\.json': (r) => (stuk ? r.abort() : r.continue()) } });
  await p.ga('fluiten.html');
  assert.match(await tekst(p), /Taken konden niet worden geladen/);
  stuk = false;
  await p.click('#inhoud [data-herlaad]'); await p.waitForTimeout(800);
  const t = await tekst(p);
  assert.doesNotMatch(t, /Taken konden niet worden geladen/);
  assert.match(t, /Fluiten op/);
  await p.sluit();
});

test('een geladen maar leeg rooster zegt wel "geen beurten gevonden"', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/officials\\.json': (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"perWedstrijd":{}}' }) } });
  for (const naam of ['fluiten.html', 'team.html']) {
    await p.ga(naam);
    const t = await tekst(p);
    assert.match(t, /Geen beurten gevonden/, naam);
    assert.doesNotMatch(t, /Taken konden niet worden geladen/, naam);
  }
  await p.sluit();
});

test('correcties onbereikbaar: waarschuwing over veldindeling, het programma blijft leesbaar', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/overrides\\.json': (r) => r.abort() } });
  await p.ga('programma.html');
  assert.match(await tekst(p, '#waarschuwing'), /Veldindeling niet gecontroleerd/);
  assert.ok((await p.locator(RIJ).count()) > 3, 'wedstrijden blijven zichtbaar');
  await p.sluit();
  const q = await pagina({});
  await q.ga('programma.html');
  assert.equal((await tekst(q, '#waarschuwing')), '', 'zonder storing geen waarschuwing');
  await q.sluit();
});

test('officials ontbreken: Vandaag zegt dat de beurten niet geladen konden worden', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/officials\\.json': (r) => r.abort() } });
  await p.ga('index.html');
  assert.match(await tekst(p), /Fluit- en telbeurten konden niet worden geladen/);
  assert.equal(await p.locator('.beurt').count(), 0, 'geen beurtblok dat op een lege dag lijkt');
  await p.sluit();
});

test('wedstrijdgegevens onbereikbaar: een foutmelding met Opnieuw proberen, geen leeg scherm', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/matches\\.json': (r) => r.abort() } });
  for (const naam of ['index.html', 'programma.html', 'zaal.html', 'kaart.html', 'team.html']) {
    await p.ga(naam);
    assert.match(await tekst(p), /kunnen nu niet worden opgehaald/, naam);
    assert.equal(await p.locator('#inhoud [data-herlaad]').count(), 1, naam);
  }
  await p.sluit();
});

// ── P2: gekozen team en onderlinge wedstrijden ──
test('MA 4 kiest: de onderlinge wedstrijd tegen MA 3 staat als uitwedstrijd, voor MA 3 als thuiswedstrijd', SKIP, async () => {
  const p = await pagina({ klok: '2026-11-20T10:00:00+01:00' });
  await p.ga('programma.html');
  const t = (await p.locator(RIJ, { hasText: 'VOLEVO MA 3' }).first().locator('summary').textContent()).replace(/\s+/g, ' ');
  assert.match(t, /12:30/);
  assert.match(t, /Uit tegen VOLEVO MA 3/);
  await p.sluit();
  const q = await pagina({ team: 'VOLEVO MA 3', klok: '2026-11-20T10:00:00+01:00' });
  await q.ga('programma.html');
  assert.match((await q.locator(RIJ, { hasText: 'VOLEVO MA 4' }).first().locator('summary').textContent()), /Thuis tegen VOLEVO MA 4/);
  await q.sluit();
  const z = await pagina({ team: '', klok: '2026-11-21T09:00:00+01:00' });
  await z.ga('programma.html');
  await z.click('#meer'); await z.waitForTimeout(300);
  const rij = z.locator(RIJ, { hasText: 'tegen VOLEVO MA 4' });
  assert.equal(await rij.count(), 1, 'één rij voor MA 3 – MA 4');
  assert.match((await rij.first().locator('summary').textContent()).replace(/\s+/g, ' '), /MA 3 tegen VOLEVO MA 4/, 'zonder teamkeuze blijft de thuisvolgorde');
  await z.sluit();
});

test('Programma alle teams: een toernooi in een andere hal is één rij, De Fluit blijft per wedstrijd', SKIP, async () => {
  const p = await pagina({ team: '', klok: '2026-11-21T09:00:00+01:00' });
  await p.ga('programma.html');
  const toernooi = p.locator('#inhoud details.toernooi').first();
  assert.match((await toernooi.locator('summary').textContent()).replace(/\s+/g, ' '), /\d+ wedstrijden in Houtrust sporthal/);
  assert.equal(await p.locator(RIJ, { hasText: 'Houtrust' }).count(), 0, 'de losse wedstrijden staan in het toernooi');
  assert.ok(await p.locator(RIJ, { hasText: 'De Fluit' }).count() >= 3);
  await p.sluit();
});

test('Vandaag: de eigen wedstrijd van 15:00 staat groot, de fluitbeurt van 12:30 als "Eerst", als taak van het team', SKIP, async () => {
  const p = await pagina();
  await p.ga('index.html');
  const held = await tekst(p, '.held');
  assert.match(held, /15:00/); assert.match(held, /VOLEVO MA 4/); assert.match(held, /thuiswedstrijd/);
  const beurt = await tekst(p, '.beurt');
  assert.match(beurt, /Eerst fluiten jullie om 12:30/);
  assert.match(beurt, /VOLEVO MC 5/);
  assert.doesNotMatch(beurt, /Je moet|aanwezig|melding/i, 'geen individuele aanwezigheid of notificaties verzinnen');
  assert.equal(await p.locator('.beurt a[href="fluiten.html"]').count(), 1, 'link naar Fluiten en tellen');
  await p.sluit();
  const q = await pagina({ team: '' });
  await q.ga('index.html');
  assert.equal(await q.locator('.beurt').count(), 0, 'zonder teamkeuze geen beurtblok');
  assert.match(await tekst(q, '.held'), /Kies je team/);
  assert.ok(await q.evaluate(() => document.documentElement.scrollHeight) < 2500, 'zonder team blijft Vandaag kort');
  await q.sluit();
});

// ── Uitslagen: winnaar, dubbele uitslagen, bronlink ──
const XML = (items) => '<?xml version="1.0"?><rss xmlns:nevobo="https://www.api.nevobo.nl/rss/"><channel>' + items.map((i) =>
  `<item><title><![CDATA[${i.titel}]]></title><link>${i.id}</link><guid>${i.id}</guid><description><![CDATA[Wedstrijd: ${i.titel}, Setstanden: ${i.sets || '25-10, 25-10, 25-10'}]]></description><pubDate>${i.tijd}</pubDate><nevobo:status>gespeeld</nevobo:status></item>`).join('') + '</channel></rss>';
const UITSLAG = '#inhoud .uitslag, #inhoud .eigen-uitslag';

test('Uitslagen: de dubbele uitslag MA 4 – MA 3 staat één keer, met Gewonnen of Verloren en de winnaar in woorden', SKIP, async () => {
  const p = await pagina();
  await p.ga('uitslagen.html');
  // MA 4 en MA 3 speelden twee keer tegen elkaar (thuis en uit); elke wedstrijd staat twee keer in de feed
  const alle = await p.locator(UITSLAG).filter({ hasText: 'VOLEVO MA 3' }).evaluateAll((els) => els.map((e) => e.innerHTML));
  assert.equal(alle.length, 2, 'elke onderlinge wedstrijd staat één keer');
  const thuis = alle.filter((x) => x.indexOf('VOLEVO MA 4') < x.indexOf('VOLEVO MA 3'));
  assert.equal(thuis.length, 1, 'één uitslag voor MA 4 – MA 3');
  const h = thuis[0];
  assert.match(h, /Gewonnen/);
  assert.match(h, /VOLEVO MA 4<span class="alleen-lezer"> \(winnaar\)<\/span>/, 'de winnaar staat er in woorden bij, niet alleen vet');
  assert.ok(h.indexOf('VOLEVO MA 4') < h.indexOf('VOLEVO MA 3'), 'het thuisteam staat boven');
  await p.sluit();
  const q = await pagina({ team: 'VOLEVO MA 3' });
  await q.ga('uitslagen.html');
  assert.match(await q.locator(UITSLAG).filter({ hasText: 'VOLEVO MA 4' }).first().innerHTML(), /Verloren/);
  await q.sluit();
  // zonder team: dezelfde wedstrijd twee keer in de feed (eens per VOLEVO-team) blijft één rij
  const dubbel = { titel: 'VOLEVO MA 4 - VOLEVO MA 3, Uitslag: 3-1', id: 'https://api.nevobo.nl/permalink/wedstrijd/9', tijd: 'Sat, 10 Oct 2026 12:30:00 +0200' };
  const z = await pagina({ team: '', mocks: { 'data/resultaten\\.xml': (r) => r.fulfill({ status: 200, contentType: 'text/xml', body: XML([dubbel, dubbel]) }) } });
  await z.ga('uitslagen.html');
  const onderling = z.locator(UITSLAG).filter({ hasText: 'VOLEVO MA 4' }).filter({ hasText: 'VOLEVO MA 3' });
  assert.equal(await onderling.count(), 1);
  assert.equal(await onderling.first().locator('.m').getAttribute('aria-label'), 'Onderling', 'zonder teamkeuze kiest de app geen kant tussen twee VOLEVO-teams');
  await z.sluit();
});

test('Uitslagen: onvolledige of ongeldige score geeft geen winnaar; alleen een bekende Nevobo-link wordt een link', SKIP, async () => {
  const feed = XML([
    { titel: 'Kalinko MA 1 - VOLEVO MA 4, Uitslag: 3-', id: 'https://api.nevobo.nl/permalink/wedstrijd/1', tijd: 'Sat, 10 Oct 2026 15:00:00 +0200' },
    { titel: 'Zovoc MA 1 - VOLEVO MA 4, Uitslag: 1-3', id: 'https://evil.example.com/wedstrijd/2', tijd: 'Sat, 03 Oct 2026 15:00:00 +0200' },
    { titel: 'DEO MA 1 - VOLEVO MA 4, Uitslag: 2-2', id: 'https://api.nevobo.nl/permalink/wedstrijd/3', tijd: 'Sat, 26 Sep 2026 15:00:00 +0200' },
    { titel: 'VOLEVO MA 4 - Leython MA 1, Uitslag: 3-0', id: 'https://api.nevobo.nl/permalink/wedstrijd/4', tijd: 'Sat, 19 Sep 2026 15:00:00 +0200' },
    { titel: 'VOLEVO MA 4 - Leython MA 1, Uitslag: 3-0', id: 'https://api.nevobo.nl/permalink/wedstrijd/5', tijd: 'Sat, 12 Sep 2026 15:00:00 +0200' }]);
  const p = await pagina({ mocks: { 'data/resultaten\\.xml': (r) => r.fulfill({ status: 200, contentType: 'text/xml', body: feed }) } });
  await p.ga('uitslagen.html');
  const k = p.locator(UITSLAG);
  assert.equal(await k.count(), 5, 'twee verschillende wedstrijden met dezelfde teams en score blijven allebei staan');
  const eerste = (await k.nth(0).textContent()).replace(/\s+/g, ' ');
  assert.match(eerste, /Uitslag onbekend/); assert.match(eerste, /Uitslag onvolledig of onbekend/); assert.doesNotMatch(eerste, /winnaar|Gewonnen|Verloren/);
  assert.equal(await k.nth(1).locator('.m').getAttribute('aria-label'), 'Gewonnen');
  assert.equal(await k.nth(2).locator('.m').getAttribute('aria-label'), 'Gelijk');
  assert.equal(await k.nth(1).evaluate((e) => e.tagName + (e.getAttribute('href') || '')), 'ARTICLE', 'een niet-Nevobo-adres wordt geen link');
  const link = k.nth(0).locator('a.bron');
  assert.equal(await link.getAttribute('href'), 'https://api.nevobo.nl/permalink/wedstrijd/1');
  assert.equal(await link.getAttribute('target'), '_blank'); assert.match(await link.getAttribute('rel'), /noopener/);
  assert.equal(await k.nth(2).getAttribute('href'), 'https://api.nevobo.nl/permalink/wedstrijd/3', 'een rij met een Nevobo-adres is zelf de link');
  assert.match(await k.nth(2).getAttribute('rel'), /noopener/);
  await p.sluit();
});

test('uitslagen onbereikbaar: een foutmelding, niet "geen uitslagen"', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/resultaten\\.xml': (r) => r.abort() } });
  await p.ga('uitslagen.html');
  assert.match(await tekst(p), /uitslagen kunnen nu niet worden opgehaald/);
  assert.doesNotMatch(await tekst(p), /Geen uitslagen/);
  await p.sluit();
});

test('Wedstrijdformulier-link alleen voor een bekende Nevobo-bron, extern herkenbaar', SKIP, async () => {
  const p = await pagina();
  await p.ga('programma.html');
  const l = p.locator('#inhoud a:has-text("Wedstrijdformulier")').first();
  assert.match(await l.getAttribute('href'), /^https:\/\/dwf\.nevobo\.nl\//);
  assert.equal(await l.getAttribute('target'), '_blank');
  assert.match(await l.textContent(), /↗/);
  await p.sluit();
});

// ── Naar de zaal en terug, binnen de app ──
test('van Programma naar de zaal en terug: zelfde tab, het veld gekleurd, lijststand en open rij blijven', SKIP, async () => {
  const p = await pagina({ team: '' });
  await p.ga('programma.html');
  await p.click('#meer'); await p.waitForTimeout(300);
  const aantal = await p.locator(RIJ).count();
  const rij = p.locator(RIJ, { has: p.locator('a:has-text("Bekijk veld in de zaal")') }).last();
  await rij.locator('summary').click();
  const link = rij.locator('a:has-text("Bekijk veld in de zaal")');
  await link.scrollIntoViewIfNeeded();
  const y = await p.evaluate(() => window.scrollY);
  const paginas = []; p.context().on('page', (x) => paginas.push(x));
  await link.click();
  await p.waitForURL(/zaal\.html/);
  assert.equal(paginas.length, 0, 'geen nieuw tabblad of venster');
  assert.match(p.url(), /van=programma/);
  await p.waitForSelector('.hal');
  assert.equal(await p.locator('.onderbalk a').count(), 5, 'vijf plekken in het menu');
  assert.match(await p.locator('.onderbalk a[aria-current="page"]').getAttribute('href'), /zaal\.html/);
  assert.match(await p.locator('#terug').textContent(), /Terug naar Programma/);
  assert.ok(await p.locator('.veld.gekozen').count() >= 1, 'het veld is gekleurd');
  assert.match(await p.locator('.veld.gekozen').first().textContent(), /gekozen veld/i, 'ook met tekst, niet alleen kleur');
  assert.match(await p.locator('.veld.gekozen').first().getAttribute('aria-label'), /gekozen veld/);
  assert.equal(await p.locator('a[href*="volevo-plattegrond"]').count(), 0, 'geen link naar de tv-plattegrond');
  await p.click('#terug');
  await p.waitForURL(/programma\.html/); await p.waitForSelector(RIJ); await p.waitForTimeout(600);
  assert.equal(await p.locator(RIJ).count(), aantal, 'zelfde aantal wedstrijden als daarvoor');
  assert.equal(await p.locator(RIJ + '[open]').count(), 1, 'de rij die open stond staat weer open');
  assert.ok(Math.abs((await p.evaluate(() => window.scrollY)) - y) < 60, 'scrollpositie blijft ongeveer gelijk');
  await p.sluit();
});

test('van een fluit- of telbeurt naar het juiste veld en terug naar Fluiten en tellen', SKIP, async () => {
  const p = await pagina();
  await p.ga('fluiten.html');
  const beurt = p.locator('#inhoud .beurtrij', { hasText: 'VOLEVO MC 5' }).first();   // MA 4 fluit bij MC 5 op 17 okt 12:30
  assert.match((await beurt.textContent()).replace(/\s+/g, ' '), /Fluiten op/);
  await beurt.locator('a:has-text("Bekijk het veld")').click();
  await p.waitForURL(/zaal\.html/); await p.waitForSelector('.hal');
  assert.match(p.url(), /ronde=12:30/); assert.match(p.url(), /van=fluiten/);
  assert.match(await p.locator('#terug').textContent(), /Terug naar Fluiten en tellen/);
  const gekozen = await p.locator('.veld.gekozen').allTextContents();
  assert.equal(gekozen.length, 1);
  assert.match(gekozen[0], /MC 5/, 'het gekozen veld is dat van de wedstrijd waar het team fluit');
  assert.match(gekozen[0], /jullie beurt/i, 'het is jullie beurt, niet jullie eigen wedstrijd');
  assert.match(await tekst(p, '.veldrij.jij'), /Jullie fluiten/);
  await p.click('#terug');
  await p.waitForURL(/fluiten\.html/);
  assert.match(await tekst(p, 'h1'), /Fluiten en tellen/);
  await p.sluit();
});

test('direct geopende zaal: geen terugknop nodig, Zaal is zelf een plek in het menu', SKIP, async () => {
  const p = await pagina();
  await p.ga('zaal.html', '?dag=2026-10-17&ronde=15:00&veld=4');
  assert.equal(await p.locator('#terug').count(), 0);
  assert.equal(await p.locator('.onderbalk a').count(), 5);
  assert.match(await p.locator('.onderbalk a[aria-current="page"]').getAttribute('href'), /zaal\.html/);
  await p.sluit();
});

test('Vandaag: de knop naar de zaal blijft in de app en komt terug op Vandaag', SKIP, async () => {
  const p = await pagina();
  await p.ga('index.html');
  await p.locator('.held a:has-text("Bekijk de zaal")').click();
  await p.waitForURL(/zaal\.html/);
  assert.match(p.url(), /van=vandaag/);
  assert.match(await p.locator('#terug').textContent(), /Terug naar Vandaag/);
  assert.match(await p.locator('.veld.gekozen').first().textContent(), /jullie veld/i);
  await p.click('#terug'); await p.waitForURL(/index\.html/);
  await p.sluit();
});

test('de zaal zonder link naar een veld kleurt de wedstrijd en de beurt van het gekozen team', SKIP, async () => {
  const p = await pagina();
  await p.ga('zaal.html', '?dag=2026-10-17&ronde=12:30');
  assert.match((await p.locator('.veld.gekozen').allTextContents()).join(' '), /jullie beurt/i);
  await p.ga('zaal.html', '?dag=2026-10-17&ronde=15:00');
  assert.match((await p.locator('.veld.gekozen').allTextContents()).join(' '), /jullie veld/i);
  await p.sluit();
});

// ── Bruikbaar op kleine telefoons ──
const ALLE = [['index.html', ''], ['programma.html', ''], ['programma.html', '?alle=1'], ['uitslagen.html', ''], ['uitslagen.html', '?alle=1'], ['team.html', ''], ['fluiten.html', ''], ['fluiten.html', '?alle=1'],
  ['kaart.html', ''], ['wijzigingen.html', '?alle=1'], ['training.html', ''], ['zaal.html', '?dag=2026-10-17&ronde=15:00&veld=4&van=programma']];
for (const breedte of [320, 390]) {
  test(`geen horizontale overflow en bruikbare knoppen op ${breedte}px`, SKIP, async () => {
    for (const [naam, zoek] of ALLE) {
      for (const team of [MA4, '']) {
        const p = await pagina({ breedte, team });
        await p.ga(naam, zoek);
        const m = await p.evaluate(() => {
          const zichtbaar = (e) => e.offsetParent !== null && !e.closest('details:not([open]) > :not(summary)');
          const doelen = [...document.querySelectorAll('.knop, select, .onderbalk a, button, .segment a, .chips a, .tekstlink, .door, summary, .sectiekop a, .voet a, .standpil')].filter(zichtbaar);
          return {
            breed: document.documentElement.scrollWidth, venster: window.innerWidth,
            klein: doelen.filter((e) => e.getBoundingClientRect().height < 44).map((e) => (e.textContent || e.tagName).trim().slice(0, 30)),
            uitHetScherm: doelen.filter((e) => { const r = e.getBoundingClientRect(); return !e.closest('.chips') && (r.right > window.innerWidth + 1 || r.left < -1); }).map((e) => (e.textContent || '').trim().slice(0, 30))
          };
        });
        const wat = `${naam}${zoek} ${breedte}px ${team || 'zonder team'}`;
        assert.ok(m.breed <= m.venster, `${wat}: pagina ${m.breed}px breed in een venster van ${m.venster}px`);
        assert.deepEqual(m.klein, [], `${wat}: tikdoelen kleiner dan 44px`);
        assert.deepEqual(m.uitHetScherm, [], `${wat}: knoppen buiten beeld`);
        assert.deepEqual(p.fouten, [], `${wat}: scriptfouten`);
        await p.sluit();
      }
    }
  });
}

test('vijf plekken in het menu op elke pagina, een duidelijke Clubwebsite-link en geen link naar de tv-plattegrond', SKIP, async () => {
  const actief = { 'index.html': 'index', 'programma.html': 'programma', 'uitslagen.html': 'programma', 'zaal.html': 'zaal', 'kaart.html': 'kaart', 'team.html': 'team', 'fluiten.html': 'team', 'wijzigingen.html': 'team', 'training.html': 'team' };
  for (const naam of Object.keys(actief)) {
    const p = await pagina();
    await p.ga(naam, naam === 'zaal.html' ? '?dag=2026-10-17&ronde=15:00' : '');
    assert.deepEqual(await p.locator('.onderbalk a').allTextContents(), ['Vandaag', 'Wedstrijden', 'Zaal', 'Kaart', 'Mijn team'], naam);
    assert.match(await p.locator('.onderbalk a[aria-current="page"]').getAttribute('href'), new RegExp('^' + actief[naam] + '\\.html$'), naam);
    const club = p.locator('.voet a.clubsite');
    assert.equal(await club.getAttribute('href'), 'https://volevo.nl/');
    assert.equal(await club.getAttribute('target'), '_blank'); assert.match(await club.getAttribute('rel'), /noopener/);
    assert.match(await club.textContent(), /Clubwebsite/);
    assert.equal(await p.locator('a[href*="volevo-plattegrond"]').count(), 0, naam);
    await p.sluit();
  }
});

// ── De zaal is altijd één tik weg, en de route gaat naar de juiste sporthal ──
test('de zaal staat op elke pagina in het menu, ook zonder wedstrijd vandaag, en opent in dezelfde tab', SKIP, async () => {
  for (const naam of ['index.html', 'programma.html', 'uitslagen.html', 'fluiten.html', 'team.html', 'kaart.html']) {
    for (const team of [MA4, '']) {
      const p = await pagina({ team, klok: '2026-10-21T10:00:00+02:00' });   // woensdag: geen wedstrijden vandaag
      await p.ga(naam);
      const knop = p.locator('.onderbalk a[href="zaal.html"]');
      assert.equal(await knop.count(), 1, naam);
      assert.ok(await knop.isVisible(), 'zichtbaar zonder doorklikken');
      const paginas = []; p.context().on('page', (x) => paginas.push(x));
      await knop.click();
      await p.waitForURL(/zaal\.html/); await p.waitForSelector('.hal');
      assert.equal(paginas.length, 0, 'zelfde tab');
      assert.equal(await p.locator('.hal').count(), 2, 'De Tas en De Bocht');
      await p.sluit();
    }
  }
});

test('Route en getoond adres van De Fluit: Fluitpolderplein 3, nooit de zwembadcoördinaten of nummer 1', SKIP, async () => {
  const p = await pagina();
  for (const [naam, zoek] of [['programma.html', ''], ['zaal.html', '?dag=2026-10-17&ronde=15:00'], ['kaart.html', '']]) {
    await p.ga(naam, zoek);
    const routes = await p.locator('#inhoud a[aria-label="Route naar De Fluit"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    assert.ok(routes.length >= 1, naam + ': minstens één route naar De Fluit');
    for (const h of routes) {
      assert.equal(new URL(h).searchParams.get('query'), 'Sporthal De Fluit, Fluitpolderplein 3, 2262 ED Leidschendam');
      assert.doesNotMatch(h, /52\.09332|4\.39517/);
    }
    const t = await tekst(p);
    assert.match(t, /Fluitpolderplein 3, 2262 ED Leidschendam/);
    assert.doesNotMatch(t, /Fluitpolderplein 1\b/);
  }
  await p.sluit();
});

test('een andere sporthal houdt zijn route met coördinaten', SKIP, async () => {
  const p = await pagina({ team: '' });
  await p.ga('programma.html');
  const uit = await p.locator('#inhoud a[aria-label^="Route naar"]').evaluateAll((els) => els.map((e) => new URL(e.href).searchParams.get('query')).filter((q) => !/Fluit/.test(q)));
  assert.ok(uit.length >= 1);
  assert.ok(uit.every((q) => /^-?\d+\.\d+,-?\d+\.\d+$/.test(q)), 'coördinaten: ' + uit.slice(0, 3));
  await p.sluit();
});

// ── Geen verzonnen veld, en van= blijft bij ronde- en dagwissel ──
test('zonder veldcorrectie: het programma zegt dat het veld nog niet bevestigd is, de link noemt geen veld en de zaal markeert niets; met correctie is het veld gemarkeerd', SKIP, async () => {
  const leeg = (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"velden":{},"meldingen":{},"standen":{}}' });
  const p = await pagina({ mocks: { 'data/overrides\\.json': leeg } });
  await p.ga('programma.html');
  const rij = p.locator(RIJ, { hasText: 'De Fluit' }).first();
  assert.match((await rij.locator('summary').textContent()).replace(/\s+/g, ' '), /veld nog niet bevestigd/);
  const link = rij.locator('a[href*="zaal.html"]');
  assert.equal((await link.textContent()).trim(), 'Bekijk zaalindeling');
  const href = await link.getAttribute('href');
  assert.match(href, /dag=\d{4}-\d{2}-\d{2}&ronde=\d{2}:\d{2}/); assert.doesNotMatch(href, /veld=/, 'geen verzonnen veld in de link'); assert.match(href, /van=programma/);
  await openEnTik(rij, 'Bekijk zaalindeling'); await p.waitForURL(/zaal\.html/); await p.waitForSelector('.hal');
  assert.equal(await p.locator('.veld.gekozen').count(), 0, 'niets gemarkeerd');
  assert.equal(await p.locator('.veld.bezet').count(), 0, 'geen verzonnen bezette velden uit Nevobo-nummers');
  assert.match(await tekst(p), /Veld nog niet bevestigd/);
  assert.match(await tekst(p, 'h1'), /De Fluit/);
  await p.sluit();
  // met correctie: veld bekend, knop "Bekijk veld in de zaal" en het veld is gemarkeerd
  const q = await pagina();
  await q.ga('programma.html');
  const bekend = q.locator(RIJ, { hasText: /De Fluit, (Tas|Bocht) \d/ }).first();
  assert.equal((await bekend.locator('a[href*="zaal.html"]').textContent()).trim(), 'Bekijk veld in de zaal');
  assert.match(await bekend.locator('a[href*="zaal.html"]').getAttribute('href'), /veld=/);
  await openEnTik(bekend, 'Bekijk veld in de zaal'); await q.waitForURL(/zaal\.html/); await q.waitForSelector('.hal');
  assert.ok(await q.locator('.veld.gekozen').count() >= 1);
  await q.sluit();
});

test('elke wedstrijd in De Fluit heeft een zaalknop in Programma, ook zonder team gekozen', SKIP, async () => {
  const p = await pagina({ team: '' });
  await p.ga('programma.html');
  const fluit = p.locator(RIJ, { hasText: 'De Fluit' });
  const n = await fluit.count();
  assert.ok(n >= 3);
  for (let i = 0; i < n; i++) assert.equal(await fluit.nth(i).locator('a[href*="zaal.html"]').count(), 1, 'rij ' + i);
  const buiten = p.locator(RIJ).filter({ hasNotText: 'De Fluit' });
  for (let i = 0; i < await buiten.count(); i++) assert.equal(await buiten.nth(i).locator('a[href*="zaal.html"]').count(), 0, 'geen zaalknop bij een andere sporthal');
  await p.sluit();
});

test('van Fluiten en tellen: wisselen van ronde of speeldag in de zaal behoudt de herkomst en Terug gaat naar Fluiten en tellen', SKIP, async () => {
  const p = await pagina();
  await p.ga('fluiten.html');
  await p.locator('#inhoud .beurtrij', { hasText: 'VOLEVO MC 5' }).first().locator('a[href*="zaal.html"]').click();
  await p.waitForURL(/zaal\.html/); await p.waitForSelector('.hal');
  await p.locator('.rondes a', { hasText: '15:00' }).click();
  await p.waitForURL(/ronde=15:00/); await p.waitForSelector('.hal');
  assert.match(p.url(), /van=fluiten/, 'van blijft na een rondewissel');
  assert.match(await p.locator('#terug').textContent(), /Terug naar Fluiten en tellen/);
  await p.locator('a[aria-label^="Volgende speeldag"]').click();
  await p.waitForURL(/dag=2026-10-2\d|dag=2026-1[12]/); await p.waitForSelector('.hal');
  assert.match(p.url(), /van=fluiten/, 'van blijft na een dagwissel');
  assert.match(await p.locator('#terug').textContent(), /Terug naar Fluiten en tellen/);
  await p.click('#terug'); await p.waitForURL(/fluiten\.html/);
  await p.sluit();
});

// ── Kaart, wijzigingen en trainingen ──
test('Kaart: de sporthallen van de dag met afstand en vertrektijd; zonder kaartbibliotheek blijft de lijst over', SKIP, async () => {
  const p = await pagina({ klok: '2026-11-21T09:00:00+01:00' });
  await p.ga('kaart.html');
  const plekken = p.locator('#inhoud details.plek');
  assert.ok(await plekken.count() >= 3);
  assert.match(await plekken.first().textContent(), /De Fluit, Leidschendam/, 'thuis staat bovenaan');
  const uit = plekken.nth(1);
  assert.match((await uit.locator('summary').textContent()).replace(/\s+/g, ' '), /\d+ km/);
  assert.match((await uit.textContent()).replace(/\s+/g, ' '), /vertrek rond \d\d:\d\d/);
  assert.equal(await p.locator('#kaart').isVisible(), false, 'de kaart zelf is in de test geblokkeerd en maakt dan geen leeg vlak');
  assert.deepEqual(p.fouten, []);
  await p.sluit();
});

test('wijzigingen onbereikbaar: een foutmelding, niet "geen wijzigingen"', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/wijzigingen\\.json': (r) => r.abort() } });
  await p.ga('wijzigingen.html', '?alle=1'); await p.waitForTimeout(400);
  assert.match(await tekst(p), /wijzigingen kunnen nu niet worden opgehaald/);
  assert.doesNotMatch(await tekst(p), /Geen wijzigingen/);
  await p.sluit();
});

test('Trainingsschema: de trainingen van het gekozen team staan bovenaan, het hele schema eronder', SKIP, async () => {
  const p = await pagina({ team: 'VOLEVO DS 2' });
  await p.ga('training.html'); await p.waitForSelector('#trainingen section');
  const t = await tekst(p, '#trainingen section');
  assert.match(t, /Dames 2 traint/); assert.match(t, /De Tas, veld \d/);
  assert.ok(await p.locator('#trainingen details').count() >= 5, 'elke trainingsdag kan open');
  await p.sluit();
});

test('volevo.app zelf opent de app', SKIP, async () => {
  const p = await pagina();
  await p.goto(basis + 'index.html'); await p.waitForURL(/\/app\/(index\.html)?$/);
  await p.sluit();
});
