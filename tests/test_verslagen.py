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


GOED = [
    'VOLEVO HS 4 won uit bij Zovoc HS 4 met 1-3. Na winst in de eerste twee sets, een verloren derde set en een sterke '
    'vierde set werd de wedstrijd sportief en overtuigend afgesloten.',
    'VOLEVO MB 4 speelde een spannende thuiswedstrijd tegen Inter Rijswijk MB 4 en trok na vijf sets aan het langste '
    'eind: 3-2. Na setstanden van 19-25, 25-23, 20-25, 26-24 en 15-13 was het een mooie, sportieve overwinning voor de '
    'ploeg uit Leidschendam.',
    'VOLEVO MA 6 speelde thuis tegen Kalinko MA 4 en verloor na een spannende vijfsetter met 2-3. Na een sterke start '
    'en twee gewonnen sets hield VOLEVO goed stand, dus op naar de volgende wedstrijd!',
]


class AfkeuringTest(unittest.TestCase):
    def test_goede_teksten_van_het_echte_model_worden_goedgekeurd(self):
        for t in GOED:
            self.assertIsNone(module.afkeuring(t), t)

    def test_een_zin_of_twee_is_goed_drie_niet(self):
        self.assertIsNone(module.afkeuring('Mooie winst. Goed gedaan!'))
        self.assertIn('3 zinnen', module.afkeuring('Mooie winst. Goed gedaan! Tot volgende week.'))

    def test_een_score_met_punt_telt_niet_als_extra_zin(self):
        # '3-2. Na' staat in de tweede goede tekst en is een zin, geen drie
        self.assertIsNone(module.afkeuring(GOED[1]))

    def test_emoji_worden_afgekeurd(self):
        for t in ('Mooie winst! 🏀', 'Goed gedaan ✨', 'Sterk 🎾🥅', 'Top 👍🏽', 'Hartelijk ❤️', 'Vlag 🇳🇱'):
            self.assertEqual(module.afkeuring(t), 'bevat emoji', t)

    def test_gewone_leestekens_en_letters_zijn_geen_emoji(self):
        self.assertIsNone(module.afkeuring('Réactie op de wedstrijd: 3-2 (na vijf sets) – mooi, “sportief” & fijn!'))

    def test_hashtag_wordt_afgekeurd_maar_een_nummer_met_hekje_niet_als_woordbegin(self):
        self.assertEqual(module.afkeuring('Mooie winst #VOLEVOPOWER'), 'bevat een hashtag')
        self.assertIsNone(module.afkeuring('Het was wedstrijd nr.4 van de dag.'))

    def test_te_lang_wordt_afgekeurd_niet_afgekapt(self):
        lang = 'Mooie winst voor VOLEVO ' + 'x' * module.MAX_TEKENS
        self.assertIn('te lang', module.afkeuring(lang))

    def test_precies_op_de_grens_is_goed(self):
        t = 'a' * module.MAX_TEKENS
        self.assertIsNone(module.afkeuring(t))
        self.assertIn('te lang', module.afkeuring(t + 'a'))

    def test_meerdere_regels_en_lege_tekst_worden_afgekeurd(self):
        self.assertEqual(module.afkeuring('Eerste regel.\nTweede regel.'), 'bestaat uit meerdere regels')
        self.assertEqual(module.afkeuring('   '), 'leeg')

    def test_de_slechte_tekst_van_phi_wordt_afgekeurd(self):
        phi = ('VOLEVO MB kon ondanks hun beste inspanningen het Uitteam van Inter Rijswijk niet overwinnen. De wedstrijd '
               'was spannend en bij scherpest perspekte ze eindigden met een eindstand in sets van 3-2. Hier presenteren '
               'we de wens van VOLEVO\'s team voor succes in de toekomst! 🎾🥅 #VOLLEVOPOWER #VOLLEVO')
        self.assertIsNotNone(module.afkeuring(phi))


class SchrijfVerslagTest(unittest.TestCase):
    CFG = {'provider': 'openai', 'model': 'm', 'sleutel': 'k', 'base_url': 'https://x.nl'}
    U = {'thuis': 'VOLEVO L4 3', 'uit': 'Zovoc L4 7', 'score': '4-0', 'sets': '15-9, 19-8'}

    def vragen(self, *antwoorden):
        gezien = []
        rij = list(antwoorden)

        def vraag(prompt, max_tokens=300, cfg=None):
            gezien.append(prompt)
            return rij.pop(0)
        return vraag, gezien

    def test_goede_tekst_kost_een_aanroep(self):
        vraag, gezien = self.vragen(GOED[0])
        self.assertEqual(module.schrijf_verslag(self.U, self.CFG, vraag), GOED[0])
        self.assertEqual(len(gezien), 1)

    def test_afgekeurde_tekst_wordt_een_keer_opnieuw_gevraagd(self):
        vraag, gezien = self.vragen('Top! 🏀', GOED[0])
        self.assertEqual(module.schrijf_verslag(self.U, self.CFG, vraag), GOED[0])
        self.assertEqual(len(gezien), 2)

    def test_twee_keer_afgekeurd_geeft_geen_tekst_en_geen_derde_aanroep(self):
        vraag, gezien = self.vragen('Top! 🏀', 'Weer slecht #fout')
        self.assertIsNone(module.schrijf_verslag(self.U, self.CFG, vraag))
        self.assertEqual(len(gezien), module.POGINGEN)

    def test_witruimte_rond_de_tekst_wordt_weggehaald(self):
        vraag, _ = self.vragen('  ' + GOED[0] + '\n')
        self.assertEqual(module.schrijf_verslag(self.U, self.CFG, vraag), GOED[0])


if __name__ == '__main__':
    unittest.main()
