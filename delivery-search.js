import {esc} from './admin-utils.js';
export function startDeliverySearch(form,onChange){
 const city=form.elements.city,address=form.elements.address,mode=form.elements.directoryMode,cityRef=form.elements.cityRef,settlementRef=form.elements.settlementRef,warehouseRef=form.elements.warehouseRef;
 const toggle=form.querySelector('#delivery-manual'),hint=form.querySelector('#delivery-directory-hint');
 let method=form.elements.deliveryMethod.value;
 const searches=[];
 function manual(){return mode.value==='manual';}
 function sync(){const branch=form.elements.deliveryMethod.value==='branch';city.setCustomValidity(!manual()&&!cityRef.value?'Оберіть місто з підказок.':'');address.setCustomValidity(!manual()&&branch&&!warehouseRef.value?'Оберіть відділення з підказок.':'');address.disabled=!manual()&&branch&&!cityRef.value;city.setAttribute('role',manual()?'textbox':'combobox');address.setAttribute('role',manual()||!branch?'textbox':'combobox');toggle.textContent=manual()?'Знайти місто й відділення у довіднику':'Ввести адресу вручну';hint.textContent=manual()?'Вкажіть місто й повну адресу відділення або доставки.':branch?'Введіть щонайменше 2 літери міста й оберіть підказку. Потім знайдіть відділення чи поштомат за номером або адресою.':'Оберіть місто з підказок і вкажіть вулицю, будинок та квартиру для кур’єрської доставки.';}
 function clearWarehouse(){warehouseRef.value='';address.value='';searches[1]?.close();}
 function autocomplete(input,listId,statusId,canSearch,url,select){
  const list=form.querySelector('#'+listId),status=form.querySelector('#'+statusId);let timer,controller,version=0,rows=[],active=-1;
  function close(){clearTimeout(timer);controller?.abort();version++;list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.removeAttribute('aria-busy');rows=[];active=-1;status.textContent='';}
  function choose(index){const row=rows[index];if(!row)return;select(row);close();sync();onChange();input.focus();}
  function highlight(index){active=index;list.querySelectorAll('[role=option]').forEach((option,i)=>{option.setAttribute('aria-selected',String(i===active));if(i===active){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}});}
  async function search(){close();if(!canSearch()||!form.isConnected)return;const token=version;controller=new AbortController();input.setAttribute('aria-busy','true');status.textContent='Шукаємо…';try{const response=await fetch(url(),{signal:controller.signal}),data=await response.json();if(token!==version||!form.isConnected)return;if(!response.ok)throw Error(data.error||'Не вдалося завантажити підказки.');rows=data.items||[];active=-1;list.innerHTML=rows.map((row,i)=>`<button type="button" role="option" aria-selected="false" id="${listId}-${i}" data-index="${i}">${esc(row.label)}</button>`).join('');list.hidden=!rows.length;input.setAttribute('aria-expanded',String(!!rows.length));status.textContent=rows.length?(data.hasMore?'Введіть номер або частину адреси, щоб звузити список.':''):'Нічого не знайдено. Уточніть запит або введіть адресу вручну.';}catch(error){if(token===version&&error.name!=='AbortError'&&form.isConnected)status.textContent=error.message;}finally{if(token===version)input.removeAttribute('aria-busy');}}
  input.addEventListener('input',()=>{close();if(canSearch())timer=setTimeout(search,300);});
  input.addEventListener('focus',()=>{if(canSearch())search();});
  input.addEventListener('blur',()=>{setTimeout(()=>{if(!list.contains(document.activeElement))close();},150);});
  input.addEventListener('keydown',event=>{if(list.hidden)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight(active<0?(event.key==='ArrowDown'?0:rows.length-1):(active+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length);}else if(event.key==='Enter'){event.preventDefault();choose(active<0?0:active);}else if(event.key==='Escape'){event.preventDefault();close();}});
  list.addEventListener('pointerdown',event=>event.preventDefault());list.addEventListener('click',event=>{const option=event.target.closest('[data-index]');if(option)choose(Number(option.dataset.index));});
  return {close,search};
 }
 // Clear references before the search listener evaluates its next query.
 city.addEventListener('input',()=>{cityRef.value='';settlementRef.value='';clearWarehouse();sync();onChange();});
 address.addEventListener('input',()=>{warehouseRef.value='';sync();onChange();});
 searches.push(autocomplete(city,'delivery-cities','delivery-city-status',()=>!manual()&&!cityRef.value&&city.value.trim().length>=2,()=>'/api/delivery/cities?q='+encodeURIComponent(city.value.trim().slice(0,80)),row=>{city.value=row.label;cityRef.value=row.ref;settlementRef.value=row.settlementRef;clearWarehouse();}));
 searches.push(autocomplete(address,'delivery-warehouses','delivery-warehouse-status',()=>!manual()&&form.elements.deliveryMethod.value==='branch'&&!!cityRef.value&&!warehouseRef.value,()=>'/api/delivery/warehouses?cityRef='+encodeURIComponent(cityRef.value)+'&q='+encodeURIComponent(address.value.trim().slice(0,80)),row=>{address.value=row.label;warehouseRef.value=row.ref;}));
 toggle.onclick=()=>{mode.value=manual()?'directory':'manual';cityRef.value='';settlementRef.value='';warehouseRef.value='';searches.forEach(s=>s.close());sync();onChange();};
 form.elements.deliveryMethod.addEventListener('change',()=>{if(method!==form.elements.deliveryMethod.value){method=form.elements.deliveryMethod.value;clearWarehouse();searches.forEach(s=>s.close());sync();onChange();}});
 sync();
}
