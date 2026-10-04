import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAdminAuth} from '../server/admin-auth.js';

test('admin password setup, authenticated write access, logout and restart',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ye-auth-test-'));let auth=createAdminAuth(folder);
 const server=createServer((req,res)=>{if(req.url==='/write'){res.statusCode=auth.authorized(req)&&auth.sameOrigin(req)?200:401;res.end();return}auth.handle(req,res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const send=(path,password,cookie='',origin=base,username='TestAdministrator')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({username,password})});
 try{
  let response=await fetch(base+'/session');assert.deepEqual(await response.json(),{configured:false,authenticated:false,needsUsername:false});
  assert.equal((await send('/write','')).status,401);
  assert.equal((await send('/setup','too-short')).status,400);
  assert.equal((await send('/setup','test-only-long-password','','https://other.example')).status,403);
  response=await send('/setup','test-only-long-password');assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const stored=JSON.parse(await readFile(join(folder,'auth.json'),'utf8'));assert.equal(stored.password,undefined);assert.equal(stored.hash.includes('test-only-long-password'),false);
  response=await fetch(base+'/session',{headers:{Cookie:cookie}});assert.deepEqual(await response.json(),{configured:true,authenticated:true,needsUsername:false});
  assert.equal((await send('/write','',cookie)).status,200);
  assert.equal((await send('/write','',cookie,'https://other.example')).status,401);
  assert.equal((await send('/setup','different-password')).status,409);
  assert.equal((await send('/login','incorrect-password')).status,401);
  assert.equal((await send('/login','test-only-long-password','',base,'WrongAdministrator')).status,401);
  assert.equal((await send('/logout','',cookie)).status,200);assert.equal((await send('/write','',cookie)).status,401);
  auth=createAdminAuth(folder);assert.equal((await send('/write','',cookie)).status,401);
  response=await send('/login','test-only-long-password');assert.equal(response.status,200);
  const legacy={salt:stored.salt,hash:stored.hash};await writeFile(join(folder,'auth.json'),JSON.stringify(legacy));auth=createAdminAuth(folder);
  response=await fetch(base+'/session');assert.equal((await response.json()).needsUsername,true);
  assert.equal((await send('/login','incorrect-password','',base,'ChosenAdministrator')).status,401);
  assert.equal(JSON.parse(await readFile(join(folder,'auth.json'),'utf8')).username,undefined);
  response=await send('/login','test-only-long-password','',base,'ChosenAdministrator');assert.equal(response.status,200);
  const upgraded=JSON.parse(await readFile(join(folder,'auth.json'),'utf8'));assert.equal(upgraded.username,'ChosenAdministrator');assert.equal(upgraded.hash,stored.hash);
  assert.equal((await send('/login','test-only-long-password','',base,'TestAdministrator')).status,401);

 }finally{await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true,force:true})}
});
