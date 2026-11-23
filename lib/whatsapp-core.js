'use strict';
// One Way · Assistente de WhatsApp — regras puras (sem rede), fáceis de testar.
const crypto=require('node:crypto');

const KINDS=['solicitacao','agendamento','duvida','reuniao','nota','outro'];
const STATUSES=['processando','novo','feito','arquivado','erro'];
const AREAS=['arte','video','trafego','outro'];
// Transcrições maiores que isso são tratadas como reunião, mesmo vindas de cliente.
const MEETING_MIN_CHARS=2500;

const clip=(v,n)=>String(v??'').slice(0,n);
const normalizePhone=v=>String(v??'').replace(/\D/g,'').slice(0,20);

function safeEqual(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);
}

// Lê o formato padrão da Cloud API (Meta e 360dialog usam o mesmo).
function extractMessages(payload){
  const out=[];
  const entries=Array.isArray(payload?.entry)?payload.entry:[];
  for(const entry of entries){
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      const value=change?.value||{};
      const names=new Map((Array.isArray(value.contacts)?value.contacts:[]).map(c=>[normalizePhone(c?.wa_id),clip(c?.profile?.name,120)]));
      for(const m of Array.isArray(value.messages)?value.messages:[]){
        if(!m||typeof m!=='object'||!m.id||!m.from)continue;
        const from=normalizePhone(m.from);
        const item={id:clip(m.id,200),from,name:names.get(from)||'',type:clip(m.type,30)||'unknown',text:'',mediaId:'',mime:'',timestamp:Number(m.timestamp)||0,groupId:clip(m.group_id,120)};
        if(m.type==='text')item.text=clip(m.text?.body,8000);
        else if(m.type==='audio'){item.mediaId=clip(m.audio?.id,200);item.mime=clip(m.audio?.mime_type,80)}
        else if(['image','video','document'].includes(m.type)){item.text=clip(m[m.type]?.caption,4000);item.mediaId=clip(m[m.type]?.id,200);item.mime=clip(m[m.type]?.mime_type,80)}
        else if(m.type==='button')item.text=clip(m.button?.text,1000);
        else if(m.type==='interactive')item.text=clip(m.interactive?.button_reply?.title||m.interactive?.list_reply?.title,1000);
        out.push(item);
      }
    }
  }
  return out;
}

// Decide o que fazer com cada mensagem.
function routeMessage(msg,{isTeam=false}={}){
  if(msg.type==='audio')return isTeam?'meeting':'transcribe';
  if(msg.text)return isTeam?'note':'classify';
  return 'ignore';
}

// Pega o primeiro objeto JSON que o modelo devolveu (mesmo com texto em volta).
function parseJsonReply(text){
  const s=String(text||'');
  const start=s.indexOf('{'),end=s.lastIndexOf('}');
  if(start<0||end<=start)return null;
  try{return JSON.parse(s.slice(start,end+1))}catch{return null}
}

function cleanClassification(raw){
  const r=raw&&typeof raw==='object'?raw:{};
  const kind=KINDS.includes(r.tipo)&&r.tipo!=='reuniao'&&r.tipo!=='nota'?r.tipo:'outro';
  return {
    kind,
    summary:clip(r.resumo,600),
    client:clip(r.cliente,120),
    deadline:clip(r.prazo,80),
    scheduleAt:clip(r.data_agendamento,40),
    needsHuman:!!r.precisa_humano,
    reply:clip(r.resposta,1200)
  };
}

function cleanMeeting(raw){
  const r=raw&&typeof raw==='object'?raw:{};
  const list=(v,n)=>(Array.isArray(v)?v:[]).map(x=>clip(x,400)).filter(Boolean).slice(0,n);
  const tasks=(Array.isArray(r.plano_de_acao)?r.plano_de_acao:[]).map(t=>({
    task:clip(t?.tarefa,300),
    owner:clip(t?.responsavel,80),
    deadline:clip(t?.prazo,80),
    area:AREAS.includes(t?.area)?t.area:'outro'
  })).filter(t=>t.task).slice(0,30);
  return {
    client:clip(r.cliente,120),
    title:clip(r.titulo,160),
    summary:clip(r.resumo,3000),
    decisions:list(r.decisoes,30),
    plan:tasks,
    clientPending:list(r.pendencias_cliente,30)
  };
}

const AGENCY_DEFAULT='A One Way Agency é uma agência de marketing de Cuiabá (MT) que atende empresas em todo o Brasil, principalmente de médio porte. Faz artes, vídeos, gestão de redes sociais e tráfego pago. Site: onewayagc.com.';

