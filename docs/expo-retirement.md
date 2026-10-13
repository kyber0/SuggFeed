# Standalone native app retirement

The Expo/React Native application has been removed from the repository, workspace, dependency graph, CI and EAS deployment workflow. The website's mobile layouts, PWA, browser push handler, in-app notifications and email notifications are unchanged.

## Preserved data and local recovery

No database migration drops or clears existing profile tokens, outbox records, notification preferences or history. Existing migrations remain immutable. Shared database notification structures are not synonymous with Expo; they are retained.

Tracked app sources and mobile-only Turbo cache files are recoverable from Git history. The ignored local mobile environment file was moved to `.local-backups/expo-retirement/mobile.env.local`, verified by hash, and protected by the root Git ignore rule. Do not commit or print this backup. Rebuildable app dependencies and Expo local caches were removed; shared dependencies and web caches were retained.

## Separate hosted rollout (not performed by this cleanup)

Repository removal does not change installed native clients, existing EAS projects or already-deployed Edge Functions. Rehearse these updates in staging, then obtain production deployment approval:

1. Deploy the updated `register-push-token` compatibility endpoint. POST returns HTTP 410 with `PUSH_CHANNEL_RETIRED`, OPTIONS remains supported, other methods return 405. It does not parse token bodies or access the database. Keep the tombstone available for older clients; simply deleting its local source would leave a previously deployed function active.
2. Deploy `review-submission` and `add-comment` with the updated shared notification helper. They no longer read Expo tokens or send requests to Expo's delivery API. Configured, opted-in email delivery remains unchanged.
3. The mobile-secret Turnstile bypass is removed. Deploy updated `submit-feedback` and `vote-submission`, which use that shared security utility, so old mobile credentials cannot bypass spam checks. Verify website Turnstile flows in staging before release.
4. Verify the hosted endpoint returns 410, no new Expo tokens are written, no requests are sent to Expo, and website feedback, voting, comments and email continue to work.

The repository no longer requires GitHub `EXPO_TOKEN` or `EXPO_PUBLIC_*` deployment secrets. Operators may remove obsolete secrets, including the hosted `MOBILE_APP_SECRET`, only after confirming no other authorized project uses them. Do not automatically delete remote Expo projects, revoke credentials, remove store listings or purge stored tokens.

## Validation

Run a frozen workspace install, remaining application checks, Express build/typecheck/tests, and the Deno shared security/notification tests. New tests use mocked network requests; no email, push or live database writes are performed. Check the website's mobile navigation, roadmap, PWA and submission form independently of the deleted native app.
