#!/usr/bin/env python3
"""Conecta somente o panorama mensal ao HTML atual sem alterar as demais funcionalidades."""
from pathlib import Path
import re

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

# Aceita URLs com query versionada para atualizar cache do Safari sem
# reinstalar um CSS/JS duplicado nem desordenar a folha dos editores.
style_match = re.search(r'<link rel="stylesheet" href="/modules/monthly-panorama\.css(?:\?[^"]*)?">', html)
script_match = re.search(r'<script src="/modules/monthly-panorama\.js(?:\?[^"]*)?" defer></script>', html)
style_tag = style_match.group(0) if style_match else '<link rel="stylesheet" href="/modules/monthly-panorama.css">'
script_tag = script_match.group(0) if script_match else '<script src="/modules/monthly-panorama.js" defer></script>'
anchor_match = re.search(r'<script src="/modules/scripts-ui\.js(?:\?[^\"]*)?" defer></script>', html)
anchor = anchor_match.group(0) if anchor_match else ''

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

# Calendário de Artes e Vídeos: somente visualização das demandas da própria área.
# A extensão reutiliza o calendário semanal, sem alterar autorizações do sistema.
editor_js = root / "modules/editor-calendar.js"
editor_css = root / "modules/editor-calendar.css"
assert editor_js.exists() and editor_js.stat().st_size > 5000, "Calendário dos editores ausente"
assert editor_css.exists() and editor_css.stat().st_size > 700, "CSS do calendário dos editores ausente"
editor_style_tag = '<link rel="stylesheet" href="/modules/editor-calendar.css">'
editor_script_tag = '<script src="/modules/editor-calendar.js" defer></script>'
if editor_style_tag not in html:
    html = html.replace(style_tag, style_tag + '\n' + editor_style_tag, 1)
if editor_script_tag not in html:
    html = html.replace(script_tag, script_tag + '\n' + editor_script_tag, 1)
assert html.count(editor_style_tag) == 1, "Folha de estilo duplicada"
assert html.count(editor_script_tag) == 1, "Calendário dos editores duplicado"
assert html.index(editor_style_tag) > html.index(style_tag)
assert html.index(editor_script_tag) > html.index(script_tag)

index.write_text(html, encoding="utf-8")
print("Panorama mensal instalado de forma aditiva; sistema preexistente preservado.")
