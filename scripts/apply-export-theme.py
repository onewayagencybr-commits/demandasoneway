#!/usr/bin/env python3
"""One Way — harmonização conservadora dos exportáveis.
Não altera dados, cálculos, armazenamento ou regras de negócio.
Aplicar uma vez sobre a versão original (idempotente em temas e seções já revisados).
"""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/"index.html"

PALETTE={
    "#05091d":"#071633",
    "#050b22":"#071633",
    "#061128":"#071633",
    "#071532":"#071633",
    "#071742":"#0c2858",
    "#0a1f47":"#102c61",
    "#0a214e":"#102c61",
    "#0b2250":"#13346d",
    "#123fff":"#2153eb",
    "#2456e8":"#2153eb",
    "#19385f":"#203f74",
    "#1d3b65":"#234677",
    "#2b4c7d":"#2d5186",
}
FACE="@font-face{font-family:OWExportMontserrat;src:url('/fonts/Montserrat.ttf') format('truetype');font-weight:100 900;font-style:normal;font-display:swap;}"

def substitute_palette(s):
    for old,new in PALETTE.items():
        s=s.replace(old,new)
    return s

def improve_font(s):
    return re.sub(r"(?<!Montserrat, )(?<!OWExport)Arial", "Montserrat, Arial", s)

def span_replace(s,start,end,fun):
    a=s.find(start)
    if a<0: raise AssertionError("Não foi possível localizar início: "+start)
    b=s.find(end,a+len(start))
    if b<0: raise AssertionError("Não foi possível localizar fim: "+end)
    return s[:a]+fun(s[a:b])+s[b:]

def generic(s):
    return improve_font(substitute_palette(s))

def html_sheet(s):
    s=generic(s)
    if FACE not in s:
        s=s.replace("<style>","<style>"+FACE,1)
    return s

