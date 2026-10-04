export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=n=>new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(n)+' ₴';
export const date=s=>s?new Date(s).toLocaleDateString('uk-UA'):'—';
export function download(name,text,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
