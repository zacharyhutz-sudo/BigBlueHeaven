export const DAY = 86400000;
export const labels = {
  available:'Available', booked:'Unavailable', turn:'Arrival or departure',
  'check-in':'Arrival only', 'check-out':'Departure only', unknown:'Unconfirmed'
};
export const capeToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
}).format(new Date());

export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === value;
}

export function addDays(day, count) {
  return new Date(Date.parse(day+'T12:00:00Z') + count*DAY).toISOString().slice(0,10);
}

export function* nightsBetween(start, end) {
  for (let day = start; day < end; day = addDays(day,1)) yield day;
}

export const canArrive = state => ['available','turn','check-in'].includes(state);
export const canDepart = state => ['available','turn','check-out'].includes(state);
export const formatPrice = cents => new Intl.NumberFormat('en-US', {
  style:'currency', currency:'USD', maximumFractionDigits:cents%100 ? 2 : 0
}).format(cents/100);

export function stayProblem(start, end, days, today = capeToday()) {
  if (!isDay(start) || !isDay(end) || end <= start || start < today) {
    return 'Choose a check-out date after check-in.';
  }
  if (Date.parse(end)-Date.parse(start) > 365*DAY) return 'Choose a stay of up to 365 nights.';
  if (!canArrive(days[start])) return 'Choose an available check-in date.';
  for (const night of nightsBetween(start,end)) {
    if (!canArrive(days[night])) return 'This stay includes unavailable nights. Choose different dates.';
  }
  if (!canDepart(days[end])) return 'Choose an available check-out date.';
  return '';
}
