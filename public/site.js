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
