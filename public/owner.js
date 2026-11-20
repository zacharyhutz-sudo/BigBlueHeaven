import {$,createCalendar,dateLimit,element,note,readableDay,request,today} from './calendar.js';
import {formatPrice,labels} from './stay.js';

const edit = $('edit');
const pricing = $('pricing');
const calendar = createCalendar();
let dashboard;
let readId = 0;
let authenticated = false;
let pricingDirty = false;
let rateRevision;
let editRevision;
let busy = false;

for (const input of [edit.elements.start,edit.elements.end]) {
  input.min = today;
  input.max = dateLimit;
}
edit.elements.start.addEventListener('change', () => {
  const first = edit.elements.start.value;
  edit.elements.end.min = first || today;
  if (first && edit.elements.end.value < first) edit.elements.end.value = first;
});
function ownerMode(active) {
  authenticated = active;
  $('login').hidden = active;
  $('manage').hidden = !active;
  if (!active) {
    readId++;
    dashboard = undefined;
    pricingDirty = false;
    editRevision = undefined;
    $('request-list').replaceChildren();
    $('seasons').replaceChildren();
  }
}

function addSeason(data={}) {
  const row = element('div','season-row');
  const fields = [
    ['Season name','name','text',data.name],
    ['First night','start','date',data.start],
    ['Last night','end','date',data.end],
    ['Rate per night ($)','rate','number',data.rate !== undefined ? data.rate/100 : '']
  ];
  for (const [label,name,type,value] of fields) {
    const wrapper = element('label','',label);
    const input = element('input');
    input.name = name;
    input.type = type;
    input.value = value ?? '';
    input.required = true;
    if (type === 'date') input.max = dateLimit;
    if (type === 'text') input.maxLength = 60;
    if (type === 'number') { input.min = '.01'; input.max = '1000000'; input.step = '.01'; }
    wrapper.append(input);
    row.append(wrapper);
  }
  const remove = element('button','under','Remove');
  remove.type = 'button';
  remove.setAttribute('aria-label','Remove '+(data.name || 'season'));
  remove.onclick = () => { markPricingDirty(); row.remove(); };
  row.append(remove);
  $('seasons').append(row);
}

function markPricingDirty() {
  if (!pricingDirty) rateRevision = dashboard?.revision;
  pricingDirty = true;
}
$('add-season').onclick = () => {
  markPricingDirty();
  addSeason();
  $('seasons').lastElementChild.querySelector('input').focus();
};
pricing.addEventListener('input',markPricingDirty);
edit.addEventListener('input',() => { editRevision ??= dashboard?.revision; });

function renderRequests(stays) {
  const pending = [];
  const history = [];
  for (const stay of stays) {
    const card = element('article','request-card');
    const header = element('div','request-head');
    header.append(element('h3','',stay.name),element('span','request-status '+stay.status,stay.status));
    const dates = readableDay(stay.start)+' to '+readableDay(stay.end);
    const contact = element('p','request-contact');
    const email = element('a','under',stay.email);
    email.href = 'mailto:'+encodeURIComponent(stay.email).replace('%40','@')+'?subject='+encodeURIComponent('Big Blue Heaven stay request · '+dates);
    contact.append(email);
    if (stay.phone) contact.append(document.createTextNode(' · '+stay.phone));
    card.append(header,
      element('p','request-dates',dates+' · '+stay.nights+' '+(stay.nights===1?'night':'nights')+' · '+stay.guests+' '+(stay.guests===1?'guest':'guests')),
      element('p','',formatPrice(stay.total)+' estimated lodging · Ref '+stay.id.slice(0,8).toUpperCase()),contact);
    if (stay.message) card.append(element('p','request-message',stay.message));
    const actions = element('div','owner-actions');
    const decisions = stay.status==='pending' ? [['Approve','approved'],['Decline','declined']] :
      stay.status==='approved' ? [['Cancel reservation','cancelled']] : [];
    for (const [label,decision] of decisions) {
      const button = element('button',decision==='approved'?'button':'under',label);
      button.type = 'button';
      button.onclick = () => {
        if (decision==='cancelled' && !window.confirm('Cancel this reservation and release its nights?')) return;
        save('/api/decision',{id:stay.id,decision,revision:dashboard?.revision},'request-msg','Request '+decision+'.');
      };
      actions.append(button);
    }
    if (actions.children.length) card.append(actions);
    (stay.status==='pending' ? pending : history).push(card);
  }
  const list = $('request-list');
  list.replaceChildren(...(pending.length ? pending : [element('p','panel-note','No pending requests.')]));
  if (history.length) {
    const details = element('details','request-history');
    details.open = list.dataset.historyOpen === 'true';
    details.addEventListener('toggle',() => { list.dataset.historyOpen = String(details.open); });
    details.append(element('summary','','Request history ('+history.length+')'),...history);
    list.append(details);
  }
}

