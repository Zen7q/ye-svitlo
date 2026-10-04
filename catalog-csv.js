import {filterSchemas} from './filters.js';
const basic=['id','name','category','price','brand','description','sku'];
export const csvColumns=[...new Set([...basic,...Object.values(filterSchemas).flat().map(d=>d.key)])];
const types={inverters:'inverter',batteries:'battery',panels:'panel',controllers:'controller',accessories:'connector'};
const encode=value=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text="'"+text;return /[;"\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
export function exportCatalog(products){return '\uFEFF'+[csvColumns.join(';'),...products.map(p=>csvColumns.map(key=>encode(Array.isArray(p[key])?p[key].join('|'):p[key])).join(';'))].join('\r\n');}
export function parseCsv(source){
 if(typeof source!=='string'||source.length>2_000_000)throw Error('CSV має бути не більшим за 2 МБ.');source=source.replace(/^\uFEFF/,'');
 let quoted=false,counts={';':0,',':0,'\t':0};for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){i++;continue}quoted=!quoted;}if(!quoted){if(c==='\n'||c==='\r')break;if(c in counts)counts[c]++;}}
 const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];const rows=[];let row=[],cell='';quoted=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell!=='')throw Error('Неправильні лапки в CSV.');else quoted=!quoted;continue;}if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==delimiter){if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&source[i+1]==='\n')i++;}}else cell+=c;}
 if(quoted)throw Error('Незакриті лапки в CSV.');row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
export function importCatalog(source,existing){
 const rows=parseCsv(source),headers=rows.shift()?.map(h=>h.trim());if(!headers||!['name','category','price'].every(k=>headers.includes(k)))throw Error('CSV має містити стовпці name, category, price.');if(new Set(headers).size!==headers.length||headers.some(h=>!csvColumns.includes(h)))throw Error('Невідомі або повторені стовпці CSV. Використайте експорт каталогу як шаблон.');if(!rows.length||rows.length>1000)throw Error('Імпортуйте від 1 до 1000 рядків.');
 let nextId=Math.max(Date.now(),...existing.map(p=>Number(p.id)+1).filter(Number.isSafeInteger));const seen=new Set();let created=0,updated=0;
 const imported=rows.map((values,index)=>{if(values.length!==headers.length)throw Error('Рядок '+(index+2)+': кількість стовпців не збігається.');const data=Object.fromEntries(headers.map((key,i)=>[key,values[i].replace(/^'(?=[=+\-@])/,'')]));const old=data.id?existing.find(p=>String(p.id)===data.id):null;if(data.id&&!old)throw Error('Рядок '+(index+2)+': id не знайдено. Для нового товару залиште id порожнім.');const id=old?.id??nextId++;if(seen.has(id))throw Error('Товар повторюється в CSV.');seen.add(id);
 const category=data.category;if(!types[category]||!data.name.trim()||data.name.length>180)throw Error('Рядок '+(index+2)+': перевірте назву й категорію.');const price=Number(data.price.replace(',','.'));if(!Number.isFinite(price)||price<=0)throw Error('Рядок '+(index+2)+': ціна має бути більшою за нуль.');
 const product={...(old||{photos:[],mainPhoto:0}),id,name:data.name.trim(),category,type:types[category],price};if(old&&old.category!==category)for(const key of csvColumns.filter(k=>!basic.includes(k)))delete product[key];
 for(const key of ['brand','description','sku'])if(Object.hasOwn(data,key))product[key]=data[key];
 for(const d of filterSchemas[category])if(Object.hasOwn(data,d.key)){const value=data[d.key];if(value===''){delete product[d.key];continue;}if(d.multiple){const values=value.split('|');if(values.some(v=>!d.choices.some(([key])=>String(key)===v)))throw Error('Рядок '+(index+2)+': неправильне значення '+d.key);product[d.key]=[...new Set(values)];}else if(d.kind==='range'){const number=Number(value.replace(',','.'));if(!Number.isFinite(number)||number<0)throw Error('Рядок '+(index+2)+': неправильне число '+d.key);product[d.key]=number;}else{if(!d.choices.some(([key])=>String(key)===value))throw Error('Рядок '+(index+2)+': неправильне значення '+d.key);product[d.key]=value;}}
 old?updated++:created++;return product;
 });
 return {products:[...existing.filter(p=>!seen.has(p.id)),...imported],imported,created,updated};
}
