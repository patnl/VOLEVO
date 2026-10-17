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
  await p.route(/workers\.dev|google|gstatic|nevobo\.nl\/(?!.*\.xml)/, (r) => r.abort());
  for (const [patroon, handler] of Object.entries(mocks)) await p.route(new RegExp(patroon), handler);
  await p.addInitScript((t) => { try { if (t) localStorage.setItem('volevo-team', t); else localStorage.removeItem('volevo-team'); } catch (e) {} }, team);
  p.ga = async (naam, zoek = '') => { await p.goto(basis + 'app/' + naam + zoek); await p.waitForSelector('#inhoud :not(.leeg)', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400); };
  p.sluit = () => ctx.close();
  return p;
}
const tekst = (p, sel = '#inhoud') => p.textContent(sel).then((t) => t.replace(/\s+/g, ' ').trim());
const SKIP = { skip: KLAAR ? false : 'Playwright is niet beschikbaar' };

// ── P1: een storing mag nooit als "geen beurten" of "alles in orde" verschijnen ──
test('officials.json onbereikbaar: Fluiten/tellen meldt dat taken niet geladen konden worden, nooit "geen beurten"', SKIP, async () => {
  for (const mock of [(r) => r.abort(), (r) => r.fulfill({ status: 500, body: 'fout' }), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"bron":"x"}' }), (r) => r.fulfill({ status: 200, body: 'geen json' })]) {
    const p = await pagina({ mocks: { 'data/officials\\.json': mock } });
    await p.ga('fluiten.html');
    const t = await tekst(p);
    assert.match(t, /Taken konden niet worden geladen/);
    assert.match(t, /Dit betekent niet dat er geen beurten zijn/);
    assert.doesNotMatch(t, /Geen beurten gevonden/);
    assert.equal(await p.locator('[data-herlaad]').count() >= 1, true, 'er is een knop Opnieuw proberen');
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
  assert.match(t, /Fluiten/);
  await p.sluit();
});

test('een geladen maar leeg rooster zegt wel "geen beurten gevonden"', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/officials\\.json': (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"perWedstrijd":{}}' }) } });
  await p.ga('fluiten.html');
  const t = await tekst(p);
  assert.match(t, /Geen beurten gevonden/);
  assert.doesNotMatch(t, /Taken konden niet worden geladen/);
  await p.sluit();
});

test('correcties onbereikbaar: waarschuwing over veldindeling, het programma blijft leesbaar', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/overrides\\.json': (r) => r.abort() } });
  await p.ga('programma.html');
  assert.match(await tekst(p, '#waarschuwing'), /Veldindeling niet gecontroleerd/);
  assert.ok((await p.locator('#inhoud .kaart').count()) > 3, 'wedstrijden blijven zichtbaar');
  await p.sluit();
  const q = await pagina({});
  await q.ga('programma.html');
  assert.equal((await tekst(q, '#waarschuwing')), '', 'zonder storing geen waarschuwing');
  await q.sluit();
});

test('officials ontbreken: Vandaag en een wedstrijdkaart zeggen dat de beurten niet geladen konden worden', SKIP, async () => {
  const p = await pagina({ mocks: { 'data/officials\\.json': (r) => r.abort() } });
  await p.ga('index.html');
  assert.match(await tekst(p), /Fluit- en telbeurten konden niet worden geladen/);
  await p.sluit();
});

// ── P2: gekozen team en onderlinge wedstrijden ──
test('MA 4 kiest: de onderlinge wedstrijd tegen MA 3 staat met MA 4 vooraan en als uitwedstrijd', SKIP, async () => {
  const p = await pagina({ klok: '2026-11-20T10:00:00+01:00' });
  await p.ga('programma.html');
  const kaart = p.locator('#inhoud .kaart', { hasText: 'VOLEVO MA 3' }).first();
  const t = (await kaart.textContent()).replace(/\s+/g, ' ');
  assert.match(t, /12:30/);
  assert.match(t, /Meisjes A 4 \(MA 4\) ?tegen VOLEVO MA 3/);
  assert.match(t, /Uit/);
  await p.sluit();
  const q = await pagina({ team: 'VOLEVO MA 3', klok: '2026-11-20T10:00:00+01:00' });
  await q.ga('programma.html');
  const t2 = (await q.locator('#inhoud .kaart', { hasText: 'VOLEVO MA 4' }).first().textContent()).replace(/\s+/g, ' ');
  assert.match(t2, /Meisjes A 3 \(MA 3\) ?tegen VOLEVO MA 4/);
  assert.match(t2, /Thuis/);
  await q.sluit();
  const z = await pagina({ team: '', klok: '2026-11-21T09:00:00+01:00' });
  await z.ga('programma.html');
  const t3 = (await z.locator('#inhoud .kaart', { hasText: 'VOLEVO MA 3' }).first().textContent()).replace(/\s+/g, ' ');
  assert.match(t3, /VOLEVO MA 3 ?tegen VOLEVO MA 4/, 'zonder teamkeuze blijft de thuisvolgorde');
  await z.sluit();
});

