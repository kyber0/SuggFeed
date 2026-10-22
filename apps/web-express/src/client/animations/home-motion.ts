namespace SfMotion {
 factories.push(context=>{
  type Story={dispose():void;pause(value:boolean):void};
  const stories=new Map<HTMLElement,Story>(),feedback=new Map<HTMLElement,Animation>();
  let paused=false;
  function fade(element:HTMLElement,duration:number=config.page,delay=0){
   if(paused||editing()||context.reduced.matches||!Element.prototype.animate||!element.isConnected)return;
   feedback.get(element)?.cancel();
   const animation=element.animate([{opacity:.8},{opacity:1}],{duration,delay,easing:config.ease});feedback.set(element,animation);
   animation.onfinish=animation.oncancel=()=>{if(feedback.get(element)===animation)feedback.delete(element);};
  }
  function register(root:HTMLElement){
   const pages=Array.from(root.querySelectorAll<HTMLElement>('[data-story-page]')),controls=root.querySelector<HTMLElement>('[data-story-controls]'),status=root.querySelector<HTMLElement>('[data-story-status]'),fold=root.querySelector<HTMLElement>('.sf-story-fold');
   if(pages.length!==3||!controls||!status||!fold)return;
   const previous=root.querySelector<HTMLButtonElement>('[data-story-prev]')!,next=root.querySelector<HTMLButtonElement>('[data-story-next]')!,choices=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-story-go]'));
   const progress=root.querySelector<HTMLElement>('[data-story-progress]');
   const lifetime=new AbortController(),wide=matchMedia('(min-width:768px)'),animations=new Set<Animation>();
   let index=0,enabled=false,suspended=paused,visible=true,frame=0,rect:DOMRect|undefined,dx=0,dy=0;
   const settle=()=>{animations.forEach(animation=>animation.cancel());animations.clear();pages.forEach(page=>{delete page.dataset.storyOutgoing;});};
   const resetArt=()=>{cancelAnimationFrame(frame);frame=0;rect=undefined;for(const art of root.querySelectorAll<HTMLElement>('.sf-story-art'))art.style.removeProperty('transform');};
   const paint=()=>{
    pages.forEach((page,i)=>{page.toggleAttribute('data-story-active',i===index);page.inert=enabled&&i!==index;if(enabled)page.setAttribute('aria-hidden',String(i!==index));else page.removeAttribute('aria-hidden');});
    choices.forEach((button,i)=>{button.setAttribute('aria-pressed',String(i===index));if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    if(progress)progress.style.transform=`scaleX(${(index+1)/pages.length})`;
    previous.disabled=index===0;next.disabled=index===pages.length-1;status.textContent=enabled?`${index+1} / ${pages.length}`:'Three simple steps';
   };
   const resize=()=>{settle();resetArt();enabled=wide.matches&&!context.reduced.matches&&!saveData()&&!!Element.prototype.animate&&!editing();root.toggleAttribute('data-story-ready',enabled);controls.hidden=!enabled;paint();};
   function turn(target:number){
    if(!enabled||target<0||target>=pages.length||target===index)return;
    const oldIndex=index,old=pages[index],direction=target>index?1:-1;settle();resetArt();index=target;paint();
    if(suspended||!visible)return;
    old.dataset.storyOutgoing='';const incoming=pages[index],origin=direction>0?'left center':'right center';
    const outgoing=old.animate([{transform:`perspective(${config.storyPerspective}px) rotateY(0deg)`,opacity:1},{transform:`perspective(${config.storyPerspective}px) rotateY(${-direction*config.storyAngle}deg) translateX(${-direction*config.distance}px)`,opacity:0}],{duration:config.story,easing:config.ease,fill:'both'});
    const entering=incoming.animate([{transform:`perspective(${config.storyPerspective}px) rotateY(${direction*config.storyAngle/2}deg)`,opacity:.65},{transform:`perspective(${config.storyPerspective}px) rotateY(0deg)`,opacity:1}],{duration:config.story-config.storyOverlap,delay:config.storyOverlap,easing:config.ease,fill:'both'});
    old.style.transformOrigin=origin;incoming.style.transformOrigin=origin;
    fold!.style.transformOrigin=origin;
    const shading=fold!.animate([{opacity:0,transform:'scaleX(.02)'},{opacity:.18,transform:'scaleX(.6)',offset:.4},{opacity:0,transform:'scaleX(1)'}],{duration:config.story,easing:config.ease});
    for(const animation of [outgoing,entering,shading])animations.add(animation);
    if(progress)animations.add(progress.animate([{transform:`scaleX(${(oldIndex+1)/pages.length})`},{transform:`scaleX(${(index+1)/pages.length})`}],{duration:config.story,easing:config.ease}));
    incoming.querySelectorAll<HTMLElement>('.sf-story-step,h3,.sf-story-copy > p:last-child,.sf-story-art-detail').forEach((element,i)=>{animations.add(element.animate([{opacity:.5,transform:`translateY(${config.mobileDistance}px)`},{opacity:1,transform:'translateY(0)'}],{duration:config.word,delay:config.storyOverlap+Math.min(i,2)*config.stagger,easing:config.ease,fill:'backwards'}));});
    entering.onfinish=settle;
   }
   root.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;if(button.hasAttribute('data-story-prev'))turn(index-1);else if(button.hasAttribute('data-story-next'))turn(index+1);else if(button.dataset.storyGo!==undefined)turn(Number(button.dataset.storyGo));},{signal:lifetime.signal});
   root.addEventListener('keydown',event=>{if(!enabled||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!(event.target instanceof Element)||event.target.closest('input,textarea,select,[contenteditable]'))return;const target=event.key==='ArrowRight'?index+1:event.key==='ArrowLeft'?index-1:event.key==='Home'?0:event.key==='End'?pages.length-1:undefined;if(target!==undefined){event.preventDefault();turn(target);}},{signal:lifetime.signal});
   root.addEventListener('pointerenter',()=>{if(enabled&&context.fine.matches&&!suspended)rect=root.getBoundingClientRect();},{signal:lifetime.signal});
   root.addEventListener('pointermove',event=>{if(!enabled||!context.fine.matches||event.pointerType!=='mouse'||suspended||!visible||!rect)return;dx=Math.max(-config.magnet,Math.min(config.magnet,((event.clientX-rect.left)/rect.width-.5)*config.magnet*2));dy=Math.max(-config.magnet,Math.min(config.magnet,((event.clientY-rect.top)/rect.height-.5)*config.magnet*2));if(!frame)frame=requestAnimationFrame(()=>{frame=0;const art=pages[index].querySelector<HTMLElement>('.sf-story-art');if(art)art.style.transform=`translate3d(${dx}px,${dy}px,0)`;});},{signal:lifetime.signal,passive:true});
   for(const type of ['pointerleave','pointerdown','focusin','pointercancel'])root.addEventListener(type,resetArt,{signal:lifetime.signal});
   wide.addEventListener('change',resize,{signal:lifetime.signal});window.addEventListener('resize',resetArt,{signal:lifetime.signal,passive:true});window.addEventListener('scroll',resetArt,{signal:lifetime.signal,passive:true});
   const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(!visible){settle();resetArt();}},{threshold:0}):undefined;observer?.observe(root);
   resize();
   stories.set(root,{pause(value){suspended=value;if(value){settle();resetArt();}},dispose(){lifetime.abort();observer?.disconnect();settle();resetArt();root.removeAttribute('data-story-ready');controls.hidden=true;progress?.style.removeProperty('transform');fold!.style.removeProperty('transform-origin');pages.forEach(page=>{page.inert=false;page.removeAttribute('aria-hidden');page.removeAttribute('data-story-active');page.style.removeProperty('transform-origin');});status.textContent='Three simple steps';}});
  }
  context.on(document,'sf:home-panel',event=>{const panel=(event as CustomEvent).detail;if(panel instanceof HTMLElement)fade(panel);});
  context.on(document,'sf:home-cards',event=>{const cards=(event as CustomEvent).detail;if(!Array.isArray(cards))return;cards.forEach((card,index)=>{if(card instanceof HTMLElement){context.seen.add(card);fade(card,config.reveal,staggerDelay(index));}});});
  const remove=(root:ParentNode)=>{for(const [element,story] of stories)if(element===root||(root instanceof Node&&root.contains(element))){story.dispose();stories.delete(element);}for(const [element,animation] of feedback)if(element===root||(root instanceof Node&&root.contains(element))){animation.cancel();feedback.delete(element);}};
  return {refresh(root){if(editing())return;for(const element of elements(root,'[data-sf-home-story]'))if(!stories.has(element))register(element);},remove,pause(value){paused=value;stories.forEach(story=>story.pause(value));if(value){feedback.forEach(animation=>animation.cancel());feedback.clear();}},destroy(){stories.forEach(story=>story.dispose());stories.clear();feedback.forEach(animation=>animation.cancel());feedback.clear();}};
 });
}
