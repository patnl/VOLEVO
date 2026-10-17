"""Spiegel de officiële Nevobo-standtekst per VOLEVO-team voor de telefoonapp."""
import json
from datetime import datetime, timezone
from pathlib import Path
import time
import urllib.parse
import urllib.request

API = 'https://api.nevobo.nl'
CLUB = '/relatiebeheer/verenigingen/cnz6b97'
ROOT = Path(__file__).resolve().parents[1]


def get(path):
    if not path.startswith('/competitie/teams'):
        raise ValueError('Onverwachte teambron')
    for attempt in range(3):
        try:
            request = urllib.request.Request(API + path, headers={
                'Accept': 'application/ld+json', 'User-Agent': 'volevo-pages-mirror'})
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def normalize(team):
    ref, name = team.get('@id', ''), team.get('naam', '')
    if team.get('vereniging') != CLUB or not ref.startswith('/competitie/teams/cnz6b97/') or not name.startswith('VOLEVO '):
        raise ValueError('Onverwacht team in de clubgegevens')
    return name, {'stand': team.get('standpositietekst') or None,
                  'seizoen': team.get('seizoen', '').removeprefix('/seizoenen/'),
                  'bron': 'https://www.volleybal.nl' + ref.replace('/competitie/teams/', '/competitie/vereniging/', 1)}


def build(fetch=get):
    path = '/competitie/teams?' + urllib.parse.urlencode({'vereniging': CLUB, 'itemsPerPage': 30})
    teams, seen, expected = {}, set(), None
    while path:
        if path in seen:
            raise ValueError('Herhaalde Nevobo-pagina')
        seen.add(path)
        data = fetch(path)
        expected = data.get('hydra:totalItems') if expected is None else expected
        for team in data['hydra:member']:
            name, value = normalize(team)
            if name in teams:
                raise ValueError('Dubbele teamnaam: ' + name)
            teams[name] = value
        path = data.get('hydra:view', {}).get('hydra:next')
    if not teams or expected != len(teams):
        raise ValueError('Onvolledige teamgegevens; bestaande standen blijven bewaard')
    return {'opgehaald': datetime.now(timezone.utc).isoformat(), 'teams': teams}


if __name__ == '__main__':
    data = build()
    destination = ROOT / 'data/teamstanden.json'
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(destination)
    print('Officiële standtekst opgehaald voor', len(data['teams']), 'teams')
