import test from 'node:test';
import assert from 'node:assert/strict';
import {recordMatches} from '../admin-record-search.js';
import {orderStatusBadge} from '../admin-order-status.js';
import {orderStatuses} from '../orders.js';
import {archivedRecords} from '../archive.js';

const order={number:125,customer:'Лук’яненко Олена',contact:'+380 (67) 123-45-67 · olena@example.test',delivery:'Нова пошта · Львів · Відділення №8',note:'Телефонувати після обіду',status:'confirmed',createdAt:'2026-10-04T10:00:00Z',promoCode:{code:'AUTUMN10'},items:[{name:'Deye SUN-15K',sku:'INV-15'}]};
test('orders can be found by buyer, number, email, delivery, item, note and status without case sensitivity',()=>{
 for(const query of ['ОЛЕНА лук\'яненко','№125','#125','olena@EXAMPLE.test','львів','SUN-15K','INV-15','після обіду','підтверджене','AUTUMN10','04.10.2026'])assert.equal(recordMatches(order,'orders',query),true,query);
 for(const query of ['Іван','№999','Олена Київ'])assert.equal(recordMatches(order,'orders',query),false,query);
});
test('phone searches ignore formatting and support international, national and partial numbers',()=>{
 for(const query of ['+380 (67) 123-45-67','380671234567','0671234567','067 123 45 67','1234567'])assert.equal(recordMatches(order,'orders',query),true,query);
 assert.equal(recordMatches(order,'orders','0681234567'),false);
 assert.equal(recordMatches({...order,contact:'',checkout:{phone:'+380991234567'}},'orders','0991234567'),true);
});
test('each archive type searches relevant fields while retaining archive boundaries and records',()=>{
 const store={orders:[order,{...order,number:126,archived:true}],products:[{name:'Акумулятор',sku:'BAT-48',brand:'Deye',category:'batteries',archived:true}],suppliers:[{name:'Сонячний склад',contact:'+380501234567',note:'Панелі',archived:true}],purchases:[{number:31,supplierName:'Сонячний склад',status:'received',items:[{name:'Deye SUN-15K'}],archived:true}]},before=structuredClone(store);
 assert.equal(archivedRecords(store,'orders').filter(o=>recordMatches(o,'orders','Олена')).length,1);
 assert.equal(archivedRecords(store,'orders',false).filter(o=>recordMatches(o,'orders','126')).length,0);
 for(const query of ['bat-48','DEYE','Акумулятори'])assert.equal(recordMatches(store.products[0],'products',query,'Акумулятори'),true);
 for(const query of ['сонячний','0501234567','панелі'])assert.equal(recordMatches(store.suppliers[0],'suppliers',query),true);
 for(const query of ['№31','сонячний','SUN-15K'])assert.equal(recordMatches(store.purchases[0],'purchases',query),true);
 assert.deepEqual(store,before);
});
test('empty queries and incomplete historical records are handled without searching internal checkout refs',()=>{
 assert.equal(recordMatches({},'orders','  '),true);
 assert.equal(recordMatches({},'suppliers','відсутній'),false);
 assert.equal(recordMatches({checkout:{cityRef:'private-directory-ref'}},'orders','private-directory-ref'),false);
});
test('all order statuses have distinct badges with text and unknown status is safe',()=>{
 for(const [status,label] of Object.entries(orderStatuses)){const badge=orderStatusBadge({status});assert.ok(badge.includes(`order-status--${status}`));assert.ok(badge.includes(label));}
 assert.ok(orderStatusBadge({status:'confirmed',source:'website'}).includes('Із сайту'));
 const badge=orderStatusBadge({status:'"><script>'});assert.ok(badge.includes('order-status--unknown'));assert.ok(!badge.includes('<script>'));
});