async function refresh() {
  const id = ++readId;
  try {
    const next = await request('/api/owner');
    if (id !== readId) return;
    if (next.revision !== dashboard?.revision) {
      dashboard = next;
      calendar.setDays(next.days);
      renderRequests(next.requests);
    }
    if (!pricingDirty) {
      pricing.elements.base.value = next.pricing.base/100;
      $('seasons').replaceChildren();
      next.pricing.seasons.forEach(addSeason);
    }
    note('cal-msg','');
  } catch (error) {
    if (id !== readId) return;
    if (error.status === 401) { ownerMode(false); note('auth-msg',error.message,true); }
    else note('cal-msg',error.message,true);
  }
}

async function save(path,body,messageId,success,afterSave) {
  if (busy) return;
  busy = true;
  try {
    if (body.revision === undefined) throw new Error('Wait for the owner dashboard to load, then try again.');
    await request(path,body);
    afterSave?.();
    await refresh();
    note(messageId,success);
  } catch (error) {
    if (error.status === 401) { ownerMode(false); note('auth-msg',error.message,true); }
    else {
      note(messageId,error.message,true);
      if (error.status === 409) {
        await refresh();
        if (path==='/api/pricing') rateRevision=dashboard?.revision;
        if (path==='/api/calendar') editRevision=dashboard?.revision;
      }
    }
  } finally { busy = false; }
}

pricing.onsubmit = event => {
  event.preventDefault();
  const cents = value => Math.round(Number(value)*100);
  const seasons = [...$('seasons').children].map(row => {
    const fields = Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.name,input.value]));
    return {...fields,rate:cents(fields.rate)};
  });
  save('/api/pricing',{revision:rateRevision ?? dashboard?.revision,pricing:{base:cents(pricing.elements.base.value),seasons}},
    'pricing-msg','Nightly rates saved.',() => { pricingDirty=false; rateRevision=undefined; });
};

edit.onsubmit = event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(edit));
  save('/api/calendar',{...fields,revision:editRevision ?? dashboard?.revision},'edit-msg','Saved dates as '+labels[fields.state]+'.',() => {
    editRevision=undefined;
    calendar.showMonth(fields.start);
  });
};
$('login').onsubmit = async event => {
  event.preventDefault();
  const button = $('login').querySelector('button');
  button.disabled = true;
  try {
    await request('/api/login',{password:$('password').value});
    $('password').value = '';
    ownerMode(true);
    note('auth-msg','');
    await refresh();
  } catch (error) { note('auth-msg',error.message,true); }
  finally { button.disabled = false; }
};
$('logout').onclick = async () => {
  try { await request('/api/logout',{}); ownerMode(false); note('auth-msg','Signed out.'); }
  catch (error) {
    if (error.status===401) ownerMode(false);
    note('auth-msg',error.message,true);
  }
};
async function startOwner() {
  try {
    const session = await request('/api/session');
    ownerMode(session.authenticated);
    note('auth-msg','');
    if (session.authenticated) await refresh();
  } catch {
    ownerMode(false);
    note('auth-msg','Could not check your session. Please try signing in.',true);
  }
}

function refreshVisible() { if (authenticated && !document.hidden && !busy) refresh(); }
window.addEventListener('focus',refreshVisible);
document.addEventListener('visibilitychange',refreshVisible);
setInterval(refreshVisible,30000);
startOwner();
