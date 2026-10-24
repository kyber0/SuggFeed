export type Locale='en'|'fil'|'taglish';
export interface Entry {id:string;status:'published';questions:Record<Locale,string>;answers:Record<Locale,string>;keywords:string[];route:string;}
export interface Knowledge {version:string;entries:Entry[];}
export interface Reply {success:true;name:'Sugi';source:'cache'|'ai'|'fallback';answered:boolean;answer:string;faqId?:string;version:string;locale:Locale;requestId?:string;feedbackToken?:string;entries?:Entry[];}
