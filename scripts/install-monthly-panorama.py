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
# Corrige a regressão: uma tag de script do panorama legado foi inserida
# DENTRO do template JavaScript de exportação PDF e fechava o script principal
# antes da inicialização do login em navegadores, especialmente no Safari.
legacy_script = '<script src="/modules/panorama-mensal.js" defer></script>'
legacy_css = '<link rel="stylesheet" href="/modules/panorama-mensal.css">'
html = html.replace(legacy_script, '', 1)
html = html.replace(legacy_css, '', 1)
# A extensão monthly-panorama é a única usada; os módulos legados permanecem
# como arquivos no repositório, mas sem execução duplicada.
main_start = html.index('<script>\nconst USERS')
main_end = html.index('</script>\n<script src="/modules/instagram-pdf.js"', main_start)
assert '</script>' not in html[main_start+len('<script>'):main_end], (
    "Uma tag de fechamento literal ainda interrompe o JavaScript principal"
)

style_tag = '<link rel="stylesheet" href="/modules/monthly-panorama.css">'
script_tag = '<script src="/modules/monthly-panorama.js" defer></script>'
anchor = '<script src="/modules/scripts-ui.js" defer></script>'

assert '</head>' in html, "Cabeçalho não encontrado"
assert anchor in html, "Ponto de instalação do módulo não encontrado"
# Corrige um fechamento HTML indevido dentro de um template de PDF.
# Ele encerrava prematuramente o script principal no navegador e bloqueava todos os logins.
# O player de panorama não pertence ao documento de impressão.
bad_pdf_tag = '<script src="/modules/panorama-mensal.js" defer></script>'
if bad_pdf_tag in html:
    assert html.count(bad_pdf_tag) == 1, "Mais de uma inclusão indevida no PDF"
    html = html.replace(bad_pdf_tag, '', 1)

# O primeiro </script> literal após o script principal deve ser seu encerramento real.
main_start = html.index('<script>\\nconst USERS') + len('<script>') if '<script>\\nconst USERS' in html else html.index('<script>\nconst USERS') + len('<script>')
main_end = html.index('</script>\n<script src="/modules/instagram-pdf.js"', main_start)
assert html.index('</script>', main_start) == main_end, "Script principal encerrado prematuramente"

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
