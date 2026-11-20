import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import baseline from './seed-days.json' with {type:'json'};

import {addDays, capeToday, DAY, isDay, labels, nightsBetween, stayProblem} from '../public/stay.js';

const defaultPricing = {base:120000, seasons:[]};
const cookieName='__Host-bbh_owner';
const maxAgeSeconds=8*60*60;
const calendarKey='availability';
const readJSON={type:'json',consistency:'strong'};

function json(body,status=200,headers={}){
  return Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}
function editValid({start,end,state,revision}){
  return validRange(start,end) && typeof state === 'string' && Object.hasOwn(labels,state) && Number.isSafeInteger(revision) && revision>=0;
}
function cookie(token,maxAge){
  return cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;
}
function sessionKey(token,password){
  return 'sessions/'+createHmac('sha256',password).update(token).digest('hex');
}
async function session(request,store,password){
  if(!password)return null;
  const token=(request.headers.get('cookie')||'').split(/;\s*/).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const key=sessionKey(token,password);
  const record=await store.get(key,readJSON);
  if(record&&record.expires>Date.now())return key;
  if(record)await store.delete(key);
  return null;
}
function condition(record){
  return record?{onlyIfMatch:record.etag}:{onlyIfNew:true};
}
async function reserveAttempt(store,key){
  for(let attempt=0;attempt<4;attempt++){
    const record=await store.getWithMetadata(key,readJSON);
    const previous=record?.data;
    const now=Date.now();
    const current=previous?.expires>now?previous:{count:0,expires:now+15*60*1000};
    if(current.count>=10)return false;
    const result=await store.setJSON(key,{count:current.count+1,expires:current.expires},condition(record));
    if(result.modified)return true;
  }
  return false;
}
async function login(body,store,password,ip){
  if(!password)return json({error:'Owner access is awaiting configuration.'},503);
  if(typeof body.password!=='string'||!body.password||body.password.length>256)return json({error:'Enter the owner password.'},400);
  const attemptKey='attempts/'+createHmac('sha256',password).update(ip||'shared').digest('hex');
  if(!await reserveAttempt(store,attemptKey))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
  const hash=text=>createHash('sha256').update(text).digest();
  if(!timingSafeEqual(hash(body.password),hash(password)))return json({error:'That password did not match. Please try again.'},401);
  const token=randomBytes(32).toString('hex');
  await store.setJSON(sessionKey(token,password),{expires:Date.now()+maxAgeSeconds*1000});
  await store.delete(attemptKey);
  return json({ok:true},200,{'set-cookie':cookie(token,maxAgeSeconds)});
}
function validRange(start,end) {
  const year = Number(capeToday().slice(0,4));
  return isDay(start) && isDay(end) && start <= end && start >= year+'-01-01' &&
    end <= (year+4)+'-12-31' && Date.parse(end)-Date.parse(start) <= 365*DAY;
}

function publicDays(current) {
  const days = {...baseline,...current?.overrides};
  for (const stay of current?.requests ?? []) {
    if (stay.status !== 'approved') continue;
    for (const night of nightsBetween(stay.start, stay.end)) {
      days[night] = night === stay.start && days[night] !== 'check-in' ? 'check-out' : 'booked';
    }
  }
  return days;
}

function quote(start,end,current) {
  const problem = stayProblem(start,end,publicDays(current));
  if (problem) return {error:problem};
  const pricing = current?.pricing ?? defaultPricing;
  const lines = [];
  let total = 0;
  for (const night of nightsBetween(start,end)) {
    const season = pricing.seasons.find(item => item.start <= night && night <= item.end);
    const rate = season?.rate ?? pricing.base;
    const last = lines.at(-1);
    if (last?.rate === rate && last.name === (season?.name ?? 'Standard rate')) {
      last.nights += 1;
    } else {
      lines.push({name:season?.name ?? 'Standard rate', rate, nights:1});
    }
    total += rate;
  }
  return {start,end,lines,total,nights:(Date.parse(end)-Date.parse(start))/DAY};
}

function isRate(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100000000;
}
function pricingValid(pricing) {
  if (!pricing || !isRate(pricing.base) || !Array.isArray(pricing.seasons) || pricing.seasons.length > 100) return false;
  const seasons = pricing.seasons;
  if (!seasons.every(item => item && typeof item.name === 'string' && item.name.trim() && item.name.length <= 60 &&
    isRate(item.rate) && validRange(item.start,item.end))) return false;
  return seasons.every((item,index) => !seasons.slice(0,index).some(other => item.start <= other.end && item.end >= other.start));
}

function isRequestId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function cleanContact(body) {
  const field = (key,max) => typeof body[key] === 'string' && body[key].trim().length <= max ? body[key].trim() : null;
  const name = field('name',120);
  const email = field('email',254);
  const phone = field('phone',40);
  const message = field('message',1000);
  const {guests,id} = body;
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone === null || message === null ||
      !Number.isInteger(guests) || guests < 1 || guests > 27 || !isRequestId(id)) return null;
  return {id,name,email,phone,message,guests};
}

const conflict = () => json({error:'The calendar changed. Review the latest information and try again.'},409);

async function writeCalendar(store,record,current) {
  return (await store.setJSON(calendarKey,current,condition(record))).modified;
}

