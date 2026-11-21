import importlib.util
import tempfile
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verslagen', Path(__file__).resolve().parents[1] / 'scripts/build_verslagen.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

FEED = '''<?xml version="1.0"?><rss xmlns:nevobo="https://www.api.nevobo.nl/rss/"><channel>
<item><title><![CDATA[VOLEVO L4 3 - Zovoc L4 7, Uitslag: 4-0]]></title><guid>g1</guid>
<description><![CDATA[Wedstrijd: x, Setstanden: 15-9, 19-8]]></description>
<pubDate>Sat, 21 Nov 2026 12:40:00 +0100</pubDate><nevobo:status>gespeeld</nevobo:status></item>
<item><title><![CDATA[Andere - Club, Uitslag: 3-1]]></title><guid>g2</guid>
<pubDate>Sat, 21 Nov 2026 12:40:00 +0100</pubDate><nevobo:status>gespeeld</nevobo:status></item>
<item><title><![CDATA[VOLEVO MA 1 - Dosko MA 1, Uitslag: 0-0]]></title><guid>g3</guid>
<pubDate>Sat, 21 Nov 2026 12:40:00 +0100</pubDate><nevobo:status>vervallen</nevobo:status></item>
</channel></rss>'''


class VerslagenTest(unittest.TestCase):
    def lees(self):
        with tempfile.NamedTemporaryFile('w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(FEED)
        return module.uitslagen(f.name)

    def test_alleen_gespeelde_volevo_wedstrijden(self):
        u = self.lees()
        self.assertEqual([x['id'] for x in u], ['g1'])
        self.assertEqual(u[0]['score'], '4-0')
        self.assertEqual(u[0]['sets'], '15-9, 19-8')

    def test_prompt_bevat_alleen_de_feiten(self):
        p = module.prompt(self.lees()[0])
        self.assertIn('VOLEVO L4 3', p)
        self.assertIn('4-0', p)
        self.assertIn('verzin geen', p)


if __name__ == '__main__':
    unittest.main()
