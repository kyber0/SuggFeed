export type AssistantActionId='signin'|'signup'|'forgot'|'schools'|'share'|'track'|'ideas'|'roadmap'|'profile'|'notifications'|'privacy'|'security'|'settings'|'invitations';
export type Locale='en'|'fil'|'taglish';
export interface Entry {id:string;status:'published';questions:Record<Locale,string>;answers:Record<Locale,string>;keywords:string[];route:string;category?:string;aliases?:Partial<Record<Locale,string[]>>;scope?:'app'|'school';}
export interface Knowledge {version:string;entries:Entry[];schoolStatus?:'available'|'empty'|'unavailable';}
export interface Reply {success:true;name:'Sugi';source:'cache'|'ai'|'fallback';answered:boolean;answer:string;actions?:AssistantActionId[];generated?:boolean;fallbackReason?:string;sources?:{id:string;title:string;url:string;scope:'app'|'school'}[];faqId?:string;scope?:'app'|'school';category?:string;version:string;locale:Locale;requestId?:string;feedbackToken?:string;entries?:Entry[];}
