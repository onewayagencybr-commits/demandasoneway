const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const window={addEventListener(){}};vm.runInNewContext(fs.readFileSync('modules/scripts-ui.js','utf8'),{window,crypto:require('node:crypto').webcrypto,document:{getElementById(){}},structuredClone});const api=window.owScripts;
test('wrapping preserves all characters of long words and paragraph breaks',()=>{const ctx={measureText:t=>({width:t.length})};const input='ação '.repeat(100)+'x'.repeat(1000)+'\n\nFIM';const lines=api.wrap(ctx,input,40);assert(lines.every(l=>l.length<=40));assert.equal(lines.join('').replace(/\s/g,''),input.replace(/\s/g,''));assert(lines.includes(''));});
test('durations honor manual values and estimate complete scripts',()=>{assert.equal(api.seconds({duration:'90'}),90);assert.equal(api.seconds({duration:'',mode:'full',text:'palavra '.repeat(138)}),60);assert.equal(api.seconds({duration:'',mode:'scenes',scenes:[{text:'',seconds:'10'},{text:'palavra '.repeat(23),seconds:''}]}),20);});
test('import rejects malformed documents and retains all twenty scenes',()=>{assert.throws(()=>api.validate({client:'A',title:'B',videos:[]}));const out=api.validate({client:'A',title:'B',videos:[{title:'Vídeo',mode:'scenes',scenes:Array.from({length:20},(_,i)=>({text:'Cena '+i,visual:'',seconds:''}))}]});assert.equal(out.videos[0].scenes.length,20);assert.equal(out.videos[0].scenes[19].text,'Cena 19');});

