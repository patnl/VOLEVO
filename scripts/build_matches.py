#!/usr/bin/env python3
"""Bouwt data/matches.json: per VOLEVO-wedstrijd de sporthal, het veld en de coordinaten.

De RSS-feed bevat geen veldnummer. De Nevobo-API wel: /competitie/wedstrijden
kan op vereniging gefilterd worden en verwijst per wedstrijd naar speelveld,
speelzaal en sporthal (met gevalideerd adres en coordinaten).

Sub-resources (teams, hallen, velden) worden gecachet; in de praktijk zijn dat
er enkele tientallen voor het hele seizoen.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

API = 'https://api.nevobo.nl'
CLUB = '/relatiebeheer/verenigingen/cnz6b97'
UA = {'User-Agent': 'volevo-pages-mirror', 'Accept': 'application/ld+json'}

_cache = {}


def get(path, tries=3):
    if path in _cache:
        return _cache[path]
    url = API + path if path.startswith('/') else path
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read().decode('utf-8'))
            _cache[path] = d
            return d
        except urllib.error.HTTPError as e:
            if e.code == 404:
                _cache[path] = None
                return None
            if n == tries - 1:
                raise
            time.sleep(5)
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(5)


def teamnaam(ref):
    d = get(ref)
    return (d or {}).get('omschrijving') or ''


def wedstrijden():
    q = urllib.parse.urlencode({'vereniging': CLUB, 'itemsPerPage': 30})
    page, out = 1, []
    while True:
        d = get('/competitie/wedstrijden?%s&page=%d' % (q, page))
        out += d.get('hydra:member', [])
        if not d.get('hydra:view', {}).get('hydra:next'):
            return out
        page += 1
        time.sleep(0.2)


matches = []
for w in wedstrijden():
    teams = w.get('teams') or []
    if len(teams) < 2:
        continue
    hal = get(w['sporthal']) if w.get('sporthal') else None
    veld = get(w['speelveld']) if w.get('speelveld') else None
    adres = (hal or {}).get('adres') or {}

    def getal(x):
        try:
            return round(float(x), 6)
        except (TypeError, ValueError):
            return None

    straat = adres.get('straat') or ''
    nr = adres.get('huisnummer')
    m = {
        'tijdstip': w.get('tijdstip') or w.get('datum'),
        'thuis': teamnaam(teams[0]),
        'uit': teamnaam(teams[1]),
        'status': (w.get('status') or {}).get('waarde'),
    }
    if hal:
        m['hal'] = hal.get('naam')
        m['plaats'] = adres.get('plaats') or hal.get('plaats')
        m['adres'] = (straat + (' ' + str(nr) if nr is not None else '')).strip()
        m['postcode'] = adres.get('postcode')
        lat, lon = getal(adres.get('breedtegraad')), getal(adres.get('lengtegraad'))
        if lat and lon:
            m['lat'], m['lon'] = lat, lon
    if veld and veld.get('aanduiding'):
        m['veld'] = veld['aanduiding']
    if w.get('urlDwf'):
        m['dwf'] = w['urlDwf']
    matches.append(m)

if not matches:
    sys.exit('Geen wedstrijden opgehaald - matches.json niet overschreven')

met_veld = sum(1 for m in matches if m.get('veld'))
if met_veld < len(matches) * 0.5:
    sys.exit('Slechts %d van %d wedstrijden heeft een veld - ziet er onbetrouwbaar uit'
             % (met_veld, len(matches)))

matches.sort(key=lambda m: (m['tijdstip'] or '', m['thuis']))
data = {'gegenereerd': time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime()),
        'wedstrijden': matches}

os.makedirs('data', exist_ok=True)
with open('data/matches.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=False)
    f.write('\n')
print('%d wedstrijden weggeschreven, %d met veldnummer, %d API-resources opgehaald'
      % (len(matches), met_veld, len(_cache)))