test('Vandaag: compacte dagkaart met de fluitbeurt van 12:30 vóór de eigen wedstrijd van 15:00, als taak van het team', SKIP, async () => {
  const p = await pagina();
  await p.ga('index.html');
  const kaart = await tekst(p, '.dagkaart');
  assert.match(kaart, /Jouw dag/);
  const volgorde = [kaart.indexOf('Je team fluit'), kaart.indexOf('Eigen wedstrijd, thuis')];
  assert.ok(volgorde[0] >= 0 && volgorde[1] > volgorde[0], 'fluitbeurt komt voor de eigen wedstrijd: ' + volgorde);
  assert.match(kaart, /12:30/); assert.match(kaart, /15:00/);
  assert.doesNotMatch(kaart, /Je moet|aanwezig|melding/i, 'geen individuele aanwezigheid of notificaties verzinnen');
  assert.equal(await p.locator('.dagkaart a[href="fluiten.html"]').count(), 1, 'link naar Fluiten/tellen');
  await p.sluit();
  const q = await pagina({ team: '' });
  await q.ga('index.html');
  assert.equal(await q.locator('.dagkaart').count(), 0, 'zonder teamkeuze geen dagkaart');
  await q.sluit();
});

// ── Uitslagen: winnaar, dubbele uitslagen, bronlink ──
const XML = (items) => '<?xml version="1.0"?><rss xmlns:nevobo="https://www.api.nevobo.nl/rss/"><channel>' + items.map((i) =>
  `<item><title><![CDATA[${i.titel}]]></title><link>${i.id}</link><guid>${i.id}</guid><description><![CDATA[Wedstrijd: ${i.titel}, Setstanden: ${i.sets || '25-10, 25-10, 25-10'}]]></description><pubDate>${i.tijd}</pubDate><nevobo:status>gespeeld</nevobo:status></item>`).join('') + '</channel></rss>';

test('Uitslagen: de dubbele uitslag MA 4 – MA 3 staat één keer, met Gewonnen/Verloren en de winnaar in woorden', SKIP, async () => {
  const p = await pagina();
  await p.ga('uitslagen.html');
  const kaarten = p.locator('#inhoud .kaart', { hasText: 'VOLEVO MA 3' });
  assert.equal(await kaarten.count(), 1, 'één kaart voor MA 4 – MA 3');
  const t = (await kaarten.first().textContent()).replace(/\s+/g, ' ');
  assert.match(t, /Gewonnen/); assert.match(t, /Winnaar: VOLEVO MA 4/); assert.match(t, /VOLEVO MA 4 \(thuis\) ?3/); assert.match(t, /VOLEVO MA 3 \(uit\) ?1/);
  await p.sluit();
  const q = await pagina({ team: 'VOLEVO MA 3' });
  await q.ga('uitslagen.html');
  assert.match((await q.locator('#inhoud .kaart', { hasText: 'VOLEVO MA 4' }).first().textContent()), /Verloren/);
  await q.sluit();
  const z = await pagina({ team: '' });
  await z.ga('uitslagen.html');
  assert.match(await tekst(z), /Winnaar: /);
  assert.doesNotMatch(await tekst(z), /Gewonnen|Verloren/, 'zonder teamkeuze geen Gewonnen/Verloren');
  await z.sluit();
});

