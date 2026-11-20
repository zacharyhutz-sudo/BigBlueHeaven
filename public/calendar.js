import {capeToday, labels} from './stay.js';

export const $ = id => document.getElementById(id);
export const today = capeToday();
export const dateLimit = (Number(today.slice(0,4))+4)+'-12-31';

export function element(tag, className='', text) {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

export function note(id,message,error=false) {
  const status = $(id);
  status.textContent = message;
  status.classList.toggle('error',error);
}

export async function request(path,data) {
  const options = data === undefined ? {} : {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data)
  };
  const response = await fetch(path,{...options,cache:'no-store'});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Unable to connect. Please try again.'),{status:response.status});
  return result;
}

const date = value => new Date(value+'T12:00:00Z');
const first = date(today.slice(0,7)+'-01');
const year = first.getUTCFullYear();
const lastOffset = 59-first.getUTCMonth();
const monthName = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
export const readableDay = value => new Intl.DateTimeFormat('en-US',{
  month:'short',day:'numeric',year:'numeric',timeZone:'UTC'
}).format(date(value));

export function createCalendar({select, choices, selection} = {}) {
  const compact = matchMedia(select ? '(max-width:1180px)' : '(max-width:720px)');
  const holder = $('months');
  let offset = 0;
  let days = {};
  function draw() {
    const count = compact.matches ? 1 : 2;
    offset = Math.max(0,Math.min(lastOffset-count+1,offset));
    $('prev-month').disabled = offset === 0;
    $('next-month').disabled = offset >= lastOffset-count+1;
    const focusedDay = holder.contains(document.activeElement) ? document.activeElement.dataset.day : undefined;
    const sections = [];
    const titles = [];
    for (let i=0; i<count; i++) {
      const start = new Date(Date.UTC(year,first.getUTCMonth()+offset+i,1,12));
      const title = monthName.format(start);
      titles.push(title);
      const section = element('section','month');
      const grid = element('div','dates');
      section.append(element('h3','',title),grid);
      for (const wd of ['Su','Mo','Tu','We','Th','Fr','Sa']) grid.append(element('span','weekday',wd));
      for (let d=0; d<start.getUTCDay(); d++) grid.append(element('span','empty'));
      for (const dt=new Date(start); dt.getUTCMonth()===start.getUTCMonth(); dt.setUTCDate(dt.getUTCDate()+1)) {
        const key = dt.toISOString().slice(0,10);
        const past = key < today;
        const state = days[key] ?? 'unknown';
        const status = past ? 'Past date' : labels[state];
        const enabled = !past && select && choices(key,days);
        const cell = element(enabled ? 'button' : 'span','day '+(past?'past':state),dt.getUTCDate());
        const text = readableDay(key)+' · '+status;
        cell.title = text;
        cell.dataset.day = key;
        if (key === today) cell.classList.add('today');
        const selected = selection?.(key);
        if (selected) cell.classList.add(selected);
        if (enabled) {
          cell.type = 'button';
          cell.setAttribute('aria-label',text);
          cell.setAttribute('aria-pressed',String(Boolean(selected)));
          cell.addEventListener('click',() => select(key));
        } else {
          cell.append(element('span','sr',', '+status));
        }
        grid.append(cell);
      }
      sections.push(section);
    }
    holder.replaceChildren(...sections);
    if (focusedDay) {
      const same = holder.querySelector('button[data-day="'+focusedDay+'"]');
      (same ?? holder.querySelector('button') ?? $('next-month')).focus({preventScroll:true});
    }
    $('view-title').setAttribute('aria-label','Availability calendar for '+titles.join(' and '));
  }
  $('prev-month').onclick = () => { offset--; draw(); };
  $('next-month').onclick = () => { offset++; draw(); };
  compact.addEventListener('change', draw);
  return {
    draw,
    setDays(next) { days = next; draw(); },
    showMonth(day) { const dt=date(day); offset=(dt.getUTCFullYear()-year)*12+dt.getUTCMonth()-first.getUTCMonth(); draw(); }
  };
}
