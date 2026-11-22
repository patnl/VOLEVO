#!/usr/bin/env python3
"""Schrijft per gespeelde VOLEVO-wedstrijd een kort verslag naar data/verslagen.json.

Leest data/resultaten.xml (de gespiegelde Nevobo-uitslagen) en laat een taalmodel per nieuwe
uitslag een of twee zinnen schrijven, alleen op basis van score en setstanden.
Het model en de aanbieder staan in de omgeving (LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL,
LLM_API_KEY; zie scripts/llm.py), dus Anthropic, Claude in Foundry en OpenAI werken allemaal.
Zonder sleutel doet het script niets (en slaagt), zodat de workflow veilig kan draaien voordat
het secret is ingesteld. Met --proef schrijft het niets weg en toont het alleen de teksten.
Een fout bij een wedstrijd slaat alleen die wedstrijd over; bestaande verslagen blijven staan.

Elke tekst wordt gecontroleerd voordat hij wordt opgeslagen (zie afkeuring): geen emoji,
geen hashtags, niet langer dan twee zinnen of 400 tekens. Een afgekeurde tekst wordt eenmaal
opnieuw gevraagd; lukt het dan nog niet, dan krijgt die wedstrijd geen verslag en probeert de
volgende run het opnieuw.
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402

BRON = 'data/resultaten.xml'
UIT = 'data/verslagen.json'
MAX_PER_RUN = 10          # begrenst de kosten bij een eerste run of na een storing
NIEUW_BINNEN_DAGEN = 14   # oudere uitslagen krijgen geen verslag meer
BEWAAR_DAGEN = 60         # oudere verslagen worden opgeruimd

MAX_TEKENS = 400          # een langere tekst past niet op de kaart en wordt afgekeurd, niet afgekapt
MAX_ZINNEN = 2
POGINGEN = 2              # per wedstrijd per run: eerste poging plus een nieuwe bij afkeuring
# Emoji en pictogrammen: de blokken met symbolen en plaatjes, plus de tekens die ze samenvoegen
EMOJI = re.compile('[\U0001F000-\U0001FAFF\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF'
                   '\u200D\uFE0E\uFE0F]')
HASHTAG = re.compile(r'(?:^|\s)#\w')


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


def afkeuring(tekst):
    """Geeft de reden waarom een tekst niet getoond mag worden, of None als hij goed is."""
    tekst = tekst.strip()
    if not tekst:
        return 'leeg'
    if EMOJI.search(tekst):
        return 'bevat emoji'
    if HASHTAG.search(tekst):
        return 'bevat een hashtag'
    if '\n' in tekst:
        return 'bestaat uit meerdere regels'
    if len(tekst) > MAX_TEKENS:
        return 'te lang (%d tekens, maximaal %d)' % (len(tekst), MAX_TEKENS)
    zinnen = [z for z in re.split(r'(?<=[.!?])\s+', tekst) if z.strip()]
    if len(zinnen) > MAX_ZINNEN:
        return '%d zinnen (maximaal %d)' % (len(zinnen), MAX_ZINNEN)
    return None


def schrijf_verslag(u, cfg, vraag=llm.vraag):
    """Een goedgekeurde tekst, of None als het model na POGINGEN keer nog niets bruikbaars gaf."""
    for poging in range(1, POGINGEN + 1):
        tekst = vraag(prompt(u), max_tokens=300, cfg=cfg).strip()
        reden = afkeuring(tekst)
        if reden is None:
            return tekst
        print('Verslag afgekeurd (poging %d van %d) voor %s - %s: %s' % (poging, POGINGEN, u['thuis'], u['uit'], reden),
              file=sys.stderr)
    return None


def laad_bestaand():
    try:
        with open(UIT, encoding='utf-8') as f:
            return json.load(f).get('verslagen', {})
    except (OSError, ValueError):
        return {}


def main(argv=None):
    proef = '--proef' in (argv if argv is not None else sys.argv[1:])
    try:
        cfg = llm.configuratie()
    except llm.LlmFout as e:
        print('Fout: %s' % e, file=sys.stderr)
        return 1
    if not cfg['sleutel']:
        print('Geen LLM_API_KEY ingesteld - geen verslagen gemaakt')
        return 0
    nu = datetime.now(timezone.utc)
    verslagen = laad_bestaand()
    uitgelezen = uitslagen(BRON)
    # Een proef bekijkt de nieuwste uitslagen, ook als daar al een verslag van is
    kandidaten = [u for u in uitgelezen if u['id'] and (proef or u['id'] not in verslagen)
                  and nu - u['tijd'] <= timedelta(days=NIEUW_BINNEN_DAGEN)]
    kandidaten.sort(key=lambda u: u['tijd'], reverse=True)
    kandidaten = kandidaten[:3] if proef else kandidaten[:MAX_PER_RUN]
    print('%s via %s, model %s' % ('Proef' if proef else 'Verslagen', cfg['provider'], cfg['model']))
    gemaakt = 0
    zonder = 0  # wedstrijden zonder bruikbare tekst, na afkeuring
    for u in kandidaten:
        try:
            tekst = schrijf_verslag(u, cfg)
        except Exception as e:  # een mislukte wedstrijd mag de rest niet blokkeren
            print('Verslag mislukt voor %s - %s: %s' % (u['thuis'], u['uit'], e), file=sys.stderr)
            continue
        if not tekst:
            zonder += 1
            continue
        if proef:
            print('\n%s - %s (%s)\n  %s' % (u['thuis'], u['uit'], u['score'], tekst))
        else:
            verslagen[u['id']] = {'tekst': tekst, 'gemaakt': nu.isoformat(), 'tijd': u['tijd'].isoformat(),
                                  'model': cfg['model']}
        gemaakt += 1
    if proef:
        print('\nProef klaar: %d tekst(en), %d zonder bruikbare tekst, niets opgeslagen' % (gemaakt, zonder))
        return 0
    grens = nu - timedelta(days=BEWAAR_DAGEN)
    verslagen = {k: v for k, v in verslagen.items()
                 if (datetime.fromisoformat(v.get('tijd', nu.isoformat())) > grens)}
    os.makedirs('data', exist_ok=True)
    with open(UIT, 'w', encoding='utf-8') as f:
        json.dump({'verslagen': verslagen}, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('%d nieuwe verslagen, %d zonder bruikbare tekst, %d in totaal' % (gemaakt, zonder, len(verslagen)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
