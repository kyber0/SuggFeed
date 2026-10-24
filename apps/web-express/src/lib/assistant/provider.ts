import {assistantConfig as c} from './config';
import {promptFor} from './prompt';
import type {Entry} from './types';
export type Selector=(entries:Entry[],tokens:string[],signal:AbortSignal)=>Promise<string|null>;
export const geminiSelect:Selector=async(entries,tokens,signal)=>{
 const {GoogleGenAI}=await import('@google/genai');const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});const prompt=promptFor(entries,tokens);
 const result=await client.models.generateContent({model:c.model,contents:prompt.contents,config:{systemInstruction:prompt.systemInstruction,temperature:0,maxOutputTokens:c.maxOutputTokens,responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{id:{type:'string',enum:[...entries.map(e=>e.id),'unknown']}},required:['id'],additionalProperties:false},httpOptions:{timeout:c.deadlineMs,retryOptions:{attempts:1}},abortSignal:signal}});
 const parsed=JSON.parse(result.text||'{}');return typeof parsed.id==='string'&&entries.some(e=>e.id===parsed.id)?parsed.id:null;
};