async function saveOwnerChange(path,body,store) {
  const record = await store.getWithMetadata(calendarKey,readJSON);
  const current = record?.data ?? {revision:0,overrides:{}};
  if (body.revision !== current.revision) return conflict();
  const updated = {...current,revision:current.revision+1};
  if (path === '/api/calendar') {
    if (!editValid(body)) return json({error:'Choose a valid date range of up to one year and a status.'},400);
    updated.overrides = {...current.overrides};
    for (const day of nightsBetween(body.start,addDays(body.end,1))) updated.overrides[day] = body.state;
  } else if (path === '/api/pricing') {
    if (!pricingValid(body.pricing)) return json({error:'Enter positive nightly rates and valid season dates that do not overlap.'},400);
    updated.pricing = {
      base:body.pricing.base,
      seasons:body.pricing.seasons.map(({name,start,end,rate}) => ({name:name.trim(),start,end,rate}))
        .sort((a,b) => a.start.localeCompare(b.start))
    };
  } else {
    const stays = current.requests ?? [];
    const selected = stays.find(stay => stay.id === body.id);
    const decision = body.decision;
    const permitted = selected?.status === 'pending' ? ['approved','declined'] : selected?.status === 'approved' ? ['cancelled'] : [];
    if (!permitted.includes(decision)) return json({error:'This request can no longer be updated that way.'},409);
    if (decision === 'approved') {
      const problem = stayProblem(selected.start,selected.end,publicDays(current));
      if (problem) return json({error:problem},409);
    }
    updated.requests = stays.map(stay => stay.id === body.id ? {...stay,status:decision,decidedAt:new Date().toISOString()} : stay);
  }
  return await writeCalendar(store,record,updated) ? json({revision:updated.revision}) : conflict();
}

async function createRequest(body,store,ip) {
  const contact = cleanContact(body);
  if (!contact || !Number.isSafeInteger(body.estimatedTotal)) {
    return json({error:'Enter valid dates, a guest count, your name, and an email address.'},400);
  }
  const attemptKey = 'request-attempts/'+createHash('sha256').update(ip || 'shared').digest('hex');
  let attemptReserved = false;
  for (let attempt=0; attempt<3; attempt++) {
    const record = await store.getWithMetadata(calendarKey,readJSON);
    const current = record?.data ?? {revision:0,overrides:{}};
    const requests = current.requests ?? [];
    const existing = requests.find(stay => stay.id === contact.id);
    if (existing) {
      if (existing.email !== contact.email || existing.start !== body.start || existing.end !== body.end) return conflict();
      return json({reference:existing.id});
    }
    const estimate = quote(body.start,body.end,current);
    if (estimate.error) return json(estimate,409);
    if (estimate.total !== body.estimatedTotal) {
      return json({error:'Your estimate changed. Review the updated total and submit again.'},409);
    }
    if (!attemptReserved) {
      if (!await reserveAttempt(store,attemptKey)) return json({error:'Too many requests. Try again in 15 minutes.'},429);
      attemptReserved = true;
    }
    const stay = {...contact, ...estimate, status:'pending', createdAt:new Date().toISOString()};
    const next = {...current,revision:current.revision+1,requests:[stay,...requests]};
    if (await writeCalendar(store,record,next)) return json({reference:stay.id},201);
  }
  return conflict();
}

export async function handleCalendar(request,store,password,ip) {
  const url = new URL(request.url);
  const {pathname,origin} = url;
  if (request.method === 'GET' && pathname === '/api/calendar') {
    const data = await store.get(calendarKey,readJSON);
    return json({revision:data?.revision ?? 0,days:publicDays(data)});
  }
  if (request.method === 'GET' && pathname === '/api/estimate') {
    const data = await store.get(calendarKey,readJSON);
    const estimate = quote(url.searchParams.get('start'),url.searchParams.get('end'),data);
    return estimate.error ? json(estimate,400) : json(estimate);
  }
  if (request.method === 'GET' && pathname === '/api/session') {
    return json({authenticated:Boolean(await session(request,store,password))});
  }
  if (request.method === 'GET' && pathname === '/api/owner') {
    if (!await session(request,store,password)) return json({error:'Please sign in to manage stays.'},401);
    const data = await store.get(calendarKey,readJSON);
    return json({revision:data?.revision ?? 0,days:publicDays(data),pricing:data?.pricing ?? defaultPricing,requests:data?.requests ?? []});
  }
  if (request.method !== 'POST') return json({error:'Method not supported.'},405);
  if (request.headers.get('origin') !== origin || !request.headers.get('content-type')?.startsWith('application/json')) {
    return json({error:'Please reopen this page and try again.'},403);
  }
  const raw = await request.text();
  if (raw.length > 24000) return json({error:'Request too large.'},413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({error:'Invalid request.'},400); }
  if (!body || typeof body !== 'object') return json({error:'Invalid request.'},400);
  if (pathname === '/api/login') return login(body,store,password,ip);
  if (pathname === '/api/request') return createRequest(body,store,ip);
  const key = await session(request,store,password);
  if (!key) return json({error:'Please sign in to manage stays.'},401);
  if (pathname === '/api/logout') {
    await store.delete(key);
    return json({ok:true},200,{'set-cookie':cookie('',0)});
  }
  if (['/api/calendar','/api/pricing','/api/decision'].includes(pathname)) return saveOwnerChange(pathname,body,store);
  return json({error:'Page not found.'},404);
}
