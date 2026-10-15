#!/usr/bin/env python3
"""Zet de veldindeling uit het wedstrijdschema van het bestuur in data/overrides.json.

Gebruik:  python3 scripts/import_veldindeling.py <schema.xlsx>
Vereist:  pip install openpyxl

Het Excel-bestand (blad 'Wedstrijden') heeft per wedstrijd een datum, tijd,
thuis- en uitteam, zaalcode en veld. In De Fluit (zaalcode LSDFL) wijkt het
veld uit het bestuursschema vaak af van het Nevobo-nummer, dus die komen als
correctie in overrides.json (sleutel: tijdstip|thuis|uit, zoals de pagina's
verwachten). Andere sporthallen komen in het schema overeen met Nevobo en
worden overgeslagen. Bestaande correcties blijven staan; alleen nieuwe of
gewijzigde velden worden bijgewerkt.

Veld = nummer: 1 t/m 3 is De Tas, 4 t/m 7 De Bocht (zie velden.js).
Wedstrijden die niet in data/matches.json staan (verplaatst of vervallen)
worden gemeld en niet verwerkt: de sleutel zou nergens op passen.
"""
import datetime, json, os, sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLUIT = 'LSDFL'


def main(pad):
    ws = openpyxl.load_workbook(pad, data_only=True)['Wedstrijden']
    rijen = [r for r in list(ws.iter_rows(values_only=True))[1:] if r[0]]

    with open(os.path.join(ROOT, 'data/matches.json'), encoding='utf-8') as f:
        wedstrijden = json.load(f)['wedstrijden']
    # "jjjj-mm-dd uu:mm|thuis|uit" -> tijdstip met de juiste zomer/wintertijd
    per_sleutel = {}
    for w in wedstrijden:
        t = datetime.datetime.fromisoformat(w['tijdstip'])
        per_sleutel[(t.strftime('%Y-%m-%d %H:%M'), w['thuis'], w['uit'])] = w['tijdstip']

    pad_over = os.path.join(ROOT, 'data/overrides.json')
    with open(pad_over, encoding='utf-8') as f:
        over = json.load(f)
    velden = over.setdefault('velden', {})

    nieuw = gewijzigd = 0
    niet_gevonden, geen_nummer, tegenspraak = [], [], []
    for r in rijen:
        datum, tijd, thuis, uit, zaalcode, zaal, veld = r[0], r[2], r[3], r[4], r[11], r[6], r[7]
        if zaalcode != FLUIT or not (isinstance(tijd, str) and tijd[:2].isdigit()):
            continue  # andere hal, of 'Vervallen' in de tijdkolom
        label = '%s %s - %s' % (datum.strftime('%d-%m') + ' ' + str(tijd), thuis, uit)
        tijdstip = per_sleutel.get((datum.strftime('%Y-%m-%d') + ' ' + tijd, thuis, uit))
        if not tijdstip:
            niet_gevonden.append(label)
            continue
        if not isinstance(veld, int) or not 1 <= veld <= 7:
            geen_nummer.append('%s (veld %r)' % (label, veld))
            continue
        # De kolom Zaal (Tas/Bocht) spreekt soms het veldnummer tegen; het nummer wint
        if (zaal == 'Tas' and veld > 3) or (zaal == 'Bocht' and veld < 4):
            tegenspraak.append('%s: zaal %s, veld %d' % (label, zaal, veld))
        sleutel = '%s|%s|%s' % (tijdstip, thuis, uit)
        if sleutel not in velden:
            nieuw += 1
        elif velden[sleutel] != str(veld):
            gewijzigd += 1
        velden[sleutel] = str(veld)

    over['velden'] = dict(sorted(velden.items()))
    over['gewijzigd'] = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()
    with open(pad_over, 'w', encoding='utf-8') as f:
        json.dump(over, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('nieuw: %d, gewijzigd: %d, totaal: %d' % (nieuw, gewijzigd, len(velden)))
    for kop, lijst in (('Niet in matches.json (overgeslagen)', niet_gevonden),
                       ('Geen bruikbaar veldnummer (overgeslagen)', geen_nummer),
                       ('Zaal spreekt veldnummer tegen (nummer gebruikt)', tegenspraak)):
        if lijst:
            print('\n%s:' % kop)
            for x in lijst:
                print('  ' + x)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
