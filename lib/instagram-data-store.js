/* One Way — armazenamento econômico: somente dados JSON, nunca arquivos PDF.
 * Bucket privado separado, acessível apenas por rotas administrativas no servidor.
 */
const {randomUUID}=require('node:crypto');
const {url,serviceHeaders}=require('./oneway-server');
const BUCKET='oneway-instagram-data',PREFIX='reports/',RETENTION=30*86400000;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const FILE=/^[A-Za-z0-9._-]{1,160}\.json$/;
function safe(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]/gi,'_').replace(/_+/g,'_').slice(0,55)||'cliente';}
function headers(type='application/json'){return serviceHeaders(type);}
async function send(endpoint,method='GET',body,contentType='application/json'){
 const response=await fetch(url()+'/storage/v1'+endpoint,{
  method,headers:headers(contentType),...(body===undefined?{}:{body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(25000)
 });
 return response;
}
async function detail(response){
 const s=(await response.text().catch(()=>'')).slice(0,380);
 return 'Storage '+response.status+': '+s;
}
async function ensureBucket(){
 const current=await send('/bucket/'+BUCKET);
 if(current.ok)return;
 if(current.status!==404)throw Error('Não foi possível consultar bucket de análises: '+await detail(current));
 const created=await send('/bucket','POST',{id:BUCKET,name:BUCKET,public:false,allowed_mime_types:['application/json'],file_size_limit:2097152});
 if(created.ok||created.status===409)return;
 if(created.status===400){
  const verify=await send('/bucket/'+BUCKET);
  if(verify.ok)return;
 }
 throw Error('Não foi possível criar armazenamento privado de dados: '+await detail(created));
}
function valid(name){return FILE.test(name)&&!name.includes('..');}
async function storeReport(report,run={}){
 await ensureBucket();
 const date=new Date();
 const stamp=date.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const id=String(run.id||randomUUID().replace(/-/g,''));
 if(!/^[a-zA-Z0-9-]{12,40}$/.test(id))throw Error('Identificador do relatório inválido.');
 const cost=(run.usageTotalUsd===null||run.usageTotalUsd===undefined)?null:Number(run.usageTotalUsd);
 const name=[stamp,safe(report.username),report.from,report.to,safe(report.clientName||report.username),id].join('__')+'.json';
 const cleanPosts=(Array.isArray(report.posts)?report.posts:[]).slice(0,300).map(p=>({
   date:String(p.date||'').slice(0,10),
   shortCode:String(p.shortCode||'').replace(/[^a-z0-9_-]/gi,'').slice(0,32),
   type:['Reel','Carrossel','Imagem'].includes(p.type)?p.type:'Imagem',
   likes:Math.max(0,Number(p.likes)||0),comments:Math.max(0,Number(p.comments)||0),
   plays:p.plays==null?null:Math.max(0,Number(p.plays)||0),
   caption:String(p.caption||'').slice(0,800)
 }));
 const payload={
   schemaVersion:1,createdAt:date.toISOString(),expiresAt:new Date(date.getTime()+RETENTION).toISOString(),
   runId:id,clientName:String(report.clientName||report.username).slice(0,100),
   username:String(report.username||'').toLowerCase(),from:report.from,to:report.to,
   costUsd:cost!==null&&Number.isFinite(cost)?cost:null,
   coverageNote:String(report.coverageNote||'').slice(0,300),posts:cleanPosts
 };
 if(!DAY.test(payload.from)||!DAY.test(payload.to)||!payload.username)throw Error('Intervalo ou perfil inválido.');
 const body=JSON.stringify(payload);
 if(Buffer.byteLength(body,'utf8')>2*1024*1024)throw Error('Dados da análise excedem limite seguro.');
 const result=await send('/object/'+BUCKET+'/'+PREFIX+encodeURIComponent(name),'POST',body);
 if(result.status===409)return {duplicate:true,name,costUsd:payload.costUsd,bytes:Buffer.byteLength(body)};
 if(!result.ok)throw Error('Falha ao salvar dados da análise: '+await detail(result));
 return {saved:true,name,costUsd:payload.costUsd,bytes:Buffer.byteLength(body)};
}
async function listFiles(){
 await ensureBucket();let all=[];
 for(let offset=0;offset<2000;offset+=100){
  const result=await send('/object/list/'+BUCKET,'POST',{prefix:PREFIX,limit:100,offset,sortBy:{column:'created_at',order:'desc'}});
  if(!result.ok)throw Error('Erro listando análises: '+await detail(result));
  const items=await result.json();
  if(!Array.isArray(items))throw Error('Formato da lista de análises inválido.');
  all.push(...items.filter(x=>valid(x.name||'')));
  if(items.length<100)break;
 }
 return all;
}
function metadata(item){
 const parts=item.name.slice(0,-5).split('__');
 if(parts.length!==6)return null;
 const [stamp,username,from,to,client,id]=parts;
 if(!DAY.test(from)||!DAY.test(to))return null;
 const created=Date.parse(item.created_at||'');
 if(!Number.isFinite(created))return null;
 return {name:item.name,id,clientName:client.replace(/_/g,' '),username,from,to,createdAt:new Date(created).toISOString(),expiresAt:new Date(created+RETENTION).toISOString(),bytes:Number(item.metadata?.size||0)};
}
async function listReports(){
 const items=await listFiles();
 return items.map(metadata).filter(Boolean).filter(x=>Date.parse(x.expiresAt)>Date.now()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
async function getReport(name){
 if(!valid(name))throw Object.assign(new Error('Arquivo inválido.'),{status:400});
 const result=await send('/object/'+BUCKET+'/'+PREFIX+encodeURIComponent(name));
 if(result.status===404)throw Object.assign(new Error('Análise não encontrada.'),{status:404});
 if(!result.ok)throw Error('Não foi possível ler os dados: '+await detail(result));
 const content=await result.json();
 if(content.schemaVersion!==1||!Array.isArray(content.posts))throw Error('Dados salvos em formato inválido.');
 if(Date.parse(content.expiresAt)<=Date.now())throw Object.assign(new Error('Análise expirada.'),{status:410});
 return content;
}
async function removeReports(names){
 const paths=names.filter(valid).map(n=>PREFIX+n);
 if(!paths.length)return;
 const response=await send('/object/'+BUCKET,'DELETE',{prefixes:paths});
 if(!response.ok)throw Error('Não foi possível excluir a análise: '+await detail(response));
}
async function testStore(){
 await ensureBucket();
 const name='_check_'+randomUUID().replace(/-/g,'')+'.json';
 const body=JSON.stringify({probe:true,at:new Date().toISOString()});
 const response=await send('/object/'+BUCKET+'/'+PREFIX+name,'POST',body);
 if(!response.ok)throw Error('Não foi possível testar o salvamento JSON: '+await detail(response));
 await removeReports([name]);
 return {ok:true,message:'Salvamento de dados JSON e exclusão confirmados. Nenhum PDF foi armazenado e nenhum crédito Apify foi usado.'};
}
module.exports={BUCKET,PREFIX,RETENTION,ensureBucket,storeReport,listReports,getReport,removeReports,listFiles,testStore,metadata,valid};