def main():
    original=INDEX.read_text(encoding="utf-8")
    s=original
    segments=[
        ("function blueDocHTML","function fileSafeName",html_sheet),
        ("async function exportReportJPEG","function exportReportPDF",generic),
        ("async function exportPlanningJPEG","function exportPlanningPDF",generic),
        ("function trafficReportHTML","function compactPieMoney",html_sheet),
        ("function drawAnalyticsBackground","function exportActiveAnalyticsPDF",generic),
        ("function proposalPrintHTML","function exportProposalPDF",html_sheet),
        ("async function exportProposalJPEG","function wrapCanvas",generic),
        ("function contractPrintHTML","function exportContractPDF",html_sheet),
        ("async function exportWeekCalendarJPEG","function weekCalendarPDFHTML",generic),
        ("function weekCalendarPDFHTML","function exportWeekCalendarPDF",html_sheet),
        ("function feedDrawCover","function feedDrawMiniIcon",generic),
        ("function feedDrawPhonePage","function feedPDFBlob",generic)
    ]
    for a,b,fn in segments:s=span_replace(s,a,b,fn)
    # Templates HTML impressos incluem fontes carregadas da própria aplicação.
    s=span_replace(s,"function blueDocHTML","function fileSafeName",lambda x:x.replace('font-family:Montserrat, Arial,"Helvetica Neue",sans-serif','font-family:OWExportMontserrat,Montserrat,Arial,sans-serif'))
    s=span_replace(s,"function proposalPrintHTML","function exportProposalPDF",lambda x:x.replace('font-family:Montserrat, Arial,sans-serif','font-family:OWExportMontserrat,Montserrat,Arial,sans-serif'))
    s=span_replace(s,"function weekCalendarPDFHTML","function exportWeekCalendarPDF",lambda x:x.replace('font-family:Montserrat, Arial,Helvetica,sans-serif','font-family:OWExportMontserrat,Montserrat,Arial,sans-serif'))
    # Ampliar logos pequenos, preservando proporção e transparência.
    s=span_replace(s,"async function exportProposalJPEG","function wrapCanvas",lambda x:x.replace("lh=105","lh=135"))
    s=span_replace(s,"function exportFinanceJPEG","function ",lambda x:x.replace("tw=245","tw=285"))
    # Os painéis seguem mesma linguagem glass do site, sem alterar conteúdo ou métricas.
    s=span_replace(s,"function proposalPrintHTML","function exportProposalPDF",lambda x:x.replace("background:linear-gradient(115deg,#071633 0%,#0c2858 56%,#2153eb 100%)","background:linear-gradient(135deg,#071633 0%,#102c61 55%,#2153eb 100%)"))
    if s==original:raise AssertionError("HTML não foi modificado")
    INDEX.write_text(s,encoding="utf-8")

    p=ROOT/"modules/instagram-ui.js"
    src=p.read_text(encoding="utf-8")
    new=src
    old="const C={navy:'#102648',navy2:'#244777',card:'#2b4c7d',line:'#45628c',white:'#f9fbff',muted:'#bfcfeb',soft:'#96add4',accent:'#b5c8fb'};"
    fresh="const C={navy:'#071633',navy2:'#2153c4',card:'rgba(135,175,250,.17)',line:'rgba(220,236,255,.17)',white:'#f9fbff',muted:'#c6d8f4',soft:'#a8c5f2',accent:'#b7d0ff'};"
    if old not in new:raise AssertionError("Tema anterior do PDF Instagram não localizado")
    new=new.replace(old,fresh)
    old="const rect=(ctx,x,y,w,h,r=20,fill=C.card)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()};"
    fresh="const rect=(ctx,x,y,w,h,r=20,fill=C.card)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.strokeStyle=C.line;ctx.lineWidth=1.5;ctx.stroke()};"
    if old not in new:raise AssertionError("Cards Instagram não localizados")
    new=new.replace(old,fresh)
    new=new.replace("g.addColorStop(0,C.navy);g.addColorStop(1,C.navy2);","g.addColorStop(0,C.navy);g.addColorStop(.58,'#102f69');g.addColorStop(1,C.navy2);")
    new=new.replace("const h=70,w=Math.min(195,h*logo.naturalWidth/logo.naturalHeight)","const h=100,w=Math.min(280,h*logo.naturalWidth/logo.naturalHeight)")
    new=new.replace("rect(ctx,77,y,946,169,18,'#1d3b65')","rect(ctx,77,y,946,169,22,'rgba(135,175,250,.12)')")
    new=new.replace("rect(ctx,76,y,947,185,19,'#1d3b65')","rect(ctx,76,y,947,185,22,'rgba(135,175,250,.12)')")
    new=new.replace("'#19385f'","'rgba(135,175,250,.12)'")
    new=new.replace("const font=(ctx,size=22,weight=300)","const font=(ctx,size=22,weight=400)")
    if new==src:raise AssertionError("Instagram UI sem alterações")
    p.write_text(new,encoding="utf-8")

    p=ROOT/"modules/scripts-ui.js"
    src=p.read_text(encoding="utf-8");new=src
    replacements={
      "ctx.fillStyle='#f7f9fc';ctx.fillRect(0,0,W,H);":"const pg=ctx.createLinearGradient(0,0,W,H);pg.addColorStop(0,'#071633');pg.addColorStop(.55,'#102c61');pg.addColorStop(1,'#2153c4');ctx.fillStyle=pg;ctx.fillRect(0,0,W,H);",
      "ctx.fillStyle=videoIndex%2===0?'#edf4ff':'#ffffff';\n    ctx.fillRect(76,cardTop,1288,1860-cardTop);\n    ctx.strokeStyle='#dfe8f5';ctx.lineWidth=2;\n    ctx.strokeRect(76,cardTop,1288,1860-cardTop);":"ctx.fillStyle=videoIndex%2===0?'rgba(189,213,255,.13)':'rgba(189,213,255,.08)';\n    ctx.beginPath();ctx.roundRect(76,cardTop,1288,1860-cardTop,30);ctx.fill();\n    ctx.strokeStyle='rgba(233,243,255,.21)';ctx.lineWidth=2;ctx.stroke();",
      "'#7185a4'":"'#bdd3f5'",
      "'#40639a'":"'#bdd3f5'",
      "'#132b51'":"'#f7faff'",
      "'#5878a9'":"'#a8c5f2'",
      "'#273e60'":"'#e4eeff'",
      "'#263d60'":"'#e4eeff'",
      "'#425b7e'":"'#cadcf9'",
      "'#607ba1'":"'#adccff'",
      "'#cad9ed'":"'rgba(230,242,255,.23)'",
      "'#315c99'":"'#b6d2ff'",
      "'#7186a4'":"'#b6c9e8'"
    }
    for a,b in replacements.items():
        if a not in new:raise AssertionError("Roteiro: trecho não encontrado: "+a[:80])
        new=new.replace(a,b)
    p.write_text(new,encoding="utf-8")

    p=ROOT/"lib/instagram-pdf-server.js"
    src=p.read_text(encoding="utf-8");new=src
    old="const C={navy:'#102648',navy2:'#244777',card:'#2b4c7d',line:'#45628c',white:'#f9fbff',muted:'#bfcfeb',soft:'#96add4',accent:'#b5c8fb',deep:'#1d3b65'};"
    fresh="const C={navy:'#071633',navy2:'#2153c4',card:'#2b518c',line:'#5479b5',white:'#f9fbff',muted:'#c6d8f4',soft:'#a8c5f2',accent:'#b7d0ff',deep:'#244677'};"
    if old not in new:raise AssertionError("Tema de servidor Instagram não localizado")
    new=new.replace(old,fresh)
    new=new.replace("let a=[16,38,72],b=[36,71,119]","let a=[7,22,51],b=[33,83,196]")
    new=new.replace("if(logo){const h=65*K,w=Math.min(195*K,h*logo.width/logo.height)","if(logo){const h=103*K,w=Math.min(282*K,h*logo.width/logo.height)")
    new=new.replace("g.rect(x,355,303,160,C.card)","g.rounded(x,355,303,160,C.card,20)")
    new=new.replace("g.rect(x,yf+38,304,120,C.card)","g.rounded(x,yf+38,304,120,C.card,20)")
    new=new.replace("g.rect(77,y,946,169,C.deep)","g.rounded(77,y,946,169,C.deep,22)")
    new=new.replace("g.rect(76,y,947,185,C.deep)","g.rounded(76,y,947,185,C.deep,22)")
    new=new.replace("g.rect(74,700,950,53,'#19385f')","g.rounded(74,700,950,53,C.deep,11)")
    marker=" const fz=n=>n*K;"
    rounded=""" function rounded(x,y,w,h,color,r=18){
  const xx=x*K, yy=H-(y+h)*K,ww=w*K,hh=h*K,rr=Math.max(2,Math.min(r,w/2,h/2))*K;
  const d=.55228475*rr;
  const path=['M',xx+rr,yy,'L',xx+ww-rr,yy,'C',xx+ww-rr+d,yy,xx+ww,yy+rr-d,xx+ww,yy+rr,
    'L',xx+ww,yy+hh-rr,'C',xx+ww,yy+hh-rr+d,xx+ww-rr+d,yy+hh,xx+ww-rr,yy+hh,
    'L',xx+rr,yy+hh,'C',xx+rr-d,yy+hh,xx,yy+hh-rr+d,xx,yy+hh-rr,
    'L',xx,yy+rr,'C',xx,yy+rr-d,xx+rr-d,yy,xx+rr,yy,'Z'].join(' ');
  p.drawSvgPath(path,{color:hex(color),opacity:.88,borderColor:hex(C.line),borderWidth:.4});
 }
"""
    if marker not in new:raise AssertionError("PDF servidor: função interna não localizada")
    new=new.replace(marker,rounded+marker)
    new=new.replace("return {p,rect,text,wrap,link,base}","return {p,rect,rounded,text,wrap,link,base}")
    if "g.rounded(" not in new:raise AssertionError("PDF servidor: cards arredondados não aplicados")
    p.write_text(new,encoding="utf-8")
    print("Atualizados: index.html, modules/instagram-ui.js, modules/scripts-ui.js, lib/instagram-pdf-server.js.")
    print("Métodos de exportação e dados preservados; apenas estilo visual.")

if __name__=="__main__":
    main()
