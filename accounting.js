import {priceInfo} from './promotions.js';
export const costFields=[['purchasePrice','Закупівельна ціна, ₴'],['inboundCost','Доставка закупівлі на одиницю, ₴'],['saleCost','Інші витрати продажу на одиницю, ₴'],['feePercent','Комісія продажу, %']];
export function unitEarnings(product,cost,promotions=[]){
 const {price,priceCents}=priceInfo(product,promotions);
 if(cost?.purchasePrice===undefined||cost.purchasePrice===null||cost.purchasePrice==='')return {known:false,price};
 const costCents=['purchasePrice','inboundCost','saleCost'].reduce((sum,key)=>sum+Math.round(Number(cost[key]||0)*100),0)+Math.round(priceCents*Number(cost.feePercent||0)/100);
 const earningsCents=priceCents-costCents;
 return {known:true,price,cost:costCents/100,earnings:earningsCents/100,earningsCents,margin:priceCents?earningsCents/priceCents*100:null,loss:earningsCents<0};
}
export function validateCosts(costs,products){
 if(!costs||typeof costs!=='object'||Array.isArray(costs))throw Error('Неправильні дані собівартості.');
 for(const [id,cost] of Object.entries(costs)){
  if(!products.some(p=>String(p.id)===id)||!cost||typeof cost!=='object'||Array.isArray(cost))throw Error('Товар для собівартості не знайдено.');
  for(const [key] of costFields){const value=cost[key];if(value!==undefined&&(!Number.isFinite(value)||value<0||(key==='feePercent'&&value>100)||Math.abs(Math.round(value*100)-value*100)>1e-8))throw Error('Собівартість: невід’ємні суми з двома знаками; комісія — від 0 до 100%.');}
 }
}
