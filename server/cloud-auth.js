import {readJson} from './http-json.js';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),ttl=8*60*60*1000;
const digest=value=>createHash('sha256').update(value).digest('hex');
function matches(a,b){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export function createCloudAuth(db,{setupToken=process.env.ADMIN_SETUP_TOKEN||'',local=false}={}){
 const ns=db.namespace;
 const token=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ye_admin='))?.slice(9);
 async function authorized(req){const key=token(req);if(!key||! /^[a-f0-9]{64}$/.test(key))return false;const {rows}=await db.query('SELECT 1 FROM ye_sessions WHERE namespace=$1 AND token_hash=$2 AND expires_at>NOW()',[ns,digest(key)]);return !!rows.length;}
 function sameOrigin(req){return req.headers.origin===`${local?'http':'https'}://${req.headers.host}`;}
 async function credentials(){const {rows}=await db.query('SELECT data FROM ye_credentials WHERE namespace=$1',[ns]);return rows[0]?.data;}
 const reply=(res,status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 const cookie=(value,seconds)=>`ye_admin=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${seconds}${local?'':'; Secure'}`;
 async function handle(req,res){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');const action=new URL(req.url,'http://local').pathname;
  try{
   if(action==='/session'&&req.method==='GET'){reply(res,200,{configured:!!await credentials(),authenticated:await authorized(req),needsUsername:false,setupTokenRequired:true});return;}
   if(req.method!=='POST'){reply(res,405,{error:'Метод не підтримується'});return;}
   if(!sameOrigin(req)){reply(res,403,{error:'Запит з іншого сайту відхилено'});return;}
   if(action==='/logout'){const key=token(req);if(key)await db.query('DELETE FROM ye_sessions WHERE namespace=$1 AND token_hash=$2',[ns,digest(key)]);res.setHeader('Set-Cookie',cookie('',0));reply(res,200,{ok:true});return;}
   if(!['/login','/setup'].includes(action)){reply(res,404,{error:'Не знайдено'});return;}
   if(!await db.rateLimit(req,'admin-login',10)){reply(res,429,{error:'Забагато спроб. Спробуйте через 10 хвилин.'});return;}
   const data=await readJson(req,2048),username=typeof data.username==='string'?data.username.trim().normalize('NFKC'):'';
   if(!/^[\p{L}\p{N}_.@-]{3,64}$/u.test(username)||typeof data.password!=='string'||data.password.length>256){reply(res,400,{error:'Введіть коректні логін і пароль.'});return;}
   const stored=await credentials();
   if(action==='/setup'){
    if(stored){reply(res,409,{error:'Доступ уже налаштовано. Увійдіть.'});return;}
    if(setupToken.length<32||typeof data.setupToken!=='string'||!matches(setupToken,data.setupToken)){reply(res,403,{error:'Введіть приватний код налаштування власника.'});return;}
    if(data.password.length<10){reply(res,400,{error:'Пароль має містити щонайменше 10 символів.'});return;}
    const salt=randomBytes(16).toString('hex'),hash=(await scrypt(data.password,salt,64)).toString('hex');
    const created=await db.query('INSERT INTO ye_credentials(namespace,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING namespace',[ns,JSON.stringify({username,salt,hash})]);
    if(!created.rows.length){reply(res,409,{error:'Доступ уже налаштовано. Оновіть сторінку.'});return;}
   }else{
    if(!stored){reply(res,409,{error:'Власник має спочатку налаштувати доступ.'});return;}
    const hash=(await scrypt(data.password,stored.salt,64)).toString('hex');
    if(!matches(hash,stored.hash)||stored.username.toLowerCase()!==username.toLowerCase()){reply(res,401,{error:'Неправильний логін або пароль'});return;}
   }
   const key=randomBytes(32).toString('hex');await db.query('DELETE FROM ye_sessions WHERE namespace=$1 AND expires_at<=NOW()',[ns]);
   await db.query('INSERT INTO ye_sessions(namespace,token_hash,expires_at) VALUES($1,$2,$3)',[ns,digest(key),new Date(Date.now()+ttl)]);
   res.setHeader('Set-Cookie',cookie(key,ttl/1000));reply(res,200,{ok:true});
  }catch{reply(res,503,{error:'Не вдалося виконати вхід. Спробуйте ще раз.'});}
 }
 return {handle,authorized,sameOrigin};
}