test('Uitslagen: onvolledige of ongeldige score geeft geen winnaar; alleen een bekende Nevobo-link krijgt een knop', SKIP, async () => {
  const feed = XML([
    { titel: 'Kalinko MA 1 - VOLEVO MA 4, Uitslag: 3-', id: 'https://api.nevobo.nl/permalink/wedstrijd/1', tijd: 'Sat, 10 Oct 2026 15:00:00 +0200' },
    { titel: 'Zovoc MA 1 - VOLEVO MA 4, Uitslag: 1-3', id: 'https://evil.example.com/wedstrijd/2', tijd: 'Sat, 03 Oct 2026 15:00:00 +0200' },
    { titel: 'DEO MA 1 - VOLEVO MA 4, Uitslag: 2-2', id: 'https://api.nevobo.nl/permalink/wedstrijd/3', tijd: 'Sat, 26 Sep 2026 15:00:00 +0200' },
    { titel: 'VOLEVO MA 4 - Leython MA 1, Uitslag: 3-0', id: 'https://api.nevobo.nl/permalink/wedstrijd/4', tijd: 'Sat, 19 Sep 2026 15:00:00 +0200' },
    { titel: 'VOLEVO MA 4 - Leython MA 1, Uitslag: 3-0', id: 'https://api.nevobo.nl/permalink/wedstrijd/5', tijd: 'Sat, 12 Sep 2026 15:00:00 +0200' }]);
  const p = await pagina({ mocks: { 'data/resultaten\\.xml': (r) => r.fulfill({ status: 200, contentType: 'text/xml', body: feed }) } });
  await p.ga('uitslagen.html');
  const k = p.locator('#inhoud .kaart');
  assert.equal(await k.count(), 5, 'twee verschillende wedstrijden met dezelfde teams en score blijven allebei staan');
  const eerste = (await k.nth(0).textContent()).replace(/\s+/g, ' ');
  assert.match(eerste, /Uitslag onbekend/); assert.match(eerste, /Uitslag onvolledig of onbekend/); assert.doesNotMatch(eerste, /Winnaar|Gewonnen|Verloren/);
  assert.match((await k.nth(1).textContent()), /Gewonnen/);
  assert.match((await k.nth(2).textContent()), /Gelijk/);
  assert.equal(await k.nth(1).locator('a:has-text("Bekijk bij Nevobo")').count(), 0, 'een niet-Nevobo-link krijgt geen knop');
  const link = k.nth(0).locator('a:has-text("Bekijk bij Nevobo")');
  assert.equal(await link.getAttribute('href'), 'https://api.nevobo.nl/permalink/wedstrijd/1');
  assert.equal(await link.getAttribute('target'), '_blank'); assert.match(await link.getAttribute('rel'), /noopener/);
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

// ── Zaalflow binnen de app ──
test('van Programma naar de zaal en terug: zelfde tab, vier tabs, team en lijststand blijven', SKIP, async () => {
  const p = await pagina({ team: '' });
  await p.ga('programma.html');
  await p.click('#meer'); await p.waitForTimeout(300);
  const aantal = await p.locator('#inhoud .kaart').count();
  const link = p.locator('#inhoud a:has-text("Bekijk veld in de zaal")').last();
  await link.scrollIntoViewIfNeeded();
  const y = await p.evaluate(() => window.scrollY);
  const paginas = []; p.context().on('page', (x) => paginas.push(x));
  await link.click();
  await p.waitForURL(/zaal\.html/);
  assert.equal(paginas.length, 0, 'geen nieuw tabblad of venster');
  assert.match(p.url(), /van=programma/);
  await p.waitForSelector('svg.zaal');
  assert.equal(await p.locator('.onderbalk a').count(), 4, 'vier hoofdtabs');
  assert.match(await p.locator('.onderbalk a[aria-current="page"]').getAttribute('href'), /programma\.html/);
  assert.match(await p.locator('#terug').textContent(), /Terug naar Programma/);
  assert.ok(await p.locator('svg.zaal .veld.gekozen').count() >= 1, 'het veld is gekleurd');
  assert.match(await p.locator('svg.zaal .veld.gekozen').first().textContent(), /GEKOZEN VELD/, 'ook met tekst, niet alleen kleur');
  assert.match(await p.locator('svg.zaal .veld.gekozen').first().getAttribute('aria-label'), /gekozen veld/);
  assert.equal(await p.locator('a[href*="volevo-plattegrond"]').count(), 0, 'geen link naar de tv-plattegrond');
  await p.click('#terug');
  await p.waitForURL(/programma\.html/); await p.waitForSelector('#inhoud .kaart'); await p.waitForTimeout(600);
  assert.equal(await p.locator('#inhoud .kaart').count(), aantal, 'zelfde aantal wedstrijden als daarvoor');
  assert.ok(Math.abs((await p.evaluate(() => window.scrollY)) - y) < 60, 'scrollpositie blijft ongeveer gelijk');
  await p.sluit();
});

test('van een fluit- of telbeurt naar het juiste veld en terug naar Fluiten en tellen', SKIP, async () => {
  const p = await pagina();
  await p.ga('fluiten.html');
  const kaart = p.locator('#inhoud .kaart', { hasText: 'VOLEVO MC 5' }).first();   // MA 4 fluit bij MC 5 op 17 okt 12:30
  assert.match((await kaart.textContent()).replace(/\s+/g, ' '), /Fluiten/);
  await kaart.locator('a:has-text("Bekijk veld in de zaal")').click();
  await p.waitForURL(/zaal\.html/); await p.waitForSelector('svg.zaal');
  assert.match(p.url(), /ronde=12:30/); assert.match(p.url(), /van=fluiten/);
  assert.match(await p.locator('#terug').textContent(), /Terug naar Fluiten en tellen/);
  const gekozen = await p.locator('svg.zaal .veld.gekozen').allTextContents();
  assert.equal(gekozen.length, 1);
  assert.match(gekozen[0], /MC 5/, 'het gekozen veld is dat van de wedstrijd waar het team fluit');
  assert.match(await tekst(p), /Gekozen veld in de zaal/, 'neutrale kop, want dit is niet de eigen wedstrijd');
  await p.click('#terug');
  await p.waitForURL(/fluiten\.html/);
  assert.match(await tekst(p, 'h1'), /Fluiten en tellen/);
  await p.sluit();
});

test('direct geopende zaal-URL: terugval naar Programma', SKIP, async () => {
  const p = await pagina();
  await p.ga('zaal.html', '?dag=2026-10-17&ronde=15:00&veld=4');
  assert.match(await p.locator('#terug').textContent(), /Terug naar Programma/);
  assert.equal(await p.locator('.onderbalk a').count(), 4);
  assert.equal(await p.locator('.onderbalk a[aria-current="page"]').count(), 0, 'geen tab actief zonder herkomst');
  await p.click('#terug');
  await p.waitForURL(/programma\.html/);
  await p.sluit();
});

test('Vandaag: dagkaart en knop naar de zaal blijven in de app en komen terug op Vandaag', SKIP, async () => {
  const p = await pagina();
  await p.ga('index.html');
  await p.locator('.dagkaart a:has-text("Bekijk veld in de zaal")').first().click();
  await p.waitForURL(/zaal\.html/);
  assert.match(p.url(), /van=vandaag/);
  assert.match(await p.locator('#terug').textContent(), /Terug naar Vandaag/);
  await p.click('#terug'); await p.waitForURL(/index\.html/);
  await p.sluit();
});

// ── Bruikbaar op kleine telefoons ──
for (const breedte of [320, 390]) {
  test(`geen horizontale overflow en bruikbare knoppen op ${breedte}px`, SKIP, async () => {
    const pagina_s = [['index.html', ''], ['programma.html', ''], ['uitslagen.html', ''], ['fluiten.html', ''], ['zaal.html', '?dag=2026-10-17&ronde=15:00&veld=4&van=programma']];
    for (const [naam, zoek] of pagina_s) {
      const p = await pagina({ breedte });
      await p.ga(naam, zoek);
      const m = await p.evaluate(() => ({
        breed: document.documentElement.scrollWidth, venster: window.innerWidth,
        klein: [...document.querySelectorAll('.knop, select, .onderbalk a, button')].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height < 44)
          .map((e) => (e.textContent || e.tagName).trim().slice(0, 30)),
        uitHetScherm: [...document.querySelectorAll('.knop, select, .onderbalk a')].filter((e) => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && (r.right > window.innerWidth + 1 || r.left < -1); })
          .map((e) => (e.textContent || '').trim().slice(0, 30))
      }));
      assert.ok(m.breed <= m.venster, `${naam} ${breedte}px: pagina ${m.breed}px breed in een venster van ${m.venster}px`);
      assert.deepEqual(m.klein, [], `${naam} ${breedte}px: tikdoelen kleiner dan 44px`);
      assert.deepEqual(m.uitHetScherm, [], `${naam} ${breedte}px: knoppen buiten beeld`);
      assert.deepEqual(p.fouten, [], `${naam}: scriptfouten`);
      await p.sluit();
    }
  });
}

