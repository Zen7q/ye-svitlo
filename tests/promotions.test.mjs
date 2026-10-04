import test from 'node:test';
import assert from 'node:assert/strict';
import {priceInfo,priceMarkup,cartTotal,validatePromotions} from '../promotions.js';
import {productPage} from '../product-page.js';
const products=[{id:1,name:'Інвертор',category:'inverters',price:1000},{id:2,name:'Акумулятор',category:'batteries',price:2000}];
const promo=(fields={})=>({id:'test',name:'Осіння акція',targetType:'category',targetId:'inverters',discountType:'percent',value:10,enabled:true,...fields});
test('category and individual promotions affect only matching products without mutating base prices',()=>{
 const promotions=[promo(),promo({id:'individual',targetType:'product',targetId:'2',discountType:'amount',value:300})];
 assert.equal(priceInfo(products[0],promotions).price,900);
 assert.equal(priceInfo(products[1],promotions).price,1700);
 assert.equal(priceInfo({...products[0],id:3},promotions).price,900);
 assert.equal(priceInfo({...products[1],id:4},promotions).price,2000);
 assert.equal(products[0].price,1000);
});
test('overlapping discounts use the best final price without stacking; disabling restores prices',()=>{
 const promotions=[promo(),promo({id:'individual',targetType:'product',targetId:'1',discountType:'amount',value:150})];
 assert.equal(priceInfo(products[0],promotions).price,850);
 assert.equal(priceInfo(products[0],promotions).promotion.id,'individual');
 assert.equal(priceInfo(products[0],promotions.map(p=>({...p,enabled:false}))).price,1000);
 assert.equal(priceInfo(products[0],[promo({value:100})]).price,0);
 assert.equal(priceInfo(products[0],[promo({discountType:'amount',value:2000})]).price,0);
});
test('discounts and cart totals round at unit cents, including decimal prices and quantities',()=>{
 const items=[{...products[0],price:19.99},{...products[1],price:0.1}];
 assert.equal(priceInfo(items[0],[promo()]).price,17.99);
 assert.equal(cartTotal(items,{1:3,2:3},[promo()]),54.27);
});
test('server promotion validation rejects invalid discounts, targets, and duplicate IDs',()=>{
 assert.deepEqual(validatePromotions([promo()],products),[promo()]);
 for(const invalid of [{value:0},{value:-1},{value:101},{value:NaN},{value:1.001},{targetType:'all'},{targetId:'wrong'},{targetType:'product',targetId:'99'},{enabled:'yes'},{name:''}])assert.throws(()=>validatePromotions([promo(invalid)],products));
 assert.throws(()=>validatePromotions([promo(),promo()],products));
 assert.throws(()=>validatePromotions({},products));
});
test('product prices expose original price and escaped promotion name; full page uses the same discounted price',()=>{
 const promotions=[promo({name:'<img onerror=x>'})];
 const html=priceMarkup(products[0],promotions);
 assert.match(html,/Ціна до знижки/);assert.match(html,/−10%/);assert.match(html,/900/);
 assert.ok(html.includes('&lt;img onerror=x&gt;'));assert.equal(html.includes('<img'),false);
 const page=productPage(products[0],{categories:[],products,art:()=>'',back:'#/catalog',promotions});
 assert.ok(page.includes('class="product-price">900'));
 assert.equal(priceMarkup(products[0],[]).includes('<s ' ),false);
});
