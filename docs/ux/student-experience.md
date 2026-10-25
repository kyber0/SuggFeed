# Student experience

The school workspace retains three primary destinations: Home, Ideas, Profile. Staff and platform navigation remain separate. No Submit button was added to desktop or mobile primary navigation.

## Destinations

- **Home:** returning members see their recent identified ideas and open private-question count first. The welcome page and existing Share/Track hub remain available. The introductory motion sequence is expandable for returning members.
- **Ideas:** Browse, Following and Progress share a section navigation. Guests opening Following see a sign-in explanation at that destination. A standalone idea's Back link can return to the same school's referring feed or roadmap filters; browser navigation and drawer scroll handling remain native/existing.
- **Profile:** My ideas, Saved & following, Inbox, Account. Account tools and preferences have their own section. Legacy activity-tab links and the old settings hash continue to resolve.
- **Inbox:** School updates, Private questions, Review decisions. Private questions filter before pagination into needs-reply, reply-sent, resolved and latest. Existing reports and safety notices move into review decisions.
- **Submission status:** `/s/:school/submission/:id` uses the existing owner-read authorization. Pending, held, declined and published ideas have a private owner destination; editing is offered only when the existing RPC permits it. Anonymous tracking remains a separate capability.

## UI and data

The scoped `student.bundle.css` uses existing school colors and shared tokens. Profile cards are compact, headings and long names wrap, personal/inbox tabs wrap on mobile, and controls keep 44px minimum heights. New motion uses transform/opacity and honors reduced motion. The customization preview uses fictional recent activity through the actual shared components.

Recent identified ideas are bounded to three; My ideas is paginated at 15. Private questions are filtered server-side and paginated at 25 with stable ordering and page clamping. A failed Home activity lookup falls back to retry guidance without taking the public welcome/feed offline.

The last student school is remembered only after the existing school, membership, policy and enrollment gates pass on a document request. `/account/home` rechecks membership eligibility before using that preference. Explicit eligible return destinations still take priority. This does not join a school or retain access after removal.

Receipts can be downloaded explicitly as local text files. Private tracking codes never enter a filename or navigation URL; the existing opt-in device-save behavior is unchanged. Private reply drafts stay in memory, survive inbox filter/page changes during the visit, and trigger an unload warning. Filters and lookups cannot race a pending reply.

No database migration, environment variable or dependency is required. Current authentication, submission idempotency, evidence ownership, moderation, consent and enrollment rules remain authoritative.

## Checks and limits

- Express type checking, production build, focused moderation lint and 92 Eta template compilations passed during implementation.
- Synthetic browser layout inspection covered Home, Browse, Progress, Profile, Saved, Account, Updates, Questions, Decisions, owner status and guest Following at 320, 375, 768 and 1440px, including long identity text. No document overflow was observed in that fixture matrix. Dark owner status was also inspected.
- No automated tests were added or run for this UI task. No hosted user records or memberships were changed. Synthetic fixtures do not prove live database authorization, email delivery, confirmation links, Gemini answers, or end-to-end submission/reply delivery. Physical phones, virtual keyboards, screen readers and deployed behavior remain release checks.
