import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import baseline from './seed-days.json' with {type:'json'};

const validStates=new Set(['available','booked','turn','check-in','check-out','unknown']);
const cookieName='__Host-bbh_owner';
const maxAgeSeconds=8*60*60;
const calendarKey='availability';
const readJSON={type:'json',consistency:'strong'};

function json(body,status=200,headers={}){
  return Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}
function isDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;
}
function editValid({start,end,state,revision}){
  const year=new Date().getUTCFullYear();
  return isDay(start)&&isDay(end)&&start<=end&&start>=year+'-01-01'&&end<=(year+4)+'-12-31'&&
    Date.parse(end)-Date.parse(start)<=365*86400000&&validStates.has(state)&&Number.isSafeInteger(revision)&&revision>=0;
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
async function reserveLoginAttempt(store,key){
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
  if(!await reserveLoginAttempt(store,attemptKey))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
  const hash=text=>createHash('sha256').update(text).digest();
  if(!timingSafeEqual(hash(body.password),hash(password)))return json({error:'That password did not match. Please try again.'},401);
  const token=randomBytes(32).toString('hex');
  await store.setJSON(sessionKey(token,password),{expires:Date.now()+maxAgeSeconds*1000});
  await store.delete(attemptKey);
  return json({ok:true},200,{'set-cookie':cookie(token,maxAgeSeconds)});
}
async function saveEdit(body,store){
  if(!editValid(body))return json({error:'Choose a valid date range of up to one year and an availability status.'},400);
  const record=await store.getWithMetadata(calendarKey,readJSON);
  const current=record?.data||{revision:0,overrides:{}};
  const collision=()=>json({error:'Another edit was saved. Review the refreshed calendar and save again.'},409);
  if(current.revision!==body.revision)return collision();
  const overrides={...current.overrides};
  const end=Date.parse(body.end+'T12:00:00Z');
  for(let day=Date.parse(body.start+'T12:00:00Z');day<=end;day+=86400000){
    overrides[new Date(day).toISOString().slice(0,10)]=body.state;
  }
  const revision=current.revision+1;
  const result=await store.setJSON(calendarKey,{overrides,revision},condition(record));
  return result.modified?json({revision}):collision();
}
export async function handleCalendar(request,store,password,ip){
  const {pathname,origin}=new URL(request.url);
  if(request.method==='GET'&&pathname==='/api/calendar'){
    const data=await store.get(calendarKey,readJSON);
    return json({revision:data?.revision??0,days:{...baseline,...data?.overrides}});
  }
  if(request.method==='GET'&&pathname==='/api/session')return json({authenticated:Boolean(await session(request,store,password))});
  if(request.method!=='POST')return json({error:'Method not supported.'},405);
  if(request.headers.get('origin')!==origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Please reopen this page and try again.'},403);
  const raw=await request.text();
  if(raw.length>2048)return json({error:'Request too large.'},413);
  let body;
  try{body=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
  if(!body||typeof body!=='object')return json({error:'Invalid request.'},400);
  if(pathname==='/api/login')return login(body,store,password,ip);
  const key=await session(request,store,password);
  if(!key)return json({error:'Please sign in to manage dates.'},401);
  if(pathname==='/api/logout'){
    await store.delete(key);
    return json({ok:true},200,{'set-cookie':cookie('',0)});
  }
  if(pathname==='/api/calendar')return saveEdit(body,store);
  return json({error:'Page not found.'},404);
}
