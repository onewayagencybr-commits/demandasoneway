/* PDF criado no servidor: visual One Way, Montserrat, 3 páginas, links clicáveis.
 * Não requer navegador, jsPDF ou sessão ativa após o início da coleta.
 */
const {PDFDocument,rgb,StandardFonts,PDFName,PDFString}=require('pdf-lib');
const fontkit=require('@pdf-lib/fontkit');
const {requestJSON}=require('./oneway-server');
const CW=1100,CH=1556,W=595.28,H=841.89,K=W/CW;
const C={navy:'#102648',navy2:'#244777',card:'#2b4c7d',line:'#45628c',white:'#f9fbff',muted:'#bfcfeb',soft:'#96add4',accent:'#b5c8fb',deep:'#1d3b65'};
const hex=s=>{let v=s.replace('#','');return rgb(parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255)};
const fmt=v=>Math.round(Number(v)||0).toLocaleString('pt-BR');
const dt=v=>String(v||'').split('-').reverse().join('/');
const truncate=(s,max=500)=>String(s||'').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').slice(0,max);
async function font(pdf){
  // Google Fonts' official Montserrat TTF; fontkit supports TrueType OpenType outlines.
  const urls=[
   'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
   'https://github.com/google/fonts/raw/refs/heads/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf'
  ];
  pdf.registerFontkit(fontkit);
  for(const url of urls){try{
   const resp=await fetch(url,{signal:AbortSignal.timeout(8000)});
   if(resp.ok){const b=await resp.arrayBuffer();return await pdf.embedFont(b,{subset:true});}
  }catch(err){console.warn('Fonte Montserrat: indisponível na origem',err?.message);}}
  // Recovery only when Montserrat is unreachable; generation should never fail solely due to the font CDN.
  return await pdf.embedFont(StandardFonts.Helvetica);
}
async function brandLogo(pdf){
  try{const u='https://onewaydemandas.vercel.app/oneway-logo.png';const r=await fetch(u,{signal:AbortSignal.timeout(8000)});if(!r.ok)return null;return await pdf.embedPng(await r.arrayBuffer());}catch{return null;}
}
function monthly(posts){const mm=new Map();for(const p of posts){const m=p.date.slice(0,7);if(!mm.has(m))mm.set(m,{m,count:0,likes:0,comments:0,plays:0});const z=mm.get(m);z.count++;z.likes+=Number(p.likes)||0;z.comments+=Number(p.comments)||0;z.plays+=Number(p.plays)||0;}return [...mm.values()].sort((a,b)=>a.m.localeCompare(b.m));}
function pageHelper(doc,ft,logo){
 const p=doc.addPage([W,H]);
 function rect(x,y,w,h,color,opacity=1){p.drawRectangle({x:x*K,y:H-(y+h)*K,width:w*K,height:h*K,color:hex(color),opacity});}
 for(let i=0;i<55;i++){
  const t=i/54;let a=[16,38,72],b=[36,71,119];let c='#'+a.map((n,j)=>Math.round(n+(b[j]-n)*t).toString(16).padStart(2,'0')).join('');
  rect(0,i*CH/55,CW,CH/55+1,c);
 }
 const fz=n=>n*K;
 function text(raw,x,y,size=20,color=C.white,weight='normal',maxW=0){
  const value=truncate(raw,500).normalize('NFC').replace(/[\u0000-\u001f]/g,'');
  if(!value)return;
  const sz=fz(size),x0=x*K,y0=H-y*K;
  if(maxW&&ft.widthOfTextAtSize(value,sz)>maxW*K){return wrap(value,x,y,maxW,size,size*1.45,color,2);}
  p.drawText(value,{x:x0,y:y0,size:sz,font:ft,color:hex(color)});
 }
 function wrap(raw,x,y,maxW,size=20,leading=30,color=C.muted,maxLines=4){
   const words=truncate(raw).split(/\s+/),lines=[];let line='';
   for(let w of words){if(!w)continue;
    // Guard extremely long caption tokens.
    if(ft.widthOfTextAtSize(w,fz(size))>maxW*K){w=w.slice(0,Math.max(5,Math.floor(maxW/size)))+'…';}
    const next=(line+' '+w).trim();
    if(line&&ft.widthOfTextAtSize(next,fz(size))>maxW*K){lines.push(line);line=w;if(lines.length>=maxLines)break;}else line=next;
   }
   if(line&&lines.length<maxLines)lines.push(line);
   lines.forEach((l,i)=>text(l,x,y+i*leading,size,color));
 }
 function link(url,x,y,width,height){
  if(!/^https:\/\/www\.instagram\.com\/(p|reel)\/[a-zA-Z0-9_-]+\/$/.test(url))return;
  const ref=doc.context.register(doc.context.obj({Type:PDFName.of('Annot'),Subtype:PDFName.of('Link'),Rect:[x*K,H-(y+height)*K,(x+width)*K,H-y*K],Border:[0,0,0],A:doc.context.obj({S:PDFName.of('URI'),URI:PDFString.of(url)})}));
  p.node.addAnnot(ref);
 }
 if(logo){const h=65*K,w=Math.min(195*K,h*logo.width/logo.height);p.drawImage(logo,{x:76*K,y:H-(44*K)-h,width:w,height:h});}
 else {text('ONE WAY',76,92,38,C.accent);text('AGENCY',77,114,13,C.soft);}
 function base(title,subtitle){text(title,76,235,44,C.white);wrap(subtitle,77,283,940,19,30,C.muted,2);}
 return {p,rect,text,wrap,link,base};
}
async function createPDF(data){
 const pdf=await PDFDocument.create(),fontFace=await font(pdf),logo=await brandLogo(pdf);
 pdf.setTitle('One Way · Relatório Instagram de '+(data.clientName||data.username));pdf.setAuthor('One Way Agency');
 const posts=Array.isArray(data.posts)?data.posts:[],rank=[...posts].sort((a,b)=>Number(b.likes||0)+Number(b.comments||0)-Number(a.likes||0)-Number(a.comments||0));
 const sum=k=>posts.reduce((acc,p)=>acc+(Number(p[k])||0),0),likes=sum('likes'),comments=sum('comments'),plays=sum('plays'),interactions=likes+comments;
 const reels=posts.filter(p=>p.type==='Reel').length,carousel=posts.filter(p=>p.type==='Carrossel').length,photos=posts.filter(p=>p.type==='Imagem').length;
 const mm=monthly(posts),sorted=posts.map(p=>p.likes+p.comments).sort((a,b)=>a-b),med=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):0;
 let g=pageHelper(pdf,fontFace,logo);
 g.base(data.clientName||data.username,'@'+data.username+'  ·  '+dt(data.from)+' a '+dt(data.to));
 [['PUBLICAÇÕES',posts.length],['INTERAÇÕES',interactions],['REPRODUÇÕES',plays]].forEach(([label,value],i)=>{let x=75+i*324;g.rect(x,355,303,160,C.card);g.text(fmt(value),x+19,439,41);g.text(label,x+21,484,15,C.muted);});
 g.text('Curtidas '+fmt(likes)+'   •   Comentários '+fmt(comments),78,560,21,C.muted);
 g.text('RESULTADOS MENSAIS',77,664,24);
 g.rect(74,700,950,53,'#19385f');[['Mês',95],['Posts',392],['Curtidas',534],['Coment.',705],['Interações',867]].forEach(([t,x])=>g.text(t,x,735,16,C.muted));
 mm.slice(0,5).forEach((m,i)=>{let y=797+i*65;g.text(new Date(m.m+'-03T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}),93,y,17);g.text(fmt(m.count),390,y,17);g.text(fmt(m.likes),530,y,17);g.text(fmt(m.comments),704,y,17);g.text(fmt(m.likes+m.comments),861,y,17);g.rect(78,y+21,939,1,C.line)});
 const yf=Math.min(1150,800+mm.length*65+70);g.text('FORMATOS PUBLICADOS',77,yf,24);
 [['REELS',reels],['CARROSSÉIS',carousel],['ESTÁTICOS',photos]].forEach(([t,n],i)=>{let x=76+i*325;g.rect(x,yf+38,304,120,C.card);g.text(fmt(n),x+19,yf+106,39);g.text(t,x+20,yf+142,13,C.muted)});
 g=pageHelper(pdf,fontFace,logo);g.base('Conteúdos de destaque','Publicações com maior volume de curtidas e comentários.');
 rank.slice(0,5).forEach((p,i)=>{const y=340+i*198;g.rect(77,y,946,169,C.deep);g.text(String(i+1).padStart(2,'0'),103,y+64,43,C.accent);
 g.wrap(p.caption||'Publicação',202,y+52,765,21,28,C.white,2);g.text(dt(p.date)+'   •   '+p.type,202,y+114,18,C.muted);
 g.text(fmt(p.likes+p.comments)+' interações   •   '+fmt(p.plays||0)+' reproduções',202,y+146,17,C.soft);
 g.text('ABRIR PUBLICAÇÃO ↗',830,y+146,14,C.accent);g.link('https://www.instagram.com/'+(p.type==='Reel'?'reel':'p')+'/'+p.shortCode+'/',77,y,946,169)});
 if(!rank.length)g.text('Nenhuma publicação encontrada nesse período.',80,390,25,C.muted);
 g=pageHelper(pdf,fontFace,logo);g.base('Leitura estratégica','O que os números sugerem para o próximo ciclo.');
 const share=interactions?(Number(rank[0]?.likes||0)+Number(rank[0]?.comments||0))*100/interactions:0;
 const insights=[['DESTAQUE','O conteúdo líder representa '+share.toFixed(1).replace('.',',')+'% das interações do período.'],['FORMATO',reels+' Reels em '+posts.length+' publicações. O vídeo pode continuar como formato prioritário.'],['CONSISTÊNCIA','Mediana de '+fmt(med)+' interações por conteúdo. A mediana ajuda a compreender o resultado típico sem o peso de um viral.'],['DIREÇÃO','Reaproveitar assuntos e aberturas dos melhores vídeos, com testes de séries, roteiros curtos e chamadas claras para comentários.']];
 insights.forEach(([label,copy],i)=>{const y=355+i*220;g.rect(76,y,947,185,C.deep);g.text(label,106,y+51,16,C.accent);g.wrap(copy,106,y+102,865,21,32,C.white,2)});
 g.text('ONE WAY  /  ESTRATÉGIA · CRIAÇÃO · CONEXÃO',77,1395,16,C.accent);
 return Buffer.from(await pdf.save({useObjectStreams:true}));
}
module.exports={createPDF};