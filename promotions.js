const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(n);
export function validatePromotions(promotions,products){
 if(!Array.isArray(promotions)||promotions.length>200)throw Error('Неправильний список акцій. Максимум 200 акцій.');
 const ids=new Set();
 for(const p of promotions){
  if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error('Неправильний ідентифікатор акції.');ids.add(p.id);
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)throw Error('Вкажіть назву акції до 120 символів.');
  if(!['category','product'].includes(p.targetType)||typeof p.targetId!=='string')throw Error('Оберіть категорію або товар для акції.');
  if(p.targetType==='category'&&!['inverters','batteries','panels','controllers','accessories'].includes(p.targetId))throw Error('Оберіть категорію для акції.');
  if(p.targetType==='product'&&!products.some(product=>String(product.id)===p.targetId))throw Error('Товар для акції не знайдено.');
  if(!['percent','amount'].includes(p.discountType)||!Number.isFinite(p.value)||p.value<=0||(p.discountType==='percent'&&p.value>100))throw Error('Знижка має бути більшою за нуль; відсоток — не більше 100.');
  if(Math.round(p.value*100)!==p.value*100&&Math.abs(Math.round(p.value*100)-p.value*100)>1e-8)throw Error('Вкажіть знижку з точністю до двох знаків після коми.');
  if(typeof p.enabled!=='boolean')throw Error('Неправильний стан акції.');
 }
 return promotions;
}
export function priceInfo(product,promotions=[]){
 const baseCents=Math.max(0,Math.round(Number(product.price)*100));
 let priceCents=baseCents,promotion=null;
 for(const p of promotions){
  if(!p.enabled||!Number.isFinite(p.value)||p.value<=0)continue;
  if(!(p.targetType==='product'&&p.targetId===String(product.id))&&!(p.targetType==='category'&&p.targetId===product.category))continue;
  const next=Math.max(0,p.discountType==='percent'?Math.round(baseCents*(1-Math.min(100,p.value)/100)):p.discountType==='amount'?baseCents-Math.round(p.value*100):baseCents);
  if(next<priceCents){priceCents=next;promotion=p;}
 }
 return {base:baseCents/100,price:priceCents/100,priceCents,saving:(baseCents-priceCents)/100,promotion};
}
export function priceMarkup(product,promotions=[],className=''){
 const info=priceInfo(product,promotions);
 return `<div class="price-display">${info.promotion?`<div class="price-before"><s aria-label="Ціна до знижки">${money(info.base)} ₴</s><span class="discount-badge">${info.promotion.discountType==='percent'?`−${money(info.promotion.value)}%`:`−${money(info.saving)} ₴`}</span></div>`:''}<strong class="${esc(className)}">${money(info.price)} <span>₴</span></strong>${info.promotion?`<span class="promotion-caption">${esc(info.promotion.name)}</span>`:''}</div>`;
}
export function cartTotal(products,cart,promotions=[]){return products.reduce((sum,p)=>sum+priceInfo(p,promotions).priceCents*(cart[p.id]||0),0)/100;}
