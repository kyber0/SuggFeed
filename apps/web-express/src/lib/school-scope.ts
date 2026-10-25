import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';
import type { SchoolCustomization } from './school-customization';
import type { AppUser } from '../types';

export interface SchoolScope {
  id: string;
  slug: string;
  name: string;
  actorId: string | null;
  role: 'student' | 'moderator' | 'admin' | null;
  staffRead?:boolean;
  customization?:SchoolCustomization;
  customizationVersion?:number;
  contentRevision?:string;
}
const scopes = new AsyncLocalStorage<SchoolScope>();
export const currentSchool = () => scopes.getStore();
export function requireSchool(): SchoolScope {
  const school = currentSchool();
  if (!school) throw new Error('A verified school context is required.');
  return school;
}
export function runWithSchool<T>(school: SchoolScope, action: () => T): T { return scopes.run(school, action); }
export function schoolUser(req: Request): AppUser | null {
  const school = currentSchool(), user = req.session.user;
  return user && school?.actorId === user.id && school.role ? { ...user, role: school.role } : null;
}
export function schoolCacheKey(key: string): string { const school=requireSchool();return `${school.id}:${school.customizationVersion?'v'+school.customizationVersion+':':''}${school.contentRevision!==undefined?'c'+school.contentRevision+':':''}${key}`; }
