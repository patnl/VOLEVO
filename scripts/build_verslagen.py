#!/usr/bin/env python3
"""Schrijft per gespeelde VOLEVO-wedstrijd een kort verslag naar data/verslagen.json.

Leest data/resultaten.xml (de gespiegelde Nevobo-uitslagen) en laat Claude per nieuwe
uitslag een of twee zinnen schrijven, alleen op basis van score en setstanden.
Zonder ANTHROPIC_API_KEY doet het script niets (en slaagt), zodat de workflow veilig
kan draaien voordat het secret is ingesteld. Een fout bij een wedstrijd slaat alleen die
wedstrijd over; bestaande verslagen blijven staan.
"""
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

BRON = 'data/resultaten.xml'
UIT = 'data/verslagen.json'
MODEL = os.environ.get('VERSLAG_MODEL', 'claude-haiku-5-5')
MAX_PER_RUN = 10          # begrenst de kosten bij een eerste run of na een storing
NIEUW_BINNEN_DAGEN = 14   # oudere uitslagen krijgen geen verslag meer
BEWAAR_DAGEN = 60         # oudere verslagen worden opgeruimd


def uitslagen(xml_pad):
    """Gespeelde wedstrijden met minstens een VOLEVO-team: lijst van dicts."""
    out = []
    for item in ET.parse(xml_pad).getroot().iter('item'):
        titel = (item.findtext('title') or '').strip()
        uitleg = item.findtext('description') or ''
        status = next((e.text for e in item if e.tag.endswith('status')), '') or ''
        if status.strip() == 'vervallen' or ', Uitslag:' not in titel:
            continue
        paar, score = titel.split(', Uitslag:', 1)
        teams = paar.split(' - ', 1)
        if len(teams) != 2 or not any(t.strip().upper().startswith('VOLEVO') for t in teams):
            continue
        m = re.search(r'Setstanden:\s*([^\r\n<]+)', uitleg, re.I)
        try:
            tijd = parsedate_to_datetime(item.findtext('pubDate') or '')
        except (TypeError, ValueError):
            continue
        out.append({'id': (item.findtext('guid') or item.findtext('link') or '').strip(),
                    'thuis': teams[0].strip(), 'uit': teams[1].strip(),
                    'score': score.strip(), 'sets': m.group(1).strip() if m else '', 'tijd': tijd})
    return out


def prompt(u):
    return (
        'Schrijf een kort, vrolijk wedstrijdverslag in het Nederlands van maximaal twee zinnen '
        'voor de app van volleybalclub VOLEVO uit Leidschendam. Gebruik alleen deze gegevens, '
        'verzin geen spelers, rally\'s of details en gebruik geen emoji.\n'
        f'Thuisteam: {u["thuis"]}\nUitteam: {u["uit"]}\nEindstand in sets (thuis-uit): {u["score"]}\n'
        f'Setstanden (thuis-uit): {u["sets"] or "onbekend"}\n'
        'Is het een wedstrijd tegen een ander VOLEVO-team, blijf dan neutraal. '
        'Bij verlies: sportief en opbeurend. Geef alleen de tekst terug.')


def vraag_claude(u, sleutel):
    body = json.dumps({'model': MODEL, 'max_tokens': 200,
                       'messages': [{'role': 'user', 'content': prompt(u)}]}).encode()
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=body, headers={
        'x-api-key': sleutel, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    tekst = ''.join(b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text').strip()
    return tekst[:400]


def laad_bestaand():
    try:
        with open(UIT, encoding='utf-8') as f:
            return json.load(f).get('verslagen', {})
    except (OSError, ValueError):
        return {}


def main():
    sleutel = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not sleutel:
        print('Geen ANTHROPIC_API_KEY ingesteld - geen verslagen gemaakt')
        return 0
    nu = datetime.now(timezone.utc)
    verslagen = laad_bestaand()
    nieuw = [u for u in uitslagen(BRON) if u['id'] and u['id'] not in verslagen
             and nu - u['tijd'] <= timedelta(days=NIEUW_BINNEN_DAGEN)]
    nieuw.sort(key=lambda u: u['tijd'], reverse=True)
    gemaakt = 0
    for u in nieuw[:MAX_PER_RUN]:
        try:
            tekst = vraag_claude(u, sleutel)
        except Exception as e:  # een mislukte wedstrijd mag de rest niet blokkeren
            print('Verslag mislukt voor %s - %s: %s' % (u['thuis'], u['uit'], e), file=sys.stderr)
            continue
        if tekst:
            verslagen[u['id']] = {'tekst': tekst, 'gemaakt': nu.isoformat(), 'tijd': u['tijd'].isoformat()}
            gemaakt += 1
    grens = nu - timedelta(days=BEWAAR_DAGEN)
    verslagen = {k: v for k, v in verslagen.items()
                 if (datetime.fromisoformat(v.get('tijd', nu.isoformat())) > grens)}
    os.makedirs('data', exist_ok=True)
    with open(UIT, 'w', encoding='utf-8') as f:
        json.dump({'verslagen': verslagen}, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('%d nieuwe verslagen, %d in totaal' % (gemaakt, len(verslagen)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
