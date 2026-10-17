import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('teamstanden', Path(__file__).resolve().parents[1] / 'scripts/build_teamstanden.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def team(name='VOLEVO MA 4', category='meiden-a', number=4, stand='5e in Meiden A 1e Klasse J eerste helft'):
    return {'@id': f'/competitie/teams/cnz6b97/{category}/{number}', 'vereniging': module.CLUB,
            'naam': name, 'seizoen': '/seizoenen/2026-2027', 'standpositietekst': stand}


class TeamstandenTest(unittest.TestCase):
    def test_officiele_tekst_en_teamlink(self):
        name, value = module.normalize(team())
        self.assertEqual(name, 'VOLEVO MA 4')
        self.assertEqual(value['stand'], '5e in Meiden A 1e Klasse J eerste helft')
        self.assertEqual(value['bron'], 'https://www.volleybal.nl/competitie/vereniging/cnz6b97/meiden-a/4')

    def test_zonder_stand_wordt_geen_positie_verzonnen(self):
        self.assertIsNone(module.normalize(team('VOLEVO L2 1', 'volley-stars-level-2', 1, None))[1]['stand'])

    def test_alle_paginas_worden_opgehaald(self):
        calls = []
        def fetch(path):
            calls.append(path)
            if len(calls) == 1:
                return {'hydra:totalItems': 2, 'hydra:member': [team()], 'hydra:view': {'hydra:next': '/competitie/teams?page=2'}}
            return {'hydra:totalItems': 2, 'hydra:member': [team('VOLEVO DS 1', 'dames', 1)]}
        self.assertEqual(len(module.build(fetch)['teams']), 2)
        self.assertEqual(calls[1], '/competitie/teams?page=2')

    def test_onvolledige_pagina_wordt_niet_gepubliceerd(self):
        with self.assertRaises(ValueError):
            module.build(lambda _: {'hydra:totalItems': 66, 'hydra:member': [team()]})

    def test_andere_vereniging_wordt_geweigerd(self):
        other = team()
        other['vereniging'] = '/relatiebeheer/verenigingen/andere'
        with self.assertRaises(ValueError):
            module.normalize(other)


if __name__ == '__main__':
    unittest.main()
