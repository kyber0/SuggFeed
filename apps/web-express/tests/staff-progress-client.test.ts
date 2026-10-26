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
  const evidenceRequests:any[]=[];const reservations=new Map<string,any>();let evidenceFailure='';let uploadReply=200;
  const context:any={document:{getElementById:node,dispatchEvent(){},createElement:(tag:string)=>node('new-'+tag+'-'+(++sequence)),createElementNS:(_ns:string,tag:string)=>node('new-'+tag+'-'+(++sequence))},window:{sfConfirm:async()=>true},CustomEvent,Intl,Date,JSON,Number,String,Array,Error,TypeError,URL,AbortController,setTimeout,clearTimeout,
    crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},
    fetch:async (_url:string,options:any)=>{
      if(_url.startsWith('https://storage.example/')){evidenceRequests.push({url:_url,method:options.method,body:options.body});return {ok:uploadReply===200,status:uploadReply};}
      if(_url.startsWith('/api/staff/progress-upload/')){
        const payload=options.body?JSON.parse(options.body):undefined;evidenceRequests.push({url:_url,method:options.method,payload});
        if(_url.endsWith('/reserve')){
          let file=reservations.get(payload.uploadId);
          if(!file){file={id:payload.uploadId,display_name:payload.name,declared_mime:payload.mime,declared_size:payload.size,alt:payload.alt,state:'pending',requestId:payload.requestId};reservations.set(payload.uploadId,file);}
          if(evidenceFailure==='reserve-lost'){evidenceFailure='';throw new TypeError('Reservation response lost');}
          return {ok:true,status:200,json:async()=>({success:true,file,upload:file.state==='ready'?null:{signedUrl:'https://storage.example/'+file.id,token:'token',path:'opaque/'+file.id}})};
        }
        const id=_url.split('/')[4];const file=reservations.get(id);
        if(options.method==='DELETE'){reservations.delete(id);return {ok:true,status:200,json:async()=>({success:true})};}
        if(evidenceFailure==='finalize-lost'){evidenceFailure='';throw new TypeError('Finalization response lost');}
        Object.assign(file,{state:'ready',mime_type:file.declared_mime.startsWith('image/')?'image/webp':'application/pdf',size_bytes:file.declared_size,href:'/api/progress-evidence/'+file.id});
        return {ok:true,status:200,json:async()=>({success:true,file})};
      }
      if(options.method!=='POST')return {ok:true,status:200,json:async()=>({success:true,updates,submission:snapshot,workflow:snapshot.workflow})};
      const payload=JSON.parse(options.body);posts.push(payload);
      if(reply==='network')throw new TypeError('Network unavailable');
      if(reply==='forbidden')return {ok:false,status:403,json:async()=>({success:false})};
      if(reply==='invalid-json')return {ok:true,status:201,json:async()=>{throw new SyntaxError('Invalid response');}};
      if(reply==='conflict')return {ok:false,status:409,json:async()=>({success:false})};
      snapshot={...snapshot,updated_at:'2026-10-11T11:00:00Z'};
      updates=[{id:'update-id',kind:payload.kind,body:payload.body,visibility:payload.visibility,percent:payload.percent,blocked_reason:null,next_step:null,occurred_on:payload.occurredOn,office_label:'School office',created_at:snapshot.updated_at,request_id:payload.requestId,files:[...reservations.values()].filter(file=>file.requestId===payload.requestId && file.state==='ready')}];
      return {ok:true,status:201,json:async()=>({success:true,update:updates[0],submission:snapshot})};
    }
  };
  context.sfSchoolPath=(value:string)=>value;context.sfSchoolRoute=(value:string)=>value;context.sfSchoolFetch=context.fetch;
  vm.createContext(context);
  for(const file of ['empty-state','staff-progress'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),context);
  const controller=context.window.sfStaffProgress;
  controller.bind({canPost:()=>allowPost,applySnapshot:(s:any)=>{applied.push(s);return true;},afterPost:async()=>{},changed(){},posting(){}});
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
  const descendants=(value:any):any[]=>[value,...value.children.flatMap(descendants)];
  const row=(index:number)=>node('staff-progress-evidence-list').children[index];
  return {node,controller,posts,applied,evidenceRequests,reservations,flush,
    setReply:(value:string)=>{reply=value;},setAllowed:(value:boolean)=>{allowPost=value;},setSnapshot:(value:any)=>{snapshot={...snapshot,...value};},
    setEvidenceFailure:(value:string)=>{evidenceFailure=value;},setUploadReply:(value:number)=>{uploadReply=value;},
    chooseFiles:async(files:any[])=>{node('staff-progress-files').files=files;await node('staff-progress-files').emit('change');},
    describe:async(index:number,text:string)=>{const input=descendants(row(index)).find(child=>String(child.id).startsWith('evidence-alt-'));input.value=text;await input.emit('input');},
    upload:async(index:number)=>{await descendants(row(index)).find(child=>/^(Upload evidence|Retry upload)$/.test(child.textContent)).emit('click');await flush();},
    remove:async(index:number)=>{await descendants(row(index)).find(child=>child.textContent==='Remove').emit('click');await flush();},
    open:async()=>{controller.open({id:snapshot.id,status:snapshot.status,title:'Add shaded seating'});await flush();}};
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