test('vier hoofdtabs op elke pagina, een duidelijke Clubwebsite-link en geen link naar de tv-plattegrond', SKIP, async () => {
  for (const naam of ['index.html', 'programma.html', 'uitslagen.html', 'fluiten.html', 'zaal.html']) {
    const p = await pagina();
    await p.ga(naam, naam === 'zaal.html' ? '?dag=2026-10-17&ronde=15:00' : '');
    assert.equal(await p.locator('.onderbalk a').count(), 4, naam);
    const club = p.locator('.clubblok a');
    assert.equal(await club.getAttribute('href'), 'https://volevo.nl/');
    assert.equal(await club.getAttribute('target'), '_blank'); assert.match(await club.getAttribute('rel'), /noopener/);
    assert.match(await club.textContent(), /Clubwebsite/);
    assert.equal(await p.locator('a[href*="volevo-plattegrond"]').count(), 0, naam);
    await p.sluit();
  }
});

// ── Zaalindeling De Fluit permanent bereikbaar, en de route naar de juiste sporthal ──
test('Zaalindeling De Fluit staat op elke pagina onder de teamkeuze, ook zonder wedstrijd vandaag, in dezelfde tab met terugroute', SKIP, async () => {
  for (const [naam, label] of [['index.html', 'Vandaag'], ['programma.html', 'Programma'], ['uitslagen.html', 'Uitslagen'], ['fluiten.html', 'Fluiten en tellen']]) {
    for (const team of [MA4, '']) {
      const p = await pagina({ team, klok: '2026-10-21T10:00:00+02:00' });   // woensdag: geen wedstrijden vandaag
      await p.ga(naam);
      const knop = p.locator('.zaalingang a');
      assert.equal(await knop.count(), 1, naam);
      assert.match(await knop.textContent(), /Zaalindeling De Fluit/);
      assert.ok(await knop.isVisible(), 'zichtbaar zonder doorklikken');
      // direct onder de teamkeuze
      assert.equal(await p.evaluate(() => document.querySelector('.teamkeuze').nextElementSibling.className), 'zaalingang');
      const paginas = []; p.context().on('page', (x) => paginas.push(x));
      await knop.click();
      await p.waitForURL(/zaal\.html/); await p.waitForSelector('svg.zaal');
      assert.equal(paginas.length, 0, 'zelfde tab');
      assert.equal(await p.locator('.onderbalk a').count(), 4);
      assert.match(await p.locator('#terug').textContent(), new RegExp('Terug naar ' + label));
      assert.equal(await p.locator('.zaalingang').count(), 0, 'op de zaalpagina zelf geen knop naar zichzelf');
      await p.click('#terug');
      await p.waitForURL(new RegExp(naam.replace('.', '\\.')));
      await p.sluit();
    }
  }
});

