import test from 'node:test';
import assert from 'node:assert/strict';
import {archivedRecords} from '../archive.js';
import {applyOperation} from '../server/operations.js';
import {stockInfo} from '../inventory.js';
import {publicStore,createStoreService} from '../server/store-service.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const sample=()=>({revision:0,products:[{id:1,name:'Інвертор',category:'inverters',price:10000}],texts:{},promotions:[],costs:{1:{purchasePrice:8000}},inventory:{1:{onHand:5,minStock:1}},movements:[{delta:5,type:'adjustment'}],suppliers:[{id:'supplier',name:'Постачальник'}],orders:[{id:'order',number:1,status:'completed',paidCents:1000000,items:[{productId:'1',quantity:1,unitPriceCents:1000000,unitCostCents:800000}]}],purchases:[{id:'purchase',status:'received',paidCents:800000,deliveryCents:0,items:[{productId:'1',quantity:1,unitCostCents:800000}]}]});
test('archiving and restoring all record types separates lists without changing ledger or public privacy',()=>{
 const store=sample(),ledger=structuredClone({costs:store.costs,inventory:store.inventory,movements:store.movements}),orderItems=structuredClone(store.orders[0].items);
 applyOperation(store,'bulk-products',{ids:['1'],operation:'archive'});applyOperation(store,'archive-supplier',{id:'supplier',archived:true});
 for(const kind of ['orders','purchases'])applyOperation(store,'archive-record',{kind,id:kind==='orders'?'order':'purchase',archived:true});
 for(const kind of ['products','suppliers','orders','purchases']){assert.equal(archivedRecords(store,kind).length,1);assert.equal(archivedRecords(store,kind,false).length,0);}
 assert.equal(publicStore(store).products.length,0);assert.equal(publicStore(store).orders,undefined);assert.deepEqual(store.orders[0].items,orderItems);assert.equal(store.orders[0].paidCents,1000000);assert.equal(store.purchases[0].paidCents,800000);assert.deepEqual({costs:store.costs,inventory:store.inventory,movements:store.movements},ledger);
 for(const kind of ['orders','purchases'])applyOperation(store,'archive-record',{kind,id:kind==='orders'?'order':'purchase',archived:false});
 applyOperation(store,'bulk-products',{ids:['1'],operation:'unarchive'});applyOperation(store,'archive-supplier',{id:'supplier',archived:false});
 for(const kind of ['products','suppliers','orders','purchases'])assert.equal(archivedRecords(store,kind,false).length,1);
 assert.equal(publicStore(store).products.length,1);assert.deepEqual(store.orders[0].items,orderItems);
});
test('open records cannot be archived and reservations and incoming remain intact',()=>{
 const store=sample();store.orders[0].status='confirmed';store.purchases[0].status='ordered';
 const before=stockInfo(store,1);
 for(const kind of ['orders','purchases'])assert.throws(()=>applyOperation(store,'archive-record',{kind,id:kind==='orders'?'order':'purchase',archived:true}),/Спочатку/);
 assert.deepEqual(stockInfo(store,1),before);assert.equal(before.reserved,1);assert.equal(before.incoming,1);
 for(const payload of [{kind:'products',id:1,archived:true},{kind:'orders',id:'order',archived:'yes'},{kind:'orders',id:'missing',archived:false}])assert.throws(()=>applyOperation(store,'archive-record',payload));
 store.orders[0].status='completed';applyOperation(store,'archive-record',{kind:'orders',id:'order',archived:true});assert.throws(()=>applyOperation(store,'order-status',{id:'order',status:'returned'}),/поверніть/);
 applyOperation(store,'archive-record',{kind:'orders',id:'order',archived:false});applyOperation(store,'order-status',{id:'order',status:'returned'});assert.equal(store.inventory[1].onHand,6);
});
test('archive persists after service restart and stale restore cannot overwrite a newer edit',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ye-archive-'));try{const service=createStoreService(folder);let store=await service.save(sample());store=await service.update(store.revision,()=>({...sample(),revision:store.revision}));store=await service.action({revision:store.revision,type:'archive-record',payload:{kind:'orders',id:'order',archived:true}});const restarted=createStoreService(folder),saved=await restarted.read();assert.equal(saved.orders[0].archived,true);assert.equal(saved.orders[0].paidCents,1000000);await assert.rejects(()=>restarted.action({revision:saved.revision-1,type:'archive-record',payload:{kind:'orders',id:'order',archived:false}}),/іншій вкладці/);assert.equal((await restarted.read()).orders[0].archived,true);}finally{await rm(folder,{recursive:true,force:true});}
});
