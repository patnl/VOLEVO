"""Geef lokale app-scripts en stylesheets een versie op basis van hun inhoud."""
import argparse
import hashlib
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
TAGS = re.compile(r'<(?:script|link)\b[^>]*>')
REFERENCE = re.compile(r'''\b(?:src|href)=["']([^"']+)["']''')


def versioned_html(page):
    def replace_tag(match):
        tag = match.group(0)
        ref = REFERENCE.search(tag)
        if not ref:
            return tag
        url = urlsplit(ref.group(1))
        if url.scheme or url.netloc or not url.path.endswith(('.js', '.css')):
            return tag
        asset = (page.parent / url.path).resolve()
        asset.relative_to(ROOT)
        digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
        query = [(key, value) for key, value in parse_qsl(url.query) if key != 'v']
        query.append(('v', digest))
        versioned = urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), url.fragment))
        return tag[:ref.start(1)] + versioned + tag[ref.end(1):]
    return TAGS.sub(replace_tag, page.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Controleer zonder bestanden te wijzigen')
    args = parser.parse_args()
    changed = []
    for page in sorted((ROOT / 'app').glob('*.html')):
        content = versioned_html(page)
        if content != page.read_text(encoding='utf-8'):
            changed.append(str(page.relative_to(ROOT)))
            if not args.check:
                page.write_text(content, encoding='utf-8')
    if changed:
        print(('Verouderde bestandsversies: ' if args.check else 'Bijgewerkt: ') + ', '.join(changed))
    return 1 if args.check and changed else 0


if __name__ == '__main__':
    raise SystemExit(main())
