#!/usr/bin/env python3
"""Mailt de wijzigingen van deze run (uit scripts/detect_wijzigingen.py --nieuw) naar
wie ze moet weten: de wedstrijdsecretaris, de officialdelers en de beheerder.

Gebruik:  python3 scripts/meld_wijzigingen.py nieuw.json

Instellingen via omgevingsvariabelen (GitHub: Settings > Secrets and variables > Actions):
  SMTP_HOST, SMTP_PORT (standaard 587), SMTP_USER, SMTP_PASSWORD   inlog van de mailbox
  MAIL_VAN        afzender, standaard SMTP_USER
  MAIL_AAN        ontvangers, gescheiden door komma's
  PAGINA_URL      adres van volevo-wijzigingen.html in de mail (optioneel)
Ontbreekt SMTP_HOST of MAIL_AAN, dan wordt er niets verstuurd en blijft het bij een melding
in de log: de wijzigingenpagina werkt dan gewoon.
"""
import datetime, json, os, smtplib, sys
from email.message import EmailMessage

SOORT = {'verplaatst': 'Verplaatst', 'vervallen': 'Vervallen', 'hersteld': 'Weer gepland',
         'nieuw': 'Nieuwe wedstrijd', 'verwijderd': 'Verwijderd uit Nevobo', 'andere zaal': 'Andere zaal'}
DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']


def wanneer(p):
    if not p:
        return '-'
    t = datetime.datetime.fromisoformat(p['tijdstip'])
    return '%s %d-%d %02d:%02d (%s)' % (DAGEN[t.weekday()], t.day, t.month, t.hour, t.minute, p.get('hal') or 'zaal onbekend')


def veldnaam(v):
    if not v:
        return None
    n = int(v.rstrip('G'))
    return '%s %d%s' % ('Tas' if n <= 3 else 'Bocht', n, ' groot' if v.endswith('G') else '')


def regel(w):
    r = ['%s: %s - %s' % (SOORT.get(w['soort'], w['soort']), w['thuis'], w['uit'])]
    if w['van']:
        r.append('  was:    ' + wanneer(w['van']))
    if w['naar'] and w['soort'] in ('verplaatst', 'andere zaal', 'nieuw', 'hersteld'):
        r.append('  wordt:  ' + wanneer(w['naar']))
    if w.get('veldVoorheen'):
        r.append('  veld was %s: kies opnieuw een veld voor de nieuwe tijd' % veldnaam(w['veldVoorheen']))
    if w.get('officials'):
        r.append('  officials op de oude tijd: ' + ', '.join('%s %s' % (o['taak'].split(' (')[0], o['team']) for o in w['officials'])
                 + ' (laat het officialschema aanpassen)')
    return '\n'.join(r)


def main(pad):
    with open(pad, encoding='utf-8') as f:
        nieuw = json.load(f)
    if not nieuw:
        print('Geen wijzigingen om te melden.')
        return
    host, aan = os.environ.get('SMTP_HOST'), [a.strip() for a in os.environ.get('MAIL_AAN', '').split(',') if a.strip()]
    tekst = ('Er is iets veranderd in het wedstrijdschema van De Fluit:\n\n' + '\n\n'.join(regel(w) for w in nieuw) + '\n')
    if os.environ.get('PAGINA_URL'):
        tekst += '\nMeer details, vrije velden en wat er nog moet gebeuren: ' + os.environ['PAGINA_URL'] + '\n'
    if not host or not aan:
        print('E-mail niet ingesteld (SMTP_HOST en MAIL_AAN); niet verstuurd. Inhoud:\n\n' + tekst)
        return
    bericht = EmailMessage()
    bericht['Subject'] = '%d wijziging(en) in het wedstrijdschema: %s' % (len(nieuw), nieuw[0]['thuis'] + (' e.a.' if len(nieuw) > 1 else ''))
    bericht['From'] = os.environ.get('MAIL_VAN') or os.environ.get('SMTP_USER', '')
    bericht['To'] = ', '.join(aan)
    bericht.set_content(tekst)
    with smtplib.SMTP(host, int(os.environ.get('SMTP_PORT', '587')), timeout=60) as s:
        s.starttls()
        if os.environ.get('SMTP_USER'):
            s.login(os.environ['SMTP_USER'], os.environ.get('SMTP_PASSWORD', ''))
        s.send_message(bericht)
    print('Gemaild naar %d ontvanger(s).' % len(aan))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
