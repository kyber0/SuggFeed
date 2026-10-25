import {studentIdeaState} from './student-experience';
import {boardFilters,WORK_STAGES} from './staff-board';
import {schoolDesign} from './school-design';
import {schoolColors} from './school-colors';
import type {SchoolCustomization} from './school-customization';
import {publicItem,groupTreeByCategory,groupTimelineByMonth,buildWorkTimeline} from './roadmap';
export const PREVIEW_PAGES=['home','feed','roadmap','idea','profile','submit','notifications','inbox','staff'] as const;
export const PREVIEW_VARIANTS:Record<string,[string,string][]>= {
 home:[['returning','Returning member'],['visitor','Visitor'],['new','New member'],['attention','Reply needed'],['unavailable','Activity unavailable']],
 feed:[['browse','Browse'],['following','Following'],['no-results','No matches']],roadmap:[['board','Status board'],['tree','By category'],['timeline','Work calendar'],['done','Completed']],
 idea:[['page','Full page'],['discussion','Discussion'],['drawer','Reading panel']],profile:[['ideas','My ideas'],['saved','Saved & following'],['account','Account']],
 submit:[['categories','Choose category'],['questions','Write the idea'],['review','Review before sending'],['receipt','Private receipt'],['recovery','Recovery notice'],['invalid','Validation guidance']],
 notifications:[['updates','School updates'],['decisions','Review decisions']],inbox:[['needs-reply','Needs a reply'],['waiting','Reply sent'],['resolved','Resolved']],
 staff:[['board','Work board'],['list','Work list'],['calendar','Target-date calendar'],['overview','Overview'],['reviews','Review queue'],['my-work','Work tasks'],['review-detail','Review panel'],['work-detail','Progress panel']]
};
export const PREVIEW_SCENARIOS=['populated','empty','disabled'] as const;
export function buildSchoolPreviewModel(input:{school:{id:string;slug:string;name:string};configuration:SchoolCustomization;page:string;scenario:string;theme:string;view?:string;variant?:string}){
 const {school,page,scenario}=input;const configuration=structuredClone(input.configuration);if(scenario==='disabled')for(const key of Object.keys(configuration.features))configuration.features[key as keyof typeof configuration.features]=false;
 const student='10000000-0000-4000-8000-000000000011';
 const categories=configuration.categories.filter(c=>c.active);const fallback=configuration.categories[0];
 const titles=['More shaded seating near the library','A quieter space for independent study','Water refill stations in every building'];
 const rows=titles.map((title,index)=>{const category=categories[index%Math.max(categories.length,1)]||fallback;return {id:'20000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),title,description:'A fictional campus idea for reviewing this workspace. A welcoming and accessible space would help students throughout the school day.',status:['approved','in_progress','resolved'][index],category:category?.name||'Campus',categories:{name:category?.name||'Campus'},category_id:category?.id,user_id:student,author:{display_name:'Jordan Reyes'},vote_count:12+index*4,comment_count:0,created_at:'2026-10-01T08:00:00Z',updated_at:'2026-10-10T08:00:00Z',started_at:index?'2026-10-05T08:00:00Z':null,resolved_at:index===2?'2026-10-10T08:00:00Z':null,resolved_at_estimated:false,progress_percent:index===2?100:index===1?45:0,is_blocked:false,staff_note:'Fictional school progress note for this preview.',status_history:[]};});
 const feed=scenario==='empty'?[]:rows;const items=feed.map(publicItem);const requestedView=input.view||configuration.design?.pages.roadmap?.view||'board';const view=['tree','timeline','done'].includes(requestedView)?requestedView:'board';
 const board=boardFilters({}),lanes=WORK_STAGES.map(stage=>{const cards=feed.filter(item=>item.status===stage.status);return {...stage,count:cards.length,page:1,pageCount:1,from:cards.length?1:0,to:cards.length,hasPrevious:false,hasNext:false,items:cards};});
 const currentPath=page==='staff'?'/admin/work':page==='home'||page==='submit'?'/':page==='idea'?'/idea/'+rows[0].id:'/'+page;
 const model:any={studentIdeaState,studentBrief:{items:feed.slice(0,3),itemsUnavailable:false,needsReply:0},profileSection:page==='inbox'||page==='notifications'?'inbox':'ideas',inboxView:page==='inbox'?'needs-reply':'updates',ideaPage:{items:feed,page:1,pages:1,total:feed.length},title:'Private school preview',renderMode:'studio',currentPath,school,schoolName:school.name,schoolId:school.id,schoolBase:'/s/'+school.slug,schoolDesignPage:page,schoolColorStyle:schoolColors.style(configuration.palette)+(configuration.design?schoolDesign.style(configuration.design):schoolDesign.cursorStyle()),schoolCustomization:configuration,schoolCustomizationVersion:0,schoolCategories:categories,configuration,previewTheme:input.theme,user:{id:student,full_name:'Jordan Reyes',email:'student@example.invalid',role:page==='staff'?'admin':'student'},signedIn:true,activeSection:'board',members:[{id:student,display_name:'Jordan Reyes'}],lanes,supabaseUrl:'',supabaseAnonKey:'',accountArea:false,platformDashboard:false,demoWorkspace:school.slug==='demo',feed,totalCount:feed.length,matchingCount:items.length,hasMore:false,page:1,pageCount:1,sortBy:'all',category:'All',search:'',categories:categories.map(c=>c.name),items,counts:Object.fromEntries(['approved','in_progress','resolved'].map(status=>[status,items.filter(item=>item.status===status).length])),filters:page==='staff'?board:{search:'',category:'all',stage:'all',view,page:1},recentlyCompleted:[],treeData:groupTreeByCategory(items,categories.map(c=>c.name)),timelineData:groupTimelineByMonth(items),workTimeline:buildWorkTimeline(items),submission:rows[0],comments:[],profile:{display_name:'Jordan Reyes'},submissions:feed,bookmarks:[],preferences:{},previewPage:page,previewScenario:scenario};
 const variant=input.variant||PREVIEW_VARIANTS[page]?.[0]?.[0]||'';model.previewVariant=variant;
 if(page==='home'){if(variant==='visitor'){model.user=null;model.signedIn=false;}if(variant==='new')model.studentBrief.items=[];if(variant==='attention')model.studentBrief.needsReply=2;if(variant==='unavailable')Object.assign(model.studentBrief,{items:[],itemsUnavailable:true,needsReply:null});}
 if(page==='feed'){model.following=variant==='following';if(variant==='no-results'){model.feed=[];model.search='Fictional topic with no matches';model.totalCount=0;}}
 if(page==='profile'){model.profileSection=variant;model.bookmarks=variant==='saved'?feed:[];}
 if(page==='notifications')model.inboxView=variant;
 if(page==='inbox')model.inboxView=variant;
 if(page==='idea'){if(variant==='drawer')model.currentPath='/feed';if(variant==='discussion'&&scenario!=='empty')model.comments=[{id:'30000000-0000-4000-8000-000000000001',body:'A fictional comment: this would make the space easier to use.',author:{display_name:'Casey Navarro'},created_at:'2026-10-20T08:00:00Z',parent_id:null,text_revision:1}];}
 if(page==='staff'){
  model.user.role='admin';model.staffMembers=[];model.savedViews=[];model.counts={...model.counts,pending:scenario==='empty'?0:2,rejected:0,all:feed.length+2};
  if(['list','calendar'].includes(variant)){model.presentation=variant;if(variant==='calendar')model.calendar={month:'2026-10',year:2026,monthNumber:10,page:1,pages:1,total:feed.length,items:feed.map((item:any)=>({...item,target_date:'2026-10-27'}))};}
  if(variant==='overview'){model.currentPath='/admin';model.activeSection='overview';model.portalFocus={overdue:0,reports:0};}
  if(['reviews','review-detail'].includes(variant)){model.currentPath='/admin/reviews';model.activeSection='queue';model.status='pending';model.submissions=feed.map((item:any)=>({...item,status:'pending'}));model.filters={status:'pending',search:'',assignment:'all',priority:'all',overdue:'false'};model.perPage=15;model.totalCount=model.submissions.length;}
  if(variant==='my-work'){model.currentPath='/admin/work';model.activeSection='work';model.routing=false;model.presentation='tasks';model.assignmentBase='/admin/work';model.isAssignmentAdmin=true;model.view='mine';model.state={staff:[],teams:[],members:[],settings:{enabled:false}};model.list={page:1,availability:{},items:[]};}
 }
 return model;
}
