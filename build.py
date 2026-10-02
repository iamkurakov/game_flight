#!/usr/bin/env python3
"""Собирает один самодостаточный файл la-flight-sim.html (стили, Three.js и весь код внутри)."""
import re, pathlib, sys
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'styles.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
def inline(m):
    src = m.group(1)
    code = (root / src).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>\n' + code + '\n</script>'
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
out = root / (sys.argv[1] if len(sys.argv) > 1 else 'la-flight-sim.html')
out.write_text(html, encoding='utf-8')
print(out, round(out.stat().st_size / 1024), 'KB')