function classifyPrompt({agencyInfo,clientNames,knownClient,contactName}){
  return `Você é o assistente de atendimento da One Way Agency no WhatsApp.
Sobre a agência: ${agencyInfo||AGENCY_DEFAULT}
Clientes atuais da agência: ${(clientNames||[]).join(', ')||'(lista indisponível)'}.
Quem está escrevendo: ${contactName||'contato sem nome'}${knownClient?` — cliente ${knownClient}`:' — cliente ainda não identificado'}.

Leia a mensagem e devolva SOMENTE um JSON com estes campos:
{"tipo":"solicitacao|agendamento|duvida|outro","resumo":"uma frase objetiva do que foi pedido","cliente":"nome do cliente da lista, se der para saber; senão vazio","prazo":"prazo citado ou vazio","data_agendamento":"AAAA-MM-DDTHH:MM se pediram horário; senão vazio","precisa_humano":true/false,"resposta":"mensagem curta para mandar de volta, ou vazio"}

Regras:
- "solicitacao": pedido de arte, vídeo, ajuste, post, campanha ou qualquer trabalho. "agendamento": pedido de reunião, gravação ou visita. "duvida": pergunta. "outro": bom dia, ok, obrigado, figurinha e conversa sem pedido.
- A resposta é em português do Brasil, simpática, curta (até 3 linhas), sem emojis exagerados, assinada como "Equipe One Way".
- Nunca confirme preço, prazo de entrega ou horário. Diga que foi registrado e que a equipe confirma em seguida.
- Para "outro", deixe "resposta" vazio (não precisa responder).
- Se não souber responder uma dúvida com as informações acima, marque precisa_humano=true e diga que a equipe já vai responder.`;
}

function meetingPrompt({clientNames,knownClient,caption}){
  return `Você organiza reuniões da One Way Agency (agência de marketing).
Clientes atuais: ${(clientNames||[]).join(', ')||'(lista indisponível)'}.
${knownClient?`Cliente provável: ${knownClient}.`:''}${caption?`\nObservação de quem enviou: ${caption}`:''}

A seguir vem a transcrição de um áudio de reunião. Devolva SOMENTE um JSON:
{"cliente":"nome da lista ou vazio","titulo":"título curto da reunião","resumo":"resumo em até 8 linhas","decisoes":["..."],"plano_de_acao":[{"tarefa":"o que fazer","responsavel":"One Way ou cliente ou nome citado","prazo":"prazo citado ou vazio","area":"arte|video|trafego|outro"}],"pendencias_cliente":["o que o cliente ficou de enviar ou fazer"]}
Seja fiel ao que foi dito. Não invente prazos, nomes nem valores.`;
}

function publicItem(row){
  if(!row||typeof row!=='object')return null;
  return {
    id:row.id,phone:row.phone,contactName:row.contact_name,clientName:row.client_name,kind:row.kind,
    messageType:row.message_type,text:row.text,transcript:row.transcript,summary:row.summary,
    details:row.details||{},reply:row.reply,status:row.status,error:row.error,
    demandIds:Array.isArray(row.demand_ids)?row.demand_ids:[],createdAt:row.created_at
  };
}


// Confirmações de entrega/leitura das mensagens que a agência mandou.
function extractStatuses(payload){
  const out=[];
  for(const entry of Array.isArray(payload?.entry)?payload.entry:[]){
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      for(const st of Array.isArray(change?.value?.statuses)?change.value.statuses:[]){
        if(!st?.id||!['sent','delivered','read','failed'].includes(st.status))continue;
        out.push({id:clip(st.id,200),status:st.status,error:clip(st.errors?.[0]?.title||st.errors?.[0]?.message,300)});
      }
    }
  }
  return out;
}

// A Meta só deixa mandar mensagem livre até 24h depois da última mensagem do cliente.
const WINDOW_MS=24*60*60*1000;
function windowOpen(lastInAt,now=Date.now()){
  const t=Date.parse(lastInAt||'');
  return Number.isFinite(t)&&now-t<WINDOW_MS;
}
// Conversa "vermelha": o cliente falou depois da última resposta humana (ou de marcar resolvida).
function isUnanswered(c){
  const lastIn=Date.parse(c?.last_in_at||'');
  if(!Number.isFinite(lastIn))return false;
  const human=Date.parse(c?.last_human_out_at||'')||0,resolved=Date.parse(c?.resolved_at||'')||0;
  return lastIn>Math.max(human,resolved);
}

// Senha da equipe (mesmo cálculo do login do sistema) e um passe assinado de 12h.
const TEAM_VERIFY_SALT='oneway-team-verifier-v1',TEAM_VERIFY_ITERATIONS=120000;
const TEAM_VERIFIER_HEX='60569e31f4ca6a772300a4bac7917b700e69ace2be19b3327a553ae50aa1747e';
function verifyTeamPassword(password){
  return new Promise(resolve=>{
    crypto.pbkdf2(String(password||''),TEAM_VERIFY_SALT,TEAM_VERIFY_ITERATIONS,32,'sha256',(err,key)=>resolve(!err&&safeEqual(key.toString('hex'),TEAM_VERIFIER_HEX)));
  });
}
function signTeamToken(secret,name,now=Date.now()){
  const body=Buffer.from(JSON.stringify({n:clip(name,60),exp:now+12*60*60*1000})).toString('base64url');
  return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');
}
function readTeamToken(secret,token,now=Date.now()){
  const [body,sig]=String(token||'').split('.');
  if(!secret||!body||!sig)return null;
  if(!safeEqual(sig,crypto.createHmac('sha256',secret).update(body).digest('base64url')))return null;
  try{const d=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return d.exp>now?{name:clip(d.n,60)}:null}catch{return null}
}

module.exports={extractStatuses,windowOpen,isUnanswered,verifyTeamPassword,signTeamToken,readTeamToken,KINDS,STATUSES,AREAS,MEETING_MIN_CHARS,clip,normalizePhone,safeEqual,extractMessages,routeMessage,parseJsonReply,cleanClassification,cleanMeeting,classifyPrompt,meetingPrompt,publicItem,AGENCY_DEFAULT};