test('image evidence requires a description and shares the final post idempotency key without deleting published files',async()=>{
  const h=harness();await h.open();
  await h.chooseFiles([{name:'benches.png',type:'image/png',size:1024}]);
  assert.equal(h.controller.hasDraft(),true);assert.equal(h.node('staff-progress-post').disabled,true);
  await h.upload(0);assert.equal(h.evidenceRequests.length,0);assert.match(h.node('staff-progress-evidence-message').textContent,/Describe/);
  await h.describe(0,'New benches beside the library');await h.upload(0);
  assert.equal(h.reservations.size,1);assert.equal(h.node('staff-progress-post').disabled,false);
  const reserved=h.evidenceRequests.find(request=>request.url.endsWith('/reserve')).payload;
  assert.equal(reserved.alt,'New benches beside the library');assert.equal(reserved.mime,'image/png');assert.ok(reserved.uploadId);
  assert.equal(h.node('staff-progress-preview-files').children[0].textContent,'New benches beside the library');
  h.node('staff-progress-body').value='The first benches are installed.';await h.node('staff-progress-body').emit('input');h.setReply('success');
  await h.node('staff-progress-form').emit('submit');
  assert.equal(h.posts[0].requestId,reserved.requestId);assert.equal(h.controller.hasDraft(),false);
  assert.equal(h.evidenceRequests.filter(request=>request.method==='DELETE').length,0);
  assert.equal(h.node('staff-progress-evidence-list').children.length,0);
});

test('selected evidence blocks publication and rejects unsupported, oversized and excess files',async()=>{
  const h=harness();await h.open();h.node('staff-progress-body').value='Evidence is being checked.';
  await h.chooseFiles([{name:'unsafe.svg',type:'image/svg+xml',size:100},{name:'unsafe.pdf',type:'application/pdf',size:100},{name:'huge.png',type:'image/png',size:10485761},...Array.from({length:6},(_,index)=>({name:'document-'+index+'.png',type:'image/png',size:200}))]);
  assert.equal(h.node('staff-progress-evidence-list').children.length,5);assert.match(h.node('staff-progress-evidence-message').textContent,/JPEG/);assert.match(h.node('staff-progress-evidence-message').textContent,/10 MB/);assert.match(h.node('staff-progress-evidence-message').textContent,/5 files/);
  await h.node('staff-progress-form').emit('submit');assert.equal(h.posts.length,0);assert.match(h.node('staff-progress-evidence-message').textContent,/Upload or remove/);
  await h.remove(0);assert.equal(h.node('staff-progress-evidence-list').children.length,4);
});

