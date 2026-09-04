#!/usr/bin/env python3
"""Bouwt data/clubs.json: clubnaam -> Nevobo-organisatiecode.

De Nevobo-API kent geen zoek-op-naam (de naam-filter wordt genegeerd), dus we
lopen de volledige verenigingenlijst door. Dat is ~59 pagina's van 30, daarom
draait dit dagelijks en niet elk kwartier.
"""
import json, sys, time, urllib.request

BASE = 'https://api.nevobo.nl/relatiebeheer/verenigingen?itemsPerPage=30&page=%d'
UA = {'User-Agent': 'volevo-pages-mirror', 'Accept': 'application/ld+json'}


def get(url, tries=3):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            if n == tries - 1:
                raise
            print('  hertry na fout: %s' % e, file=sys.stderr)
            time.sleep(5)


clubs, page, total = {}, 1, None
while True:
    d = get(BASE % page)
    total = d.get('hydra:totalItems')
    members = d.get('hydra:member', [])
    if not members:
        break
    for v in members:
        code = (v.get('organisatiecode') or '').strip().upper()
        if not code:
            continue
        for key in (v.get('naam'), v.get('officielenaam')):
            key = (key or '').strip()
            # Kortste naam wint: "VELO" is bruikbaarder dan "v.v. VELO afd. volleybal"
            if key and (key not in clubs or len(key) < len(clubs.get(key, ''))):
                clubs[key] = code
    if len(clubs) and page % 10 == 0:
        print('  pagina %d, %d namen' % (page, len(clubs)), file=sys.stderr)
    if not d.get('hydra:view', {}).get('hydra:next'):
        break
    page += 1
    time.sleep(0.3)

if total and len(clubs) < total * 0.8:
    sys.exit('Te weinig clubs opgehaald (%d van %d) - bestand niet overschreven'
             % (len(clubs), total))

out = dict(sorted(clubs.items(), key=lambda kv: kv[0].lower()))
with open('data/clubs.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
print('%d clubnamen weggeschreven (%s verenigingen in de API)' % (len(out), total))
