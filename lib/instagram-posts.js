// Match the existing One Way public-metric accounting.
function localISO(when){return new Date(new Date(when).getTime()-4*3600000).toISOString().slice(0,10)}
function normalize(records,from,to){
 const seen=new Set(),posts=[];
 for(const p of records){
  if(!p.timestamp||!p.shortCode)continue;
  const date=localISO(p.timestamp);
  if(date<from||date>to||seen.has(p.shortCode))continue;
  seen.add(p.shortCode);
  posts.push({date,shortCode:p.shortCode,type:p.type==='Video'?'Reel':p.type==='Sidecar'?'Carrossel':'Imagem',likes:Math.max(0,Number(p.likesCount)||0),comments:Math.max(0,Number(p.commentsCount)||0),plays:p.videoPlayCount==null?null:Math.max(0,Number(p.videoPlayCount)||0),caption:String(p.caption||'').slice(0,800)});
 }
 posts.sort((a,b)=>b.date.localeCompare(a.date));return posts;
}
module.exports={normalize};