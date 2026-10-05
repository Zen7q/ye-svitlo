import {createHash,randomUUID} from 'node:crypto';
import {calculateSolar,estimateSystemPrice} from '../power-calculator.js';
export const consultationStatuses={new:'Нова',in_progress:'У роботі',completed:'Опрацьована',canceled:'Скасована'};
export function consultationInput(payload){
 if(!payload||typeof payload!=='object'||typeof payload.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.requestId))throw Error('Оновіть форму й повторіть заявку.');
 const raw=typeof payload.phone==='string'?payload.phone.trim():'';
 if(raw.length>40||!/^[+\d\s()-]+$/.test(raw))throw Error('Введіть коректний український номер телефону.');
 let phone=raw.replace(/\D/g,'');if(/^0\d{9}$/.test(phone))phone='38'+phone;
 if(!/^380\d{9}$/.test(phone))throw Error('Введіть номер у форматі +380 або 0 та 9 цифр.');
 const name=typeof payload.name==='string'?payload.name.trim():'',comment=typeof payload.comment==='string'?payload.comment.trim():'';
 if(name.length>80||comment.length>1000)throw Error('Скоротіть ім’я або коментар.');
 if(payload.consent!==true)throw Error('Підтвердьте згоду на передзвін за вказаним номером.');
 const calculation=payload.calculation?calculateSolar(payload.calculation):null;
 if(calculation&&payload.calculation.includeBattery!==undefined&&typeof payload.calculation.includeBattery!=='boolean')throw Error('Оберіть, чи додавати акумулятор.');
 if(calculation&&payload.calculation.includeBattery)calculation.includeBattery=true;
 return {phone:'+'+phone,name,comment,calculation};
}
export function createConsultation(current,payload){
 const data=consultationInput(payload),signature=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 current.consultations||=[];
 const existing=current.consultations.find(r=>r.requestId===payload.requestId);
 if(existing){if(existing.signature!==signature)throw Error('Цю заявку вже надіслано. Оновіть форму для нового звернення.');return existing;}
 const item={...data,calculation:data.calculation?{...data.calculation,priceEstimate:estimateSystemPrice(data.calculation.systemKw,{includeBattery:data.calculation.includeBattery===true})}:null,id:randomUUID(),number:Math.max(0,...current.consultations.map(r=>r.number||0))+1,createdAt:new Date().toISOString(),status:'new',requestId:payload.requestId,signature,consentAt:new Date().toISOString(),...(current.demo?{demo:true}:{})};
 current.consultations.push(item);return item;
}
export function updateConsultation(current,payload){
 const item=(current.consultations||[]).find(r=>r.id===payload.id);
 if(!item||!Object.hasOwn(consultationStatuses,payload.status))throw Error('Заявку або статус не знайдено.');
 item.status=payload.status;item.updatedAt=new Date().toISOString();return current;
}
