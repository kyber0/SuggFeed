namespace SfMotion {
 factories.push(context=>{
  const records=new Map<HTMLElement,{sync():void;destroy():void}>();let paused=false;
  const remove=(root:ParentNode)=>{for(const [el,record] of records)if(root===el||(root instanceof Node&&root.contains(el))){record.destroy();records.delete(el);}};
  return {refresh(root){if(context.reduced.matches||editing()||!Element.prototype.animate||!('ResizeObserver' in window)||!('IntersectionObserver' in window))return;
   for(const el of elements(root,'[data-sf-marquee]')){
    if(records.has(el)||blocked(el))continue;
    const nodes=[...el.childNodes],track=document.createElement('div'),original=document.createElement('div'),viewport=document.createElement('div');
    track.dataset.sfMarqueeTrack='';track.dataset.sfGenerated='';original.dataset.sfMarqueeOriginal='';viewport.dataset.sfMarqueeViewport='';viewport.dataset.sfGenerated='';
    original.append(...nodes);track.append(original);viewport.append(track);
    const button=document.createElement('button');button.type='button';button.dataset.sfMarqueeToggle='';button.dataset.sfGenerated='';button.textContent='Pause animation';button.setAttribute('aria-pressed','false');el.append(viewport,button);el.setAttribute('data-sf-marquee-ready','');
    let animation:Animation|undefined,frame=0,userPaused=false,hovered=false,focused=false,onscreen=false;
    const sync=()=>{if(animation){if(paused||userPaused||hovered||focused||!onscreen)animation.pause();else animation.play();}};
    const measure=()=>{frame=0;animation?.cancel();track.querySelectorAll('[data-sf-marquee-clone]').forEach(clone=>clone.remove());const width=original.getBoundingClientRect().width;
     if(width<=0||!el.isConnected)return;const copies=Math.ceil(viewport.clientWidth/width)+1;
     // shortcut: tiny strips needing over 32 copies remain stationary; use meaningful-width content.
     if(copies>32)return;
     for(let i=1;i<Math.max(2,copies);i++){const clone=original.cloneNode(true) as HTMLElement;clone.removeAttribute('data-sf-marquee-original');clone.dataset.sfMarqueeClone='';clone.setAttribute('aria-hidden','true');clone.inert=true;clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));clone.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').forEach(node=>{node.setAttribute('tabindex','-1');node.removeAttribute('autofocus');node.removeAttribute('name');});track.append(clone);}
     const requested=Number(el.dataset.sfMarqueeSpeed),speed=Number.isFinite(requested)&&requested>0?Math.min(100,requested):config.marqueeSpeed;
     animation=track.animate([{transform:'translateX(0)'},{transform:`translateX(-${width}px)`}],{duration:Math.max(config.interaction,width/speed*1000),iterations:Infinity,easing:'linear'});sync();
    };
    const queue=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(queue);resize.observe(viewport);resize.observe(original);
    const visibility=new IntersectionObserver(entries=>{onscreen=entries.some(entry=>entry.isIntersecting);sync();});visibility.observe(el);
    const lifetime=new AbortController();const on=(type:string,fn:()=>void)=>el.addEventListener(type,fn,{signal:lifetime.signal});
    on('pointerenter',()=>{hovered=true;sync();});on('pointerleave',()=>{hovered=false;sync();});on('focusin',()=>{focused=true;sync();});
    el.addEventListener('focusout',event=>{focused=Boolean(event.relatedTarget instanceof Node&&el.contains(event.relatedTarget));sync();},{signal:lifetime.signal});
    button.addEventListener('click',()=>{userPaused=!userPaused;button.textContent=userPaused?'Resume animation':'Pause animation';button.setAttribute('aria-pressed',String(userPaused));sync();},{signal:lifetime.signal});
    records.set(el,{sync,destroy(){lifetime.abort();resize.disconnect();visibility.disconnect();cancelAnimationFrame(frame);animation?.cancel();el.replaceChildren(...original.childNodes);el.removeAttribute('data-sf-marquee-ready');}});queue();
   }
  },remove,pause(value){paused=value;records.forEach(record=>record.sync());},destroy(){records.forEach(record=>record.destroy());records.clear();}};
 });
}
