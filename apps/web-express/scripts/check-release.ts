import 'dotenv/config';
import { releaseConfigurationChecks, sharedServiceReleaseBlockers } from '../src/lib/release-readiness';

for (const check of releaseConfigurationChecks()) {
  console.log(`${check.pass ? 'CONFIGURED' : 'MISSING/INVALID'}: ${check.name}`);
}
for (const blocker of sharedServiceReleaseBlockers) console.log(`BLOCKED: ${blocker}`);
console.log('Local checks only: credentials, mailbox delivery, hosted settings and legal compliance have not been verified.');
process.exitCode = 1;
