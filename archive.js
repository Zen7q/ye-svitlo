export const archiveSections = {products:'Товари',suppliers:'Постачальники',orders:'Замовлення',purchases:'Закупівлі',consultations:'Заявки на консультацію'};
export function archivedRecords(store,kind,archived=true){return (store[kind]||[]).filter(record=>!!record.archived===archived);}
export function canArchiveRecord(kind,record){if(kind==='consultations')return true;return (kind==='orders'?['completed','cancelled','returned']:kind==='purchases'?['received','cancelled']:[]).includes(record.status);}
