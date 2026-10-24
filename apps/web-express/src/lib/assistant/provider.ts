import type {Model,GoogleGenAI} from '@google/genai';
import {assistantConfig as c} from './config';
import {promptFor} from './prompt';
import type {Source} from './documents';
import type {Locale} from './types';
export type Generator=(sources:Source[],question:string,locale:Locale,schoolName:string,previousQuestions:string[],signal:AbortSignal)=>Promise<unknown>;
export function selectAvailableModel(models:Pick<Model,'name'|'supportedActions'>[]):string {
 const names=models.filter(m=>m.supportedActions?.includes('generateContent')).map(m=>(m.name||'').replace(/^models\//,''));
 const stable=(lite:boolean)=>names.filter(name=>new RegExp('^gemini-(\\d+(?:\\.\\d+)?)-flash'+(lite?'-lite':'')+'$').test(name)).sort((a,b)=>parseFloat(b.slice(7))-parseFloat(a.slice(7)))[0];
 const chosen=names.includes('gemini-flash-lite-latest')?'gemini-flash-lite-latest':stable(true)||(names.includes('gemini-flash-latest')?'gemini-flash-latest':stable(false));
 if(!chosen)throw Object.assign(new Error('No supported stable Flash model is available'),{status:404});return chosen;
}
export function providerErrorCode(error:unknown):string {const text=error instanceof Error?error.message:'';return /api.key.*(?:invalid|not valid|expired)|API_KEY_INVALID/i.test(text)?'api_key':/schema|response.mime|enum|generation.config/i.test(text)?'schema':/thinking|token|budget/i.test(text)?'token_limit':/billing|payment/i.test(text)?'billing':/location|region|country/i.test(text)?'region':/not.supported|unsupported/i.test(text)?'unsupported':'unknown';}
let discovered:Promise<string>|null=null;
async function availableModel(client:GoogleGenAI,signal:AbortSignal):Promise<string>{
 if(c.model!=='auto')return c.model;
 if(!discovered)discovered=(async()=>{const pager=await client.models.list({config:{pageSize:100,abortSignal:signal,httpOptions:{timeout:c.deadlineMs,retryOptions:{attempts:1}}}});const models:Model[]=[];for await(const model of pager){models.push(model);if(models.length>=200)break;}return selectAvailableModel(models);})().catch(error=>{discovered=null;throw error;});
 return discovered;
}
export const geminiAnswer:Generator=async(sources,question,locale,schoolName,previousQuestions,signal)=>{
 const {GoogleGenAI}=await import('@google/genai');const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});const prompt=promptFor(sources,question,locale,schoolName,previousQuestions);
 const model=await availableModel(client,signal);
 const result=await client.models.generateContent({model,contents:prompt.contents,config:{systemInstruction:prompt.systemInstruction,temperature:0,maxOutputTokens:c.maxOutputTokens,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{answer:{type:'STRING'},sourceIds:{type:'ARRAY',items:{type:'STRING',enum:sources.map(s=>s.id)}},unknown:{type:'BOOLEAN'}},required:['answer','sourceIds','unknown']},httpOptions:{timeout:c.deadlineMs,retryOptions:{attempts:1}},abortSignal:signal}});
 return JSON.parse(result.text||'{}');
};
