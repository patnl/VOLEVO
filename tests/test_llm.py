import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('llm', ROOT / 'scripts/llm.py')
llm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(llm)


class Antwoord(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def nep(data):
    """Een 'urlopen' die vaste JSON teruggeeft en het verzoek onthoudt."""
    gezien = []

    def openen(req, timeout=None):
        gezien.append(req)
        return Antwoord(json.dumps(data).encode())
    return openen, gezien


class ConfiguratieTest(unittest.TestCase):
    def test_standaard_is_anthropic_haiku(self):
        c = llm.configuratie({})
        self.assertEqual((c['provider'], c['model'], c['sleutel']), ('anthropic', 'claude-haiku-5-5', ''))
        self.assertEqual(c['base_url'], 'https://api.anthropic.com')

    def test_oude_namen_blijven_werken(self):
        c = llm.configuratie({'ANTHROPIC_API_KEY': 'oud', 'VERSLAG_MODEL': 'claude-sonnet-5-5'})
        self.assertEqual((c['sleutel'], c['model']), ('oud', 'claude-sonnet-5-5'))

    def test_nieuwe_namen_gaan_voor(self):
        c = llm.configuratie({'LLM_API_KEY': 'nieuw', 'ANTHROPIC_API_KEY': 'oud', 'LLM_MODEL': 'claude-fable-5-2',
                              'VERSLAG_MODEL': 'ander'})
        self.assertEqual((c['sleutel'], c['model']), ('nieuw', 'claude-fable-5-2'))

    def test_lege_variabelen_vallen_terug_op_de_standaard(self):
        c = llm.configuratie({'LLM_PROVIDER': '', 'LLM_BASE_URL': '', 'LLM_MODEL': ''})
        self.assertEqual((c['provider'], c['base_url'], c['model']),
                         ('anthropic', 'https://api.anthropic.com', 'claude-haiku-5-5'))

    def test_onbekende_aanbieder_geeft_fout(self):
        with self.assertRaises(llm.LlmFout):
            llm.configuratie({'LLM_PROVIDER': 'iets'})


class VerzoekTest(unittest.TestCase):
    def test_anthropic_zelf(self):
        url, h, body = llm.bouw_verzoek(llm.configuratie({'LLM_API_KEY': 'k'}), 'hoi', 100)
        self.assertEqual(url, 'https://api.anthropic.com/v1/messages')
        self.assertEqual(h['x-api-key'], 'k')
        self.assertEqual(json.loads(body)['max_tokens'], 100)

    def test_claude_in_foundry(self):
        cfg = llm.configuratie({'LLM_API_KEY': 'k', 'LLM_MODEL': 'mijn-sonnet',
                                'LLM_BASE_URL': 'https://res.services.ai.azure.com/anthropic/'})
        url, h, body = llm.bouw_verzoek(cfg, 'hoi')
        self.assertEqual(url, 'https://res.services.ai.azure.com/anthropic/v1/messages')
        self.assertEqual(h['x-api-key'], 'k')
        self.assertNotIn('api-key', h)
        self.assertEqual(json.loads(body)['model'], 'mijn-sonnet')

    def test_volledig_adres_wordt_niet_dubbel_gemaakt(self):
        cfg = llm.configuratie({'LLM_API_KEY': 'k', 'LLM_BASE_URL': 'https://x.nl/anthropic/v1/messages'})
        self.assertEqual(llm.bouw_verzoek(cfg, 'hoi')[0], 'https://x.nl/anthropic/v1/messages')

    def test_azure_openai(self):
        cfg = llm.configuratie({'LLM_PROVIDER': 'openai', 'LLM_API_KEY': 'k', 'LLM_MODEL': 'gpt-deploy',
                                'LLM_BASE_URL': 'https://res.openai.azure.com/openai/v1'})
        url, h, body = llm.bouw_verzoek(cfg, 'hoi', 100)
        self.assertEqual(url, 'https://res.openai.azure.com/openai/v1/chat/completions')
        self.assertEqual((h['api-key'], h['authorization']), ('k', 'Bearer k'))
        b = json.loads(body)
        self.assertEqual(b['model'], 'gpt-deploy')
        self.assertGreaterEqual(b['max_completion_tokens'], 1500)
        self.assertNotIn('max_tokens', b)

    def test_openai_vraagt_om_een_model(self):
        with self.assertRaises(llm.LlmFout):
            llm.bouw_verzoek(llm.configuratie({'LLM_PROVIDER': 'openai', 'LLM_API_KEY': 'k'}), 'hoi')

    def test_alleen_https(self):
        cfg = llm.configuratie({'LLM_API_KEY': 'k', 'LLM_BASE_URL': 'http://onveilig.nl'})
        with self.assertRaises(llm.LlmFout):
            llm.bouw_verzoek(cfg, 'hoi')


class AntwoordTest(unittest.TestCase):
    def test_anthropic_tekstblokken(self):
        data = {'content': [{'type': 'thinking', 'thinking': 'x'}, {'type': 'text', 'text': ' Mooi! '}]}
        self.assertEqual(llm.lees_antwoord('anthropic', data), 'Mooi!')

    def test_openai_keuze(self):
        self.assertEqual(llm.lees_antwoord('openai', {'choices': [{'message': {'content': ' Goed. '}}]}), 'Goed.')

    def test_leeg_antwoord_geeft_lege_tekst(self):
        self.assertEqual(llm.lees_antwoord('openai', {'choices': []}), '')
        self.assertEqual(llm.lees_antwoord('openai', {'choices': [{'message': {'content': None}}]}), '')
        self.assertEqual(llm.lees_antwoord('anthropic', {}), '')


class VraagTest(unittest.TestCase):
    def test_zonder_sleutel_geen_aanroep(self):
        openen, gezien = nep({})
        with self.assertRaises(llm.LlmFout):
            llm.vraag('hoi', cfg=llm.configuratie({}), openen=openen)
        self.assertEqual(gezien, [])

    def test_vraag_geeft_tekst_terug(self):
        openen, gezien = nep({'content': [{'type': 'text', 'text': 'Hallo'}]})
        self.assertEqual(llm.vraag('hoi', cfg=llm.configuratie({'LLM_API_KEY': 'k'}), openen=openen), 'Hallo')
        self.assertEqual(len(gezien), 1)

    def test_http_fout_lekt_geen_body(self):
        def openen(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 401, 'nee', {}, io.BytesIO(b'geheime sleutel k'))
        with self.assertRaises(llm.LlmFout) as ctx:
            llm.vraag('hoi', cfg=llm.configuratie({'LLM_API_KEY': 'k'}), openen=openen)
        self.assertIn('401', str(ctx.exception))
        self.assertNotIn('geheim', str(ctx.exception))


class ProefmodusTest(unittest.TestCase):
    def test_zonder_sleutel_doet_het_script_niets(self):
        sp = importlib.util.spec_from_file_location('verslagen', ROOT / 'scripts/build_verslagen.py')
        m = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(m)
        oud = {k: os.environ.pop(k) for k in ('LLM_API_KEY', 'ANTHROPIC_API_KEY') if k in os.environ}
        cwd = os.getcwd()
        try:
            with tempfile.TemporaryDirectory() as d:
                os.chdir(d)
                self.assertEqual(m.main(['--proef']), 0)
                self.assertFalse(os.path.exists('data/verslagen.json'))
        finally:
            os.chdir(cwd)
            os.environ.update(oud)


if __name__ == '__main__':
    unittest.main()
