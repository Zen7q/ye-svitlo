import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createCloudDatabase,emptyStore} from '../server/cloud-database.js';
import {createStoreService} from '../server/store-service.js';
import {createCloudHandler} from '../server/cloud-handler.js';
import {createCloudAuth} from '../server/cloud-auth.js';
import {photoBytes} from '../server/cloud-photos.js';
import {readJson} from '../server/http-json.js';
import {demoSeed} from '../server/demo-seed.js';
import {publicStore} from '../server/store-service.js';
import {stat} from 'node:fs/promises';
function testDatabase(){
 const pg=new PGlite();let tail=Promise.resolve();
 async function lease(){const before=tail;let release;tail=new Promise(r=>{release=r;});await before;return release;}
 const query=async(sql,args)=>!args?.length&&sql.split(';').filter(s=>s.trim()).length>1?(await pg.exec(sql)).at(-1):pg.query(sql,args);
 const pool={query:async(sql,args)=>{const release=await lease();try{return await query(sql,args);}finally{release();}},connect:async()=>{const release=await lease();return {query,release};},end:()=>pg.close()};
 return {pool,db:createCloudDatabase({pool,namespace:'test'})};
}
const seed=()=>({...emptyStore(),products:[{id:1,name:'Тестовий товар',category:'inverters',price:1000}],costs:{1:{purchasePrice:500}},inventory:{1:{onHand:1,minStock:0}}});
const order=()=>({requestId:randomUUID(),firstName:'Тест',lastName:'Покупець',phone:'+380 000 000 000',email:'demo@example.invalid',deliveryMethod:'branch',directoryMode:'manual',paymentMethod:'receipt',city:'Тестове місто',address:'Тестове відділення',items:[{productId:'1',quantity:1,expectedPriceCents:100000}]});
test('SQL storage rolls back failures, preserves history and rejects stale edits across services',async()=>{
 const {db,pool}=testDatabase();try{
  const first=createStoreService('/unused',{repository:db});let saved=await first.save(seed());await db.transaction(async()=>({next:{...seed(),revision:saved.revision},snapshot:null}));saved=await first.read();
  const second=createStoreService('/unused',{repository:createCloudDatabase({pool,namespace:'test'})});
  assert.equal((await second.read()).products[0].price,1000);
  await assert.rejects(first.update(saved.revision,current=>{current.products=[];throw Error('abort');}),/abort/);
  assert.equal((await first.read()).revision,saved.revision);
  saved=await second.save({...saved,products:[{...saved.products[0],price:1200}]});
  assert.equal((await first.read()).products[0].price,1200);
  await assert.rejects(first.save({...saved,revision:saved.revision-1}),e=>e.status===409);
  const history=await first.history();assert.equal(history.length,2);
  const snapshot=await db.snapshot(history.find(h=>h.id&&(h.createdAt)).id);assert.ok(Array.isArray(snapshot.products));
  await assert.rejects(first.save({...saved,products:[],costs:{}}),/складом/);
 }finally{await db.close();}
});
test('two SQL service instances cannot sell the same unit, and retries do not duplicate orders',async()=>{
 const {db,pool}=testDatabase();try{
  const first=createStoreService('/unused',{repository:db}),second=createStoreService('/unused',{repository:createCloudDatabase({pool,namespace:'test'})});
  await first.save(seed());await db.transaction(async()=>({next:seed(),snapshot:null}));
  const payload=order();const results=await Promise.allSettled([first.checkout(payload),second.checkout(order())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const stored=await db.read();assert.equal(stored.orders.length,1);assert.equal(stored.orders[0].items[0].unitCostCents,50000);
  const accepted=stored.orders[0].checkoutRequestId===payload.requestId?payload:null;
  assert.ok(accepted);assert.equal((await second.checkout(accepted)).number,1);assert.equal((await db.read()).orders.length,1);
 }finally{await db.close();}
});
test('cloud routes protect setup, share sessions across instances, revoke logout and keep accounting private',async()=>{
 const {db,pool}=testDatabase(),setupToken='test-only-private-setup-token-long-enough';
 let handler=createCloudHandler(db,{local:true,setupToken,directory:{validate:async()=>{}},upload:async()=>({url:'https://example.invalid/photo.png'})});
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const send=(path,body,cookie='',origin=base)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const credentials={username:'demo-admin',password:'test-only-password-long',setupToken};
 try{
  const service=createStoreService('/unused',{repository:db});await service.save(seed());await db.transaction(async()=>({next:seed(),snapshot:null}));
  assert.equal((await fetch(base+'/api/store?admin=1')).status,401);
  assert.equal((await send('/api/admin/setup',{...credentials,setupToken:'wrong'})).status,403);
  assert.equal((await send('/api/admin/setup',credentials,'','https://other.invalid')).status,403);
  const response=await send('/api/admin/setup',credentials);assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
  const stored=await db.query('SELECT data FROM ye_credentials');assert.equal(stored.rows[0].data.password,undefined);
  handler=createCloudHandler(createCloudDatabase({pool,namespace:'test'}),{local:true,setupToken,directory:{validate:async()=>{}}});
  assert.equal((await (await fetch(base+'/api/admin/session',{headers:{Cookie:cookie}})).json()).authenticated,true);
  assert.equal((await fetch(base+'/api/store?admin=1',{headers:{Cookie:cookie}})).status,200);
  const publicData=await (await fetch(base+'/api/index?route=store')).json();assert.equal(publicData.demo,true);assert.equal(publicData.costs,undefined);
  const checkout=await send('/api/store/checkout',order());assert.equal(checkout.status,200);assert.deepEqual(await checkout.json(),{number:1,totalCents:100000,demo:true});
  assert.equal((await send('/api/admin/setup',credentials)).status,409);
  assert.equal((await send('/api/admin/logout',{},cookie)).status,200);
  assert.equal((await fetch(base+'/api/store?admin=1',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await send('/api/admin/login',{...credentials,password:'wrong'})).status,401);
  assert.equal((await send('/api/admin/login',credentials)).status,200);
  const auth=createCloudAuth(db);assert.equal(auth.sameOrigin({headers:{origin:'https://demo.invalid',host:'demo.invalid'},socket:{}}),true);assert.equal(auth.sameOrigin({headers:{origin:'http://demo.invalid',host:'demo.invalid'},socket:{}}),false);
 }finally{await new Promise(r=>server.close(r));await db.close();}
});
test('database request limits survive a new instance and keep separate request scopes',async()=>{
 const {db,pool}=testDatabase();try{const req={headers:{},socket:{remoteAddress:'test-address'}};
  assert.equal(await db.rateLimit(req,'login',2,600001),true);
  assert.equal(await createCloudDatabase({pool,namespace:'test'}).rateLimit(req,'login',2,600002),true);
  assert.equal(await db.rateLimit(req,'login',2,600003),false);
  assert.equal(await db.rateLimit(req,'checkout',2,600004),true);
  assert.equal(await db.rateLimit(req,'login',2,1200001),true);
 }finally{await db.close();}
});
test('cloud JSON accepts platform-parsed bodies with byte limits; photos reject executable or oversized content',async()=>{
 assert.deepEqual(await readJson({body:{name:'тест'}},100),{name:'тест'});
 await assert.rejects(readJson({body:{name:'x'.repeat(100)}},50),e=>e.status===413);
 assert.throws(()=>photoBytes('data:image/svg+xml;base64,PHN2Zz4='));
 assert.throws(()=>photoBytes('data:image/png;base64,YWJjZA=='));
 assert.throws(()=>photoBytes('data:image/jpeg;base64,'+Buffer.alloc(3*1024*1024+1,255).toString('base64')));
 assert.equal(photoBytes('data:image/jpeg;base64,/9j/').contentType,'image/jpeg');
});
test('demo catalogue includes all supplied models and photos, keeps supplier private and seeds only once',async()=>{
 const data=demoSeed();assert.equal(data.products.length,17);assert.equal(data.products.reduce((sum,p)=>sum+p.photos.length,0),56);
 assert.equal(data.suppliers[0].name,'NKON');assert.equal(data.orders.length,0);assert.equal(data.costs[data.products[0].id].purchasePrice,75900);assert.equal(data.products[0].price,87285);assert.equal(publicStore(data).costs,undefined);
 assert.ok(data.products.every(p=>p.brand==='Deye'&&p.price>0));
 assert.equal(publicStore(data).suppliers,undefined);assert.equal(publicStore(data).demo,true);
 assert.equal(data.products.find(p=>p.sku==='SUN-3.6K-SG05LP1-EU-AM2-P').powerW,3600);
 assert.equal(data.products.find(p=>p.sku==='SUN-125K-SG02HP3-EU-GM10').mpptCount,undefined);
 for(const photo of new Set(data.products.flatMap(p=>p.photos)))assert.ok((await stat(new URL('../public'+photo,import.meta.url))).isFile());
 const {pool,db:unused}=testDatabase();const db=createCloudDatabase({pool,namespace:'demo-seed',initialData:data});
 try{const saved=await db.read();assert.equal(saved.products.length,17);
  await db.transaction(async current=>{current.products[0].price=123;current.revision++;return {next:current,snapshot:null};});
  const restart=createCloudDatabase({pool,namespace:'demo-seed',initialData:demoSeed()});assert.equal((await restart.read()).products[0].price,123);
 }finally{await unused.close();}
});
