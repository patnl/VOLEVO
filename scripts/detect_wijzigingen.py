#!/usr/bin/env python3
"""Bepaalt wat er sinds de vorige run in data/matches.json is veranderd en bewaart
dat in data/wijzigingen.json (het logboek dat volevo-wijzigingen.html toont).

Vergelijkt data/matches.json met de versie in git (HEAD), dus draai dit direct
na scripts/build_matches.py en vóór het committen. Herkend worden:
  verplaatst   zelfde teams, ander tijdstip (en eventueel andere zaal)
  vervallen    status werd 'vervallen'
  hersteld     status was 'vervallen' en is weer gepland
  nieuw        wedstrijd die er eerst niet was
  verwijderd   wedstrijd die verdwenen is zonder nieuwe datum
  andere zaal  zelfde tijdstip, andere sporthal

Per wijziging staan erbij: het veld dat de oude wedstrijd had (uit overrides.json)
en wie er officialbeurten had (uit officials.json). Veld en officials hangen aan
datum, tijd en teams; bij een verplaatsing raken ze zonder tussenkomst kwijt.

Gebruik:  python3 scripts/detect_wijzigingen.py [--nieuw pad.json] [--oud matches.json]
  --nieuw  schrijft de wijzigingen van deze run apart weg (voor de e-mail)
  --oud    vergelijk met dit bestand in plaats van met git HEAD (voor testen)
"""
import datetime, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, 'data/wijzigingen.json')
MAX_AANTAL, MAX_DAGEN = 150, 60


def laad(pad):
    with open(pad, encoding='utf-8') as f:
        return json.load(f)


def sleutel(w):
    return '%s|%s|%s' % (w['tijdstip'], w['thuis'], w['uit'])


def plek(w):
    return {'tijdstip': w['tijdstip'], 'hal': w.get('hal'), 'plaats': w.get('plaats'), 'status': w.get('status')}


def oude_wedstrijden(oud_pad):
    if oud_pad:
        return laad(oud_pad)['wedstrijden']
    uit = subprocess.run(['git', 'show', 'HEAD:data/matches.json'], cwd=ROOT, capture_output=True)
    if uit.returncode != 0:
        return None          # eerste run: niets om mee te vergelijken
    return json.loads(uit.stdout.decode('utf-8'))['wedstrijden']


def bepaal(oud, nieuw, velden, officials):
    o = {sleutel(w): w for w in oud}
    n = {sleutel(w): w for w in nieuw}
    nu = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()
    uit = []

    def maak(soort, w_oud, w_nieuw):
        basis = w_oud or w_nieuw
        k_oud = sleutel(w_oud) if w_oud else None
        return {
            'id': '%s|%s|%s' % (soort, k_oud, sleutel(w_nieuw) if w_nieuw else None),
            'gezien': nu, 'soort': soort, 'thuis': basis['thuis'], 'uit': basis['uit'],
            'van': plek(w_oud) if w_oud else None,
            'naar': plek(w_nieuw) if w_nieuw else None,
            'veldVoorheen': velden.get(k_oud) if k_oud else None,
            'officials': officials.get(k_oud, []) if k_oud else [],
        }

    weg = [o[k] for k in o if k not in n]
    erbij = [n[k] for k in n if k not in o]
    for w in weg:
        if w.get('status') == 'gespeeld':
            continue
        kandidaat = next((a for a in erbij if a['thuis'] == w['thuis'] and a['uit'] == w['uit']), None)
        if kandidaat:
            erbij.remove(kandidaat)
            uit.append(maak('verplaatst', w, kandidaat))
        else:
            uit.append(maak('verwijderd', w, None))
    for a in erbij:
        uit.append(maak('nieuw', None, a))
    for k in o:
        if k in n and o[k].get('status') != n[k].get('status'):
            if n[k].get('status') == 'vervallen':
                uit.append(maak('vervallen', o[k], n[k]))
            elif o[k].get('status') == 'vervallen' and n[k].get('status') == 'gepland':
                uit.append(maak('hersteld', o[k], n[k]))
        elif k in n and o[k].get('hal') != n[k].get('hal'):
            uit.append(maak('andere zaal', o[k], n[k]))
    return uit


def main(argv):
    nieuw_pad = argv[argv.index('--nieuw') + 1] if '--nieuw' in argv else None
    oud_pad = argv[argv.index('--oud') + 1] if '--oud' in argv else None
    oud = oude_wedstrijden(oud_pad)
    gevonden = []
    if oud is not None:
        nieuw = laad(os.path.join(ROOT, 'data/matches.json'))['wedstrijden']
        velden = laad(os.path.join(ROOT, 'data/overrides.json')).get('velden', {})
        officials = laad(os.path.join(ROOT, 'data/officials.json')).get('perWedstrijd', {})
        gevonden = bepaal(oud, nieuw, velden, officials)

    log = laad(LOG)['wijzigingen'] if os.path.exists(LOG) else []
    bekend = {w['id'] for w in log}
    toe = [w for w in gevonden if w['id'] not in bekend]
    grens = (datetime.datetime.now().astimezone() - datetime.timedelta(days=MAX_DAGEN)).isoformat()
    log = sorted([w for w in log + toe if w['gezien'] >= grens], key=lambda w: w['gezien'], reverse=True)[:MAX_AANTAL]
    with open(LOG, 'w', encoding='utf-8') as f:
        json.dump({'bijgewerkt': datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(), 'wijzigingen': log},
                  f, ensure_ascii=False, indent=2)
        f.write('\n')
    if nieuw_pad:
        with open(nieuw_pad, 'w', encoding='utf-8') as f:
            json.dump(toe, f, ensure_ascii=False, indent=2)
    print('%d nieuwe wijziging(en); logboek bevat er %d' % (len(toe), len(log)))
    for w in toe:
        print('  %s: %s - %s' % (w['soort'], w['thuis'], w['uit']))


if __name__ == '__main__':
    main(sys.argv[1:])
