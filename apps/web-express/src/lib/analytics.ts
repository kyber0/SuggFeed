export interface AnalyticsFilters {range:'7d'|'30d'|'90d'|'all';category:string;}
export function analyticsFilters(query:Record<string,unknown>={}):AnalyticsFilters {
 return {range:['7d','30d','90d','all'].includes(String(query.range))?query.range as AnalyticsFilters['range']:'30d',category:typeof query.category==='string'?query.category.trim().slice(0,100) || 'all':'all'};
}
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
const day=(value:Date)=>dayFormatter.format(value);
const isApproved=(status:string)=>['approved','in_progress','resolved'].includes(status);
const percent=(value:number,total:number)=>total?Math.round(value/total*100):0;
const delta=(current:number,previous:number)=>previous?Math.round((current-previous)/previous*100):null;
export function summarizeAnalytics(rows:any[],input:Record<string,unknown>={},now=new Date()) {
 const filters=analyticsFilters(input),today=day(now),dateEnd=Date.parse(today+'T00:00:00Z'),days=filters.range==='7d'?7:filters.range==='90d'?90:30;
 const available=rows.filter(row=>Number.isFinite(Date.parse(row.created_at)) && Date.parse(row.created_at)<=now.getTime()).map(row=>({...row,category:row.categories?.name || row.category || 'Other',vote_count:Math.max(0,Number(row.vote_count)||0),day:day(new Date(row.created_at))}));
 const categoryOptions=[...new Set<string>(available.map(row=>row.category))].sort();
 const matching=available.filter(row=>filters.category==='all' || row.category===filters.category);
 const start=new Date(dateEnd-(days-1)*86400000).toISOString().slice(0,10),previousStart=new Date(dateEnd-(days*2-1)*86400000).toISOString().slice(0,10);
 const selected=matching.filter(row=>filters.range==='all' || row.day>=start),previous=matching.filter(row=>filters.range!=='all' && row.day>=previousStart && row.day<start);
 const approved=selected.filter(row=>isApproved(row.status)).length,previousApproved=previous.filter(row=>isApproved(row.status)).length;
 const votes=selected.reduce((sum,row)=>sum+row.vote_count,0),previousVotes=previous.reduce((sum,row)=>sum+row.vote_count,0);
 const resolved=selected.filter(row=>row.status==='resolved').length,previousResolved=previous.filter(row=>row.status==='resolved').length;
 const average=(total:number,count:number)=>count?Number((total/count).toFixed(1)):0;
 const byDay=new Map<string,{submissions:number;approved:number;votes:number}>(),byCategory=new Map<string,{count:number;votes:number;approved:number;resolved:number}>();
 for(const row of selected){
  const bin=byDay.get(row.day)||{submissions:0,approved:0,votes:0};bin.submissions++;bin.votes+=row.vote_count;if(isApproved(row.status))bin.approved++;byDay.set(row.day,bin);
  const cat=byCategory.get(row.category)||{count:0,votes:0,approved:0,resolved:0};cat.count++;cat.votes+=row.vote_count;if(isApproved(row.status))cat.approved++;if(row.status==='resolved')cat.resolved++;byCategory.set(row.category,cat);
 }
 const dates=filters.range==='all'?[...byDay.keys()].sort():Array.from({length:days},(_,i)=>new Date(dateEnd-(days-1-i)*86400000).toISOString().slice(0,10));
 const timeline=dates.map(key=>({key,date:new Date(key+'T04:00:00Z').toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'}),fullDate:new Date(key+'T04:00:00Z').toLocaleDateString('en-PH',{timeZone:'Asia/Manila',dateStyle:'long'}),...(byDay.get(key)||{submissions:0,approved:0,votes:0})}));
 const categories=[...byCategory].map(([name,value])=>({name,...value,pct:percent(value.count,selected.length)})).sort((a,b)=>b.count-a.count);
 const statusCounts=Object.fromEntries(['pending','approved','in_progress','resolved','rejected'].map(status=>[status,selected.filter(row=>row.status===status).length]));
 return {filters,categoryOptions,snapshotCount:rows.length,comparisonCount:previous.length,recordLimit:2000,capturedAt:now.toISOString(),
  kpis:{totalSubmissions:{value:selected.length,delta:delta(selected.length,previous.length)},approvalRate:{value:percent(approved,selected.length),delta:percent(approved,selected.length)-percent(previousApproved,previous.length)},totalVotes:{value:votes,delta:delta(votes,previousVotes)},resolutionRate:{value:percent(resolved,approved),delta:percent(resolved,approved)-percent(previousResolved,previousApproved)},avgVotes:{value:average(votes,selected.length),delta:delta(average(votes,selected.length),average(previousVotes,previous.length))}},
  statusCounts,timeline,categories,funnel:[['pending','Needs review'],['approved','Planned'],['in_progress','In progress'],['resolved','Completed'],['rejected','Declined']].map(([status,label])=>({status,label,count:statusCounts[status],pct:percent(statusCounts[status],selected.length)}))};
}
