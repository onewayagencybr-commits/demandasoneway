#!/usr/bin/env python3
"""Corrige fechamento prematuro do script principal que bloqueia o login."""
from pathlib import Path
import subprocess, tempfile

path=Path("index.html")
html=path.read_text(encoding="utf-8")
rogue='<script src="/modules/panorama-mensal.js" defer></script>'
assert html.count(rogue)==1, "Marca inesperada; abortando para não alterar outra parte"
login_marker='<script>\nconst USERS='
end_marker='\n</script>\n<script src="/modules/instagram-pdf.js"'
start=html.index(login_marker)+len('<script>')
end=html.index(end_marker,start)
assert start < html.index(rogue) < end, "Falha não está dentro do JavaScript principal"
fixed=html.replace(rogue,'',1)
script=fixed[fixed.index(login_marker)+len('<script>'):fixed.index(end_marker)]
assert '</script>' not in script.lower(), "JavaScript contém fechamento prematuro HTML"
assert "function initLogin()" in script and "function enterApp()" in script
assert '<script src="/modules/monthly-panorama.js" defer></script>' in fixed
with tempfile.NamedTemporaryFile(mode="w",suffix=".js",encoding="utf-8",delete=True) as temp:
    temp.write(script)
    temp.flush()
    subprocess.run(["node","--check",temp.name],check=True)
path.write_text(fixed,encoding="utf-8")
print("OK: script principal íntegro, login preservado, panorama mantido.")
