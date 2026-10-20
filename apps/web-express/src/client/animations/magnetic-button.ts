namespace SfMotion {
 factories.push(context=>{
  if(context.reduced.matches||!context.fine.matches||saveData()||editing())return {destroy(){}};
  const records=new Map<HTMLElement,{inner:HTMLElement;nodes:Node[];reset():void;dispose():void}>();
  let paused=false;
  context.on(window,'scroll',()=>records.forEach(record=>record.reset()),{passive:true,capture:true});
  context.on(window,'blur',()=>records.forEach(record=>record.reset()));
  const remove=(root:ParentNode)=>{for(const [button,record] of records)if(root===button||(root instanceof Node&&root.contains(button))){record.dispose();record.inner.replaceWith(...record.inner.childNodes);records.delete(button);}};
  return {refresh(root){for(const button of elements(root,'[data-sf-magnetic]')){
   const existing=records.get(button);if(existing){if(button.matches(':disabled,[aria-disabled="true"],[aria-busy="true"]'))existing.reset();continue;}
   if(blocked(button)||button.closest('.studio-toolbar')||button.matches(':disabled,[aria-disabled="true"],[data-destructive]')||button.querySelector('input,textarea,select,[data-sf-magnetic-inner]'))continue;
   const inner=document.createElement('span');inner.dataset.sfMagneticInner='';inner.dataset.sfGenerated='';const nodes=[...button.childNodes];inner.append(...nodes);button.append(inner);
   const lifetime=new AbortController();let frame=0,rect:DOMRect|undefined,dx=0,dy=0;
   const reset=()=>{cancelAnimationFrame(frame);frame=0;inner.style.transform='translate3d(0,0,0)';rect=undefined;};
   const enter=()=>{rect=button.getBoundingClientRect();};
   button.addEventListener('pointerenter',enter,{signal:lifetime.signal});
   button.addEventListener('pointermove',event=>{if(paused||event.pointerType!=='mouse'||button.matches(':disabled,[aria-disabled="true"],[aria-busy="true"],:focus-visible')){reset();return;}if(!rect)return;dx=Math.max(-config.magnet,Math.min(config.magnet,((event.clientX-rect.left)/rect.width-.5)*config.magnet*2));dy=Math.max(-config.magnet,Math.min(config.magnet,((event.clientY-rect.top)/rect.height-.5)*config.magnet*2));if(!frame)frame=requestAnimationFrame(()=>{frame=0;inner.style.transform=`translate3d(${dx}px,${dy}px,0)`;});},{signal:lifetime.signal,passive:true});
   for(const type of ['pointerleave','pointercancel','focusin','pointerdown'])button.addEventListener(type,reset,{signal:lifetime.signal});
   records.set(button,{inner,nodes,reset,dispose(){lifetime.abort();reset();}});
  }},remove,pause(value){paused=value;records.forEach(record=>record.reset());},destroy(){for(const [button,record] of records){record.dispose();if(record.inner.parentNode===button)record.inner.replaceWith(...record.inner.childNodes);}records.clear();}};
 });
}
