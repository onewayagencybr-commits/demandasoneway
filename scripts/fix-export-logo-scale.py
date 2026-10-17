#!/usr/bin/env python3
"""Enquadra a logo pelo desenho visível nos relatórios e imagens One Way."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def rep(s,a,b):
    if a in s:return s.replace(a,b,1)
    if b in s:return s
    raise AssertionError("Não localizado: "+a[:100])
def section(s,start,end,changes):
    a=s.index(start);b=s.index(end,a+len(start));block=s[a:b]
    for before,after in changes:block=rep(block,before,after)
    return s[:a]+block+s[b:]
def main():
    p=ROOT/"index.html";s=p.read_text()
    for a,b,pairs in [
      ("function blueDocHTML","function fileSafeName",[("logo:LOGO_DATA_URI","logo:TRAFFIC_LOGO_DATA_URI")]),
      ("async function exportReportJPEG","function exportReportPDF",[("loadImage(LOGO_DATA_URI)","loadImage(TRAFFIC_LOGO_DATA_URI)")]),
      ("async function exportPlanningJPEG","function exportPlanningPDF",[("loadImage(LOGO_DATA_URI)","loadImage(TRAFFIC_LOGO_DATA_URI)")]),
      ("function analyticsDocShell","function trafficReportHTML",[("const logo=LOGO_DATA_URI","const logo=TRAFFIC_LOGO_DATA_URI")]),
      ("async function exportInstagramJPEG","function exportActiveAnalyticsPDF",[("loadImage(LOGO_DATA_URI)","loadImage(TRAFFIC_LOGO_DATA_URI)")]),
      ("function proposalPrintHTML","function exportProposalPDF",[("const logo=LOGO_DATA_URI","const logo=TRAFFIC_LOGO_DATA_URI")]),
      ("async function exportProposalJPEG","function wrapCanvas",[("loadImage(LOGO_DATA_URI)","loadImage(TRAFFIC_LOGO_DATA_URI)")]),
      ("async function exportWeekCalendarJPEG","function weekCalendarPDFHTML",[("loadImage(LOGO_DATA_URI)","loadImage(TRAFFIC_LOGO_DATA_URI)"),("const h=94,w=logo.width*h/logo.height","const h=126,w=logo.width*h/logo.height")]),
      ("function weekCalendarPDFHTML","function exportWeekCalendarPDF",[("img.src='$"+"{LOGO_DATA_URI}'","img.src='$"+"{TRAFFIC_LOGO_DATA_URI}'")])
    ]:s=section(s,a,b,pairs)
    p.write_text(s)
    # O LOGO_DATA_URI original tem espaço transparente acima e abaixo do símbolo.
    # TRAFFIC_LOGO_DATA_URI já contém a mesma arte recortada com proporção correta.
    p=ROOT/"modules/instagram-ui.js";s=p.read_text()
    before="if(logo?.naturalWidth && logo?.naturalHeight){const h=100,w=Math.min(280,h*logo.naturalWidth/logo.naturalHeight);ctx.drawImage(logo,76,46,w,h)}"
    after=("if(logo?.naturalWidth && logo?.naturalHeight){"
       "if(logo.naturalWidth===1447&&logo.naturalHeight===2048)"
       "ctx.drawImage(logo,89,792,1231,464,76,49,308,116);"
       "else{const h=116,w=Math.min(308,h*logo.naturalWidth/logo.naturalHeight);ctx.drawImage(logo,76,49,w,h)}}")
    p.write_text(rep(s,before,after))
    p=ROOT/"lib/instagram-pdf-server.js";s=p.read_text()
    before="if(logo){const h=103*K,w=Math.min(282*K,h*logo.width/logo.height);p.drawImage(logo,{x:76*K,y:H-(44*K)-h,width:w,height:h});}"
    after="""if(logo){
  // Tamanho calculado pelo conteúdo visível do PNG original, não pelas margens transparentes.
  if(logo.width===1447&&logo.height===2048){
    const art={x:89,y:792,w:1231,h:464},scale=308*K/art.w;
    const x=76*K-art.x*scale;
    const y=H-49*K-art.h*scale-(logo.height-art.y-art.h)*scale;
    p.drawImage(logo,{x,y,width:logo.width*scale,height:logo.height*scale});
  }else{
    const h=116*K,w=Math.min(308*K,h*logo.width/logo.height);
    p.drawImage(logo,{x:76*K,y:H-49*K-h,width:w,height:h});
  }
 }"""
    p.write_text(rep(s,before,after))
    print("CORRIGIDOS: PDFs/JPEGs gerais, calendário, propostas, relatório IG browser e servidor.")
if __name__=="__main__":main()
