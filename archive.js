export const archiveSections = {products:'Товари',suppliers:'Постачальники',orders:'Замовлення',purchases:'Закупівлі'};
export function archivedRecords(store,kind,archived=true){return (store[kind]||[]).filter(record=>!!record.archived===archived);}
export function canArchiveRecord(kind,record){return (kind==='orders'?['completed','cancelled','returned']:kind==='purchases'?['received','cancelled']:[]).includes(record.status);}
