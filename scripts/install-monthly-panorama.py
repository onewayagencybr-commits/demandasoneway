#!/usr/bin/env python3
"""Conecta somente o panorama mensal ao HTML atual sem alterar as demais funcionalidades."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = root / "index.html"
script = root / "modules/monthly-panorama.js"
css = root / "modules/monthly-panorama.css"

assert script.exists() and script.stat().st_size > 10000, "Módulo JS não encontrado"
assert css.exists() and css.stat().st_size > 5000, "Tema do panorama não encontrado"

html = index.read_text(encoding="utf-8")
style_tag = '<link rel="stylesheet" href="/modules/monthly-panorama.css">'
script_tag = '<script src="/modules/monthly-panorama.js" defer></script>'
anchor = '<script src="/modules/scripts-ui.js" defer></script>'

assert '</head>' in html, "Cabeçalho não encontrado"
assert anchor in html, "Ponto de instalação do módulo não encontrado"
if style_tag not in html:
    html = html.replace('</head>', style_tag + '\n</head>', 1)
if script_tag not in html:
    html = html.replace(anchor, anchor + '\n' + script_tag, 1)

assert html.count(style_tag) == 1
assert html.count(script_tag) == 1
assert html.index(style_tag) < html.index('</head>')
assert html.index(script_tag) > html.index(anchor)

index.write_text(html, encoding="utf-8")
print("Panorama mensal instalado de forma aditiva; sistema preexistente preservado.")
