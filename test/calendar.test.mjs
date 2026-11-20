import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getStore} from '@netlify/blobs';
import {BlobsServer} from '@netlify/blobs/server';
import {handleCalendar} from '../server/calendar.mjs';

test('an owner can save and reopen dates across requests; anonymous visitors see the update',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'heaven-calendar-'));
  const server=new BlobsServer({directory,logger(){}});
  const {port}=await server.start();
  t.after(async()=>{await server.stop();await rm(directory,{recursive:true,force:true});});
  const storeOptions={name:'test-calendar',siteID:'test-site',apiURL:'http://127.0.0.1:'+port,token:'local-test',consistency:'strong'};
  const password=crypto.randomUUID(),origin='https://calendar.example';
  let cookie='';
  const call=(path,body,requestOrigin=origin)=>handleCalendar(new Request(origin+path,{
    method:body?'POST':'GET',headers:{origin:requestOrigin,cookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined
  }),getStore(storeOptions),password,'local-test');
  const initial=await(await call('/api/calendar')).json();
  assert.equal(Object.keys(initial.days).length,547);
  const date=new Date();date.setUTCDate(date.getUTCDate()+15);
  const start=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+2);
  const end=date.toISOString().slice(0,10),edit={start,end,state:'booked',revision:0};
  assert.equal((await call('/api/calendar',edit)).status,401);
  assert.equal((await call('/api/login',{password},'https://different.example')).status,403);
  assert.equal((await call('/api/login',{password:'wrong'})).status,401);
  const login=await call('/api/login',{password});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure/);
  cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await call('/api/session')).json()).authenticated,true);
  assert.equal((await call('/api/calendar',{...edit,start:'2026-02-31'})).status,400);
  assert.equal((await call('/api/calendar',edit)).status,200);
  assert.equal((await call('/api/calendar',{...edit,state:'available'})).status,409);
  const ownerCookie=cookie;cookie='';
  const saved=await(await call('/api/calendar')).json();
  assert.equal(saved.days[start],'booked');assert.equal(saved.days[end],'booked');
  cookie=ownerCookie;
  assert.equal((await call('/api/calendar',{...edit,state:'available',revision:saved.revision})).status,200);
  assert.equal((await(await call('/api/calendar')).json()).days[end],'available');
  assert.equal((await call('/api/logout',{})).status,200);
  assert.equal((await call('/api/calendar',edit)).status,401);
  for(let i=0;i<10;i++)assert.equal((await call('/api/login',{password:'wrong'})).status,401);
  assert.equal((await call('/api/login',{password:'wrong'})).status,429);
});
