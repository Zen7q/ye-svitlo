import {Pool} from 'pg';
import {createHash} from 'node:crypto';

export const emptyStore=()=>({revision:0,products:[],texts:{},promotions:[],promoCodes:[],costs:{},inventory:{},orders:[],suppliers:[],purchases:[],movements:[]});
export function createCloudDatabase({pool,connectionString=process.env.DATABASE_URL||process.env.POSTGRES_URL,namespace=process.env.YE_STORE_NAMESPACE||'demo',initialData=emptyStore()}={}){
 if(!pool){if(!connectionString)throw Error('Не налаштовано хмарну базу.');pool=new Pool({connectionString,max:3,connectionTimeoutMillis:12000,idleTimeoutMillis:10000,allowExitOnIdle:true});}
 if(!/^[a-z0-9_-]{1,40}$/.test(namespace))throw Error('Неправильний простір даних.');
 let ready;
 async function initialize(){
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(775542126)');
  await client.query(`CREATE TABLE IF NOT EXISTS ye_store (namespace text PRIMARY KEY, data jsonb NOT NULL);
   CREATE TABLE IF NOT EXISTS ye_history (namespace text NOT NULL, id uuid NOT NULL, data jsonb NOT NULL, PRIMARY KEY(namespace,id));
   CREATE TABLE IF NOT EXISTS ye_credentials (namespace text PRIMARY KEY, data jsonb NOT NULL);
   CREATE TABLE IF NOT EXISTS ye_sessions (namespace text NOT NULL, token_hash text NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(namespace,token_hash));
   CREATE TABLE IF NOT EXISTS ye_limits (namespace text NOT NULL, key text NOT NULL, window_start bigint NOT NULL, count integer NOT NULL, PRIMARY KEY(namespace,key));`);
  await client.query('INSERT INTO ye_store(namespace,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[namespace,JSON.stringify(initialData)]);
  await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 const init=()=>ready??=(initialize().catch(e=>{ready=null;throw e;}));
 async function query(sql,params=[]){await init();return pool.query(sql,params);}
 async function read(){const result=await query('SELECT data FROM ye_store WHERE namespace=$1',[namespace]);return {...emptyStore(),...result.rows[0].data};}
 async function transaction(change){
  await init();const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const {rows}=await client.query('SELECT data FROM ye_store WHERE namespace=$1 FOR UPDATE',[namespace]);
   let changed;try{changed=await change({...emptyStore(),...rows[0].data});}catch(e){if(!e.code&&!e.status)e.status=400;throw e;}const {next,snapshot}=changed;
   if(snapshot)await client.query('INSERT INTO ye_history(namespace,id,data) VALUES($1,$2,$3::jsonb)',[namespace,snapshot.id,JSON.stringify(snapshot)]);
   await client.query('UPDATE ye_store SET data=$2::jsonb WHERE namespace=$1',[namespace,JSON.stringify(next)]);
   await client.query('COMMIT');return next;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 async function history(){const {rows}=await query("SELECT id, data->>'createdAt' AS \"createdAt\", data->>'label' AS label FROM ye_history WHERE namespace=$1 ORDER BY data->>'createdAt' DESC",[namespace]);return rows;}
 async function snapshot(id){const {rows}=await query('SELECT data FROM ye_history WHERE namespace=$1 AND id=$2',[namespace,id]);return rows[0]?.data;}
 async function rateLimit(req,scope,limit,now=Date.now()){
  // Vercel supplies this header; callers cannot choose their own rate-limit identity.
  const address=req.headers['x-vercel-forwarded-for']||req.socket.remoteAddress||'unknown';
  const key=createHash('sha256').update(scope+':'+address).digest('hex'),start=Math.floor(now/600000)*600000;
  const {rows}=await query(`INSERT INTO ye_limits(namespace,key,window_start,count) VALUES($1,$2,$3,1)
   ON CONFLICT(namespace,key) DO UPDATE SET window_start=EXCLUDED.window_start,
   count=CASE WHEN ye_limits.window_start=EXCLUDED.window_start THEN ye_limits.count+1 ELSE 1 END RETURNING count`,[namespace,key,start]);
  await query('DELETE FROM ye_limits WHERE namespace=$1 AND window_start<$2',[namespace,start-600000]);
  return rows[0].count<=limit;
 }
 return {read,transaction,history,snapshot,query,namespace,rateLimit,close:()=>pool.end()};
}
