import {assistantConfig} from './config';
import {supabasePlatform} from '../supabase';
export type Store=(action:string,data?:Record<string,unknown>)=>Promise<unknown>; // Database JSON is validated at the service boundary.
export function storeFor(school:string|null,actor:string|null):Store {return async(action,data={})=>{const result=await supabasePlatform.rpc('assistant_action',{p_school:school,p_actor:actor,p_action:action,p_data:data}).abortSignal(AbortSignal.timeout(assistantConfig.storageTimeoutMs));if(result.error)throw new Error('assistant_storage_unavailable');return result.data;};}

export function knowledgeStoreFor(school:string,actor:string|null):Store {return async(action,data={})=>{const result=await supabasePlatform.rpc('assistant_knowledge_action',{p_school:school,p_actor:actor,p_action:action,p_data:data}).abortSignal(AbortSignal.timeout(assistantConfig.storageTimeoutMs));if(result.error)throw Object.assign(new Error('School FAQ operation unavailable'),{code:result.error.code});return result.data;};}
