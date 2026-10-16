import { createHash, randomBytes } from 'node:crypto';
import { legalDetails } from './legal';

export function schoolApplicationsConfigured(env: NodeJS.ProcessEnv = process.env) {
  const legal = legalDetails(env);
  return Boolean(legal.operatorName && legal.privacyEmail);
}
export function invitationToken() { return randomBytes(32).toString('hex'); }
export function invitationHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function validInvitationToken(token: string) { return /^[a-f0-9]{64}$/.test(token); }

// shortcut: instance-local IP budget complements the atomic shared database actor/global budgets.
const applicationAttempts = new Map<string, { count: number; expires: number }>();
export function allowSchoolApplication(key: string, now = Date.now()) {
  const hash = invitationHash(key);
  for (const [id, value] of applicationAttempts) if (value.expires <= now) applicationAttempts.delete(id);
  const value = applicationAttempts.get(hash);
  if (value) { value.count++; return value.count <= 5; }
  if (applicationAttempts.size >= 5000) return false;
  applicationAttempts.set(hash, { count: 1, expires: now + 3600000 });
  return true;
}
export const schoolSettingFields = ['privacy_notice', 'terms_notice', 'privacy_contact', 'school_contact', 'age_policy', 'publication_policy', 'retention_days'] as const;
