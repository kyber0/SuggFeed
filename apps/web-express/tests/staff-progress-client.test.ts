import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function harness() {
  const nodes=new Map<string, any>();
  const node=(id:string):any=>{
    if(nodes.has(id))return nodes.get(id);
    const classes=new Set<string>();const listeners=new Map<string,Array<(event:any)=>unknown>>();
    const value:any={id,value:'',checked:false,disabled:false,hidden:false,required:false,textContent:'',dataset:{},children:[],validity:{valid:true},
      classList:{toggle(name:string,on:boolean){on?classes.add(name):classes.delete(name);},contains:(name:string)=>classes.has(name)},
      addEventListener(name:string,fn:any){listeners.set(name,[...(listeners.get(name)||[]),fn]);},
      async emit(name:string){for(const fn of listeners.get(name)||[])await fn({preventDefault(){}});},
      append(...children:any[]){this.children.push(...children);},replaceChildren(...children:any[]){this.children=children;},
      setAttribute(){},removeAttribute(){},focus(){},reportValidity(){return true;},setCustomValidity(){},
      querySelector(selector:string){return node(id+selector);},
      reset(){for(const key of ['kind','visibility','body','percent','blocked-reason','next-step','date'])node('staff-progress-'+key).value='';node('staff-progress-notify').checked=false;}
    };
    Object.defineProperty(value,'innerHTML',{set(){throw new Error('Progress text must not use innerHTML');}});
    nodes.set(id,value);return value;
  };
  let snapshot:any={id:'00000000-0000-4000-8000-000000000001',status:'in_progress',updated_at:'2026-10-11T10:00:00Z',staff_note:'Current review',assignee_id:null,priority:'normal',target_date:null,progress_percent:25,started_at:'2026-10-10',is_blocked:false,resolved_at:null};
  const posts:any[]=[];const applied:any[]=[];let updates:any[]=[];let reply='network';let allowPost=true;let sequence=0;
  const context:any={document:{getElementById:node,createElement:(tag:string)=>node('new-'+tag+'-'+(++sequence))},window:{},Intl,Date,JSON,Number,String,Array,Error,TypeError,AbortController,setTimeout,clearTimeout,
    crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},
    fetch:async (_url:string,options:any)=>{
      if(options.method!=='POST')return {ok:true,status:200,json:async()=>({success:true,updates,submission:snapshot})};
      const payload=JSON.parse(options.body);posts.push(payload);
      if(reply==='network')throw new TypeError('Network unavailable');
      if(reply==='conflict')return {ok:false,status:409,json:async()=>({success:false})};
      snapshot={...snapshot,updated_at:'2026-10-11T11:00:00Z'};
      updates=[{id:'update-id',kind:payload.kind,body:payload.body,visibility:payload.visibility,percent:payload.percent,blocked_reason:null,next_step:null,occurred_on:payload.occurredOn,office_label:'School office',created_at:snapshot.updated_at,request_id:payload.requestId}];
      return {ok:true,status:201,json:async()=>({success:true,update:updates[0],submission:snapshot})};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/staff-progress.js'),'utf8'),context);
  const controller=context.window.sfStaffProgress;
  controller.bind({canPost:()=>allowPost,applySnapshot:(s:any)=>{applied.push(s);return true;},afterPost:async()=>{},changed(){},posting(){}});
  return {node,controller,posts,applied,setReply:(value:string)=>{reply=value;},setAllowed:(value:boolean)=>{allowPost=value;},setSnapshot:(value:any)=>{snapshot={...snapshot,...value};},open:async()=>{controller.open({id:snapshot.id,status:snapshot.status,title:'Add shaded seating'});await new Promise(resolve=>setImmediate(resolve));}};
}

test('progress drafts render as text and retries reuse an idempotency key until the post is confirmed',async()=>{
  const h=harness();await h.open();assert.equal(h.controller.hasDraft(),false);
  h.node('staff-progress-body').value='<img src=x onerror=alert(1)> We ordered the benches.';
  await h.node('staff-progress-body').emit('input');
  assert.equal(h.node('staff-progress-preview-body').textContent,'<img src=x onerror=alert(1)> We ordered the benches.');
  assert.equal(h.controller.hasDraft(),true);
  await h.node('staff-progress-form').emit('submit');
  assert.equal(h.posts.length,1);assert.equal(h.controller.hasDraft(),true);assert.match(h.node('staff-progress-message').textContent,/Retry/);
  h.setReply('success');await h.node('staff-progress-form').emit('submit');
  assert.equal(h.posts.length,2);assert.equal(h.posts[0].requestId,h.posts[1].requestId);assert.equal(h.posts[1].percent,null);
  assert.equal(h.controller.hasDraft(),false);assert.equal(h.applied.at(-1).updated_at,'2026-10-11T11:00:00Z');
});

test('a conflict retains the draft and explicit refresh uses the current review version; unsaved review blocks posting',async()=>{
  const h=harness();await h.open();h.node('staff-progress-body').value='Waiting for approval.';await h.node('staff-progress-body').emit('input');
  h.setAllowed(false);await h.node('staff-progress-form').emit('submit');assert.equal(h.posts.length,0);assert.match(h.node('staff-progress-message').textContent,/Review/);
  h.setAllowed(true);h.setReply('conflict');await h.node('staff-progress-form').emit('submit');
  assert.equal(h.controller.hasDraft(),true);assert.match(h.node('staff-progress-message').textContent,/changed/);
  h.setSnapshot({updated_at:'2026-10-11T10:30:00Z',staff_note:'A newer review'});await h.controller.refresh();
  assert.equal(h.node('staff-progress-body').value,'Waiting for approval.');
  h.setReply('success');await h.node('staff-progress-form').emit('submit');
  assert.equal(h.posts.at(-1).updatedAt,'2026-10-11T10:30:00Z');assert.equal(h.applied.some(s=>s.staff_note==='A newer review'),true);
});

test('staff-only progress never sends public estimates or follower notifications',async()=>{
  const h=harness();await h.open();h.node('staff-progress-visibility').value='staff';h.node('staff-progress-body').value='Internal scheduling check';
  h.node('staff-progress-percent').value='70';h.node('staff-progress-notify').checked=true;await h.node('staff-progress-visibility').emit('input');
  h.setReply('success');await h.node('staff-progress-form').emit('submit');
  assert.equal(h.posts[0].visibility,'staff');assert.equal(h.posts[0].percent,null);assert.equal(h.posts[0].notify,false);
});
