#!/usr/bin/env python3
"""Een kleine, gedeelde laag om een taalmodel aan te roepen, zonder afhankelijkheden.

Werkt met twee soorten API's, op elke plek waar die draaien:

  provider 'anthropic'  Messages API van Anthropic. Dit is ook Claude in Microsoft Foundry (Azure).
      LLM_BASE_URL  https://api.anthropic.com                          (standaard)
                    https://<resource>.services.ai.azure.com/anthropic (Claude in Foundry)
      LLM_MODEL     claude-haiku-5-5 (standaard), claude-sonnet-5-5, claude-fable-5-2, ...
                    In Foundry: de naam van je deployment.
      Sleutel gaat in de header x-api-key.

  provider 'openai'     Chat Completions API van OpenAI, Azure OpenAI en alles dat daarop lijkt.
      LLM_BASE_URL  https://api.openai.com/v1                          (standaard)
                    https://<resource>.openai.azure.com/openai/v1      (Azure OpenAI in Foundry)
      LLM_MODEL     de modelnaam, of in Azure de naam van je deployment.
      De sleutel gaat mee in api-key (Azure) en Authorization: Bearer (OpenAI).

Instellingen komen uit de omgeving, zodat wisselen van model of aanbieder geen codewijziging is:
  LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
Terugvallen op de oude namen kan: ANTHROPIC_API_KEY en VERSLAG_MODEL.

Proberen vanaf de opdrachtregel, voor welk ander doel dan ook:
  LLM_API_KEY=... python3 scripts/llm.py "Schrijf een grap over volleybal"

Een sleutel verlaat dit proces alleen richting LLM_BASE_URL, en die moet https zijn.
"""
import json
import os
import sys
import urllib.request

STANDAARD = {
    'anthropic': {'base_url': 'https://api.anthropic.com', 'model': 'claude-haiku-5-5'},
    'openai': {'base_url': 'https://api.openai.com/v1', 'model': ''},
}


class LlmFout(Exception):
    pass


def configuratie(env=None):
    """Leest de instellingen uit de omgeving. Geeft een dict; 'sleutel' is leeg als er geen is."""
    env = os.environ if env is None else env
    provider = (env.get('LLM_PROVIDER') or 'anthropic').strip().lower()
    if provider not in STANDAARD:
        raise LlmFout("Onbekende LLM_PROVIDER '%s' (kies anthropic of openai)" % provider)
    basis = STANDAARD[provider]
    return {
        'provider': provider,
        'base_url': (env.get('LLM_BASE_URL') or basis['base_url']).strip(),
        'model': (env.get('LLM_MODEL') or env.get('VERSLAG_MODEL') or basis['model']).strip(),
        'sleutel': (env.get('LLM_API_KEY') or env.get('ANTHROPIC_API_KEY') or '').strip(),
    }


def bouw_verzoek(cfg, prompt, max_tokens=300):
    """Geeft (url, headers, body als bytes) voor de gekozen aanbieder."""
    basis = cfg['base_url'].rstrip('/')
    if not basis.startswith('https://'):
        raise LlmFout('LLM_BASE_URL moet met https:// beginnen')
    if not cfg['model']:
        raise LlmFout('LLM_MODEL ontbreekt (bij OpenAI en Azure is dat de modelnaam of de naam van je deployment)')
    if cfg['provider'] == 'anthropic':
        if basis.endswith('/v1/messages'):
            basis = basis[:-len('/v1/messages')]
        url = basis + '/v1/messages'
        headers = {'x-api-key': cfg['sleutel'], 'anthropic-version': '2023-06-01',
                   'content-type': 'application/json'}
        body = {'model': cfg['model'], 'max_tokens': max_tokens,
                'messages': [{'role': 'user', 'content': prompt}]}
    else:
        if basis.endswith('/chat/completions'):
            basis = basis[:-len('/chat/completions')]
        url = basis + '/chat/completions'
        headers = {'api-key': cfg['sleutel'], 'authorization': 'Bearer ' + cfg['sleutel'],
                   'content-type': 'application/json'}
        # Nieuwere OpenAI-modellen kennen alleen max_completion_tokens, en redeneermodellen
        # gebruiken een deel daarvan voor nadenken: geef dus ruim budget.
        body = {'model': cfg['model'], 'max_completion_tokens': max(max_tokens, 1500),
                'messages': [{'role': 'user', 'content': prompt}]}
    return url, headers, json.dumps(body).encode('utf-8')


def lees_antwoord(provider, data):
    """Haalt de tekst uit het antwoord van de aanbieder."""
    if provider == 'anthropic':
        return ''.join(b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text').strip()
    keuzes = data.get('choices') or []
    if not keuzes:
        return ''
    inhoud = (keuzes[0].get('message') or {}).get('content')
    return (inhoud or '').strip()


def vraag(prompt, max_tokens=300, cfg=None, openen=urllib.request.urlopen):
    """Stelt een vraag en geeft de tekst terug. Gooit LlmFout bij een configuratie- of netwerkprobleem."""
    cfg = cfg or configuratie()
    if not cfg['sleutel']:
        raise LlmFout('Geen LLM_API_KEY ingesteld')
    url, headers, body = bouw_verzoek(cfg, prompt, max_tokens)
    try:
        with openen(urllib.request.Request(url, data=body, headers=headers), timeout=60) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        # Alleen de statuscode, niet de body: die kan de aanvraag terugspelen
        raise LlmFout('%s gaf HTTP %s' % (cfg['provider'], e.code))
    except (OSError, ValueError) as e:
        raise LlmFout('Aanroep mislukt: %s' % e)
    return lees_antwoord(cfg['provider'], data)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cfg = configuratie()
    print('# %s, %s, model %s' % (cfg['provider'], cfg['base_url'], cfg['model']), file=sys.stderr)
    try:
        print(vraag(' '.join(argv[1:]), max_tokens=500, cfg=cfg))
    except LlmFout as e:
        print('Fout: %s' % e, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
