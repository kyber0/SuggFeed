import { PROGRESS_KINDS } from './progress';
export const DEFAULT_DIGEST_KINDS=[...PROGRESS_KINDS];
export function digestPreferenceFields(body:Record<string,unknown>) {
  if(body.digest_paused!==undefined && typeof body.digest_paused!=='boolean')throw new Error('Choose whether weekly email is paused.');
  const kinds=body.digest_kinds;
  if(kinds!==undefined && (!Array.isArray(kinds) || kinds.length<1 || kinds.length>PROGRESS_KINDS.length || new Set(kinds).size!==kinds.length || kinds.some(x=>typeof x!=='string' || !(PROGRESS_KINDS as readonly string[]).includes(x))))throw new Error('Choose at least one valid weekly email update type.');
  return {...(body.digest_paused===undefined?{}:{digest_paused:body.digest_paused}),...(kinds===undefined?{}:{digest_kinds:kinds as string[]})};
}
export function digestConsent(preference:any) {return preference?.weekly_digest===true && preference.digest_paused!==true;}
export function filterDigestEntries<T extends {kind:string}>(entries:T[],preference:any):T[] {
  const kinds=Array.isArray(preference?.digest_kinds)?preference.digest_kinds:DEFAULT_DIGEST_KINDS;
  return entries.filter(entry=>kinds.includes(entry.kind));
}
/** A scheduler window, not a promise of delivery at a precise time. */
export function nextDigestWindow(now=new Date()) {
  const local=new Date(now.getTime()+8*3600000),day=local.getUTCDay();
  local.setUTCDate(local.getUTCDate()+((8-day)%7 || 7));local.setUTCHours(0,0,0,0);
  return new Date(local.getTime()-8*3600000).toISOString();
}
