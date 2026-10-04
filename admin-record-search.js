import {esc,date} from './admin-utils.js';
import {orderStatuses} from './orders.js';
import {purchaseStatuses} from './purchases.js';

const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('uk-UA').replace(/[’‘`ʼ']/g,'').trim();
const digits=value=>String(value??'').replace(/\D/g,'');
const nationalPhone=value=>value.length===12&&value.startsWith('380')?value.slice(2):value;

export function recordMatches(record,kind,query,categoryName=''){
 const normalized=normalize(String(query??'').replace(/[№#]/g,' '));
 if(!normalized)return true;
 let fields;
 if(kind==='orders')fields=[record.number,record.customer,record.contact,record.delivery,record.note,record.createdAt,date(record.createdAt),orderStatuses[record.status],record.promoCode?.code,...['firstName','lastName','phone','email','city','address'].map(key=>record.checkout?.[key]),...(record.items||[]).flatMap(item=>[item.name,item.sku])];
 else if(kind==='purchases')fields=[record.number,record.supplierName,record.note,record.createdAt,date(record.createdAt),record.expectedDate,date(record.expectedDate),purchaseStatuses[record.status],...(record.items||[]).flatMap(item=>[item.name,item.sku])];
 else if(kind==='suppliers')fields=[record.name,record.contact,record.note];
 else if(kind==='products')fields=[record.name,record.sku,record.brand,record.category,categoryName,record.description];
 else return false;
 const values=fields.map(normalize);
 const matches=token=>values.some(value=>value.includes(token)||(/^[+\d().\s-]+$/.test(token)&&digits(token).length>=3&&(digits(value).includes(digits(token))||nationalPhone(digits(value)).includes(nationalPhone(digits(token))))));
 if(/^[+\d().\s-]+$/.test(normalized)&&digits(normalized).length>=3)return matches(normalized);
 return normalized.split(/\s+/).every(matches);
}

const labels={orders:['Пошук замовлень','Ім’я, телефон, № замовлення, email або товар'],purchases:['Пошук закупівель','№ закупівлі, постачальник або товар'],suppliers:['Пошук постачальників','Назва, телефон, email або примітка'],products:['Пошук товарів','Назва, артикул, виробник або категорія']};

// Only filter the list: keep focus, caret and unsaved forms intact while typing.
export function mountRecordSearch(work,records,kind,state,{archived=false,categories=[]}={}){
 const list=work.querySelector('.admin-list');
 if(!list)return;
 const key=(archived?'archive-':'active-')+kind,[label,placeholder]=labels[kind];
 list.insertAdjacentHTML('beforebegin',`<div class="admin-search"><label>${label}<input type="search" data-record-search maxlength="200" autocomplete="off" placeholder="${placeholder}" value="${esc(state[key]||'')}"></label><button type="button" class="secondary" data-clear-record-search>Очистити</button><p class="admin-search-count" role="status" aria-live="polite"></p></div><p class="admin-search-empty accounting-note" hidden>Нічого не знайдено. Спробуйте інший запит або очистіть пошук.</p>`);
 const input=work.querySelector('[data-record-search]'),clear=work.querySelector('[data-clear-record-search]'),count=work.querySelector('.admin-search-count'),empty=work.querySelector('.admin-search-empty'),cards=[...list.children];
 function filter(){
  state[key]=input.value;let found=0;
  records.forEach((record,index)=>{const match=recordMatches(record,kind,input.value,categories.find(category=>category.id===record.category)?.name);cards[index].hidden=!match;if(match)found++;});
  count.textContent=`Показано: ${found} із ${records.length}`;
  empty.hidden=!records.length||found>0;clear.disabled=!input.value;
 }
 input.addEventListener('input',event=>{event.stopPropagation();filter();});
 input.addEventListener('change',event=>event.stopPropagation());
 input.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
 clear.addEventListener('click',event=>{event.stopPropagation();input.value='';filter();input.focus();});
 filter();
}
