import {randomUUID} from 'node:crypto';
import {stockInfo} from '../inventory.js';
import {priceInfo} from '../promotions.js';
import {unitEarnings} from '../accounting.js';
import {orderTransitions,orderTotals} from '../orders.js';
import {purchaseTotals} from '../purchases.js';
import {canArchiveRecord} from '../archive.js';
export function quantity(value,min=0){if(!Number.isInteger(value)||value<min||value>1_000_000)throw Error('Кількість має бути цілим числом від '+min+' до 1 000 000.');return value;}
export function productFor(store,id){const p=store.products.find(p=>String(p.id)===String(id));if(!p)throw Error('Товар не знайдено.');return p;}
export function text(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Вкажіть '+label+' (до '+max+' символів).');return value.trim();}
export function movement(store,productId,delta,type,reason){store.movements.push({id:randomUUID(),createdAt:new Date().toISOString(),productId:String(productId),delta,type,reason});}
export function amount(value){if(!Number.isFinite(value)||value<0||value>1e10||Math.abs(Math.round(value*100)-value*100)>1e-8)throw Error('Вкажіть невід’ємну суму з точністю до копійок.');return Math.round(value*100);}
function optional(value,max){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw Error('Текст завеликий.');return value.trim();}
function orderFor(store,id){const order=store.orders.find(o=>o.id===id);if(!order)throw Error('Замовлення не знайдено.');return order;}
export function applyOperation(store,type,payload){
 if(type==='archive-record'){
  if(!['orders','purchases'].includes(payload.kind)||typeof payload.archived!=='boolean')throw Error('Перевірте тип запису та дію архіву.');
  const record=store[payload.kind].find(r=>r.id===payload.id);if(!record)throw Error('Запис не знайдено.');
  if(payload.archived&&!canArchiveRecord(payload.kind,record))throw Error('Спочатку завершіть або скасуйте запис. Відкриті записи залишаються в роботі.');
  record.archived=payload.archived;return store;
 }
 if(type==='set-stock'){
  const p=productFor(store,payload.productId),onHand=quantity(payload.onHand),minStock=quantity(payload.minStock),reason=text(payload.reason,'причину зміни залишку'),previous=store.inventory[p.id]?.onHand||0;
  if(onHand<stockInfo(store,p.id).reserved)throw Error('Залишок не може бути меншим за кількість у резерві. Спочатку скасуйте відповідні замовлення.');
  store.inventory[p.id]={onHand,minStock};if(onHand!==previous)movement(store,p.id,onHand-previous,'adjustment',reason);
  return store;
 }
 if(type==='create-order'){
  const id=text(payload.id,'ідентифікатор',100);if(store.orders.some(o=>o.id===id))throw Error('Це замовлення вже збережено.');
  if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>100)throw Error('Оберіть від 1 до 100 товарів.');
  const seen=new Set(),items=payload.items.map(i=>{const p=productFor(store,i.productId);if(p.archived)throw Error('Архівний товар не можна додати до нового замовлення.');if(seen.has(p.id))throw Error('Товар повторюється. Змініть його кількість в одному рядку.');seen.add(p.id);const price=priceInfo(p,store.promotions),earnings=unitEarnings(p,store.costs[p.id],store.promotions);return {productId:String(p.id),name:p.name,quantity:quantity(i.quantity,1),unitPriceCents:price.priceCents,unitCostCents:earnings.known?Math.round(earnings.cost*100):null,promotionName:price.promotion?.name||''};});
  const order={id,number:Math.max(0,...store.orders.map(o=>o.number))+1,createdAt:new Date().toISOString(),customer:text(payload.customer,'покупця',120),contact:optional(payload.contact,200),delivery:optional(payload.delivery,500),note:optional(payload.note,1000),items,status:'draft',paidCents:amount(payload.paidAmount||0)};
  if(order.paidCents>orderTotals(order).totalCents)throw Error('Оплата перевищує суму замовлення.');store.orders.push(order);return store;
 }
 if(type==='order-payment'){const order=orderFor(store,payload.id),paidCents=amount(payload.amount);if(paidCents>orderTotals(order).totalCents)throw Error('Оплата перевищує суму замовлення.');order.paidCents=paidCents;return store;}
 if(type==='order-status'){
  const order=orderFor(store,payload.id),next=payload.status;if(order.archived)throw Error('Спочатку поверніть замовлення з архіву.');if(!orderTransitions[order.status]?.includes(next))throw Error('Такий перехід статусу недоступний.');
  if(['confirmed','shipped'].includes(next))for(const i of order.items){const stock=stockInfo(store,i.productId);if(!stock.tracked)throw Error('Спочатку задайте залишок товару: '+i.name);const available=stock.available+(['new','confirmed'].includes(order.status)?i.quantity:0);if(available<i.quantity)throw Error('Недостатньо доступного товару: '+i.name);}
  if(next==='shipped')for(const i of order.items){store.inventory[i.productId].onHand-=i.quantity;movement(store,i.productId,-i.quantity,'sale','Відправлення замовлення №'+order.number);}
  if(next==='returned')for(const i of order.items){store.inventory[i.productId].onHand+=i.quantity;movement(store,i.productId,i.quantity,'return','Повне повернення замовлення №'+order.number);}
  order.status=next;return store;
 }
 if(type==='bulk-products'){
  if(!Array.isArray(payload.ids)||!payload.ids.length||payload.ids.length>1000||new Set(payload.ids).size!==payload.ids.length)throw Error('Оберіть від 1 до 1000 різних товарів.');
  const products=payload.ids.map(id=>productFor(store,id)),operation=payload.operation;
  if(!['percent','amount','archive','unarchive','duplicate'].includes(operation))throw Error('Невідома масова дія.');
  if(['percent','amount'].includes(operation)){const value=payload.value;if(!Number.isFinite(value)||Math.abs(value)>1000000||Math.abs(Math.round(value*100)-value*100)>1e-8)throw Error('Перевірте зміну ціни.');const prices=products.map(p=>Math.round((operation==='percent'?p.price*(1+value/100):p.price+value)*100)/100);if(prices.some(price=>!Number.isFinite(price)||price<=0))throw Error('Усі ціни після зміни мають бути більшими за нуль.');products.forEach((p,i)=>{p.price=prices[i];});}
  if(['archive','unarchive'].includes(operation))products.forEach(p=>{p.archived=operation==='archive';});
  if(operation==='duplicate'){let id=Math.max(Date.now(),...store.products.map(p=>Number(p.id)+1).filter(Number.isSafeInteger));for(const p of products){const copy={...structuredClone(p),id:id++,name:p.name.slice(0,170)+' (копія)',archived:false,sku:''};store.products.push(copy);if(store.costs[p.id])store.costs[copy.id]=structuredClone(store.costs[p.id]);}}
  return store;
 }
 if(type==='save-supplier'){
  const id=text(payload.id,'ідентифікатор',100),existing=store.suppliers.find(s=>s.id===id),supplier={id,name:text(payload.name,'назву постачальника',160),contact:optional(payload.contact,500),note:optional(payload.note,1000),archived:existing?.archived||false};
  if(existing)Object.assign(existing,supplier);else store.suppliers.push(supplier);return store;
 }
 if(type==='archive-supplier'){const supplier=store.suppliers.find(s=>s.id===payload.id);if(!supplier||typeof payload.archived!=='boolean')throw Error('Постачальника не знайдено.');supplier.archived=payload.archived;return store;}
 if(type==='create-purchase'){
  const id=text(payload.id,'ідентифікатор',100);if(store.purchases.some(p=>p.id===id))throw Error('Закупівля вже збережена.');const supplier=store.suppliers.find(s=>s.id===payload.supplierId&&!s.archived);if(!supplier)throw Error('Оберіть активного постачальника.');
  if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>100)throw Error('Оберіть від 1 до 100 товарів.');const seen=new Set();
  const items=payload.items.map(i=>{const p=productFor(store,i.productId);if(p.archived||seen.has(p.id))throw Error('Архівний товар або повторений рядок закупівлі.');seen.add(p.id);return {productId:String(p.id),name:p.name,quantity:quantity(i.quantity,1),unitCostCents:amount(i.unitCost)};});
  const expectedDate=optional(payload.expectedDate,10);if(expectedDate&&(! /^\d{4}-\d{2}-\d{2}$/.test(expectedDate)||Number.isNaN(Date.parse(expectedDate))||new Date(expectedDate).toISOString().slice(0,10)!==expectedDate))throw Error('Перевірте очікувану дату поставки.');
  const purchase={id,number:Math.max(0,...store.purchases.map(p=>p.number))+1,createdAt:new Date().toISOString(),supplierId:supplier.id,supplierName:supplier.name,expectedDate,note:optional(payload.note,1000),status:'ordered',items,deliveryCents:amount(payload.deliveryCost),paidCents:amount(payload.paidAmount)};
  if(purchase.paidCents>purchaseTotals(purchase).totalCents)throw Error('Оплата перевищує суму закупівлі.');store.purchases.push(purchase);return store;
 }
 if(['purchase-payment','cancel-purchase','receive-purchase'].includes(type)){
  const purchase=store.purchases.find(p=>p.id===payload.id);if(!purchase)throw Error('Закупівлю не знайдено.');
  if(type==='purchase-payment'){const paidCents=amount(payload.amount);if(paidCents>purchaseTotals(purchase).totalCents)throw Error('Оплата перевищує суму закупівлі.');purchase.paidCents=paidCents;return store;}
  if(purchase.status!=='ordered')throw Error('Цю закупівлю вже закрито. Повторне приймання недоступне.');
  if(type==='cancel-purchase'){purchase.status='cancelled';return store;}
  if(typeof payload.updateCosts!=='boolean')throw Error('Перевірте вибір оновлення собівартості.');
  for(const i of purchase.items){productFor(store,i.productId);quantity((store.inventory[i.productId]?.onHand||0)+i.quantity);}
  const totals=purchaseTotals(purchase),totalQuantity=purchase.items.reduce((sum,i)=>sum+i.quantity,0);
  for(const i of purchase.items){const previous=store.inventory[i.productId];store.inventory[i.productId]={onHand:(previous?.onHand||0)+i.quantity,minStock:previous?.minStock||0};movement(store,i.productId,i.quantity,'receipt','Приймання закупівлі №'+purchase.number);
   if(payload.updateCosts){const lineShipping=purchase.deliveryCents*(totals.goodsCents?i.unitCostCents*i.quantity/totals.goodsCents:i.quantity/totalQuantity);store.costs[i.productId]={...(store.costs[i.productId]||{}),purchasePrice:i.unitCostCents/100,inboundCost:Math.round(lineShipping/i.quantity)/100};}
  }
  purchase.status='received';purchase.receivedAt=new Date().toISOString();return store;
 }
 throw Error('Невідома дія.');
}
