const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const password = process.env.ADMIN_PASSWORD;
const sessions = new Map();
let queue = Promise.resolve();
async function records() { try { return JSON.parse(await fs.readFile(path.join(DATA, 'projects.json'), 'utf8')); } catch(e) { if(e.code === 'ENOENT') return []; throw e; } }
async function persist(change) {
  const task = queue.then(async () => { const items = await records(); const result = change(items); await fs.mkdir(DATA,{recursive:true}); await fs.writeFile(path.join(DATA,'projects.tmp'),JSON.stringify(result)); await fs.rename(path.join(DATA,'projects.tmp'),path.join(DATA,'projects.json')); });
  queue = task.catch(()=>{}); return task;
}
function authenticated(req) { const token = /(?:^|; )portfolio_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]; return (sessions.get(token) || 0) > Date.now(); }
function send(res,status,value) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); }
async function body(req) { let size=0; const chunks=[]; for await(const chunk of req) { size+=chunk.length; if(size>36*1024*1024) throw new Error('Upload exceeds server limit.'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString()); }
function validate(p) {
  if(!p || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.id) || typeof p.title!=='string' || !p.title.trim() || p.title.length>70 || !['landing','website'].includes(p.category)) throw Error('Invalid project details.');
  if(typeof p.description!=='string' || p.description.length>260 || !Array.isArray(p.tags) || p.tags.length>10 || p.tags.some(t=>typeof t!=='string'||t.length>100)) throw Error('Invalid project description or tags.');
  if(!Array.isArray(p.files)||!p.files.length||p.files.length>250) throw Error('Upload one HTML file or a ZIP containing a website.');
  let size=0; const paths=new Set();
  for(const f of p.files) {
    if(typeof f.path!=='string'||f.path.length>500||f.path.startsWith('/')||f.path.includes('\\')||f.path.includes('\0')||f.path.split('/').some(s=>s==='..'||s==='.'||!s)||paths.has(f.path)||! /\.(html?|css|js|mjs|json|txt|xml|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|webmanifest|pdf|map)$/i.test(f.path)) throw Error('Invalid website path.');
    paths.add(f.path);
    if(typeof f.data!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data)) throw Error('Invalid file content.');
    const bytes=Buffer.byteLength(f.data,'base64'); if(bytes>8*1024*1024) throw Error('File exceeds 8 MB.'); size+=bytes;
    f.type = 'application/octet-stream';
  }
  if(size>20*1024*1024||!paths.has(p.entryPath)||! /\.html?$/i.test(p.entryPath)) throw Error('Invalid entry page or website exceeds 20 MB.');
  if(p.thumbnail && (typeof p.thumbnail!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(p.thumbnail)||p.thumbnail.length>5600000)) throw Error('Invalid thumbnail.');
  return {id:p.id,title:p.title.trim(),description:p.description,category:p.category,tags:p.tags,published:p.published!==false,files:p.files.map(f=>({path:f.path,type:f.type,data:f.data})),entryPath:p.entryPath,thumbnail:p.thumbnail||null,updatedAt:Date.now(),isDemo:false};
}
const attempts=new Map();
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://server');
  if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`https://${req.headers.host}` && req.headers.origin!==`http://${req.headers.host}`) return send(res,403,{error:'Untrusted origin.'});
  if(url.pathname==='/api/session' && req.method==='GET') return send(res,200,{authenticated:authenticated(req)});
  if(url.pathname==='/api/login' && req.method==='POST') {
    if(!password) return send(res,503,{error:'Set ADMIN_PASSWORD on the server to enable management.'});
    const ip=req.socket.remoteAddress, now=Date.now(); let a=attempts.get(ip); if(!a||now>a.until) {a={count:0,until:now+600000};attempts.set(ip,a);} if(++a.count>15) return send(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
    const input=await body(req); const hash=s=>crypto.createHash('sha256').update(String(s||'')).digest();
    if(!crypto.timingSafeEqual(hash(input.password),hash(password))) return send(res,401,{error:'Incorrect password.'});
    const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,now+8*3600000);
    res.setHeader('Set-Cookie',`portfolio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.headers['x-forwarded-proto']==='https'||req.socket.encrypted?'; Secure':''}`); return send(res,200,{ok:true});
  }
  if(url.pathname==='/api/projects' && req.method==='GET') { const items=await records(); return send(res,200,items.map(p=>authenticated(req)||p.published!==false?p:{id:p.id,published:false,files:[],tags:[]})); }
  if(url.pathname.startsWith('/api/projects') && ['PUT','DELETE'].includes(req.method)) {
    if(!authenticated(req)) return send(res,401,{error:'Sign in to manage projects.'});
    if(req.method==='PUT' && url.pathname==='/api/projects') {const p=validate(await body(req)); await persist(items=>[...items.filter(i=>i.id!==p.id),p]); return send(res,200,{ok:true});}
    if(req.method==='DELETE' && /^\/api\/projects\/[\w-]+$/.test(url.pathname)) {const id=url.pathname.split('/').pop();await persist(items=>items.filter(i=>i.id!==id));return send(res,200,{ok:true});}
  }
  const files={'/':'index.html','/index.html':'index.html','/Index.html':'Index.html'};
  if(req.method==='GET'&&files[url.pathname]) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});return res.end(await fs.readFile(path.join(__dirname,files[url.pathname])));}
  send(res,404,{error:'Not found.'});
 } catch(e) {send(res,400,{error:e.message||'Request failed.'});}
});
if(require.main===module) server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Portfolio server ready'));
module.exports={server,validate};
