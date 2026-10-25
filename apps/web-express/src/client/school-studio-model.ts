(() => {
 const copy=(value:any)=>structuredClone(value);
 const clean=(value:any)=>{const result=copy(value);delete result.formVersion;return result;};
 const node=(id:string,label:string,group:string,pages:string[]=[])=>({id,label,group,pages});
 function registry(configuration:any,page:string){const nodes=[node('school.theme','Colors & theme','workspace'),node('school.identity','School identity','workspace'),node('community.features','Participation settings','workspace'),node('school.email','Email content','workspace'),node('locked.brand','SuggFeed & shared navigation','workspace')];
  const definition=SfSchoolDesign.pages[page];if(definition){nodes.push(node('page.'+page,definition.label+' layout','page',[page]));for(const [id,section] of Object.entries(definition.sections))nodes.push(node('section.'+page+'.'+id,section.label,'section',[page]));}
  if(page==='home')nodes.push(node('home.hero','Welcome content','content',['home']),node('home.links','Official links & help','content',['home']));
  if(['home','feed','roadmap','submit'].includes(page)){nodes.push(node('community.categories','Feedback categories','content',[page]));for(const c of configuration.categories)nodes.push(node('category:'+c.id,c.name||'New category','category',[page]));}
  if(page==='submit'){nodes.push(node('submission.instructions','Questions & instructions','content',['submit']));for(const q of configuration.form.questions)nodes.push(node('question:'+q.id,q.label||'New question','question',['submit']));}
  if(['roadmap','idea'].includes(page))nodes.push(node('progress.labels','Progress wording','content',[page]));return nodes;
 }
 function create(initial:any){let configuration=clean(initial.configuration),saved=copy(configuration),selection:any={componentId:'school.theme'},page='home';let revision=initial.serverRevision||0;
  const past:any[]=[],future:any[]=[],listeners=new Set<(state:any)=>void>();let lastKey='',lastAt=0,bytes=0,grouped=false,batching=false;
  const getState=()=>({configuration,savedConfiguration:saved,serverRevision:revision,selection,page,dirty:JSON.stringify(configuration)!==JSON.stringify(saved),canUndo:past.length>0,canRedo:future.length>0});
  const emit=()=>{for(const listener of listeners)listener(getState());};
  function applyChange(componentId:string,property:string,value:any){const next=copy(configuration);let target:any,allowed:string[]=[];
   if(componentId==='school.theme'){target=next;allowed=['design'];}
   else if(componentId.startsWith('page.')||componentId.startsWith('section.')){const pageId=componentId.split('.')[1];if(!SfSchoolDesign.pages[pageId])throw new Error('Unsupported page.');next.design ||= SfSchoolDesign.defaults(next.palette);next.design.pages[pageId] ||= SfSchoolDesign.pageDefaults();target=next.design.pages[pageId];allowed=['layout','spacing','cards','hidden','order','sections',...(pageId==='roadmap'?['view']:[])];}
   else if(componentId.startsWith('category:')){target=next.categories.find((c:any)=>c.id===componentId.slice(9));allowed=['name','slug','description','icon','active'];}
   else if(componentId.startsWith('question:')){target=next.form.questions.find((q:any)=>q.id===componentId.slice(9));allowed=['label','help','type','required','options'];}
   else{const groups:any={'school.identity':[next,['displayName','palette','logo','cover']],'home.hero':[next.welcome,['headline','intro','message']],'home.links':[next.welcome,['help','links']],'community.categories':[next,['categories']],'submission.instructions':[next.form,['instructions','example','attachments','questions']],'community.features':[next.features,Object.keys(next.features)],'progress.labels':[next,['labels','stageDescriptions']],'school.email':[next.email,['invitation','introduction','digest']]};const group=groups[componentId];if(group)[target,allowed]=group;}
   if(!target||!allowed.includes(property))throw new Error('This property cannot be edited here.');
   if(typeof target[property]==='boolean'&&typeof value!=='boolean'||typeof target[property]==='string'&&typeof value!=='string'||Array.isArray(target[property])&&!Array.isArray(value))throw new Error('Choose a supported value.');
   target[property]=copy(value);if(JSON.stringify(next)===JSON.stringify(configuration))return;
   if(batching){configuration=next;return;}
   const key=componentId+':'+property,now=Date.now();if(key!==lastKey||!grouped&&now-lastAt>500){const entry=copy(configuration);past.push(entry);bytes+=JSON.stringify(entry).length;while(past.length>50||bytes>2*1024*1024){const removed=past.shift();bytes-=JSON.stringify(removed).length;}}
   lastKey=key;lastAt=now;future.length=0;configuration=next;emit();
  }
  return {getState,applyChange,batch(changes:{componentId:string;property:string;value:any}[]){const previous=copy(configuration);batching=true;try{for(const change of changes)applyChange(change.componentId,change.property,change.value);}catch(error){configuration=previous;throw error;}finally{batching=false;}if(JSON.stringify(previous)===JSON.stringify(configuration))return;past.push(previous);bytes+=JSON.stringify(previous).length;while(past.length>50||bytes>2*1024*1024){const removed=past.shift();bytes-=JSON.stringify(removed).length;}future.length=0;lastKey='';emit();},select(value:any){selection=value;lastKey='';emit();},setPage(value:string){page=value;selection=null;lastKey='';emit();},beginGroup(){grouped=true;},endGroup(){grouped=false;lastKey='';},undo(){if(!past.length)return;future.push(copy(configuration));const entry=past.pop();bytes-=JSON.stringify(entry).length;configuration=entry;lastKey='';emit();},redo(){if(!future.length)return;past.push(copy(configuration));bytes+=JSON.stringify(configuration).length;configuration=future.pop();lastKey='';emit();},markSaved(value:any,nextRevision:number,sent:any){const canonical=clean(value);if(JSON.stringify(configuration)===JSON.stringify(clean(sent)))configuration=copy(canonical);saved=canonical;revision=nextRevision;emit();},replaceDraft(value:any,nextRevision:number){configuration=clean(value);saved=copy(configuration);revision=nextRevision;past.length=0;future.length=0;bytes=0;lastKey='';emit();},subscribe(listener:(state:any)=>void){listeners.add(listener);return()=>listeners.delete(listener);}};
 }
 Object.assign(window,{sfSchoolStudioModel:{create,registry}});
})();
