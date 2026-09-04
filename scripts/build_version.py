#!/usr/bin/env python3
"""Schrijft data/version.json: per pagina de datum en commit van de laatste wijziging.

Het versielabel in de header was hardgecodeerd ("v2.5 - 18 apr") en liep dus
altijd achter. De pagina's lezen dit bestand en zetten de datum zelf goed.
"""
import glob, json, os, subprocess, sys


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True,
                          check=True).stdout.strip()


files = {}
for path in sorted(glob.glob('*.html')):
    out = git('log', '-1', '--format=%cI|%h', '--', path)
    if not out:
        continue  # nog niet gecommit
    date, sha = out.split('|', 1)
    files[path] = {'date': date, 'commit': sha}

if not files:
    sys.exit('Geen gecommitte HTML-pagina\'s gevonden - version.json niet geschreven')

data = {
    'commit': git('rev-parse', '--short', 'HEAD'),
    'date': git('log', '-1', '--format=%cI'),
    'files': files,
}

os.makedirs('data', exist_ok=True)
with open('data/version.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
    f.write('\n')
print('version.json geschreven voor %d pagina(s), HEAD %s' % (len(files), data['commit']))
