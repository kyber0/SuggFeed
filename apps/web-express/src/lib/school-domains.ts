import {Resolver} from 'node:dns/promises';

const personalDomains=new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.com.ph','ymail.com','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','aol.com','proton.me','protonmail.com','mail.com']);
export function schoolEmailDomain(value:unknown):string | null {
 if(typeof value!=='string')return null;
 const domain=value.trim().toLowerCase();
 if(domain.length>243 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || personalDomains.has(domain))return null;
 return domain;
}
export function domainRecord(domain:string){return '_suggfeed.'+domain;}
export function domainProof(token:string){return 'suggfeed-verification='+token;}
export async function schoolDomainProofPresent(domain:string,token:string):Promise<boolean> {
 if(!schoolEmailDomain(domain) || !/^[a-f0-9]{64}$/.test(token))return false;
 const resolver=new Resolver({timeout:2000,tries:2});
 try{return (await resolver.resolveTxt(domainRecord(domain))).some(parts=>parts.join('')===domainProof(token));}
 catch{return false;}
}
