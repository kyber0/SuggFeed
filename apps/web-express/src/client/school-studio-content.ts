/** Content bindings are an allowlist, shared by the canvas and its parent controller. */
namespace SfStudioContent {
 export type Field={value:string;fallback:string;max:number;required:boolean;multiline:boolean};
 export function field(p:any,schoolName:string,id:string,property:string):Field|null{
  let value:unknown,fallback='',max=0,required=false,multiline=false;
  if(id==='school.identity'&&property==='displayName'){value=p.displayName;fallback=schoolName;max=60;}
  if(id==='home.hero'&&['headline','intro','message'].includes(property)){value=p.welcome[property];max=property==='headline'?100:property==='intro'?500:1500;multiline=property!=='headline';fallback=property==='headline'?'Your ideas can shape your campus.':property==='intro'?'Share what could be better, support useful suggestions, and follow your school’s progress.':'';}
  if(id==='home.links'&&property==='help'){value=p.welcome.help;max=500;multiline=true;}
  if(id==='home.links'&&/^link-label:\d+$/.test(property)){const link=p.welcome.links[Number(property.split(':')[1])];if(link){value=link.label;max=60;required=true;}}
  if(id.startsWith('category:')&&['name','description'].includes(property)){const row=p.categories.find((c:any)=>c.id===id.slice(9));if(row){value=row[property];max=property==='name'?40:200;required=property==='name';multiline=property==='description';if(property==='description')fallback='Share feedback and suggestions about this topic.';}}
  if(id.startsWith('question:')&&['label','help'].includes(property)){const row=p.form.questions.find((q:any)=>q.id===id.slice(9));if(row){value=row[property];max=property==='label'?120:240;required=property==='label';multiline=property==='help';}}
  if(id==='submission.instructions'&&['instructions','example'].includes(property)){value=p.form[property];max=1000;multiline=true;}
  if(id==='progress.labels'&&/^(label|description):(approved|in_progress|resolved)$/.test(property)){const [kind,status]=property.split(':');value=p[kind==='label'?'labels':'stageDescriptions'][status];max=kind==='label'?40:240;required=kind==='label';multiline=kind==='description';}
  return typeof value==='string'&&max?{value,fallback,max,required,multiline}:null;
 }
 export function change(p:any,schoolName:string,id:string,property:string,value:unknown){const f=field(p,schoolName,id,property);if(!f||typeof value!=='string'||value.length>f.max||f.required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return null;
  if(property.startsWith('link-label:')){const links=structuredClone(p.welcome.links);links[Number(property.split(':')[1])].label=value;return {componentId:id,property:'links',value:links};}
  if(id==='progress.labels'){const [kind,status]=property.split(':'),key=kind==='label'?'labels':'stageDescriptions';return {componentId:id,property:key,value:{...p[key],[status]:value}};}
  return {componentId:id,property,value};
 }
}
