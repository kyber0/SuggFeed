import {hasProfanity} from './comment-moderation';
import {contentSafetyConfig} from './content-safety-config';
export function checkProfanity(text: string): boolean { return hasProfanity(text); }
export function submissionVerdict(text: string): 'clear'|'flagged'|'rejected' {
 try {return checkProfanity(text)?contentSafetyConfig.submissions.mode==='reject'?'rejected':'flagged':'clear';}
 catch {console.error('submission_moderation_unavailable');return 'flagged';}
}

import {urgentRules} from './urgent-rules';
import {categoryRules} from './category-rules';
export function checkUrgent(text:string):boolean {
 if(text.length>16000)throw new RangeError('Moderation input exceeds limit');
 const normalized=text.normalize('NFKC').toLowerCase().replace(/\p{Cf}/gu,'').replace(/[013@$]/g,c=>({'0':'o','1':'i','3':'e','@':'a','$':'s'})[c]!);
 return urgentRules.some(rule=>new RegExp(rule.pattern,'iu').test(normalized));
}
export function categorize(text:string,categories:ReadonlyArray<{id:string;name:string;slug?:string;active:boolean}>):string|null {
 const tokens=new Set(text.normalize('NFKC').toLowerCase().slice(0,16000).match(/[\p{L}\p{N}]+/gu)||[]);
 for(const rule of categoryRules)if(rule.keywords.some(word=>tokens.has(word))){const category=categories.find(c=>c.active&&rule.categories.includes((c.slug||c.name).toLowerCase()));if(category)return category.id;}
 return categories.find(c=>c.active&&['other','others','iba'].includes((c.slug||c.name).toLowerCase()))?.id||categories.find(c=>c.active)?.id||null;
}
export function assessSubmission(title:string,description:string,answers:unknown={}) {
 const fields=[title,description,...(answers&&typeof answers==='object'?Object.values(answers):[]).filter((v):v is string=>typeof v==='string').slice(0,8)];
 try {const urgent=checkUrgent(fields.join('\n'));const profane=fields.some(checkProfanity);return {state:urgent?'flagged':profane?contentSafetyConfig.submissions.mode==='reject'?'rejected':'flagged':'clear',urgent};}
 catch{console.error('submission_safety_unavailable');return {state:'flagged',urgent:true};}
}
