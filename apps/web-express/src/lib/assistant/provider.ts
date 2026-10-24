import {assistantConfig as c} from './config';
import {promptFor} from './prompt';
import type {Source} from './documents';
import type {Locale} from './types';
export type Generator=(sources:Source[],question:string,locale:Locale,schoolName:string,previousQuestions:string[],signal:AbortSignal)=>Promise<unknown>;
export const geminiAnswer:Generator=async(sources,question,locale,schoolName,previousQuestions,signal)=>{
 const {GoogleGenAI}=await import('@google/genai');const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});const prompt=promptFor(sources,question,locale,schoolName,previousQuestions);
 const result=await client.models.generateContent({model:c.model,contents:prompt.contents,config:{systemInstruction:prompt.systemInstruction,temperature:0,maxOutputTokens:c.maxOutputTokens,responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{answer:{type:'string'},sourceIds:{type:'array',items:{type:'string',enum:sources.map(s=>s.id)}},unknown:{type:'boolean'}},required:['answer','sourceIds','unknown'],additionalProperties:false},httpOptions:{timeout:c.deadlineMs,retryOptions:{attempts:1}},abortSignal:signal}});
 return JSON.parse(result.text||'{}');
};
