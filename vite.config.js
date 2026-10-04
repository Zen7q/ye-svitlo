import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {createAdminAuth} from './server/admin-auth.js';
import {createStoreMiddleware} from './server/store-service.js';
import {createNovaPoshta,createDeliveryMiddleware} from './server/nova-poshta.js';
const folder=resolve('data');
function storage(){return {name:'local-store',configureServer(server){
 const auth=createAdminAuth(folder),directory=createNovaPoshta();
 server.middlewares.use((req,res,next)=>{const path=decodeURIComponent((req.url||'').split('?')[0]);if(path.startsWith('/data/')||path.startsWith('/server/')){res.statusCode=404;res.end();return}next()});
 server.middlewares.use('/api/admin',auth.handle);
 server.middlewares.use('/api/delivery',createDeliveryMiddleware(directory));
 server.middlewares.use('/api/store',createStoreMiddleware(folder,auth,directory));
}}}
export default defineConfig({plugins:[storage()],server:{fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/data/**','**/server/**']}}});
