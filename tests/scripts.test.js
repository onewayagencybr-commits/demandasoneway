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
