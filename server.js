const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
require('./src/config');
const {getDirectory}=require('./src/directory');
const {getChat,aiSettings}=require('./src/ai');
const {getPhoto,photoSettings}=require('./src/photos');
const PORT=Number(process.env.PORT || 3000);
const ROOT=path.join(__dirname,'public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const recentPlaces=new Map();
const visits=new Map();
function json(res,status,data,extras={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extras});res.end(JSON.stringify(data));
}
function rememberPlaces(places) {
  const now=Date.now();for(const [id,p] of recentPlaces) if(p.until<now) recentPlaces.delete(id);
  for(const place of places) recentPlaces.set(place.id,{place,until:now+10*60*1000});
}
function rateOK(req,route) {
  const ip=String(req.socket.remoteAddress || 'unknown'); const key=ip+':'+route; const now=Date.now();
  for(const [id,val] of visits) if(val.until<now) visits.delete(id);
  const r=visits.get(key) || {num:0,until:now+60_000};
  r.num++;visits.set(key,r);return r.num <= (route==='photo'?90:route==='chat'?30:50);
}
function parseBody(req,limit=20000) {
  return new Promise((resolve,reject)=>{
    let chunks=[],length=0;
    req.on('data',chunk=>{length+=chunk.length;if(length>limit){reject(Object.assign(new Error('Request too large'),{status:413}));req.destroy();return;}chunks.push(chunk);});
    req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});
    req.on('error',reject);
  });
}
async function handler(req,res) {
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://www.openstreetmap.org; base-uri 'none'; object-src 'none'; form-action 'self'");
  let url;try {url=new URL(req.url,'http://localhost');}catch {return json(res,400,{error:'Invalid URL'});}
  if(req.method==='GET' && url.pathname==='/api/health') return json(res,200,{ok:true,app:'CBD Ventures AI Assistance',uptimeSeconds:Math.floor(process.uptime())});
  if(req.method==='GET' && url.pathname==='/api/config') return json(res,200,{aiAvailable:aiSettings().configured,aiProvider:aiSettings().configured?aiSettings().provider:'local',photosAvailable:true,localPhotosIncluded:true,externalPhotoServiceAvailable:photoSettings().places||photoSettings().streetview,photoMode:photoSettings().mode});
  if(req.method==='GET' && url.pathname==='/api/places') {
    if(!rateOK(req,'places')) return json(res,429,{error:'Too many requests. Please try again shortly.'});
    const directory=await getDirectory({category:url.searchParams.get('category'),q:url.searchParams.get('q')});
    rememberPlaces([...directory.places,...directory.pending]);
    return json(res,200,directory);
  }
  if(req.method==='POST' && url.pathname==='/api/chat') {
    if(!rateOK(req,'chat')) return json(res,429,{error:'Too many messages; try again in a minute.'});
    const body=await parseBody(req);
    if(!Array.isArray(body.messages) || body.messages.length<1 || body.messages.length>30 || body.messages.some(m=>!m || !['user','assistant'].includes(m.role) || typeof m.content!=='string' || m.content.length>2000) || body.messages.at(-1)?.role!=='user' || !body.messages.at(-1)?.content.trim()) return json(res,400,{error:'Send a valid message (up to 2,000 characters).'});
    const directory=await getDirectory(); rememberPlaces([...directory.places,...directory.pending]);
    const chat=await getChat(body.messages,directory.places,directory.pending);
    return json(res,200,{...chat,directoryWarning:directory.warning});
  }
  if(req.method==='GET' && url.pathname==='/api/photo') {
    if(!rateOK(req,'photo')) return json(res,429,{error:'Photo request limit reached.'});
    const id=String(url.searchParams.get('id') || '').slice(0,160);
    const remembered=recentPlaces.get(id);
    if(!remembered || remembered.until<Date.now()) return json(res,404,{error:'Photo unavailable; refresh nearby places.'});
    const place=remembered.place;
    try {
      const image=await getPhoto(place);
      if(!image) return json(res,404,{error:'No business photo or nearby Street View image available.'});
      if(image.redirect){res.writeHead(302,{'Location':image.redirect,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();}
      res.writeHead(200,{'Content-Type':image.contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(image.buffer);
    }catch(e){console.warn('Photo service error:',e.message);return json(res,503,{error:'Photo service temporarily unavailable.'});}
  }
  if(req.method!=='GET' && req.method!=='HEAD') return json(res,405,{error:'Method not allowed'});
  let pathname;
  try{pathname=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'Invalid path'});}
  if(pathname==='/' ) pathname='/index.html';
  const file=path.resolve(ROOT,'.'+pathname);
  if(file!==ROOT && !file.startsWith(ROOT+path.sep)) return json(res,403,{error:'Forbidden'});
  try {
    const stat=await fs.promises.stat(file);
    if(!stat.isFile()) return json(res,404,{error:'File not found'});
    const content=await fs.promises.readFile(file);
    const headers={'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':pathname==='/sw.js'?'no-cache':'public, max-age=180'};
    res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:content);
  }catch{return json(res,404,{error:'File not found'});}
}
const server=http.createServer((req,res)=>handler(req,res).catch(error=>{
  console.error('Request failed:',error.message);
  if(!res.headersSent) json(res,error.status || 500,{error:error.status===413?'Request too large.':'Something went wrong. Please try again.'});
}));
if(require.main===module) server.listen(PORT,'0.0.0.0',()=>console.log(`CBD Ventures AI Assistance listening on port ${PORT}`));
module.exports={server,handler};
