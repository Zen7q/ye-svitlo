import {mountRecordSearch} from './admin-record-search.js';
import {archiveSections,archivedRecords} from './archive.js';
import {startConsultations} from './admin-consultations.js';
import {startOrders} from './admin-orders.js';
import {startPurchases} from './admin-purchases.js';
import {esc,money} from './admin-utils.js';
export function startArchive(work,store,categories,options){
 let kind='products';
 const searchState=options.searchState||{};
 const childOptions={...options,searchState,archived:true,action:async(type,payload)=>{await options.action(type,payload);for(const b of work.querySelectorAll('[data-archive-section]'))b.textContent=archiveSections[b.dataset.archiveSection]+' · '+archivedRecords(store,b.dataset.archiveSection).length;}};
 function render(){
  options.setDirty(false);
  work.innerHTML=`<h2>Архів</h2><p class="accounting-note">Архівовані записи приховані у робочих списках. Тут їх можна переглянути й повернути. Суми, оплати та історія руху товарів зберігаються.</p><div class="admin-tabs">${Object.entries(archiveSections).map(([key,label])=>`<button data-archive-section="${key}" aria-pressed="${kind===key}">${label} · ${archivedRecords(store,key).length}</button>`).join('')}</div><div id="archive-work"></div>`;
  const content=work.querySelector('#archive-work');
  if(kind==='consultations')return startConsultations(content,store,childOptions);
  if(kind==='orders')return startOrders(content,store,childOptions);
  if(kind==='purchases')return startPurchases(content,store,childOptions);
  if(kind==='suppliers')return startPurchases(content,store,{...childOptions,initialSection:'suppliers'});
  const products=archivedRecords(store,'products');
  content.innerHTML=`<div class="admin-list">${products.map(p=>`<article class="admin-card admin-product">${p.photos?.length?`<img src="${esc(p.photos[p.mainPhoto||0])}" alt="">`:'<div class="photo-placeholder">Без фото</div>'}<div><h3>${esc(p.name)}</h3><p>${esc(categories.find(c=>c.id===p.category)?.name)} · ${money(p.price)}</p></div><button class="secondary" data-restore-product="${p.id}">Повернути з архіву</button></article>`).join('')||'<p class="accounting-note">Архівних товарів немає.</p>'}</div>`;
  mountRecordSearch(content,products,'products',searchState,{archived:true,categories});
 }
 work.onclick=async e=>{const b=e.target.closest('button');if(!b)return;try{
  if(b.dataset.archiveSection){if(options.getDirty()&&!confirm('Вийти без збереження змін?'))return;kind=b.dataset.archiveSection;render();}
  if(b.dataset.restoreProduct){b.disabled=true;await options.action('bulk-products',{ids:[b.dataset.restoreProduct],operation:'unarchive'});render();}
 }catch(err){options.notify(err.message,true);b.disabled=false;}};
 render();
}
