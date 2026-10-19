(() => {
 const copy=(value:any)=>structuredClone(value);
 const clean=(value:any)=>{const result=copy(value);delete result.formVersion;return result;};
 const node=(id:string,label:string,group:string,pages:string[]=[])=>({id,label,group,pages});
 function registry(configuration:any,page:string){const nodes=[node('school.identity','School identity','appearance'),node('home.hero','Welcome & cover','hero',['home']),node('home.links','Official links & help','links',['home']),node('community.categories','Feedback categories','categories',['home','feed','roadmap','submit']),node('submission.instructions','Submission form','form',['submit']),node('community.features','Community features','features'),node('progress.labels','Progress labels','progress',['roadmap','idea']),node('school.email','School email content','email'),node('locked.brand','SuggFeed & navigation','locked')];
  if(['home','feed','roadmap','submit'].includes(page))for(const c of configuration.categories)nodes.push(node('category:'+c.id,c.name||'New category','category'));
  if(page==='submit')for(const q of configuration.form.questions)nodes.push(node('question:'+q.id,q.label||'New question','question'));
  return nodes.filter(n=>!n.pages.length||n.pages.includes(page));
 }
 function create(initial:any){let configuration=clean(initial.configuration),saved=copy(configuration),selection:any={componentId:'school.identity'},page='home';let revision=initial.serverRevision||0;
  const past:any[]=[],future:any[]=[],listeners=new Set<(state:any)=>void>();let lastKey='',lastAt=0,bytes=0;
  const getState=()=>({configuration,savedConfiguration:saved,serverRevision:revision,selection,page,dirty:JSON.stringify(configuration)!==JSON.stringify(saved),canUndo:past.length>0,canRedo:future.length>0});
  const emit=()=>{for(const listener of listeners)listener(getState());};
  function applyChange(componentId:string,property:string,value:any){const next=copy(configuration);let target:any,allowed:string[]=[];
   if(componentId.startsWith('category:')){target=next.categories.find((c:any)=>c.id===componentId.slice(9));allowed=['name','slug','description','icon','active'];}
   else if(componentId.startsWith('question:')){target=next.form.questions.find((q:any)=>q.id===componentId.slice(9));allowed=['label','help','type','required','options'];}
   else{const groups:any={'school.identity':[next,['displayName','palette','logo','cover']],'home.hero':[next.welcome,['headline','intro','message']],'home.links':[next.welcome,['help','links']],'community.categories':[next,['categories']],'submission.instructions':[next.form,['instructions','example','attachments','questions']],'community.features':[next.features,Object.keys(next.features)],'progress.labels':[next,['labels','stageDescriptions']],'school.email':[next.email,['invitation','introduction','digest']]};const group=groups[componentId];if(group)[target,allowed]=group;}
   if(!target||!allowed.includes(property))throw new Error('This property cannot be edited here.');
   if(typeof target[property]==='boolean'&&typeof value!=='boolean'||typeof target[property]==='string'&&typeof value!=='string'||Array.isArray(target[property])&&!Array.isArray(value))throw new Error('Choose a supported value.');
   target[property]=copy(value);if(JSON.stringify(next)===JSON.stringify(configuration))return;
   const key=componentId+':'+property,now=Date.now();if(key!==lastKey||now-lastAt>500){const entry=copy(configuration);past.push(entry);bytes+=JSON.stringify(entry).length;while(past.length>50||bytes>2*1024*1024){const removed=past.shift();bytes-=JSON.stringify(removed).length;}}
   lastKey=key;lastAt=now;future.length=0;configuration=next;emit();
  }
  return {getState,applyChange,select(value:any){selection=value;lastKey='';emit();},setPage(value:string){page=value;selection=null;lastKey='';emit();},endGroup(){lastKey='';},undo(){if(!past.length)return;future.push(copy(configuration));const entry=past.pop();bytes-=JSON.stringify(entry).length;configuration=entry;lastKey='';emit();},redo(){if(!future.length)return;past.push(copy(configuration));bytes+=JSON.stringify(configuration).length;configuration=future.pop();lastKey='';emit();},markSaved(value:any,nextRevision:number,sent:any){const canonical=clean(value);if(JSON.stringify(configuration)===JSON.stringify(clean(sent)))configuration=copy(canonical);saved=canonical;revision=nextRevision;emit();},replaceDraft(value:any,nextRevision:number){configuration=clean(value);saved=copy(configuration);revision=nextRevision;past.length=0;future.length=0;bytes=0;lastKey='';emit();},subscribe(listener:(state:any)=>void){listeners.add(listener);return()=>listeners.delete(listener);}};
 }
 Object.assign(window,{sfSchoolStudioModel:{create,registry}});
})();
