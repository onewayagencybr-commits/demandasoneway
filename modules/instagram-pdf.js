/* One Way — exportador PDF nativo (offline, sem jsPDF ou CDN).
 * Comprime páginas JPEG e preserva links clicáveis para publicações.
 */
(()=>{
  'use strict';
  const PT_W=595.28,PT_H=841.89;
  const CANVAS_W=1100,CANVAS_H=1556;
  const safeCode=v=>/^[A-Za-z0-9_-]{6,35}$/.test(String(v||''))?String(v):null;
  const urlForPost=p=>{const code=safeCode(p?.shortCode);return code?'https://www.instagram.com/p/'+code+'/':null;};
  const round=v=>Number(v).toFixed(2);
  function build(pages,posts=[]){
    if(!Array.isArray(pages)||!pages.length)throw Error('Não há páginas para exportar.');
    const N=pages.length,featured=[...posts].sort((a,b)=>(Number(b.likes)+Number(b.comments))-(Number(a.likes)+Number(a.comments))).slice(0,5);
    const annotations=[];
    if(N>=2){
      featured.forEach((p,i)=>{
        const url=urlForPost(p);if(!url)return;
        const x=77,y=340+198*i,width=946,height=169;
        const rect=[
          round(x*PT_W/CANVAS_W),
          round((CANVAS_H-y-height)*PT_H/CANVAS_H),
          round((x+width)*PT_W/CANVAS_W),
          round((CANVAS_H-y)*PT_H/CANVAS_H)
        ];
        annotations.push({id:3+N*3+annotations.length,page:1,url,rect});
      });
    }
    const encoder=new TextEncoder(),chunks=[],offset=[0];let size=0;
    function append(part){const b=typeof part==='string'?encoder.encode(part):part;chunks.push(b);size+=b.length;}
    function obj(id,value){offset[id]=size;append(id+' 0 obj\n'+value+'\nendobj\n');}
    append('%PDF-1.4\n%ONEWAY\n');
    obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
    obj(2,'<< /Type /Pages /Count '+N+' /Kids ['+pages.map((_,i)=>(3+3*i)+' 0 R').join(' ')+'] >>');
    for(let i=0;i<N;i++){
      const p=3+3*i,img=p+1,content=p+2;
      const cv=pages[i],jpeg=cv.toDataURL('image/jpeg',.90),bin=atob(jpeg.split(',')[1]),bytes=new Uint8Array(bin.length);
      for(let j=0;j<bin.length;j++)bytes[j]=bin.charCodeAt(j);
      const links=annotations.filter(a=>a.page===i).map(a=>a.id+' 0 R');
      obj(p,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PT_W+' '+PT_H+'] /Resources << /XObject << /Im0 '+img+' 0 R >> >> /Contents '+content+' 0 R'+(links.length?' /Annots ['+links.join(' ')+']':'')+' >>');
      offset[img]=size;
      append(img+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+cv.width+' /Height '+cv.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bytes.length+' >>\nstream\n');
      append(bytes);append('\nendstream\nendobj\n');
      const command='q '+PT_W+' 0 0 '+PT_H+' 0 0 cm /Im0 Do Q\n';
      obj(content,'<< /Length '+encoder.encode(command).length+' >>\nstream\n'+command+'endstream');
    }
    for(const a of annotations)obj(a.id,'<< /Type /Annot /Subtype /Link /Rect ['+a.rect.join(' ')+'] /Border [0 0 0] /A << /S /URI /URI ('+a.url+') >> >>');
    const maxId=2+3*N+annotations.length,cross=size;
    append('xref\n0 '+(maxId+1)+'\n0000000000 65535 f \n');
    for(let i=1;i<=maxId;i++){
      if(!Number.isFinite(offset[i]))throw Error('Erro interno na numeração do PDF.');
      append(String(offset[i]).padStart(10,'0')+' 00000 n \n');
    }
    append('trailer\n<< /Size '+(maxId+1)+' /Root 1 0 R >>\nstartxref\n'+cross+'\n%%EOF');
    return new Blob(chunks,{type:'application/pdf'});
  }
  window.onewayInstagramPDF={build};
})();