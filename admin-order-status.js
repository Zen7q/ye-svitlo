import {orderStatuses} from './orders.js';
import {esc} from './admin-utils.js';

export function orderStatusBadge(order){
 const status=Object.hasOwn(orderStatuses,order.status)?order.status:'unknown';
 return `<span class="order-status order-status--${status}">${esc(orderStatuses[status]||'Невідомий статус')}${order.source==='website'&&status!=='new'?' · Із сайту':''}</span>`;
}
