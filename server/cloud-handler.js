import {demoSeed} from './demo-seed.js';
import {createCloudDatabase} from './cloud-database.js';
import {createCloudAuth} from './cloud-auth.js';
import {createStoreMiddleware} from './store-service.js';
import {createNovaPoshta,createDeliveryMiddleware} from './nova-poshta.js';
import {createPhotoMiddleware} from './cloud-photos.js';
export function createCloudHandler(db,{local=false,setupToken,upload,directory=createNovaPoshta(),demo=true}={}){
 const auth=createCloudAuth(db,{local,setupToken});
 const handlers={admin:auth.handle,store:createStoreMiddleware('/unused',auth,directory,{repository:db,rateLimit:db.rateLimit,demo}),delivery:createDeliveryMiddleware(directory,{rateLimit:db.rateLimit}),photos:createPhotoMiddleware(auth,db,{upload})};
 return async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  try{
   const url=new URL(req.url,'http://local');
   const path=url.pathname==='/api/index'?'/api/'+(url.searchParams.get('route')||''):url.pathname;
   const matched=path.match(/^\/api\/(admin|store|delivery|photos)(\/[^/]+)?\/?$/);
   if(!matched){res.statusCode=404;res.end(JSON.stringify({error:'Не знайдено.'}));return;}
   url.searchParams.delete('route');req.url=(matched[2]||'/')+(url.searchParams.size?'?'+url.searchParams.toString():'');
   await handlers[matched[1]](req,res);
  }catch{
   if(!res.headersSent){res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Не вдалося підключитися до даних. Спробуйте ще раз.'}));}
   else if(!res.writableEnded)res.end();
  }
 };
}
let handler;
export default async function cloudHandler(req,res){
 if(process.env.DEMO_MODE!=='true'){res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Хмарний макет ще не налаштовано.'}));return;}
 try{handler??=createCloudHandler(createCloudDatabase({initialData:demoSeed()}));await handler(req,res);}catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Не налаштовано хмарну базу.'}));}
}
