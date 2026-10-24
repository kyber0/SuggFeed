import generated from './knowledge.generated.json';
import type {Entry,Knowledge} from './types';
export const entries=generated.app.entries as Entry[];
export const knowledgeVersion=generated.app.version;
export function knowledgeFor(schoolId?:string):Knowledge {const school=(generated.schools as Record<string,Knowledge>)[schoolId||''];return {version:knowledgeVersion+(school?':'+school.version:''),entries:school?[...entries.map(e=>({...e,scope:'app' as const})),...school.entries.map(e=>({...e,scope:'school' as const}))]:entries.map(e=>({...e,scope:'app' as const}))};}
