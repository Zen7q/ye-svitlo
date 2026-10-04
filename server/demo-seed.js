import {demoProducts,demoSupplier,demoSupplierPrices} from './demo-catalog.js';
import {randomUUID} from 'node:crypto';
export function demoSeed(){
 const products=structuredClone(demoProducts).map(p=>({...p,stockStatus:'in-stock'})),createdAt=new Date().toISOString();
 return {revision:0,demo:true,products,texts:{},promotions:[],promoCodes:[],costs:Object.fromEntries(products.map(p=>[p.id,{purchasePrice:demoSupplierPrices[p.sku]}])),inventory:Object.fromEntries(products.map(p=>[p.id,{onHand:3,minStock:1}])),orders:[],suppliers:[structuredClone(demoSupplier)],purchases:[],movements:products.map(p=>({id:randomUUID(),createdAt,productId:p.id,delta:3,type:'adjustment',reason:'Демонстраційний початковий залишок: 3 шт. Фактичної поставки не було.'}))};
}
