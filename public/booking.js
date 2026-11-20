import {$,createCalendar,dateLimit,element,note,readableDay,request,today} from './calendar.js';
import {addDays,canArrive,canDepart,formatPrice,stayProblem} from './stay.js';

const form = $('booking');
const {start,end} = form.elements;
const submit = form.querySelector('button[type=submit]');
const estimateBox = $('estimate');
let days = {};
let revision;
let estimate;
let quoteId = 0;
let requestId = crypto.randomUUID();
let calendarReadId = 0;
let submitting = false;
let awaitingCheckout = false;
start.min = today;
start.max = dateLimit;
end.min = addDays(today,1);
end.max = dateLimit;

const calendar = createCalendar({
  select(day) {
    if (awaitingCheckout) {
      end.value = day;
      awaitingCheckout = false;
    } else {
      start.value = day;
      end.value = '';
      awaitingCheckout = true;
    }
    updateDates();
  },
  choices(day, availability) {
    return awaitingCheckout ?
      day > start.value && canDepart(availability[day]) && !stayProblem(start.value,day,availability,today) :
      canArrive(availability[day]);
  },
  selection(day) {
    if (day === start.value || day === end.value) return 'range-edge';
    if (day > start.value && day < end.value) return 'range-inside';
  }
});

function estimateText(text) {
  estimateBox.replaceChildren(element('p','',text));
}

async function updateEstimate() {
  const id = ++quoteId;
  estimate = null;
  submit.disabled = true;
  if (!start.value || !end.value) {
    estimateText('Choose dates to see your lodging estimate.');
    return;
  }
  const expected = stayProblem(start.value,end.value,days,today);
  if (expected) {
    estimateText(expected);
    return;
  }
  estimateText('Calculating your estimate…');
  try {
    const params = new URLSearchParams({start:start.value,end:end.value});
    const result = await request('/api/estimate?'+params);
    if (id !== quoteId) return;
    estimate = result;
    const breakdown = element('dl','estimate-summary');
    for (const line of estimate.lines) {
      breakdown.append(element('dt','',line.name+' · '+line.nights+' × '+formatPrice(line.rate)),
        element('dd','',formatPrice(line.nights*line.rate)));
    }
    breakdown.append(element('dt','estimate-total','Estimated lodging'),element('dd','estimate-total',formatPrice(estimate.total)));
    estimateBox.replaceChildren(breakdown,element('p','estimate-note','The owner will confirm your total before booking.'));
    submit.disabled = submitting;
  } catch (error) {
    if (id === quoteId) estimateText(error.message);
  }
}

function renderSelection() {
  calendar.draw();
  note('calendar-prompt',awaitingCheckout ? 'Choose your check-out date.' :
    end.value ? 'Dates selected. Send your request when you’re ready.' : 'Choose your check-in date.');
  $('clear-dates').hidden = !start.value && !end.value;
}

function updateDates() {
  end.min = addDays(start.value || today,1);
  requestId = crypto.randomUUID();
  note('booking-msg','');
  renderSelection();
  updateEstimate();
}

$('clear-dates').onclick = () => {
  if (submitting) return;
  start.value = '';
  end.value = '';
  awaitingCheckout = false;
  updateDates();
  start.focus();
};
start.addEventListener('change', () => {
  if (end.value <= start.value) end.value = '';
  awaitingCheckout = Boolean(start.value && !end.value);
  if (start.value) calendar.showMonth(start.value);
  updateDates();
});
end.addEventListener('change', () => {
  awaitingCheckout = Boolean(start.value && !end.value);
  updateDates();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!estimate || submitting) return;
  const fields = Object.fromEntries(new FormData(form));
  submitting = true;
  submit.disabled = true;
  note('booking-msg','Sending your stay request…');
  try {
    const result = await request('/api/request',{
      ...fields, guests:Number(fields.guests), id:requestId, estimatedTotal:estimate.total
    });
    $('booking-confirmation').textContent = readableDay(fields.start)+' to '+readableDay(fields.end)+
      ' · Reference '+result.reference.slice(0,8).toUpperCase();
    form.hidden = true;
    $('booking-success').hidden = false;
    $('booking-success').focus();
  } catch (error) {
    note('booking-msg',error.message,true);
    if (error.status === 409) { await refresh(); await updateEstimate(); }
  } finally {
    submitting = false;
    submit.disabled = !estimate;
  }
});
$('new-request').onclick = () => {
  form.reset();
  form.hidden = false;
  $('booking-success').hidden = true;
  awaitingCheckout = false;
  updateDates();
  start.focus();
};

async function refresh() {
  const id = ++calendarReadId;
  try {
    const next = await request('/api/calendar');
    if (id !== calendarReadId || next.revision === revision) return;
    revision = next.revision;
    days = next.days;
    calendar.setDays(days);
    note('cal-msg','');
    await updateEstimate();
  } catch {
    if (id !== calendarReadId) return;
    revision = undefined;
    days = {};
    calendar.setDays(days);
    note('cal-msg','Availability could not be loaded. Please try again shortly.',true);
    await updateEstimate();
  }
}
function refreshVisible() { if (!document.hidden && !submitting) refresh(); }
window.addEventListener('focus',refreshVisible);
document.addEventListener('visibilitychange',refreshVisible);
setInterval(refreshVisible,30000);
refresh();
