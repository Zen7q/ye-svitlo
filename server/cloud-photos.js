import {put} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {readJson} from './http-json.js';
export function photoBytes(value){
 const match=typeof value==='string'&&value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)throw Error('Оберіть JPG, PNG або WebP.');
 const bytes=Buffer.from(match[2],'base64');
 if(!bytes.length||bytes.length>3*1024*1024)throw Error('Фото має бути до 3 МБ.');
 const valid=match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!valid)throw Error('Неправильний формат фото.');
 return {bytes,contentType:match[1],extension:match[1].slice(6)};
}
export function createPhotoMiddleware(auth,db,{upload=put}={}){return async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try{
  if(req.method!=='POST'){reply(405,{error:'Метод не підтримується.'});return;}
  if(!await auth.authorized(req)){reply(401,{error:'Увійдіть в адмінку.'});return;}
  if(!auth.sameOrigin(req)){reply(403,{error:'Запит з іншого сайту відхилено.'});return;}
  if(!await db.rateLimit(req,'photos',50)){reply(429,{error:'Забагато фото. Спробуйте пізніше.'});return;}
  const {photo}=await readJson(req,4_400_000),{bytes,contentType,extension}=photoBytes(photo);
  const result=await upload(`products/${randomUUID()}.${extension}`,bytes,{access:'public',contentType,addRandomSuffix:false});
  reply(200,{url:result.url});
 }catch(e){reply(e.status||400,{error:e.status===413?e.message:'Не вдалося зберегти фото. Перевірте формат і підключення сховища.'});}
};}
