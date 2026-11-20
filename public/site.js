const menu=document.querySelector('.menu-toggle'), nav=document.getElementById('nav');
function showMenu(open){menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.classList.toggle('open',open);}
menu.addEventListener('click',()=>showMenu(menu.getAttribute('aria-expanded')!=='true'));
nav.addEventListener('click',()=>showMenu(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){showMenu(false);menu.focus();}});
const modal=document.getElementById('lightbox');
if(modal){
  const items=[...document.querySelectorAll('.gallery-item')];
  let current=0;
  function draw(index){
    current=(index+items.length)%items.length;
    const img=items[current].querySelector('img');
    const large=document.getElementById('large-photo');
    large.src=img.src;large.alt=img.alt;
    document.getElementById('photo-title').textContent=img.alt;
    document.getElementById('photo-count').textContent=(current+1)+' / '+items.length;
  }
  function open(index){draw(index);modal.showModal();document.body.style.overflow='hidden';}
  items.forEach((btn,i)=>btn.addEventListener('click',()=>open(i)));
  document.querySelector('.gallery-open').addEventListener('click',()=>open(0));
  document.getElementById('close-photo').onclick=()=>modal.close();
  document.getElementById('prev-photo').onclick=()=>draw(current-1);
  document.getElementById('next-photo').onclick=()=>draw(current+1);
  modal.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')draw(current-1);if(e.key==='ArrowRight')draw(current+1);});
  modal.addEventListener('close',()=>{document.body.style.overflow='';});
  modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
}

function initScrollReveals() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

  const targets = [...document.querySelectorAll('[data-reveal]')];
  const threshold = window.innerHeight < 450 ? 0.12 : 0.28;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.intersectionRatio < threshold) continue;
      const target = entry.target;
      target.classList.replace('reveal-pending', 'reveal-shown');
      observer.unobserve(target);
    }
  }, { threshold });

  // Keep content already in view stable, including when the browser restores a scroll position.
  for (const target of targets) {
    const bounds = target.getBoundingClientRect();
    const revealAt = bounds.height * threshold;
    const visible = Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0);
    if (!bounds.height || bounds.top < 0 || visible >= revealAt || revealAt > window.innerHeight / 2) continue;
    target.classList.add('reveal-pending');
    observer.observe(target);
  }

  document.addEventListener('focusin', event => {
    const target = event.target.closest('.reveal-pending, .reveal-shown');
    if (!target) return;
    target.classList.remove('reveal-pending', 'reveal-shown');
    observer.unobserve(target);
  });

  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    for (const target of targets) target.classList.remove('reveal-pending', 'reveal-shown');
  });
}

initScrollReveals();
