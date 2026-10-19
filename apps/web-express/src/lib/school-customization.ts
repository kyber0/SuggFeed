import { currentSchool } from './school-scope';

export const SCHOOL_PALETTES=['navy','forest','purple','burgundy','teal','indigo'] as const;
export const SCHOOL_ICONS=['board','message','care','users','shield','list','calendar','book','building','globe'] as const;
export interface SchoolCategory {id:string;name:string;slug:string;description:string;icon:string;active:boolean;}
export interface SchoolQuestion {id:string;label:string;help:string;type:'short'|'long'|'choice';required:boolean;options:string[];}
export interface SchoolCustomization {
 schemaVersion:1; displayName:string;palette:string;logo:string|null;cover:string|null;
 welcome:{headline:string;intro:string;message:string;help:string;links:{label:string;url:string}[]};
 categories:SchoolCategory[];
 features:{comments:boolean;voting:boolean;roadmap:boolean;sharing:boolean;anonymous:boolean};
 form:{instructions:string;example:string;questions:SchoolQuestion[];attachments:'off'|'optional'|'required'};
 labels:{approved:string;in_progress:string;resolved:string};
 stageDescriptions:{approved:string;in_progress:string;resolved:string};
 email:{invitation:string;introduction:string;digest:'weekly'|'off'};
 formVersion?:string|null;
}
export const customizationDefaults=(categories:SchoolCategory[]=[]):SchoolCustomization=>({schemaVersion:1,displayName:'',palette:'navy',logo:null,cover:null,welcome:{headline:'',intro:'',message:'',help:'',links:[]},categories,features:{comments:true,voting:true,roadmap:true,sharing:true,anonymous:true},form:{instructions:'',example:'',questions:[],attachments:'off'},labels:{approved:'Planned',in_progress:'In progress',resolved:'Completed'},stageDescriptions:{approved:'Approved ideas ready for the next step.',in_progress:'Follow work underway in your school.',resolved:'Community feedback put into action.'},email:{invitation:'',introduction:'',digest:'weekly'},formVersion:null});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object=(value:unknown,keys:string[],label:string):Record<string,any>=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Check '+label+'. Unsupported fields are not accepted.');return value as Record<string,any>;};
const text=(value:unknown,max:number,label:string,min=0):string=>{if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error(`${label} must contain ${min}–${max} characters.`);return value.trim();};
const id=(value:unknown,label:string)=>{if(typeof value!=='string'||!UUID.test(value))throw new Error('Invalid '+label+'.');return value.toLowerCase();};
const flag=(value:unknown)=>{if(typeof value!=='boolean')throw new Error('Choose a valid feature setting.');return value;};
export function normalizeCustomization(value:unknown):SchoolCustomization {
 const p=object(value,['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email','formVersion'],'school customization');
 if(p.schemaVersion!==1||!SCHOOL_PALETTES.includes(p.palette))throw new Error('Choose a supported appearance.');
 const w=object(p.welcome,['headline','intro','message','help','links'],'welcome content');
 if(!Array.isArray(w.links)||w.links.length>5)throw new Error('Use up to five official links.');
 const links=w.links.map((value:unknown)=>{const link=object(value,['label','url'],'official link');const url=new URL(text(link.url,500,'Link address',1));if(url.protocol!=='https:'||url.username||url.password)throw new Error('Official links must use HTTPS without credentials.');return {label:text(link.label,60,'Link label',1),url:url.href};});
 if(!Array.isArray(p.categories)||p.categories.length>60)throw new Error('Keep at most 60 current and archived categories.');
 const categories=p.categories.map((value:unknown)=>{const c=object(value,['id','name','slug','description','icon','active'],'category');if(!SCHOOL_ICONS.includes(c.icon))throw new Error('Choose a supported category icon.');const slug=text(c.slug,63,'Category address',1);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Use lowercase letters, numbers and hyphens in category addresses.');return {id:id(c.id,'category ID'),name:text(c.name,40,'Category name',1),slug,description:text(c.description,200,'Category description'),icon:c.icon,active:flag(c.active)};});
 if(!categories.some(c=>c.active)||categories.filter(c=>c.active).length>20||new Set(categories.map(c=>c.id)).size!==categories.length||new Set(categories.map(c=>c.slug)).size!==categories.length||new Set(categories.map(c=>c.name.toLowerCase())).size!==categories.length)throw new Error('Use 1–20 active categories with unique names, IDs and addresses.');
 const f=object(p.features,['comments','voting','roadmap','sharing','anonymous'],'community features');
 const form=object(p.form,['instructions','example','questions','attachments'],'submission form');
 if(!['off','optional','required'].includes(form.attachments)||!Array.isArray(form.questions)||form.questions.length>8)throw new Error('Use a supported attachment rule and up to eight questions.');
 const questions=form.questions.map((value:unknown)=>{const q=object(value,['id','label','help','type','required','options'],'question');if(!['short','long','choice'].includes(q.type)||!Array.isArray(q.options))throw new Error('Choose a supported question type.');const options=q.options.map((v:unknown)=>text(v,80,'Choice',1));if((q.type==='choice'&&(options.length<2||options.length>10||new Set(options).size!==options.length))||(q.type!=='choice'&&options.length))throw new Error('Choice questions need 2–10 unique options; text questions have no options.');return {id:id(q.id,'question ID'),label:text(q.label,120,'Question',1),help:text(q.help,240,'Question help'),type:q.type,required:flag(q.required),options};});
 if(new Set(questions.map(q=>q.id)).size!==questions.length)throw new Error('Question IDs must be unique.');
 const descriptions=object(p.stageDescriptions,['approved','in_progress','resolved'],'stage explanations');
 const labels=object(p.labels,['approved','in_progress','resolved'],'progress labels'),email=object(p.email,['invitation','introduction','digest'],'email content');
 if(!['weekly','off'].includes(email.digest))throw new Error('Choose weekly digest or off.');
 return {schemaVersion:1,displayName:text(p.displayName,60,'School display name'),palette:p.palette,logo:p.logo===null?null:id(p.logo,'logo'),cover:p.cover===null?null:id(p.cover,'cover'),welcome:{headline:text(w.headline,100,'Welcome headline'),intro:text(w.intro,500,'Introduction'),message:text(w.message,1500,'Welcome message'),help:text(w.help,500,'Help information'),links},categories,features:{comments:flag(f.comments),voting:flag(f.voting),roadmap:flag(f.roadmap),sharing:flag(f.sharing),anonymous:flag(f.anonymous)},form:{instructions:text(form.instructions,1000,'Submission instructions'),example:text(form.example,1000,'Submission example'),questions,attachments:form.attachments},labels:{approved:text(labels.approved,40,'Planned label',1),in_progress:text(labels.in_progress,40,'In-progress label',1),resolved:text(labels.resolved,40,'Completed label',1)},stageDescriptions:{approved:text(descriptions.approved,240,'Planned-stage explanation'),in_progress:text(descriptions.in_progress,240,'In-progress explanation'),resolved:text(descriptions.resolved,240,'Completed-stage explanation')},email:{invitation:text(email.invitation,1000,'Invitation welcome'),introduction:text(email.introduction,1000,'Email introduction'),digest:email.digest}};
}
export function schoolPresentation(){return currentSchool()?.customization || customizationDefaults();}
export function schoolFeature(feature:keyof SchoolCustomization['features']){return schoolPresentation().features[feature];}
export function schoolStatusLabel(status:string){const labels=schoolPresentation().labels;return status in labels?labels[status as keyof typeof labels]:status.replace(/_/g,' ');}
export function customizationChanges(previous:SchoolCustomization,next:SchoolCustomization){
 const changes:string[]=[];
 for(const key of ['displayName','palette','logo','cover','welcome','categories','form','labels','stageDescriptions','email'] as const)if(JSON.stringify(previous[key])!==JSON.stringify(next[key]))changes.push(({displayName:'School display name',palette:'Accent palette',logo:'School logo',cover:'Cover image',welcome:'Welcome content and official links',categories:'Categories and their availability',form:'Submission questions and attachment rules',labels:'Public progress labels',stageDescriptions:'Public stage explanations',email:'Email and digest settings'})[key]);
 for(const [key,value] of Object.entries(next.features))if(previous.features[key as keyof typeof previous.features]!==value)changes.push(`${value?'Enable':'Disable'} ${key==='comments'?'new comments':key}`);
 const archived=previous.categories.filter(old=>old.active&&!next.categories.some(item=>item.id===old.id&&item.active)).length;
 if(archived)changes.push(`Archive ${archived} ${archived===1?'category':'categories'}; existing ideas remain readable`);
 const required=next.form.questions.filter(q=>q.required&&!previous.form.questions.some(old=>old.id===q.id&&old.required)).length;
 if(required)changes.push(`Add ${required} required ${required===1?'question':'questions'} for future submissions`);
 return changes;
}
export function schoolCategories(includeArchived=false){
 const configured=currentSchool()?.customization?.categories;
 const categories=configured || ['Facilities','Learning','Safety','Student life','Other'].map(name=>({id:name,name,slug:name.toLowerCase().replace(/ /g,'-'),description:'',icon:'message',active:true}));
 return categories.filter(category=>includeArchived||category.active);
}
export function schoolCategory(value:string){return schoolCategories(true).find(c=>c.id===value||c.name===value||c.slug===value);}
