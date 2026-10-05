import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {calculateSolar,estimateSystemPrice} from '../power-calculator.js';
import {consultationInput} from '../server/consultations.js';
import {createStoreService,createStoreMiddleware,publicStore} from '../server/store-service.js';
const payload=()=>({requestId:randomUUID(),phone:'(067) 123-45-67',name:'Тестовий клієнт',comment:'Тестова консультація',consent:true,calculation:{monthlyKwh:500}});
test('solar estimate matches the reference, rounds panel count up and rejects unsupported consumption',()=>{
 const result=calculateSolar({monthlyKwh:500});assert.equal(result.panelCount,10);assert.equal(result.systemKw,5.5);assert.equal(result.annualConsumptionKwh,6000);
 const larger=calculateSolar({monthlyKwh:1000});assert.equal(larger.panelCount,20);assert.equal(larger.systemKw,11);
 assert.ok(calculateSolar({monthlyKwh:50}).panelCount>=1);assert.ok(calculateSolar({monthlyKwh:1500}).estimatedAnnualGenerationKwh>=18000);
 for(const value of [0,-1,NaN,Infinity,1501,'500'])assert.throws(()=>calculateSolar({monthlyKwh:value}));
});
test('system budget scales with panel capacity, rounds to thousands and states its scope',()=>{
 const small=estimateSystemPrice(calculateSolar({monthlyKwh:500}).systemKw);assert.equal(small.amountUah,100000);assert.equal(small.panelsUah,50000);assert.equal(small.batteryUah,0);assert.ok(small.includes.includes('Без акумулятора'));
 assert.equal(estimateSystemPrice(11).amountUah,199000);assert.equal(estimateSystemPrice(1.1).amountUah,40000);
 let last=0;for(let monthlyKwh=50;monthlyKwh<=1500;monthlyKwh+=50){const amount=estimateSystemPrice(calculateSolar({monthlyKwh}).systemKw).amountUah;assert.ok(amount>=last&&amount>0);assert.equal(amount%1000,0);last=amount;}
 for(const value of [0,-1,NaN,Infinity,'5.5'])assert.throws(()=>estimateSystemPrice(value));
});
test('optional battery changes only equipment price; electric car increases generation and server snapshots',()=>{
 const base=calculateSolar({monthlyKwh:500}),car=calculateSolar({monthlyKwh:500,hasElectricCar:true});
 assert.equal(car.monthlyKwh,500);assert.equal(car.totalMonthlyKwh,800);assert.equal(car.panelCount,16);assert.equal(car.systemKw,8.8);
 assert.equal(estimateSystemPrice(base.systemKw,{includeBattery:true}).amountUah,148000);
 assert.equal(estimateSystemPrice(car.systemKw).amountUah,159000);assert.equal(estimateSystemPrice(car.systemKw,{includeBattery:true}).amountUah,207000);
 const data=consultationInput({...payload(),calculation:{monthlyKwh:500,hasElectricCar:true,includeBattery:true,priceEstimate:{amountUah:1}}});assert.equal(data.calculation.panelCount,16);assert.equal(data.calculation.includeBattery,true);assert.equal(data.calculation.priceEstimate,undefined);
 assert.throws(()=>calculateSolar({monthlyKwh:500,hasElectricCar:'yes'}));assert.throws(()=>consultationInput({...payload(),calculation:{monthlyKwh:500,includeBattery:'yes'}}));
});
test('callback requires consent, normalizes Ukrainian phones, limits data and recalculates untrusted totals',()=>{
 const valid=payload();const data=consultationInput({...valid,calculation:{...valid.calculation,panelCount:0,systemKw:0}});assert.equal(data.phone,'+380671234567');assert.equal(data.calculation.panelCount,10);
 assert.equal(consultationInput({...valid,phone:'+380 67 123 45 67',calculation:null}).calculation,null);
 for(const change of [{consent:false},{phone:'123'},{phone:'+380abcdefghi'},{name:'x'.repeat(81)},{comment:'x'.repeat(1001)},{requestId:'bad'}])assert.throws(()=>consultationInput({...valid,...change}));
});
test('callback retries are atomic, persist after restart, reject changed reuse and do not alter inventory or orders',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ye-consultations-'));try{
 const service=createStoreService(folder),data=await service.read();data.demo=true;await service.save({...data,products:[{id:1,name:'Тест',price:100}],texts:{},costs:{1:{purchasePrice:50}}});
 await service.update((await service.read()).revision,current=>({...current,demo:true}));
 const before=await service.read(),request=payload();const responses=await Promise.all([service.consultation(request),service.consultation(request)]);assert.deepEqual(responses,[{number:1,demo:true},{number:1,demo:true}]);
 const saved=await createStoreService(folder).read();assert.equal(saved.consultations.length,1);assert.equal(saved.consultations[0].calculation.priceEstimate.amountUah,100000);assert.equal(saved.consultations[0].phone,'+380671234567');assert.deepEqual(saved.orders,before.orders);assert.deepEqual(saved.inventory,before.inventory);assert.deepEqual(saved.costs,before.costs);
 assert.equal(publicStore(saved).consultations,undefined);assert.equal(publicStore(saved).costs,undefined);
 await assert.rejects(service.consultation({...request,phone:'0681234567'}));
 await assert.rejects(service.consultation({...request,calculation:{monthlyKwh:500,includeBattery:true}}));
 const optionReceipt=await service.consultation({...payload(),calculation:{monthlyKwh:500,hasElectricCar:true,includeBattery:true}});assert.equal(optionReceipt.number,2);const optionRecord=(await service.read()).consultations[1];assert.equal(optionRecord.calculation.priceEstimate.amountUah,207000);assert.equal(optionRecord.calculation.hasElectricCar,true);assert.equal(optionRecord.calculation.priceEstimate.includeBattery,true);
 const currentRevision=(await service.read()).revision;
 const updated=await service.action({revision:currentRevision,type:'update-consultation',payload:{id:saved.consultations[0].id,status:'completed'}});assert.equal(updated.consultations[0].status,'completed');
 await assert.rejects(service.action({revision:saved.revision,type:'update-consultation',payload:{id:saved.consultations[0].id,status:'new'}}),e=>e.status===409);
 await assert.rejects(service.action({revision:updated.revision,type:'update-consultation',payload:{id:saved.consultations[0].id,status:'unknown'}}));
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('callback HTTP accepts only bounded same-origin JSON, returns no contacts and throttles public requests',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ye-consultations-http-'));let base;
 const server=createServer(createStoreMiddleware(folder,{authorized:()=>false,sameOrigin:r=>r.headers.origin===base},null,{demo:true}));await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const send=(body,origin=base,type='application/json')=>fetch(base+'/consultations',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:JSON.stringify(body)});
 try{
 assert.equal((await send(payload(),'https://other.invalid')).status,403);assert.equal((await send(payload(),base,'text/plain')).status,400);
 const r=await send(payload());assert.equal(r.status,200);assert.deepEqual(await r.json(),{number:1,demo:true});assert.equal((await fetch(base+'/?admin=1')).status,401);
 const pub=await(await fetch(base+'/')).json();assert.equal(pub.consultations,undefined);
 assert.equal((await send({...payload(),comment:'x'.repeat(9000)})).status,413);
 for(let i=0;i<3;i++)await send(payload());assert.equal((await send(payload())).status,429);
 }finally{await new Promise(r=>server.close(r));await rm(folder,{recursive:true,force:true});}
});
