#!/usr/bin/env python3
"""Instala CSS responsivo carregado depois dos temas de todos os módulos One Way."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
index=root/"index.html"
css=root/"modules/mobile-responsive.css"
assert css.exists() and css.stat().st_size>10000, "Tema mobile ausente ou incompleto"
html=index.read_text(encoding="utf-8")
mark='<link rel="stylesheet" href="/modules/scripts-ui.css">'
link='<link rel="stylesheet" href="/modules/mobile-responsive.css?v=20261017">'
if link not in html:
    assert mark in html, "Não encontrado link para stylesheet de roteiros"
    html=html.replace(mark,mark+"\n"+link,1)
    index.write_text(html,encoding="utf-8")
assert html.count(link)==1, "Duplicidade de folha responsiva"
assert html.index(link)>html.index(mark), "Tema responsivo precisa carregar por último"
assert html.index(link)<html.index("</head>"), "Tema mobile deve ficar no head"
print("One Way mobile: stylesheet conectado após os módulos, desktop preservado")
