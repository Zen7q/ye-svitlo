import test from 'node:test';
import assert from 'node:assert/strict';
import {filteredProducts,definitions,matchesFilters} from '../filters.js';
const fixtures=[
{id:1,name:'A',category:'inverters',brand:'Test',price:30000,powerKw:5,inverterType:'hybrid',phases:1,batteryVoltage:48,mpptCount:2},
{id:2,name:'B',category:'inverters',brand:'Test',price:40000,powerKw:6,inverterType:'hybrid',phases:3,batteryVoltage:48,mpptCount:4},
{id:3,name:'C',category:'inverters',brand:'Other',price:10000,powerKw:3,inverterType:'offgrid',phases:1,batteryVoltage:24,mpptCount:1},
{id:4,name:'D',category:'batteries',price:50000,capacityKwh:10,voltage:51.2,chemistry:'lifepo4',mounting:'rack'},
{id:5,name:'Incomplete',category:'inverters',price:20000}
];
const run=q=>filteredProducts(fixtures,new URLSearchParams(q)).map(p=>p.id);
test('power range is inclusive and removed price parameters do not restrict results',()=>assert.deepEqual(run('category=inverters&powerKwMin=5&powerKwMax=6&priceMax=35000'),[1,2]));
test('multiple options use OR within a group and AND across groups',()=>assert.deepEqual(run('category=inverters&inverterType=hybrid&inverterType=offgrid&phases=1&batteryVoltage=48'),[1]));
test('unrestricted missing specifications are included, restricted missing specs excluded',()=>{assert.deepEqual(run('category=inverters'),[1,2,3,5]);assert.deepEqual(run('category=inverters&powerKwMin=0'),[1,2,3]);});
test('battery-specific capacity and chemistry filters',()=>assert.deepEqual(run('category=batteries&capacityKwhMin=10&capacityKwhMax=10&chemistry=lifepo4&voltage=51.2'),[4]));
test('search composes with characteristics',()=>assert.deepEqual(filteredProducts(fixtures,new URLSearchParams('category=inverters&q=Test&phases=3')).map(p=>p.id),[2]));
test('MPPT 4 or more and multi-voltage products',()=>{const defs=definitions('inverters');assert.equal(matchesFilters({mpptCount:5,batteryVoltage:[24,48]},new URLSearchParams('mpptCount=4&batteryVoltage=48'),defs),true);});
test('empty catalogue remains empty under selected filters',()=>assert.deepEqual(filteredProducts([],new URLSearchParams('category=inverters&powerKwMin=5')),[]));
test('NKON functions support several values per product and combine with stock, phase and battery type',()=>{
 const items=[{id:10,category:'inverters',name:'LV',extraFunctions:['wifi','can'],stockStatus:'in-stock',phases:1,batteryType:'low'}, {id:11,category:'inverters',name:'HV',extraFunctions:['rs485'],stockStatus:'preorder',phases:3,batteryType:'high'}];
 assert.deepEqual(filteredProducts(items,new URLSearchParams('category=inverters&extraFunctions=wifi&extraFunctions=bluetooth&stockStatus=in-stock&phases=1&batteryType=low')).map(p=>p.id),[10]);
 assert.deepEqual(filteredProducts(items,new URLSearchParams('category=inverters&extraFunctions=can&stockStatus=preorder')),[]);
});
test('active and apparent power are independent and inclusive',()=>{
 const items=[{id:10,name:'A',category:'inverters',powerW:5000,apparentPowerVa:5500},{id:11,name:'B',category:'inverters',powerW:5000,apparentPowerVa:6000}];
 assert.deepEqual(filteredProducts(items,new URLSearchParams('category=inverters&powerWMin=5000&powerWMax=5000&apparentPowerVaMax=5500')).map(p=>p.id),[10]);
});
test('legacy kW data works with the new W filter',()=>assert.deepEqual(run('category=inverters&powerWMin=5000&powerWMax=6000'),[1,2]));
test('legacy battery voltage maps to LV and HV without inventing unknown values',()=>assert.deepEqual(run('category=inverters&batteryType=low'),[1,2,3]));
test('removed rating filters do not restrict results and are absent from definitions',()=>{
 const items=[{id:10,name:'A',category:'inverters',rating:5},{id:11,name:'B',category:'inverters',rating:4.5},{id:12,name:'C',category:'inverters'}];
 assert.equal(definitions('inverters').some(d=>d.key==='rating'),false);
 assert.equal(filteredProducts(items,new URLSearchParams('category=inverters&rating=5')).length,3);
});