test('lost reservation and finalize replies safely retry the same file rather than reserving a duplicate',async()=>{
  const h=harness();await h.open();await h.chooseFiles([{name:'installation.png',type:'image/png',size:2048}]);await h.describe(0,'Installed school equipment.');
  h.setEvidenceFailure('reserve-lost');await h.upload(0);assert.equal(h.reservations.size,1);assert.equal(h.node('staff-progress-post').disabled,true);
  h.setUploadReply(409);h.setEvidenceFailure('finalize-lost');await h.upload(0);
  assert.equal(h.node('staff-progress-post').disabled,true);assert.equal(h.reservations.size,1);
  const attempts=h.evidenceRequests.filter(request=>request.url.endsWith('/reserve'));
  assert.equal(attempts.length,2);assert.equal(attempts[0].payload.uploadId,attempts[1].payload.uploadId);assert.equal(attempts[0].payload.requestId,attempts[1].payload.requestId);
  await h.upload(0);assert.equal(h.node('staff-progress-post').disabled,false);
  assert.equal(h.evidenceRequests.filter(request=>request.method==='PUT').length,1);
  await h.remove(0);assert.equal(h.reservations.size,0);assert.equal(h.controller.hasDraft(),false);
});

test('clearing an unpublished evidence draft cancels reservations and never persists student content locally',async()=>{
  const h=harness();await h.open();await h.chooseFiles([{name:'school-note.png',type:'image/png',size:100}]);await h.describe(0,'School work evidence.');await h.upload(0);
  await h.node('staff-progress-clear').emit('click');await h.flush();
  assert.equal(h.evidenceRequests.filter(request=>request.method==='DELETE').length,1);assert.equal(h.reservations.size,0);assert.equal(h.controller.hasDraft(),false);
  const source=fs.readFileSync(path.join(__dirname,'../src/client/staff-progress.ts'),'utf8');assert.doesNotMatch(source,/localStorage|sessionStorage/);
});


test('workflow guards keep paused actions and completion without evidence from posting',async()=>{
 const paused=harness();paused.setSnapshot({workflow:{mode:'work',paused:true,allowedActions:['update'],issues:[],canRepair:false}});await paused.open();
 paused.node('staff-progress-body').value='A draft that must remain private until work resumes.';await paused.node('staff-progress-body').emit('input');await paused.node('staff-progress-form').emit('submit');
 assert.equal(paused.posts.length,0);assert.match(paused.node('staff-progress-message').textContent,/not currently available/);assert.equal(paused.controller.hasDraft(),true);
 const completed=harness();completed.setSnapshot({workflow:{mode:'work',paused:false,allowedActions:['complete'],issues:[],canRepair:false}});await completed.open();
 completed.node('staff-progress-body').value='Completion requires evidence.';await completed.node('staff-progress-body').emit('input');await completed.node('staff-progress-form').emit('submit');
 assert.equal(completed.posts.length,0);assert.match(completed.node('staff-progress-evidence-message').textContent,/at least one ready evidence/);
});

test('private decline previews disable public progress and notification controls',async()=>{
 const h=harness();h.setSnapshot({workflow:{mode:'review',paused:false,allowedActions:['decline'],issues:[],canRepair:false}});await h.open();
 assert.equal(h.node('staff-progress-visibility').value,'staff');assert.equal(h.node('staff-progress-percent').disabled,true);assert.equal(h.node('staff-progress-notify').disabled,true);
 assert.equal(h.node('staff-progress-preview-title').textContent,'Decision preview');assert.match(h.node('staff-progress-audience-hint').textContent,/not published/);
});


test('expired access and malformed replies retain progress drafts without applying an unconfirmed snapshot',async()=>{
 for(const reply of ['forbidden','invalid-json']){
  const h=harness();await h.open();h.node('staff-progress-body').value='Keep this unconfirmed progress draft.';await h.node('staff-progress-body').emit('input');h.setReply(reply);
  const applied=h.applied.length;await h.node('staff-progress-form').emit('submit');assert.equal(h.posts.length,1);assert.equal(h.applied.length,applied);assert.equal(h.controller.hasDraft(),true);
  assert.match(h.node('staff-progress-message').textContent,reply==='forbidden'?/session expired|access changed/:/could not confirm/);
 }
});
