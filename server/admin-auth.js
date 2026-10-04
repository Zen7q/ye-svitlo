import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),ttl=8*60*60*1000;
export function createAdminAuth(folder){
 const authFile=join(folder,'auth.json'),sessions=new Map(),attempts=new Map();
 let usernameQueue=Promise.resolve();
 async function credentials(){try{return JSON.parse(await readFile(authFile,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
 function addUsername(username){const pending=usernameQueue.then(async()=>{const current=await credentials();if(current.username)return current.username.toLowerCase()===username.toLowerCase();await writeFile(authFile+'.tmp',JSON.stringify({...current,username}),{mode:0o600});await rename(authFile+'.tmp',authFile);return true});usernameQueue=pending.catch(()=>{});return pending}
 function token(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ye_admin='))?.slice(9)}
 function authorized(req){const key=token(req),expires=sessions.get(key);if(expires&&expires>Date.now())return true;if(key)sessions.delete(key);return false}
 function sameOrigin(req){return req.headers.origin===`${req.socket.encrypted?'https':'http'}://${req.headers.host}`}
 function session(req,res){const key=randomBytes(32).toString('hex');sessions.set(key,Date.now()+ttl);res.setHeader('Set-Cookie',`ye_admin=${key}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${ttl/1000}${req.socket.encrypted?'; Secure':''}`)}
 const reply=(res,status,data)=>{res.statusCode=status;res.end(JSON.stringify(data))};
 async function handle(req,res){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');const action=req.url.split('?')[0];try{
  if(action==='/session'&&req.method==='GET'){const stored=await credentials();reply(res,200,{configured:!!stored,authenticated:authorized(req),needsUsername:!!stored&&!stored.username});return}
  if(req.method!=='POST'){reply(res,405,{error:'Метод не підтримується'});return}
  if(!sameOrigin(req)){reply(res,403,{error:'Запит з іншого сайту відхилено'});return}
  if(action==='/logout'){sessions.delete(token(req));res.setHeader('Set-Cookie','ye_admin=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');reply(res,200,{ok:true});return}
  if(!['/setup','/login'].includes(action)){reply(res,404,{error:'Не знайдено'});return}
  const address=req.socket.remoteAddress||'local',now=Date.now();const recent=(attempts.get(address)||[]).filter(t=>now-t<10*60*1000);if(recent.length>=10){reply(res,429,{error:'Забагато спроб. Спробуйте через 10 хвилин.'});return}recent.push(now);attempts.set(address,recent);
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('Запит завеликий')}const {password,username:rawUsername}=JSON.parse(body);const username=typeof rawUsername==='string'?rawUsername.trim().normalize('NFKC'):'';if(!/^[\p{L}\p{N}_.@-]{3,64}$/u.test(username)){reply(res,400,{error:'Логін: 3–64 символи. Літери, цифри, крапка, @, дефіс або підкреслення.'});return}if(typeof password!=='string'||password.length>256){reply(res,400,{error:'Введіть пароль'});return}
  const stored=await credentials();
  if(action==='/setup'){
   if(stored){reply(res,409,{error:'Пароль уже встановлено. Увійдіть у магазин.'});return}
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)){reply(res,403,{error:'Перший пароль можна встановити лише на цьому комп’ютері через localhost.'});return}
   if(password.length<10){reply(res,400,{error:'Пароль має містити щонайменше 10 символів'});return}
   const salt=randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,64)).toString('hex');await mkdir(folder,{recursive:true});try{await writeFile(authFile,JSON.stringify({username,salt,hash}),{flag:'wx',mode:0o600})}catch(e){if(e.code==='EEXIST'){reply(res,409,{error:'Пароль уже встановлено. Оновіть сторінку.'});return}throw e}
  }else{
   if(!stored){reply(res,409,{error:'Спочатку встановіть пароль'});return}
   const hash=await scrypt(password,stored.salt,64),expected=Buffer.from(stored.hash,'hex');if(hash.length!==expected.length||!timingSafeEqual(hash,expected)||(stored.username&&stored.username.toLowerCase()!==username.toLowerCase())){reply(res,401,{error:'Неправильний логін або пароль'});return}if(!stored.username&&!await addUsername(username)){reply(res,401,{error:'Неправильний логін або пароль'});return}
  }
  session(req,res);reply(res,200,{ok:true});
 }catch{reply(res,400,{error:'Не вдалося виконати вхід. Спробуйте ще раз.'})}}
 return {handle,authorized,sameOrigin};
}
