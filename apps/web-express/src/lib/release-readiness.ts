import { legalDetails } from './legal';

function httpsOrigin(value: string | undefined): boolean {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash &&
      !/^(localhost|127\.|\[::1\])/.test(url.hostname) && !/example|placeholder|your-project/i.test(url.hostname);
  } catch { return false; }
}

function configured(value: string | undefined): boolean {
  return !!value?.trim() && !/placeholder|your[-_]|change[-_]|example|fallback/i.test(value);
}

/** Configuration shape checks only; never expose credential values or contact providers. */
export function releaseConfigurationChecks(env: NodeJS.ProcessEnv = process.env) {
  const legal = legalDetails(env);
  const anon = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return [
    { name: 'Canonical HTTPS APP_ORIGIN', pass: httpsOrigin(env.APP_ORIGIN) },
    { name: 'HTTPS Supabase origin', pass: httpsOrigin(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL) },
    { name: 'Supabase public key configured', pass: configured(anon) },
    { name: 'Separate Supabase service key configured', pass: configured(env.SUPABASE_SERVICE_ROLE_KEY) && env.SUPABASE_SERVICE_ROLE_KEY !== anon },
    { name: 'SESSION_SECRET configured (32+ characters)', pass: configured(env.SESSION_SECRET) && (env.SESSION_SECRET?.length || 0) >= 32 },
    { name: 'Platform legal operator configured', pass: !!legal.operatorName && configured(legal.operatorName) },
    { name: 'Platform privacy mailbox configured', pass: !!legal.privacyEmail && configured(legal.privacyEmail) },
  ];
}

// These are verified project gaps, not switches that an environment flag can waive.
export const sharedServiceReleaseBlockers = [
  'Shared-school isolation and verified school onboarding are not implemented.',
  'A safe demo-school backfill and tenant authorization verification are not implemented.',
  'Platform/school notices, lawful grounds, eligibility, retention and processing agreements need approval.',
  'Hosted access controls, distributed abuse protection, rights handling and recovery require operational evidence.',
];
