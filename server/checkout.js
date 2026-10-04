import {normalizePromoCode} from '../promo-codes.js';
import {checkoutQuote} from './checkout-quote.js';
import {orderTotals} from '../orders.js';
import {isReference} from './nova-poshta.js';
import {createHash} from 'node:crypto';
import {applyOperation,text} from './operations.js';
import {priceInfo} from '../promotions.js';
import {stockInfo} from '../inventory.js';
import {deliveryMethods,paymentMethods} from '../checkout-options.js';
function optional(value,max){if(value===undefined||value==='')return '';return text(value,'коректний текст',max);}
export function checkoutOrder(store,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Перевірте дані замовлення.');
 if(typeof payload.requestId!=='string'||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(payload.requestId))throw Error('Оновіть сторінку оформлення замовлення.');
 const firstName=text(payload.firstName,'ім’я',59),lastName=text(payload.lastName,'прізвище',60),phone=text(payload.phone,'номер телефону',30).replace(/[\s()\-]/g,'');
 if(! /^\+?\d{7,15}$/.test(phone))throw Error('Введіть коректний номер телефону.');
 const email=optional(payload.email,160);if(email&&! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Перевірте email.');
 if(!Object.hasOwn(deliveryMethods,payload.deliveryMethod)||!Object.hasOwn(paymentMethods,payload.paymentMethod))throw Error('Оберіть доставку й спосіб оплати.');
 const city=text(payload.city,'місто',100),address=text(payload.address,'відділення або адресу доставки',300),note=optional(payload.note,1000);
 if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>30)throw Error('Оберіть від 1 до 30 товарів.');
 const seen=new Set(),items=payload.items.map(i=>{if(!i||!['string','number'].includes(typeof i.productId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99||!Number.isSafeInteger(i.expectedPriceCents)||i.expectedPriceCents<0)throw Error('Перевірте товари й кількість у кошику.');const productId=String(i.productId);if(seen.has(productId))throw Error('Товар повторюється в кошику.');seen.add(productId);return {productId,quantity:i.quantity,expectedPriceCents:i.expectedPriceCents};}).sort((a,b)=>a.productId.localeCompare(b.productId));
 const directory={};if(payload.directoryMode==='directory'){if(!isReference(payload.cityRef)||!isReference(payload.settlementRef)||(payload.deliveryMethod==='branch'&&!isReference(payload.warehouseRef)))throw Error('Оберіть місто та відділення зі списку Нової пошти.');Object.assign(directory,{directoryMode:'directory',cityRef:payload.cityRef,settlementRef:payload.settlementRef,warehouseRef:payload.deliveryMethod==='branch'?payload.warehouseRef:''});}
 const promoCode=normalizePromoCode(payload.promoCode),discountDetails=promoCode?{promoCode,expectedTotalCents:payload.expectedTotalCents}:{};
 const details={...discountDetails,...directory,firstName,lastName,phone,email,city,address,deliveryMethod:payload.deliveryMethod,paymentMethod:payload.paymentMethod,note,items};
 const requestHash=createHash('sha256').update(JSON.stringify(details)).digest('hex');
 const existing=store.orders.find(o=>o.source==='website'&&o.checkoutRequestId===payload.requestId);
 if(existing){if(existing.checkoutRequestHash!==requestHash){const e=Error('Ця спроба оформлення вже використана. Оновіть сторінку перед новим замовленням.');e.status=409;throw e;}return existing;}
 const quote=checkoutQuote(store,{items,promoCode});if(promoCode&&(!Number.isSafeInteger(payload.expectedTotalCents)||payload.expectedTotalCents!==quote.totalCents)){const e=Error('Знижка змінилася. Застосуйте промокод знову й перевірте суму.');e.status=409;throw e;}
 let reserve=true;
 for(const i of items){const product=store.products.find(p=>String(p.id)===i.productId&&!p.archived);if(!product)throw Error('Один із товарів уже недоступний. Оновіть кошик.');
  if(priceInfo(product,store.promotions).priceCents!==i.expectedPriceCents){const e=Error('Ціни змінилися. Оновіть кошик і перевірте суму перед підтвердженням.');e.status=409;throw e;}
  const stock=stockInfo(store,i.productId);if(product.stockStatus==='preorder'){reserve=false;continue;}
  if(stock.tracked&&stock.available<i.quantity)throw Error('Недостатньо доступного товару: '+product.name+'. Змініть кількість у кошику.');
  if(!stock.tracked){if(product.stockStatus==='out-of-stock')throw Error('Товар недоступний: '+product.name);reserve=false;}
 }
 applyOperation(store,'create-order',{id:payload.requestId,customer:lastName+' '+firstName,contact:phone+(email?' · '+email:''),delivery:deliveryMethods[payload.deliveryMethod]+' · '+city+' · '+address,note,paidAmount:0,items:items.map(({productId,quantity})=>({productId,quantity}))});
 const order=store.orders.at(-1);if(quote.promotion){order.promoCode=quote.promotion;order.items.forEach((line,index)=>{line.discountCents=quote.discounts[index];const cost=store.costs[line.productId];if(line.unitCostCents!==null){const baseCost=['purchasePrice','inboundCost','saleCost'].reduce((sum,key)=>sum+Math.round(Number(cost?.[key]||0)*100),0);line.lineCostCents=baseCost*line.quantity+Math.round((line.unitPriceCents*line.quantity-line.discountCents)*Number(cost?.feePercent||0)/100);}});}
 Object.assign(order,{source:'website',status:reserve?'new':'draft',checkoutRequestId:payload.requestId,checkoutRequestHash:requestHash,checkout:{...directory,firstName,lastName,phone,email,city,address,deliveryMethod:payload.deliveryMethod,paymentMethod:payload.paymentMethod}});return order;
}
export function checkoutReceipt(order){return {number:order.number,totalCents:orderTotals(order).totalCents};}
