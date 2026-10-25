import {supabasePlatform} from '../supabase';
import {requireSchool} from '../school-scope';
export class AssignmentError extends Error {constructor(public status:number,message:string){super(message);}}
const fields:Record<string,string[]>={list:['view','page'],state:[],history:['kind','id'],access:['kind','id'],acknowledge:['kind','id'],notifications:[],'read-notice':['id'],availability:['userId','away','awayUntil'],preferences:['notifications'],settings:['revision','enabled','maxOpen','intervalMinutes','urgentTeam','autoReassignAway','autoReassignOverdue','slas'],team:['id','name','supervisor','backup','active'],assignee:['userId','active','notifications','maxOpen','teams'],rule:['id','kind','category','team','order','active','sla'],assign:['kind','id','version','person','team','note'],retry:['kind','id','version']};
export async function assignmentAction(actor:string,action:string,data:Record<string,unknown>={}) {
 if(!data||Array.isArray(data)||typeof data!=='object'||!fields[action]||Object.keys(data).some(key=>!fields[action].includes(key)))throw new AssignmentError(400,'Check the assignment request fields.');
 const {data:result,error}=await supabasePlatform.rpc('assignment_action',{p_school:requireSchool().id,p_actor:actor,p_action:action,p_data:data});
 if(error){const status=error.code==='42501'?403:error.code==='40001'?409:error.code==='P0002'?404:['22023','22P02','22007','22008','22003','23502','23503','23514','23505'].includes(error.code)?400:503;throw new AssignmentError(status,status===503?'Assignment tools are temporarily unavailable. Your idea is preserved.':error.message);}
 return result;
}
