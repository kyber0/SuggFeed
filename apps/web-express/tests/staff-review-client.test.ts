import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const item=(n:number)=>({id:id(n),title:'Duplicate title',description:'Exact submission '+n,status:'pending',category:'Facilities',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-12T00:00:00Z',staff_note:'',assignee_id:'',priority:'normal',target_date:''});
function harness(initial=''){
  const listeners=new Map<string,Function[]>(),nodes=new Map<string,any>(),pending:Array<{url:string;signal:AbortSignal;resolve:Function}>=[];
  class Element {
    hidden=false;disabled=false;open=false;textContent='';value='';defaultValue='';scrollTop=0;tabIndex=0;isConnected=true;focused=false;
    dataset:Record<string,string>={};attributes=new Map<string,string>();events=new Map<string,Function[]>();options:any[]=[];
    validity={valid:true};classList={add(){},remove(){},toggle(){}};
    addEventListener(name:string,fn:Function){this.events.set(name,[...(this.events.get(name)||[]),fn]);}
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    getAttribute(name:string){return this.attributes.get(name)||null;}
    removeAttribute(name:string){this.attributes.delete(name);}
    querySelectorAll(selector:string){return selector==='[data-review-tab]'?tabs:selector==='[role="tabpanel"]'?panels:[];}
    querySelector(selector:string){return selector==='.staff-review-scroll'?scroll:selector==='[data-review-tab="progress"]'?tabs[1]:null;}
    getClientRects(){return this.isConnected?[{}]:[];}
    focus(){this.focused=true;}
    showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.events.get('close')||[])fn();}
    replaceChildren(){}
    append(..._children:unknown[]){}
    after(){}
    reportValidity(){return true;}
    closest(selector:string){return selector==='[data-review]' && this.dataset.review?this:null;}
  }
  const template=fs.readFileSync(path.join(__dirname,'../views/partials/staff-detail.eta'),'utf8');
  for(const match of template.matchAll(/id="([\w-]+)"/g))nodes.set(match[1],new Element());
  nodes.set('staff-current-user',{textContent:'{}'});nodes.set('staff-tools-message',new Element());
  const scroll=new Element(),tabs=['decision','progress','notes','history'].map(key=>Object.assign(new Element(),{dataset:{reviewTab:key}}));
  const panels=tabs.map(tab=>Object.assign(new Element(),{id:'review-panel-'+tab.dataset.reviewTab}));
  nodes.get('review-retry-detail').hidden=true;
  const document:any={activeElement:new Element(),getElementById:(key:string)=>nodes.get(key),querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name:string,fn:Function)=>listeners.set(name,[...(listeners.get(name)||[]),fn]),createElement:()=>new Element(),createElementNS:()=>new Element()};
  const window:any={scrollTo(){},location:{href:'https://www.suggfeed.me/admin/board'+initial,pathname:initial?'/admin':'/admin/board'},addEventListener(){},getSelection:()=>null};
  vm.runInNewContext(['empty-state','staff-review'].map(file=>fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8')).join('\n'),{
    scrollX:0,scrollY:0,location:window.location, sfSchoolPath: (value:string)=>value, sfSchoolRoute:(value:string)=>value, document,window,HTMLElement:Element,URL,AbortController,setTimeout,clearTimeout,
    sfSchoolFetch:(url:string,options:any)=>url.endsWith('/activity')?Promise.resolve({ok:true,json:async()=>({success:true,history:[],notes:[],transitions:[]})}):new Promise(resolve=>pending.push({url,signal:options.signal,resolve})),
  });
  const flush=async()=>{await new Promise<void>(resolve=>setImmediate(resolve));};
  const click=async(target:any)=>{for(const fn of listeners.get('click')||[])fn({target,button:0,preventDefault(){}});await flush();};
  const trigger=(n:number,section='decision')=>Object.assign(new Element(),{dataset:{review:id(n),reviewSection:section}});
  const respond=async(index:number,data:any,status=200)=>{pending[index].resolve({ok:status===200,status,json:async()=>data});await flush();};
  return {nodes,pending,click,trigger,respond,flush,dialog:nodes.get('staff-review-dialog'),tabs};
}
test('shared review opens exact IDs with fresh data and supports delegated cards after pagination',async()=>{
  const h=harness();await h.click(h.trigger(99));assert.equal(h.pending[0].url,'/api/staff/submissions/'+id(99));
  assert.equal(h.nodes.get('staff-review-fields').disabled,true);
  await h.respond(0,{success:true,item:item(99)});
  assert.equal(h.nodes.get('review-description').textContent,'Exact submission 99');assert.equal(h.nodes.get('staff-review-fields').disabled,false);
  assert.equal(h.nodes.get('review-save-next').hidden,true);
  h.dialog.close();await h.click(h.trigger(100,'progress'));await h.respond(1,{success:true,item:item(100)});
  assert.equal(h.tabs[1].getAttribute('aria-selected'),'true');assert.equal(h.nodes.get('review-save').hidden,true);
});
test('late and closed detail responses cannot replace the active submission; close restores focus',async()=>{
  const h=harness(),first=h.trigger(1),second=h.trigger(2);
  await h.click(first);await h.click(second);assert.equal(h.pending[0].signal.aborted,true);
  await h.respond(1,{success:true,item:item(2)});await h.respond(0,{success:true,item:item(1)});
  assert.equal(h.nodes.get('review-description').textContent,'Exact submission 2');
  h.dialog.close();assert.equal(first.focused,true);
  await h.click(h.trigger(3));h.dialog.close();await h.respond(2,{success:true,item:item(3)});assert.equal(h.dialog.open,false);
});
test('unavailable details show retry without stale controls; retry recovers the same ID',async()=>{
  const h=harness();await h.click(h.trigger(4));await h.respond(0,{success:false},404);
  assert.equal(h.dialog.dataset.unavailable,'true');assert.equal(h.nodes.get('review-retry-detail').hidden,false);
  assert.match(h.nodes.get('review-message').textContent,/no longer available/);
  h.nodes.get('review-retry-detail').events.get('click')[0]();await h.flush();assert.equal(h.pending[1].url,h.pending[0].url);
  await h.respond(1,{success:true,item:item(4)});assert.equal(h.dialog.dataset.unavailable,undefined);assert.equal(h.nodes.get('review-retry-detail').hidden,true);
});
test('direct links load IDs outside the current page and drafts block replacement',async()=>{
  const h=harness('?idea='+id(88));assert.equal(h.pending[0].url,'/api/staff/submissions/'+id(88));
  await h.respond(0,{success:true,item:item(88)});h.nodes.get('review-note').value='Unsaved response';
  await h.click(h.trigger(2));assert.equal(h.pending.length,1);assert.equal(h.nodes.get('review-discard-warning').hidden,false);
});
test('workboard background opens the drawer but drag gestures and embedded controls do not',async()=>{
  const h=harness(),title=h.trigger(6);let interactive=false;
  const card={dataset:{boardId:id(6),dragging:'true',draggedAt:'0'},querySelector:()=>title};
  const target={closest:(selector:string)=>selector==='[data-board-id]'?card:selector==='input,select,button,a,label,summary,details' && interactive?{}:null};
  await h.click(target);assert.equal(h.pending.length,0);
  card.dataset.dragging='';card.dataset.draggedAt=String(Date.now());await h.click(target);assert.equal(h.pending.length,0);
  card.dataset.draggedAt='0';interactive=true;await h.click(target);assert.equal(h.pending.length,0);
  interactive=false;await h.click(target);assert.equal(h.pending.length,1);
  await h.respond(0,{success:true,item:item(6)});assert.equal(h.nodes.get('review-description').textContent,'Exact submission 6');
});
