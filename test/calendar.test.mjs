import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getStore} from '@netlify/blobs';
import {BlobsServer} from '@netlify/blobs/server';
import {handleCalendar} from '../server/calendar.mjs';
import {addDays,capeToday} from '../public/stay.js';

async function fixture(t) {
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
  return {call,password,useCookie(value) { cookie=value; }};
}

test('an owner can save and reopen dates across requests; anonymous visitors see the update',async t=>{
  const {call,password,useCookie} = await fixture(t);
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
  const ownerCookie=login.headers.get('set-cookie').split(';')[0];
  useCookie(ownerCookie);
  assert.equal((await(await call('/api/session')).json()).authenticated,true);
  assert.equal((await call('/api/calendar',{...edit,start:'2026-02-31'})).status,400);
  assert.equal((await call('/api/calendar',edit)).status,200);
  assert.equal((await call('/api/calendar',{...edit,state:'available'})).status,409);
  useCookie('');
  const saved=await(await call('/api/calendar')).json();
  assert.equal(saved.days[start],'booked');assert.equal(saved.days[end],'booked');
  useCookie(ownerCookie);
  assert.equal((await call('/api/calendar',{...edit,state:'available',revision:saved.revision})).status,200);
  assert.equal((await(await call('/api/calendar')).json()).days[end],'available');
  assert.equal((await call('/api/logout',{})).status,200);
  assert.equal((await call('/api/calendar',edit)).status,401);
  for(let i=0;i<10;i++)assert.equal((await call('/api/login',{password:'wrong'})).status,401);
  assert.equal((await call('/api/login',{password:'wrong'})).status,429);
});


test('requests preserve quoted rates and block nights only after a successful approval',async t=>{
  const {call,password,useCookie} = await fixture(t);
  const checkIn = addDays(capeToday(),25);
  const lastNight = addDays(checkIn,2);
  const checkout = addDays(lastNight,1);
  const added = addDays(checkout,1);
  const estimatePath = '/api/estimate?'+new URLSearchParams({start:checkIn,end:checkout});
  const owner = async () => (await call('/api/owner')).json();

  assert.equal((await call('/api/owner')).status,401);
  const login = await call('/api/login',{password});
  const admin = login.headers.get('set-cookie').split(';')[0];
  useCookie(admin);
  const original = await owner();
  assert.equal(original.pricing.base,120000);
  const open = await call('/api/calendar',{start:addDays(checkIn,-1),end:added,state:'available',revision:0});
  assert.equal(open.status,200);
  const launch = await (await call(estimatePath)).json();
  assert.equal(launch.total,360000);

  const season = {name:'Holiday',start:addDays(checkIn,1),end:lastNight,rate:180000};
  const updated = await call('/api/pricing',{revision:1,pricing:{base:120000,seasons:[season]}});
  assert.equal(updated.status,200);
  assert.equal((await call('/api/pricing',{revision:2,pricing:{base:120000,seasons:[season,{...season,name:'Overlap'}]}})).status,400);
  const estimate = await (await call(estimatePath)).json();
  assert.equal(estimate.total,480000);
  assert.equal(estimate.nights,3);
  assert.deepEqual(estimate.lines,[{name:'Standard rate',rate:120000,nights:1},{name:'Holiday',rate:180000,nights:2}]);

  useCookie('');
  const guest = {
    id:crypto.randomUUID(), start:checkIn, end:checkout, name:'Sample Guest', email:'guest@example.com',
    phone:'', message:'Sample request', guests:8, estimatedTotal:launch.total
  };
  assert.equal((await call('/api/request',guest)).status,409);
  guest.estimatedTotal = estimate.total;
  assert.equal((await call('/api/request',guest)).status,201);
  assert.equal((await call('/api/request',guest)).status,200);
  const overlappingGuest = {...guest,id:crypto.randomUUID(),email:'other@example.com'};
  assert.equal((await call('/api/request',overlappingGuest)).status,201);
  const openDates = await (await call('/api/calendar')).json();
  assert.equal(openDates.days[checkIn],'available');
  assert.deepEqual(Object.keys(openDates).sort(),['days','revision']);
  assert.equal((await call('/api/decision',{id:guest.id,decision:'approved',revision:openDates.revision})).status,401);

  useCookie(admin);
  const beforeApproval = await owner();
  assert.equal(beforeApproval.requests.length,2);
  assert.equal(beforeApproval.requests.find(row => row.id===guest.id).email,guest.email);
  const approve = id => call('/api/decision',{id,decision:'approved',revision:beforeApproval.revision});
  assert.equal((await approve(guest.id)).status,200);
  assert.equal((await approve(overlappingGuest.id)).status,409);
  const closed = await owner();
  assert.equal(closed.days[checkIn],'check-out');
  assert.equal(closed.days[lastNight],'booked');
  assert.equal(closed.days[checkout],'available');
  assert.equal((await call('/api/decision',{id:overlappingGuest.id,decision:'approved',revision:closed.revision})).status,409);
  assert.equal((await call(estimatePath)).status,400);
  const adjoining = '/api/estimate?'+new URLSearchParams({start:checkout,end:added});
  assert.equal((await call(adjoining)).status,200);
  const cancel = await call('/api/decision',{id:guest.id,decision:'cancelled',revision:closed.revision});
  assert.equal(cancel.status,200);
  assert.equal((await call(estimatePath)).status,200);
});