test('Route naar sporthal en getoond adres van De Fluit: Fluitpolderplein 3, nooit de zwembadcoördinaten of nummer 1', SKIP, async () => {
  const p = await pagina();
  for (const naam of ['index.html', 'programma.html']) {   // Fluiten/tellen biedt geen route aan
    await p.ga(naam);
    const routes = await p.locator('#inhoud a:has-text("Route naar sporthal")').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    const fluitRoutes = routes.filter((h) => /Fluit/.test(decodeURIComponent(h)));
    assert.ok(fluitRoutes.length >= 1, naam + ': minstens één route naar De Fluit');
    for (const h of fluitRoutes) {
      const q = new URL(h).searchParams.get('query');
      assert.equal(q, 'Sporthal De Fluit, Fluitpolderplein 3, 2262 ED Leidschendam');
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
  const uit = await p.locator('#inhoud a:has-text("Route naar sporthal")').evaluateAll((els) => els.map((e) => new URL(e.href).searchParams.get('query')).filter((q) => !/Fluit/.test(q)));
  assert.ok(uit.length >= 1);
  assert.ok(uit.every((q) => /^-?\d+\.\d+,-?\d+\.\d+$/.test(q)), 'coördinaten: ' + uit.slice(0, 3));
  await p.sluit();
});
