namespace SfMotion {
 factories.push(context=>{
  if(context.reduced.matches||!context.fine.matches||saveData()||editing())return {destroy(){}};
  const cursor=document.createElement('div');cursor.dataset.sfCursor='';cursor.dataset.sfGenerated='';cursor.setAttribute('aria-hidden','true');document.body.append(cursor);
  let frame=0,x=0,y=0,targetX=0,targetY=0,visible=false,paused=false,initialized=false,lastScroll=0,dragging=false;
  const hide=()=>{visible=false;cursor.style.opacity='0';cancelAnimationFrame(frame);frame=0;};
  const tick=()=>{frame=0;if(!visible||paused)return;x+=(targetX-x)*.3;y+=(targetY-y)*.3;cursor.style.transform=`translate3d(${x}px,${y}px,0)`;if(Math.abs(targetX-x)+Math.abs(targetY-y)>.2)frame=requestAnimationFrame(tick);};
  context.on(document,'pointermove',event=>{const pointer=event as PointerEvent,el=event.target instanceof Element?event.target:null;
   if(paused||dragging||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')||pointer.pointerType!=='mouse'||!el||performance.now()-lastScroll<config.interaction||blocked(el)||el.closest('input,textarea,select,[contenteditable],dialog[open],[aria-modal="true"]')||document.querySelector('dialog[open],[aria-modal="true"]:not(dialog):not([hidden])')||!window.getSelection()?.isCollapsed){hide();return;}
   if(el.closest('[draggable="true"]')){hide();return;}
   targetX=pointer.clientX;targetY=pointer.clientY;if(!initialized){x=targetX;y=targetY;initialized=true;}
   cursor.dataset.state=el.closest('[draggable="true"]')?'drag':el.closest('button,[role="button"],a[href]')?'action':'default';visible=true;cursor.style.opacity='1';if(!frame)frame=requestAnimationFrame(tick);
  },{passive:true});
  context.on(document,'dragstart',()=>{dragging=true;hide();},{capture:true});
  for(const type of ['dragend','drop'])context.on(document,type,()=>{dragging=false;hide();},{capture:true});
  for(const type of ['keydown','pointerdown','selectionchange','dragstart','focusin','contextmenu'])context.on(document,type,hide,{capture:true});
  context.on(document,'pointerout',event=>{if(!(event as PointerEvent).relatedTarget)hide();});
  context.on(window,'scroll',()=>{lastScroll=performance.now();hide();},{passive:true,capture:true});
  context.on(window,'blur',hide);
  return {pause(value){paused=value;hide();},destroy(){hide();cursor.remove();}};
 });
}
