import { retiredPushRegistration } from '../_shared/retired-push.ts';

// Compatibility tombstone for previously installed native clients.
// No credentials, profile reads, token storage, or delivery are performed.
Deno.serve(retiredPushRegistration);
