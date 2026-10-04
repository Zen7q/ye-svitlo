import {readJson} from './http-json.js';
import {readFile,readdir,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {filterSchemas} from '../filters.js';
import {validatePromoCodes} from '../promo-codes.js';
import {checkoutQuote,publicQuote} from './checkout-quote.js';
import {validatePromotions} from '../promotions.js';
import {validateCosts} from '../accounting.js';
import {applyOperation} from './operations.js';
import {stockInfo} from '../inventory.js';
import {checkoutOrder,checkoutReceipt} from './checkout.js';
const publicFields=new Set(['id','name','category','price','brand','description','photos','mainPhoto','type','sku','powerKw','additionalSpecifications',...Object.values(filterSchemas).flat().map(d=>d.key)]);
export function publicStore(data){const productData=p=>{const result=Object.fromEntries(Object.entries(p).filter(([key])=>publicFields.has(key)));const stock=stockInfo(data,p.id);if(stock.tracked&&p.stockStatus!=='preorder')result.stockStatus=stock.available>0?'in-stock':'out-of-stock';return result;};return {...(data.demo?{demo:true}:{}),products:data.products.filter(p=>!p.archived).map(productData),texts:data.texts,promotions:(data.promotions||[]).map(p=>Object.fromEntries(['id','name','targetType','targetId','discountType','value','enabled'].map(key=>[key,p[key]])))};}
export function createStoreService(folder,{repository}={}){
 const file=join(folder,'store.json'),historyFolder=join(folder,'history'),latestRevision=Symbol('checkout');let queue=Promise.resolve();
 async function read(){let data;if(repository)data=await repository.read();else try{data=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;data={products:[],texts:{}}}return {revision:0,promoCodes:[],costs:{},inventory:{},orders:[],suppliers:[],purchases:[],movements:[],...data};}
 async function history(){if(repository)return repository.history();let names;try{names=await readdir(historyFolder)}catch(e){if(e.code==='ENOENT')return [];throw e}const records=await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>{const item=JSON.parse(await readFile(join(historyFolder,n),'utf8'));return {id:n.slice(0,-5),createdAt:item.createdAt,label:item.label}}));return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 async function update(revision,change,label){
  const commit=async current=>{
   if(revision!==latestRevision&&revision!==current.revision){const e=Error('Дані змінилися в іншій вкладці. Оновіть адмінку й повторіть зміни.');e.status=409;throw e;}
   const next=await change(structuredClone(current));
   const snapshot=label&&JSON.stringify([current.products,current.costs,current.promotions])!==JSON.stringify([next.products,next.costs,next.promotions])?{id:randomUUID(),createdAt:new Date().toISOString(),label,products:current.products,costs:current.costs,promotions:current.promotions||[]}:null;
   next.revision=current.revision+1;return {next,snapshot};
  };
  if(repository)return repository.transaction(commit);
  const result=queue.catch(()=>{}).then(async()=>{
   const {next,snapshot}=await commit(await read());
   if(snapshot){await mkdir(historyFolder,{recursive:true});await writeFile(join(historyFolder,snapshot.id+'.json'),JSON.stringify(snapshot),{mode:0o600});}
   await mkdir(folder,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(next,null,2));await rename(file+'.tmp',file);return next;
  });queue=result;return result;
 }

 function save(data){return update(data.revision,current=>{if(!Array.isArray(data.products)||!data.texts||typeof data.texts!=='object'||Array.isArray(data.texts))throw Error('Неправильні дані.');for(const p of data.products)if(!p.id||typeof p.name!=='string'||!p.name.trim()||!Number.isFinite(p.price)||p.price<=0)throw Error('Вкажіть назву та коректну ціну товару.');if(new Set(data.products.map(p=>String(p.id))).size!==data.products.length)throw Error('Повторюються ідентифікатори товарів.');validatePromotions(data.promotions||[],data.products);validateCosts(data.costs||{},data.products);const promoCodes=validatePromoCodes(data.promoCodes??current.promoCodes);checkReferences(current,data.products);return {...current,promoCodes,products:data.products,texts:data.texts,promotions:data.promotions||[],costs:data.costs||{}};},'Редагування каталогу, собівартості або акцій');}
 function checkReferences(current,products){const ids=new Set(products.map(p=>String(p.id)));const referenced=[...Object.keys(current.inventory),...current.orders.flatMap(o=>o.items.map(i=>i.productId)),...current.purchases.flatMap(p=>p.items.map(i=>i.productId))];if(referenced.some(id=>!ids.has(String(id))))throw Error('Не можна прибрати товар, пов’язаний зі складом, замовленнями чи закупівлями. Використайте архівування.');}
 const action=(data)=>update(data.revision,async current=>{if(data.type==='restore-catalog'){const id=data.payload.id;if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))throw Error('Неправильний знімок.');const old=repository?await repository.snapshot(id):JSON.parse(await readFile(join(historyFolder,id+'.json'),'utf8'));if(!old)throw Error('Знімок не знайдено.');checkReferences(current,old.products);validateCosts(old.costs,old.products);validatePromotions(old.promotions,old.products);return {...current,products:old.products,costs:old.costs,promotions:old.promotions};}return applyOperation(current,data.type,data.payload);},['bulk-products','restore-catalog','receive-purchase'].includes(data.type)?'Масова зміна або відновлення каталогу':null);
 async function checkout(payload){let receipt;await update(latestRevision,current=>{receipt={...checkoutReceipt(checkoutOrder(current,payload)),...(current.demo?{demo:true}:{})};return current;});return receipt;}
 return {read,update,save,action,history,checkout};
}
export function createStoreMiddleware(folder,auth,directory,{repository,rateLimit,demo=false}={}){
 const service=createStoreService(folder,{repository}),checkoutAttempts=new Map(),quoteAttempts=new Map();
 return async(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data))};try{
  const url=new URL(req.url,'http://local');
  if(req.method==='GET'){if(url.pathname==='/history'){if(!await auth.authorized(req)){reply(401,{error:'Увійдіть в адмінку.'});return}reply(200,await service.history());return}if(url.pathname!=='/'){reply(404,{error:'Не знайдено'});return}if(url.searchParams.has('admin')){if(!await auth.authorized(req)){reply(401,{error:'Увійдіть в адмінку.'});return}reply(200,{...await service.read(),...(repository?{cloudPhotos:true}:{}),...(demo?{demo:true}:{})});return}reply(200,{...publicStore(await service.read()),...(demo?{demo:true}:{})});return}
  if(req.method==='POST'&&['/checkout','/quote'].includes(url.pathname)){
   if(!auth.sameOrigin(req)){reply(403,{error:'Запит з іншого сайту відхилено'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){reply(400,{error:'Неправильний формат запиту.'});return}
   const isQuote=url.pathname==='/quote',attempts=isQuote?quoteAttempts:checkoutAttempts;if(rateLimit&&!await rateLimit(req,isQuote?'quote':'checkout',isQuote?60:10)){reply(429,{error:'Забагато запитів. Спробуйте через 10 хвилин.'});return;}const address=req.socket.remoteAddress||'local',now=Date.now();for(const [key,times] of attempts)if(times.every(t=>now-t>=600000))attempts.delete(key);const recent=rateLimit?[]:(attempts.get(address)||[]).filter(t=>now-t<600000);if(recent.length>=(isQuote?60:10)){reply(429,{error:isQuote?'Забагато перевірок промокоду. Спробуйте через 10 хвилин.':'Забагато спроб оформлення. Спробуйте через 10 хвилин.'});return}recent.push(now);attempts.set(address,recent);
   const payload=await readJson(req,16000);if(isQuote){reply(200,publicQuote(checkoutQuote(await service.read(),payload)));return;}if(directory&&payload.directoryMode==='directory'){const current=await service.read();if(!current.orders.some(o=>o.source==='website'&&o.checkoutRequestId===payload.requestId))await directory.validate(payload);}reply(200,{...await service.checkout(payload),...(demo?{demo:true}:{})});return;
  }
  if(!await auth.authorized(req)){reply(401,{error:'Увійдіть в адмінку, щоб зберегти зміни'});return}
  if(!auth.sameOrigin(req)){reply(403,{error:'Запит з іншого сайту відхилено'});return}
  if(req.method!=='PUT'&&!(req.method==='POST'&&url.pathname==='/actions')){reply(405,{error:'Метод не підтримується'});return}
  const data=await readJson(req,repository?4_000_000:35_000_000);const saved=req.method==='POST'?await service.action(data):await service.save(data);reply(200,{...saved,...(repository?{cloudPhotos:true}:{}),...(demo?{demo:true}:{})});
 }catch(e){reply(e.status||(repository?503:400),{error:e.status||!repository?e.message:'Не вдалося зберегти дані. Оновіть сторінку й спробуйте ще раз.'})}};
}
