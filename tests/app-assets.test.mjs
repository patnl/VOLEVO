import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// HTML en JavaScript kunnen na een uitrol uit verschillende caches komen.
// Elk appbestand moet daarom een URL krijgen die bij zijn inhoud hoort.
const app = new URL('../app/', import.meta.url);
for (const page of readdirSync(app).filter((name) => name.endsWith('.html'))) {
  test(page + ': scripts en stijlen krijgen een versie die bij hun inhoud hoort', () => {
    const html = readFileSync(new URL(page, app), 'utf8');
    const tags = html.match(/<(?:script|link)\b[^>]*>/g) || [];
    let count = 0;
    for (const tag of tags) {
      const ref = /\b(?:src|href)=["']([^"']+)["']/.exec(tag)?.[1];
      if (!ref || /^(?:https?:)?\/\//.test(ref)) continue;
      const url = new URL(ref, new URL(page, app));
      if (!/\.(?:js|css)$/.test(url.pathname)) continue;
      const expected = createHash('sha256').update(readFileSync(new URL(url.pathname, 'file:'))).digest('hex').slice(0, 12);
      assert.equal(url.searchParams.get('v'), expected, ref + ' kan anders een oud gecachet bestand laden');
      count++;
    }
    assert.ok(count >= 3, 'de app moet zijn gedeelde scripts en stylesheet blijven laden');
  });
}
