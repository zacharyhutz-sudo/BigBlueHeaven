const $=id=>document.getElementById(id);
const isOwner=Boolean($('manage'));
const compact=matchMedia('(max-width:720px)');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const first=new Date(today.slice(0,7)+'-01T12:00:00Z');
const year=first.getUTCFullYear();
const lastMonth=(year+4-year)*12+11-first.getUTCMonth();
const labels={available:'Available',booked:'Unavailable',turn:'Arrival or departure','check-in':'Arrival only','check-out':'Departure only',unknown:'Unconfirmed'};
let offset=0, revision=null, days={}, authenticated=false, draftRevision=null;
let latest=0;
function note(id,message,error=false){const el=$(id);el.textContent=message;el.classList.toggle('error',error);}
function elem(tag,cls,text){const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
const monthName=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
function draw(){
  const count=compact.matches?1:2;
  offset=Math.max(0,Math.min(lastMonth-count+1,offset));
  $('prev-month').disabled=offset===0;
  $('next-month').disabled=offset>=lastMonth-count+1;
  const holder=$('months');holder.replaceChildren();
  const titles=[];
  for(let i=0;i<count;i++){
    const start=new Date(Date.UTC(year,first.getUTCMonth()+offset+i,1,12));
    const title=monthName.format(start);titles.push(title);
    const section=elem('section','month');section.append(elem('h3','',title));
    const grid=elem('div','dates');section.append(grid);
    for(const wd of ['Su','Mo','Tu','We','Th','Fr','Sa'])grid.append(elem('span','weekday',wd));
    for(let d=0;d<start.getUTCDay();d++)grid.append(elem('span','empty'));
    const dt=new Date(start);
    while(dt.getUTCMonth()===start.getUTCMonth()){
      const key=dt.toISOString().slice(0,10);
      const past=key<today;
      const state=(days[key] in labels)?days[key]:'unknown';
      const status=past?'Past date':labels[state];
      const cell=elem('span','day '+(past?'past':state)+(key===today?' today':''));
      cell.textContent=dt.getUTCDate();cell.title=key+' · '+status;
      cell.append(elem('span','sr',', '+status));grid.append(cell);
      dt.setUTCDate(dt.getUTCDate()+1);
    }
    holder.append(section);
  }
  $('view-title').setAttribute('aria-label','Availability calendar for '+titles.join(' and '));
}
async function request(path,data){
  const options=data===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),cache:'no-store'};
  const response=await fetch(path,options);
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(result.error||'Unable to connect. Please try again.'),{status:response.status});
  return result;
}
async function refresh(){
  const id=++latest;
  try{
    const next=await request('/api/calendar');
    if(id!==latest)return;
    days=next.days;revision=next.revision;
    draw();note('cal-msg','');
  }catch{
    if(id!==latest)return;
    days={};revision=null;draw();note('cal-msg','Availability could not be loaded. Please refresh or check with Cape & Coast.',true);
  }
}
function ownerMode(ok){
  authenticated=ok;$('login').hidden=ok;$('manage').hidden=!ok;
  if(!ok){$('password').value='';draftRevision=null;}
}
async function startOwner(){
  try{
    const result=await request('/api/session');
    ownerMode(result.authenticated);note('auth-msg','');
    if(authenticated)await refresh();
  }catch{ownerMode(false);note('auth-msg','Could not check your session. Please try signing in.',true);}
}
function navigate(n){offset+=n;draw();}
$('prev-month').onclick=()=>navigate(-1);$('next-month').onclick=()=>navigate(1);
compact.addEventListener('change',draw);
if(isOwner){
  const form=$('edit'), start=form.elements.start,end=form.elements.end;
  start.min=today;start.max=end.max=(year+4)+'-12-31';end.min=today;
  start.addEventListener('change',()=>{end.min=start.value||today;if(!end.value||end.value<start.value)end.value=start.value;});
  form.addEventListener('input',()=>{if(draftRevision===null)draftRevision=revision;});
  $('login').onsubmit=async e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;
    try{await request('/api/login',{password:$('password').value});$('password').value='';ownerMode(true);note('auth-msg','');await refresh();}
    catch(err){note('auth-msg',err.message,true);}
    finally{btn.disabled=false;}
  };
  $('logout').onclick=async()=>{
    try{await request('/api/logout',{});ownerMode(false);note('auth-msg','Signed out.');}
    catch(err){if(err.status===401)ownerMode(false);note('auth-msg',err.message,true);}
  };
  form.onsubmit=async e=>{
    e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;
    try{
      if(revision===null)throw new Error('Reload the calendar before saving dates.');
      const data={start:start.value,end:end.value,state:form.elements.state.value,revision:draftRevision??revision};
      await request('/api/calendar',data);
      draftRevision=null;
      const chosen=new Date(data.start+'T12:00:00Z');
      offset=(chosen.getUTCFullYear()-year)*12+chosen.getUTCMonth()-first.getUTCMonth();
      await refresh();note('edit-msg','Saved '+data.start+' through '+data.end+' as '+labels[data.state]+'.');
    }catch(err){
      if(err.status===401){ownerMode(false);note('auth-msg',err.message,true);}
      else{note('edit-msg',err.message,true);if(err.status===409){draftRevision=null;await refresh();}}
    }finally{btn.disabled=false;}
  };
  startOwner();
}else{refresh();}
function refreshVisible(){if(!document.hidden&&(!isOwner||authenticated))refresh();}
document.addEventListener('visibilitychange',refreshVisible);
window.addEventListener('focus',refreshVisible);
setInterval(refreshVisible,30000);