test('PDF de roteiros usa papel branco e azul-escuro e preserva os dois modos de vídeo',async()=>{
 const painted=[],labels=[];
 const ctx={
  fillStyle:'#000',font:'',textAlign:'left',
  measureText:t=>({width:String(t).length*14}),
  fillRect(x,y,w,h){painted.push({color:this.fillStyle,x,y,w,h})},
  fillText(value){labels.push({value,color:this.fillStyle})},
  beginPath(){},roundRect(){},fill(){},stroke(){},drawImage(){}
 };
 const fakeCanvas={width:0,height:0,getContext:()=>ctx,toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='};
 const fakeDocument={fonts:{add(){}},createElement:tag=>{assert.equal(tag,'canvas');return fakeCanvas}};
 class FakeFontFace{async load(){return this;}}
 const fakeWindow={addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('modules/scripts-ui.js','utf8'),{
  window:fakeWindow,crypto:require('node:crypto').webcrypto,document:fakeDocument,structuredClone,FontFace:FakeFontFace
 });
 const pages=await fakeWindow.owScripts.pagesFor({client:'Scania - Rota Oeste',videos:[
  {title:'Scania R 560 SUPER 6x4',mode:'full',duration:'70',text:'Um teste de texto completo.',scenes:[]},
  {title:'Vídeo em cenas',mode:'scenes',duration:'25',text:'',scenes:[{text:'Texto falado.',visual:'Enquadramento.',seconds:'10'}]}
 ]});
 assert.equal(pages.length,2);
 const backgrounds=painted.filter(c=>c.x===0&&c.y===0&&c.w===1440&&c.h===2036);
 assert.equal(backgrounds.length,2);
 assert.ok(backgrounds.every(c=>c.color==='#ffffff'));
 for(const phrase of ['Scania - Rota Oeste','Scania R 560 SUPER 6x4','Um teste de texto completo.','CENA 01','Texto falado.','Enquadramento.'])assert.ok(labels.some(l=>l.value.includes(phrase)),phrase);
 assert.ok(labels.filter(l=>l.value.includes('Scania R 560')).every(l=>l.color==='#102a55'));
 assert.ok(painted.filter(c=>c.w===1440&&c.h===2036).every(c=>c.color==='#ffffff'));
});

test('PDF slider fits representative Scania script on one page without cutting text',async()=>{
 const doc={fonts:{add(){}},createElement:()=>canvas};
 const written=[];
 const ctx={
  font:'',fillStyle:'#000',textAlign:'left',
  measureText(t){const match=this.font.match(/(\d+(?:\\.\d+)?)px/);return {width:String(t).length*Number(match?.[1]||30)*.51};},
  fillRect(){},fillText(t){written.push(String(t))},beginPath(){},roundRect(){},fill(){},stroke(){},drawImage(){}
 };
 const canvas={getContext:()=>ctx,toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='};
 class FontFace{async load(){return this;}}
 const mockedWindow={addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('modules/scripts-ui.js','utf8'),{
  window:mockedWindow,document:doc,FontFace,crypto:require('node:crypto').webcrypto,structuredClone
 });
 const body=[
  'Já pensou em ter na sua frota um caminhão preparado para entregar desempenho, eficiência e rentabilidade para o seu negócio?',
  'Conheça o Scania R 560 SUPER 6x4: potência, tecnologia e soluções desenvolvidas para encarar os desafios do transporte.',
  'Na estrada, cada detalhe faz a diferença.',
  'A disponibilidade do veículo é fundamental para manter sua operação em movimento.',
  'A eficiência e a economia de combustível podem contribuir para reduzir os custos operacionais e melhorar a rentabilidade por quilômetro rodado.',
  'O desempenho vai além da força:\n- tecnologia, recursos de segurança e conforto para o motorista fazem parte de uma experiência pensada para enfrentar longas jornadas com mais confiança e praticidade.',
  'Se você busca mais eficiência, produtividade e potencial de rentabilidade para sua operação, venha conhecer o Scania R 560 SUPER 6x4.',
  'Entre em contato com a Rota Oeste Veículos e converse com nosso time comercial.\nScania R 560 SUPER 6x4.',
  'Mais do que potência, uma escolha estratégica para o seu negócio.'
 ].join('\n\n');
 const script={client:'Scania - Rota Oeste',videos:[{title:'Scania R 560 SUPER 6x4',duration:'70',mode:'scenes',text:'',scenes:[{text:body,visual:'',seconds:''}]}]};
 const normal=await mockedWindow.owScripts.pagesFor({...script,pdfFontScale:100});
 const smaller=await mockedWindow.owScripts.pagesFor({...script,pdfFontScale:85});
 assert.equal(normal.length,2);
 assert.equal(smaller.length,1);
 assert.ok(written.some(s=>s.includes('Mais do que potência')));
 assert.equal(mockedWindow.owScripts.validate({client:'X',title:'',videos:script.videos}).pdfFontScale,100);
 assert.equal(mockedWindow.owScripts.validate({...script,title:'',pdfFontScale:85}).pdfFontScale,85);
 assert.equal(mockedWindow.owScripts.fontScale(20),70);
 assert.equal(mockedWindow.owScripts.fontScale(200),115);
});

test('references survive document reload and old scripts remain compatible',()=>{
 const context={window:{addEventListener(){}},URL,crypto:require('node:crypto').webcrypto,document:{getElementById(){}},structuredClone};
 vm.runInNewContext(fs.readFileSync('modules/scripts-ui.js','utf8'),context);
 const api=context.window.owScripts;
 const v={title:'Vídeo',mode:'full',text:'Texto',scenes:[],references:'https://youtu.be/abc\nhttps://www.instagram.com/reel/xyz/'};
 const d=api.validate({client:'Cliente',title:'',videos:[v]});
 assert.equal(d.videos[0].references,v.references);
 assert.equal(api.referenceURLs(d.videos[0].references).length,2);
 assert.equal(api.validate({client:'Cliente',title:'',videos:[{...v,references:undefined}]}).videos[0].references,'');
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com','não é um link'])assert.throws(()=>api.referenceURLs(value));
 assert.equal(api.pdfIssue({...d,videos:[{...v,references:'javascript:alert(1)'}]}),'Use um link de referência http:// ou https:// sem credenciais.');
});

test('compact reference QR codes interrupt card border without pushing text and keep PDF links',async()=>{
 const written=[],images=[],painted=[];
 const ctx={
  font:'',fillStyle:'#000',textAlign:'left',imageSmoothingEnabled:true,imageSmoothingQuality:'low',
  measureText:t=>({width:String(t).length*14}),
  fillRect(x,y,w,h){painted.push({color:this.fillStyle,x,y,w,h})},
  fillText(t){written.push(String(t))},
  beginPath(){},roundRect(){},fill(){},stroke(){},drawImage(...args){images.push(args)}
 };
 const canvas=()=>({width:0,height:0,getContext:()=>ctx,toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='});
 const mockDoc={fonts:{add(){}},createElement:tag=>{assert.equal(tag,'canvas');return canvas()}};
 const mockQr=()=>({addData(){},make(){},getModuleCount:()=>25,isDark:()=>false});
 class FontFace{async load(){return this;}}
 const fakeWindow={addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('modules/scripts-ui.js','utf8'),{
  window:fakeWindow,document:mockDoc,FontFace,qrcode:mockQr,URL,crypto:require('node:crypto').webcrypto,structuredClone
 });
 const urls=['https://youtu.be/first','https://youtu.be/second','https://youtu.be/third'];
 const script={client:'One Way Agency',pdfFontScale:100,videos:[{title:'Bastidores da produção',mode:'full',duration:'30',text:'Um roteiro curto em uma página.',references:urls.join('\\n'),scenes:[]}]};
 const pages=await fakeWindow.owScripts.pagesFor(script);
 assert.equal(pages.length,1);
 assert.equal(pages.links[0].length,3);
 assert.deepEqual(Array.from(pages.links[0],link=>link.url),urls);
 assert.deepEqual(Array.from(pages.links[0],link=>link.w),[182,182,182]);
 assert.ok(pages.links[0].every(link=>link.y===212&&link.h===182));
 assert.ok(pages.links[0][0].x<pages.links[0][1].x&&pages.links[0][1].x<pages.links[0][2].x);
 assert.ok(painted.some(r=>r.color==='#ffffff'&&r.y===200&&r.w===210&&r.h===206),'white cutout above card border');
 assert.equal(images.filter(args=>args.length===5&&args[3]===182&&args[4]===182).length,3);
 assert.ok(written.includes('ROTEIRO COMPLETO'));
 assert.ok(written.some(t=>t.includes('Um roteiro curto')));
 assert.ok(!written.some(t=>t.includes('Abrir referência')));
});
