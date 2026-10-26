# Measured code health

Revision `6da6fc938ad1b5539138ba717728ff372bc8a40d`. Audit date: 26 October 2026 (Asia/Manila).

## Methods and scope

- Facts below come from raw artifacts in `raw/`. AST analysis covers authored Express server/client/API TypeScript plus retained Edge runtime files; it excludes tests, dependencies and generated output.
- Cyclomatic = 1 plus branch/loop/catch/case/conditional/logical decisions, excluding nested function bodies. Nesting counts decision depth. Length counts physical lines, so compressed code can evade line limits. AST values are comparable within this audit; they are not ESLint/Sonar cyclomatic scores.
- Cognitive complexity is the actual SonarJS S3776 rule (3.0.5), loaded directly because initializing the full plugin failed against the temporary TypeScript dependency layout. ESLint existing 10.13.0 + TypeScript parser 8.72.0 were used. Threshold 0 collects positive-complexity functions; 0-score functions are not reported by that rule.
- Fan-in/out count distinct local static import/re-export paths, including type imports; instability is undefined for isolated files. Runtime SCCs exclude explicit type-only imports. Classic browser globals, literal `require()` of generated artifacts, template includes and SQL calls are additional edges reviewed manually.
- jscpd 4.0.5: 50-token / 5-line minimum over TS, authored CSS and SQL migrations. Eta templates, tests, generated bundles and dependencies are outside its denominator. Immutable migration duplication is not an instruction to edit history.
- Knip 5.85.0 treated browser scripts, tests and build scripts as entry points. Its candidates are not deletions: it misclassifies Deno/CLI entry points. No source was changed.

## Summary

| Metric | Fact |
|---|---|
| revision | 6da6fc938ad1b5539138ba717728ff372bc8a40d |
| modules | 204 |
| functions | 3021 |
| sourceLines | 15511 |
| any | 399 |
| casts | 1018 |
| emptyCatch | 40 |
| tsIgnore | 0 |
| ccOver20 | 82 |
| cognitiveOver15 | 129 |
| nestingOver3 | 68 |
| lengthOver60 | 60 |
| paramsOver5 | 5 |
| filesOver300 | 14 |
| classicBrowserFiles | 80 |

## Top functions by cyclomatic estimate

| File / lines | Function | CC | Nesting | Lines | Params |
|---|---|---:|---:|---:|---:|
| apps/web-express/src/client/school-studio-inspector.ts:14–59 | render | 122 | 14 | 46 | 0 |
| apps/web-express/src/client/staff-tools.ts:82–145 | navigate | 82 | 4 | 64 | 5 |
| apps/web-express/src/lib/assistant/actions.ts:3–43 | replyActions | 67 | 2 | 41 | 3 |
| apps/web-express/src/client/staff-progress.ts:325–367 | callback to form.addEventListener | 65 | 4 | 43 | 1 |
| apps/web-express/src/lib/assistant/service.ts:15–36 | ask | 63 | 5 | 22 | 2 |
| apps/web-express/src/client/auth-callback.ts:2–183 | callback to document.addEventListener | 59 | 7 | 182 | 0 |
| apps/web-express/src/client/school-customization.ts:81–91 | callback to window.addEventListener | 57 | 5 | 11 | 1 |
| apps/web-express/src/client/school-studio-tools.ts:6–15 | changes | 52 | 4 | 10 | 2 |
| apps/web-express/src/routes/api.ts:122–184 | callback to asyncHandler | 51 | 2 | 63 | 2 |
| apps/web-express/src/lib/progress.ts:25–63 | validateProgress | 50 | 1 | 39 | 2 |
| apps/web-express/src/client/staff-progress.ts:214–252 | updateComposer | 47 | 7 | 39 | 0 |
| apps/web-express/src/client/school-studio-frame.ts:105–125 | callback to document.addEventListener | 45 | 10 | 21 | 1 |
| apps/web-express/src/client/school-studio-inspector.ts:61–67 | callback to host.addEventListener | 45 | 5 | 7 | 1 |
| apps/web-express/src/client/school-studio-inspector.ts:68–81 | callback to host.addEventListener | 45 | 3 | 14 | 1 |
| apps/web-express/src/routes/assignments.ts:17–41 | callback to router.get | 45 | 4 | 25 | 3 |
| apps/web-express/src/client/staff-review.ts:88–108 | paintWorkflow | 43 | 4 | 21 | 1 |
| apps/web-express/src/lib/school-preview-model.ts:17–42 | buildSchoolPreviewModel | 41 | 3 | 26 | 1 |
| apps/web-express/src/client/school-studio-frame.ts:60–73 | patch | 40 | 6 | 14 | 1 |
| apps/web-express/src/lib/school-context.ts:16–58 | <anonymous> | 39 | 2 | 43 | 0 |
| apps/web-express/src/client/navigation.ts:77–113 | destinationScreen | 37 | 3 | 37 | 1 |
| apps/web-express/src/client/school-submission.ts:23–57 | updateSchema | 36 | 5 | 35 | 1 |
| apps/web-express/src/client/staff-review.ts:378–421 | loadActivity | 36 | 3 | 44 | 0 |
| apps/web-express/src/lib/digests.ts:32–100 | deliverWeeklyDigests | 35 | 8 | 69 | 1 |
| apps/web-express/src/client/assistant.ts:23–28 | callback to form.addEventListener | 34 | 3 | 6 | 1 |
| apps/web-express/src/client/feed.ts:371–432 | sfLoadMoreFeed | 34 | 3 | 62 | 0 |
| apps/web-express/src/client/school-studio-frame.ts:93–101 | callback to window.addEventListener | 33 | 3 | 9 | 1 |
| apps/web-express/src/client/staff-review.ts:322–359 | callback to form.addEventListener | 33 | 4 | 38 | 1 |
| apps/web-express/src/client/staff-tools.ts:236–257 | paintPointer | 33 | 5 | 22 | 0 |
| apps/web-express/src/lib/platform-dashboard.ts:121–148 | platformSchool | 33 | 4 | 28 | 4 |
| apps/web-express/src/lib/school-images.ts:10–29 | finishSchoolImage | 33 | 3 | 20 | 1 |

## Positive cognitive scores above 15

| File / line | Cognitive |
|---|---:|
| apps/web-express/src/client/school-studio-inspector.ts:14 | 153 |
| apps/web-express/src/client/staff-tools.ts:82 | 91 |
| apps/web-express/src/lib/digests.ts:32 | 87 |
| apps/web-express/src/client/staff-progress.ts:214 | 76 |
| apps/web-express/src/client/school-studio-inspector.ts:61 | 70 |
| apps/web-express/src/lib/assistant/actions.ts:3 | 70 |
| apps/web-express/src/client/school-studio-frame.ts:60 | 67 |
| apps/web-express/src/lib/assistant/service.ts:15 | 66 |
| apps/web-express/src/client/school-submission.ts:23 | 64 |
| apps/web-express/src/client/school-studio-tools.ts:6 | 62 |
| apps/web-express/src/client/school-studio-inspector.ts:68 | 59 |
| apps/web-express/src/routes/assignments.ts:17 | 59 |
| apps/web-express/src/client/submit-panel.ts:182 | 58 |
| apps/web-express/src/client/staff-progress.ts:325 | 57 |
| apps/web-express/src/client/school-customization.ts:81 | 55 |
| apps/web-express/src/lib/school-preview-model.ts:17 | 53 |
| apps/web-express/src/client/staff-review.ts:88 | 51 |
| apps/web-express/src/client/school-studio-frame.ts:78 | 49 |
| apps/web-express/src/client/school-studio-content.ts:4 | 47 |
| apps/web-express/src/client/school-studio-frame.ts:105 | 45 |
| apps/web-express/src/client/assistant.ts:23 | 44 |
| apps/web-express/src/client/auth-callback.ts:2 | 43 |
| apps/web-express/src/client/staff-tools.ts:236 | 43 |
| apps/web-express/src/client/feed.ts:371 | 42 |
| apps/web-express/src/client/navigation.ts:77 | 40 |
| apps/web-express/src/client/platform-dashboard.ts:1 | 40 |
| apps/web-express/src/client/school-customization.ts:14 | 39 |
| apps/web-express/src/client/school-design.ts:41 | 37 |
| apps/web-express/src/lib/school-context.ts:16 | 37 |
| apps/web-express/src/client/school-customization.ts:34 | 36 |
| apps/web-express/src/client/school-design.ts:18 | 36 |
| apps/web-express/src/lib/assistant/provider.ts:14 | 36 |
| apps/web-express/src/lib/platform-dashboard.ts:121 | 35 |
| apps/web-express/src/client/file-upload.ts:10 | 34 |
| apps/web-express/src/client/school-studio-inspector.ts:9 | 34 |
| apps/web-express/src/client/submit-panel.ts:266 | 34 |
| apps/web-express/src/routes/api.ts:122 | 34 |
| apps/web-express/src/client/roadmap.ts:207 | 33 |
| apps/web-express/src/client/school-design.ts:26 | 33 |
| apps/web-express/src/client/staff-review.ts:378 | 33 |
| apps/web-express/src/lib/submission-safety.ts:5 | 33 |
| apps/web-express/src/client/staff-progress.ts:124 | 32 |
| apps/web-express/src/routes/profile.ts:75 | 32 |
| apps/web-express/src/client/home.ts:364 | 31 |
| apps/web-express/src/client/idea-detail-drawer.ts:429 | 31 |
| apps/web-express/src/lib/community.ts:104 | 31 |
| apps/web-express/src/lib/roadmap.ts:59 | 31 |
| apps/web-express/src/client/assignments.ts:7 | 30 |
| apps/web-express/src/client/school-customization.ts:57 | 30 |
| apps/web-express/src/client/staff-review.ts:161 | 30 |
| apps/web-express/src/client/staff-review.ts:322 | 30 |
| apps/web-express/src/routes/school-customization-preview.ts:18 | 30 |
| apps/web-express/src/client/school-customization.ts:15 | 29 |
| apps/web-express/src/client/school-customization.ts:45 | 29 |
| apps/web-express/src/lib/community.ts:53 | 29 |
| apps/web-express/src/routes/platform-dashboard.ts:8 | 29 |
| apps/web-express/src/client/feed.ts:319 | 28 |
| apps/web-express/src/client/staff-progress.ts:258 | 28 |
| apps/web-express/src/lib/school-images.ts:10 | 28 |
| apps/web-express/src/client/community.ts:127 | 27 |
| apps/web-express/src/lib/comments.ts:7 | 27 |
| apps/web-express/src/client/animations/split-text.ts:5 | 26 |
| apps/web-express/src/client/roadmap.ts:271 | 26 |
| apps/web-express/src/client/roadmap.ts:387 | 26 |
| apps/web-express/src/lib/progress.ts:25 | 26 |
| apps/web-express/src/routes/community.ts:104 | 26 |
| apps/web-express/src/client/controls.ts:46 | 25 |
| apps/web-express/src/client/feed.ts:229 | 25 |
| apps/web-express/src/client/staff-review.ts:210 | 25 |
| apps/web-express/src/client/school-studio-frame.ts:127 | 24 |
| apps/web-express/src/client/staff-progress.ts:287 | 24 |
| apps/web-express/src/client/comment-edit.ts:12 | 23 |
| apps/web-express/src/client/engagement.ts:2 | 23 |
| apps/web-express/src/client/feed.ts:182 | 23 |
| apps/web-express/src/client/idea.ts:147 | 23 |
| apps/web-express/src/client/roadmap-timeline.ts:58 | 23 |
| apps/web-express/src/client/school-customization.ts:20 | 23 |
| apps/web-express/src/client/school-studio-frame.ts:93 | 22 |
| apps/web-express/src/client/school-studio-model.ts:16 | 22 |
| apps/web-express/src/client/staff-progress.ts:151 | 22 |
| apps/web-express/src/lib/assistant/school-knowledge.ts:11 | 22 |
| apps/web-express/src/routes/admin.ts:44 | 22 |
| apps/web-express/src/client/community.ts:64 | 21 |
| apps/web-express/src/client/roadmap-timeline.ts:33 | 21 |
| apps/web-express/src/client/controls.ts:20 | 20 |
| apps/web-express/src/client/profile.ts:64 | 20 |
| apps/web-express/src/client/school-customization.ts:80 | 20 |
| apps/web-express/src/client/staff-tools.ts:188 | 20 |
| apps/web-express/src/lib/community.ts:63 | 20 |
| apps/web-express/src/lib/supabase.ts:65 | 20 |
| apps/web-express/src/routes/community.ts:52 | 20 |
| apps/web-express/src/routes/platform-dashboard.ts:53 | 20 |
| apps/web-express/src/client/school-customization.ts:77 | 19 |
| apps/web-express/src/client/school-customization.ts:106 | 19 |
| apps/web-express/src/lib/school-customization.ts:48 | 19 |
| apps/web-express/src/routes/schools.ts:39 | 19 |
| apps/web-express/src/client/auth-modal.ts:220 | 18 |
| apps/web-express/src/client/controls.ts:25 | 18 |
| apps/web-express/src/client/idea-detail-drawer.ts:374 | 18 |
| apps/web-express/src/client/notifications.ts:32 | 18 |
| apps/web-express/src/client/roadmap-timeline.ts:101 | 18 |
| apps/web-express/src/client/roadmap.ts:136 | 18 |
| apps/web-express/src/client/school-customization.ts:1 | 18 |
| apps/web-express/src/client/school-customization.ts:64 | 18 |
| apps/web-express/src/lib/assignment/service.ts:5 | 18 |
| apps/web-express/src/lib/platform-dashboard.ts:102 | 18 |
| apps/web-express/src/lib/progress-evidence.ts:193 | 18 |
| supabase/functions/_shared/notifications.ts:151 | 18 |
| apps/web-express/src/client/admin-staff.ts:174 | 17 |
| apps/web-express/src/client/comment-edit.ts:32 | 17 |
| apps/web-express/src/client/saved-searches.ts:130 | 17 |
| apps/web-express/src/client/school-submission.ts:10 | 17 |
| apps/web-express/src/client/staff-review.ts:269 | 17 |
| apps/web-express/src/client/staff-tools.ts:53 | 17 |
| apps/web-express/src/routes/assistant-admin.ts:22 | 17 |
| apps/web-express/src/routes/schools.ts:292 | 17 |
| apps/web-express/src/client/admin-staff.ts:55 | 16 |
| apps/web-express/src/client/auth-modal.ts:36 | 16 |
| apps/web-express/src/client/profile.ts:45 | 16 |
| apps/web-express/src/client/roadmap-views.ts:18 | 16 |
| apps/web-express/src/client/school-customization.ts:68 | 16 |
| apps/web-express/src/client/school-studio-frame.ts:11 | 16 |
| apps/web-express/src/lib/assistant/sources.ts:6 | 16 |
| apps/web-express/src/lib/safety-email.ts:5 | 16 |
| apps/web-express/src/lib/shared-rate-limit.ts:9 | 16 |
| apps/web-express/src/routes/community.ts:90 | 16 |
| apps/web-express/src/routes/engagement.ts:45 | 16 |
| apps/web-express/src/routes/school-customization.ts:31 | 16 |
| apps/web-express/src/routes/schools.ts:79 | 16 |

## Module coupling and change frequency

| Module | Lines | Fan-in | Fan-out | Instability | 12-month changes | Max CC | Max cognitive |
|---|---:|---:|---:|---:|---:|---:|---:|
| apps/web-express/api/index.ts | 40 | 0 | 0 | — | 1 | 5 | 3 |
| apps/web-express/src/client/account-security.ts | 91 | 0 | 0 | — | 7 | 28 | 12 |
| apps/web-express/src/client/activity.ts | 10 | 0 | 0 | — | 2 | 6 | 5 |
| apps/web-express/src/client/admin-analytics.ts | 150 | 0 | 0 | — | 4 | 7 | 4 |
| apps/web-express/src/client/admin-overview.ts | 66 | 0 | 0 | — | 3 | 12 | 13 |
| apps/web-express/src/client/admin-staff.ts | 284 | 0 | 0 | — | 6 | 15 | 17 |
| apps/web-express/src/client/animations/config.ts | 12 | 0 | 0 | — | 3 | 3 | 2 |
| apps/web-express/src/client/animations/controller.ts | 32 | 0 | 0 | — | 1 | 9 | 15 |
| apps/web-express/src/client/animations/cursor.ts | 23 | 0 | 0 | — | 2 | 17 | 8 |
| apps/web-express/src/client/animations/home-motion.ts | 59 | 0 | 0 | — | 2 | 13 | 12 |
| apps/web-express/src/client/animations/magnetic-button.ts | 23 | 0 | 0 | — | 1 | 9 | 10 |
| apps/web-express/src/client/animations/marquee.ts | 34 | 0 | 0 | — | 1 | 9 | 5 |
| apps/web-express/src/client/animations/page-transition.ts | 16 | 0 | 0 | — | 1 | 12 | 3 |
| apps/web-express/src/client/animations/reveal.ts | 25 | 0 | 0 | — | 1 | 14 | 13 |
| apps/web-express/src/client/animations/smooth-scroll.ts | 27 | 0 | 0 | — | 1 | 10 | 5 |
| apps/web-express/src/client/animations/split-text.ts | 16 | 0 | 0 | — | 2 | 14 | 26 |
| apps/web-express/src/client/animations/stagger.ts | 4 | 0 | 0 | — | 1 | 2 | 1 |
| apps/web-express/src/client/assignments.ts | 24 | 0 | 0 | — | 1 | 24 | 30 |
| apps/web-express/src/client/assistant-admin.ts | 11 | 0 | 0 | — | 1 | 17 | 15 |
| apps/web-express/src/client/assistant-documents.ts | 18 | 0 | 0 | — | 1 | 12 | 9 |
| apps/web-express/src/client/assistant-knowledge.ts | 22 | 0 | 0 | — | 2 | 13 | 11 |
| apps/web-express/src/client/assistant.ts | 49 | 0 | 0 | — | 8 | 34 | 44 |
| apps/web-express/src/client/auth-callback.ts | 185 | 0 | 0 | — | 10 | 59 | 43 |
| apps/web-express/src/client/auth-confirm.ts | 27 | 0 | 0 | — | 1 | 10 | 11 |
| apps/web-express/src/client/auth-modal.ts | 327 | 0 | 0 | — | 7 | 22 | 18 |
| apps/web-express/src/client/auth.ts | 130 | 0 | 0 | — | 7 | 12 | 6 |
| apps/web-express/src/client/comment-edit.ts | 110 | 0 | 0 | — | 3 | 18 | 23 |
| apps/web-express/src/client/community.ts | 170 | 0 | 0 | — | 15 | 24 | 27 |
| apps/web-express/src/client/confirmation.ts | 42 | 0 | 0 | — | 1 | 6 | 3 |
| apps/web-express/src/client/controls.ts | 63 | 0 | 0 | — | 1 | 16 | 25 |
| apps/web-express/src/client/empty-state.ts | 19 | 0 | 0 | — | 1 | 5 | 3 |
| apps/web-express/src/client/engagement.ts | 74 | 0 | 0 | — | 5 | 17 | 23 |
| apps/web-express/src/client/events.ts | 154 | 0 | 0 | — | 4 | 9 | 7 |
| apps/web-express/src/client/feed.ts | 447 | 0 | 0 | — | 15 | 34 | 42 |
| apps/web-express/src/client/file-upload.ts | 38 | 0 | 0 | — | 1 | 16 | 34 |
| apps/web-express/src/client/globals.d.ts | 116 | 0 | 0 | — | 15 | 0 | 0 |
| apps/web-express/src/client/header.ts | 25 | 0 | 0 | — | 2 | 4 | 2 |
| apps/web-express/src/client/home.ts | 405 | 0 | 0 | — | 11 | 23 | 31 |
| apps/web-express/src/client/idea-detail-drawer.ts | 547 | 0 | 0 | — | 16 | 27 | 31 |
| apps/web-express/src/client/idea.ts | 233 | 0 | 0 | — | 10 | 22 | 23 |
| apps/web-express/src/client/interaction-feedback.ts | 75 | 0 | 0 | — | 2 | 17 | 9 |
| apps/web-express/src/client/invitations.ts | 28 | 0 | 0 | — | 1 | 4 | 3 |
| apps/web-express/src/client/navigation-cache.ts | 75 | 0 | 0 | — | 2 | 15 | 11 |
| apps/web-express/src/client/navigation.ts | 157 | 0 | 0 | — | 9 | 37 | 40 |
| apps/web-express/src/client/notifications.ts | 87 | 0 | 0 | — | 8 | 17 | 18 |
| apps/web-express/src/client/platform-dashboard.ts | 38 | 0 | 0 | — | 1 | 16 | 40 |
| apps/web-express/src/client/preferences.ts | 22 | 0 | 0 | — | 5 | 12 | 4 |
| apps/web-express/src/client/profile.ts | 114 | 0 | 0 | — | 9 | 18 | 20 |
| apps/web-express/src/client/public-history.ts | 35 | 0 | 0 | — | 3 | 14 | 15 |
| apps/web-express/src/client/responsive.ts | 40 | 0 | 0 | — | 3 | 6 | 5 |
| apps/web-express/src/client/roadmap-timeline.ts | 159 | 0 | 0 | — | 2 | 18 | 23 |
| apps/web-express/src/client/roadmap-views.ts | 27 | 0 | 0 | — | 4 | 11 | 16 |
| apps/web-express/src/client/roadmap.ts | 450 | 0 | 0 | — | 15 | 23 | 33 |
| apps/web-express/src/client/saved-searches.ts | 177 | 0 | 0 | — | 7 | 13 | 17 |
| apps/web-express/src/client/school-colors.ts | 16 | 0 | 0 | — | 1 | 3 | 3 |
| apps/web-express/src/client/school-context.ts | 77 | 0 | 0 | — | 3 | 18 | 15 |
| apps/web-express/src/client/school-customization.ts | 134 | 0 | 0 | — | 12 | 57 | 55 |
| apps/web-express/src/client/school-design.ts | 51 | 0 | 0 | — | 5 | 27 | 37 |
| apps/web-express/src/client/school-studio-content.ts | 22 | 0 | 0 | — | 1 | 31 | 47 |
| apps/web-express/src/client/school-studio-frame.ts | 130 | 0 | 0 | — | 8 | 45 | 67 |
| apps/web-express/src/client/school-studio-inspector.ts | 92 | 0 | 0 | — | 9 | 122 | 153 |
| apps/web-express/src/client/school-studio-model.ts | 33 | 0 | 0 | — | 5 | 24 | 22 |
| apps/web-express/src/client/school-studio-tools.ts | 18 | 0 | 0 | — | 1 | 52 | 62 |
| apps/web-express/src/client/school-submission.ts | 63 | 0 | 0 | — | 2 | 36 | 64 |
| apps/web-express/src/client/school-ui.ts | 15 | 0 | 0 | — | 3 | 10 | 14 |
| apps/web-express/src/client/scroll-reveal.ts | 3 | 0 | 0 | — | 3 | 0 | 0 |
| apps/web-express/src/client/staff-login.ts | 57 | 0 | 0 | — | 2 | 6 | 4 |
| apps/web-express/src/client/staff-portal.ts | 20 | 0 | 0 | — | 1 | 9 | 8 |
| apps/web-express/src/client/staff-progress.ts | 377 | 0 | 0 | — | 10 | 65 | 76 |
| apps/web-express/src/client/staff-review.ts | 518 | 0 | 0 | — | 13 | 43 | 51 |
| apps/web-express/src/client/staff-tools.ts | 416 | 0 | 0 | — | 18 | 82 | 91 |
| apps/web-express/src/client/student-access.ts | 25 | 0 | 0 | — | 1 | 11 | 11 |
| apps/web-express/src/client/student-experience.ts | 17 | 0 | 0 | — | 1 | 13 | 14 |
| apps/web-express/src/client/submission-recovery.ts | 181 | 0 | 0 | — | 7 | 19 | 11 |
| apps/web-express/src/client/submission-safety.ts | 15 | 0 | 0 | — | 2 | 9 | 12 |
| apps/web-express/src/client/submission-storage.ts | 60 | 0 | 0 | — | 4 | 25 | 6 |
| apps/web-express/src/client/submit-panel.ts | 490 | 0 | 0 | — | 14 | 30 | 58 |
| apps/web-express/src/client/system-ux.ts | 35 | 0 | 0 | — | 2 | 4 | 3 |
| apps/web-express/src/client/theme-init.ts | 11 | 0 | 0 | — | 5 | 11 | 10 |
| apps/web-express/src/client/theme.ts | 10 | 0 | 0 | — | 3 | 3 | 2 |
| apps/web-express/src/client/toast.ts | 93 | 0 | 0 | — | 3 | 7 | 5 |
| apps/web-express/src/lib/analytics.ts | 34 | 1 | 0 | 0 | 1 | 10 | 11 |
| apps/web-express/src/lib/assignment/service.ts | 11 | 3 | 2 | 0.4 | 1 | 12 | 18 |
| apps/web-express/src/lib/assistant/actions.ts | 44 | 1 | 2 | 0.667 | 2 | 67 | 70 |
| apps/web-express/src/lib/assistant/cache.ts | 6 | 1 | 3 | 0.75 | 1 | 7 | 3 |
| apps/web-express/src/lib/assistant/config.ts | 2 | 9 | 0 | 0 | 6 | 0 | 0 |
| apps/web-express/src/lib/assistant/documents.ts | 31 | 5 | 2 | 0.286 | 2 | 15 | 11 |
| apps/web-express/src/lib/assistant/feedback.ts | 5 | 1 | 3 | 0.75 | 1 | 7 | 2 |
| apps/web-express/src/lib/assistant/knowledge.ts | 6 | 1 | 1 | 0.5 | 2 | 4 | 2 |
| apps/web-express/src/lib/assistant/limits.ts | 7 | 3 | 2 | 0.4 | 1 | 7 | 4 |
| apps/web-express/src/lib/assistant/log.ts | 7 | 1 | 4 | 0.8 | 1 | 9 | 4 |
| apps/web-express/src/lib/assistant/normalize.ts | 10 | 4 | 2 | 0.333 | 4 | 10 | 9 |
| apps/web-express/src/lib/assistant/prompt.ts | 6 | 1 | 2 | 0.667 | 3 | 2 | 0 |
| apps/web-express/src/lib/assistant/provider.ts | 28 | 1 | 4 | 0.8 | 7 | 9 | 36 |
| apps/web-express/src/lib/assistant/school-knowledge.ts | 24 | 4 | 4 | 0.5 | 1 | 27 | 22 |
| apps/web-express/src/lib/assistant/service.ts | 37 | 2 | 12 | 0.857 | 9 | 63 | 66 |
| apps/web-express/src/lib/assistant/sources.ts | 15 | 2 | 3 | 0.6 | 1 | 14 | 16 |
| apps/web-express/src/lib/assistant/store.ts | 9 | 10 | 2 | 0.167 | 3 | 2 | 1 |
| apps/web-express/src/lib/assistant/tools.ts | 4 | 0 | 0 | — | 1 | 1 | 0 |
| apps/web-express/src/lib/assistant/topics.ts | 4 | 4 | 0 | 0 | 2 | 4 | 3 |
| apps/web-express/src/lib/assistant/types.ts | 6 | 11 | 0 | 0 | 8 | 0 | 0 |
| apps/web-express/src/lib/auth-assurance.ts | 46 | 5 | 1 | 0.167 | 8 | 16 | 7 |
| apps/web-express/src/lib/auth-email-template.ts | 5 | 0 | 0 | — | 1 | 0 | 0 |
| apps/web-express/src/lib/category-rules.ts | 9 | 1 | 0 | 0 | 1 | 0 | 0 |
| apps/web-express/src/lib/comment-moderation-config.ts | 4 | 2 | 1 | 0.333 | 2 | 0 | 0 |
| apps/web-express/src/lib/comment-moderation-words.ts | 25 | 1 | 0 | 0 | 2 | 0 | 0 |
| apps/web-express/src/lib/comment-moderation.ts | 52 | 2 | 2 | 0.5 | 2 | 7 | 7 |
| apps/web-express/src/lib/comments.ts | 32 | 4 | 5 | 0.556 | 2 | 12 | 27 |
| apps/web-express/src/lib/community.ts | 135 | 5 | 4 | 0.444 | 8 | 25 | 31 |
| apps/web-express/src/lib/content-moderation.ts | 26 | 2 | 4 | 0.667 | 1 | 7 | 9 |
| apps/web-express/src/lib/content-safety-config.ts | 9 | 7 | 0 | 0 | 1 | 0 | 0 |
| apps/web-express/src/lib/data.ts | 358 | 19 | 4 | 0.174 | 16 | 13 | 10 |
| apps/web-express/src/lib/digest-email.ts | 50 | 1 | 1 | 0.5 | 5 | 9 | 5 |
| apps/web-express/src/lib/digest-preferences.ts | 20 | 2 | 1 | 0.333 | 1 | 11 | 6 |
| apps/web-express/src/lib/digests.ts | 111 | 2 | 6 | 0.75 | 7 | 35 | 87 |
| apps/web-express/src/lib/engagement.ts | 59 | 8 | 1 | 0.111 | 2 | 13 | 4 |
| apps/web-express/src/lib/feed-account.ts | 63 | 6 | 4 | 0.4 | 3 | 9 | 5 |
| apps/web-express/src/lib/feed-filters.ts | 18 | 4 | 2 | 0.333 | 2 | 7 | 5 |
| apps/web-express/src/lib/identity.ts | 68 | 1 | 2 | 0.667 | 6 | 24 | 15 |
| apps/web-express/src/lib/invitation-email.ts | 37 | 1 | 3 | 0.75 | 4 | 13 | 9 |
| apps/web-express/src/lib/legal.ts | 10 | 5 | 0 | 0 | 1 | 8 | 4 |
| apps/web-express/src/lib/navigation-context.ts | 37 | 4 | 1 | 0.2 | 3 | 8 | 5 |
| apps/web-express/src/lib/navigation-data.ts | 60 | 1 | 3 | 0.75 | 4 | 12 | 9 |
| apps/web-express/src/lib/platform-dashboard.ts | 149 | 2 | 3 | 0.6 | 1 | 33 | 35 |
| apps/web-express/src/lib/progress-evidence.ts | 228 | 2 | 5 | 0.714 | 4 | 28 | 18 |
| apps/web-express/src/lib/progress.ts | 121 | 8 | 3 | 0.273 | 4 | 50 | 26 |
| apps/web-express/src/lib/read-budget.ts | 39 | 3 | 1 | 0.25 | 1 | 22 | 13 |
| apps/web-express/src/lib/release-readiness.ts | 38 | 0 | 1 | 1 | 2 | 10 | 4 |
| apps/web-express/src/lib/request-path.ts | 5 | 1 | 0 | 0 | 2 | 1 | 0 |
| apps/web-express/src/lib/roadmap.ts | 257 | 3 | 3 | 0.5 | 9 | 26 | 31 |
| apps/web-express/src/lib/safety-email.ts | 22 | 2 | 3 | 0.6 | 1 | 18 | 16 |
| apps/web-express/src/lib/school-colors.ts | 3 | 5 | 0 | 0 | 2 | 0 | 0 |
| apps/web-express/src/lib/school-context.ts | 60 | 1 | 7 | 0.875 | 13 | 39 | 37 |
| apps/web-express/src/lib/school-customization-access.ts | 13 | 2 | 2 | 0.5 | 1 | 12 | 14 |
| apps/web-express/src/lib/school-customization.ts | 65 | 16 | 2 | 0.111 | 3 | 22 | 19 |
| apps/web-express/src/lib/school-design.ts | 7 | 4 | 0 | 0 | 2 | 0 | 0 |
| apps/web-express/src/lib/school-domains.ts | 18 | 1 | 0 | 0 | 1 | 5 | 2 |
| apps/web-express/src/lib/school-enrollment.ts | 16 | 1 | 0 | 0 | 2 | 12 | 14 |
| apps/web-express/src/lib/school-images.ts | 30 | 2 | 1 | 0.333 | 2 | 33 | 28 |
| apps/web-express/src/lib/school-jobs.ts | 19 | 2 | 2 | 0.5 | 1 | 8 | 10 |
| apps/web-express/src/lib/school-onboarding.ts | 26 | 6 | 1 | 0.143 | 2 | 5 | 5 |
| apps/web-express/src/lib/school-path.ts | 10 | 3 | 0 | 0 | 3 | 5 | 2 |
| apps/web-express/src/lib/school-preview-model.ts | 43 | 2 | 6 | 0.75 | 8 | 41 | 53 |
| apps/web-express/src/lib/school-scope.ts | 30 | 35 | 2 | 0.054 | 4 | 4 | 2 |
| apps/web-express/src/lib/security.ts | 27 | 6 | 0 | 0 | 3 | 7 | 5 |
| apps/web-express/src/lib/session-store.ts | 64 | 1 | 0 | 0 | 2 | 4 | 3 |
| apps/web-express/src/lib/shared-rate-limit.ts | 50 | 1 | 3 | 0.75 | 2 | 24 | 16 |
| apps/web-express/src/lib/staff-board.ts | 152 | 2 | 3 | 0.6 | 6 | 12 | 15 |
| apps/web-express/src/lib/staff-workspace.ts | 103 | 10 | 5 | 0.333 | 8 | 12 | 10 |
| apps/web-express/src/lib/student-experience.ts | 32 | 5 | 1 | 0.167 | 1 | 15 | 13 |
| apps/web-express/src/lib/submission-context.ts | 20 | 4 | 1 | 0.2 | 2 | 6 | 3 |
| apps/web-express/src/lib/submission-safety.ts | 12 | 2 | 4 | 0.667 | 1 | 12 | 33 |
| apps/web-express/src/lib/supabase.ts | 109 | 50 | 1 | 0.02 | 10 | 24 | 20 |
| apps/web-express/src/lib/urgent-rules.ts | 11 | 1 | 0 | 0 | 1 | 0 | 0 |
| apps/web-express/src/lib/workflow.ts | 47 | 2 | 4 | 0.667 | 4 | 18 | 2 |
| apps/web-express/src/routes/account-security.ts | 16 | 1 | 1 | 0.5 | 1 | 2 | 1 |
| apps/web-express/src/routes/admin.ts | 115 | 1 | 4 | 0.8 | 12 | 17 | 22 |
| apps/web-express/src/routes/api.ts | 388 | 1 | 17 | 0.944 | 18 | 51 | 34 |
| apps/web-express/src/routes/assignments.ts | 49 | 1 | 5 | 0.833 | 4 | 45 | 59 |
| apps/web-express/src/routes/assistant-admin.ts | 35 | 1 | 9 | 0.9 | 3 | 17 | 17 |
| apps/web-express/src/routes/assistant.ts | 20 | 1 | 11 | 0.917 | 6 | 16 | 15 |
| apps/web-express/src/routes/auth.ts | 70 | 1 | 3 | 0.75 | 10 | 18 | 6 |
| apps/web-express/src/routes/community.ts | 135 | 1 | 8 | 0.889 | 16 | 20 | 26 |
| apps/web-express/src/routes/digests.ts | 34 | 1 | 3 | 0.75 | 4 | 9 | 4 |
| apps/web-express/src/routes/engagement.ts | 81 | 2 | 6 | 0.75 | 5 | 14 | 16 |
| apps/web-express/src/routes/feed.ts | 58 | 1 | 5 | 0.833 | 10 | 4 | 3 |
| apps/web-express/src/routes/home.ts | 53 | 1 | 7 | 0.875 | 10 | 5 | 2 |
| apps/web-express/src/routes/idea.ts | 47 | 1 | 3 | 0.75 | 2 | 7 | 8 |
| apps/web-express/src/routes/legal.ts | 23 | 1 | 1 | 0.5 | 3 | 1 | 0 |
| apps/web-express/src/routes/notifications.ts | 20 | 1 | 3 | 0.75 | 5 | 11 | 9 |
| apps/web-express/src/routes/platform-dashboard.ts | 104 | 1 | 4 | 0.8 | 1 | 26 | 29 |
| apps/web-express/src/routes/profile.ts | 141 | 1 | 7 | 0.875 | 12 | 22 | 32 |
| apps/web-express/src/routes/progress-evidence.ts | 48 | 1 | 4 | 0.8 | 2 | 8 | 2 |
| apps/web-express/src/routes/progress.ts | 35 | 1 | 5 | 0.833 | 6 | 3 | 2 |
| apps/web-express/src/routes/public-history.ts | 18 | 1 | 3 | 0.75 | 1 | 5 | 4 |
| apps/web-express/src/routes/roadmap.ts | 47 | 1 | 3 | 0.75 | 10 | 8 | 4 |
| apps/web-express/src/routes/saved-searches.ts | 52 | 1 | 6 | 0.857 | 3 | 11 | 5 |
| apps/web-express/src/routes/school-branding.ts | 8 | 1 | 3 | 0.75 | 1 | 8 | 5 |
| apps/web-express/src/routes/school-customization-preview.ts | 43 | 1 | 4 | 0.8 | 18 | 15 | 30 |
| apps/web-express/src/routes/school-customization.ts | 73 | 1 | 8 | 0.889 | 5 | 19 | 16 |
| apps/web-express/src/routes/school-members.ts | 43 | 1 | 2 | 0.667 | 1 | 19 | 10 |
| apps/web-express/src/routes/school-submissions.ts | 36 | 1 | 4 | 0.8 | 2 | 18 | 14 |
| apps/web-express/src/routes/schools.ts | 352 | 6 | 11 | 0.647 | 24 | 24 | 19 |
| apps/web-express/src/routes/security-maintenance.ts | 25 | 1 | 3 | 0.75 | 2 | 24 | 14 |
| apps/web-express/src/routes/staff-workspace.ts | 146 | 1 | 7 | 0.875 | 11 | 21 | 15 |
| apps/web-express/src/routes/student-access.ts | 50 | 1 | 3 | 0.75 | 1 | 13 | 10 |
| apps/web-express/src/routes/submission-safety.ts | 25 | 1 | 11 | 0.917 | 3 | 11 | 10 |
| apps/web-express/src/server.ts | 374 | 0 | 44 | 1 | 33 | 15 | 14 |
| apps/web-express/src/sw.ts | 210 | 0 | 0 | — | 13 | 16 | 13 |
| apps/web-express/src/types/index.ts | 73 | 4 | 0 | 0 | 3 | 0 | 0 |
| supabase/functions/_shared/notifications.ts | 314 | 0 | 0 | — | 6 | 13 | 18 |
| supabase/functions/_shared/retired-push.ts | 21 | 1 | 1 | 0.5 | 1 | 3 | 2 |
| supabase/functions/_shared/retired-school-endpoint.ts | 10 | 9 | 1 | 0.1 | 1 | 2 | 1 |
| supabase/functions/_shared/security.ts | 110 | 2 | 0 | 0 | 6 | 9 | 7 |
| supabase/functions/add-comment/index.ts | 4 | 0 | 1 | 1 | 6 | 0 | 0 |
| supabase/functions/archive-old-submissions/index.ts | 4 | 0 | 1 | 1 | 4 | 0 | 0 |
| supabase/functions/get-attachments/index.ts | 4 | 0 | 1 | 1 | 2 | 0 | 0 |
| supabase/functions/invite-staff/index.ts | 4 | 0 | 1 | 1 | 5 | 0 | 0 |
| supabase/functions/lookup-by-tracking-code/index.ts | 4 | 0 | 1 | 1 | 4 | 0 | 0 |
| supabase/functions/my-activity/index.ts | 4 | 0 | 1 | 1 | 5 | 0 | 0 |
| supabase/functions/register-push-token/index.ts | 6 | 0 | 1 | 1 | 3 | 0 | 0 |
| supabase/functions/review-submission/index.ts | 4 | 0 | 1 | 1 | 5 | 0 | 0 |
| supabase/functions/submit-feedback/index.ts | 4 | 0 | 1 | 1 | 3 | 0 | 0 |
| supabase/functions/vote-submission/index.ts | 4 | 0 | 1 | 1 | 8 | 0 | 0 |

## Duplication blocks

| First file / line | Second file / line | Lines | Interpretation |
|---|---|---:|---|
| supabase/migrations/202610120008_community_workflows.sql:67 | supabase/migrations/202610130010_guided_workflows.sql:353 | 46 | Historical migration replacement: retain history |
| supabase/migrations/202610180004_school_customization.sql:67 | supabase/migrations/202610200002_school_custom_colors.sql:8 | 38 | Historical migration replacement: retain history |
| supabase/migrations/202610110003_public_progress.sql:96 | supabase/migrations/202610130010_guided_workflows.sql:196 | 36 | Historical migration replacement: retain history |
| supabase/migrations/202609280004_user_bookmarks_reports_shares.sql:127 | supabase/migrations/202609280005_fix_report_comment_overload.sql:3 | 30 | Historical migration replacement: retain history |
| supabase/migrations/202610120008_community_workflows.sql:112 | supabase/migrations/202610130010_guided_workflows.sql:405 | 24 | Historical migration replacement: retain history |
| supabase/migrations/202610120008_community_workflows.sql:135 | supabase/migrations/202610130010_guided_workflows.sql:432 | 19 | Historical migration replacement: retain history |
| supabase/migrations/202610110003_public_progress.sql:173 | supabase/migrations/202610130010_guided_workflows.sql:302 | 19 | Historical migration replacement: retain history |
| apps/web-express/src/client/idea-detail-drawer.ts:294 | apps/web-express/src/client/idea.ts:125 | 18 | Inspect duplicated behavior before extraction |
| apps/web-express/src/routes/home.ts:9 | apps/web-express/src/routes/idea.ts:4 | 16 | Inspect duplicated behavior before extraction |
| apps/web-express/src/routes/feed.ts:7 | apps/web-express/src/routes/idea.ts:4 | 16 | Inspect duplicated behavior before extraction |
| apps/web-express/src/client/idea-detail-drawer.ts:345 | apps/web-express/src/client/idea.ts:42 | 16 | Inspect duplicated behavior before extraction |
| apps/web-express/src/client/idea-detail-drawer.ts:277 | apps/web-express/src/client/idea.ts:10 | 15 | Inspect duplicated behavior before extraction |
| supabase/migrations/202610120008_community_workflows.sql:167 | supabase/migrations/202610130010_guided_workflows.sql:328 | 14 | Historical migration replacement: retain history |
| supabase/migrations/202610110004_progress_evidence.sql:108 | supabase/migrations/202610120006_progress_evidence_hardening.sql:66 | 14 | Historical migration replacement: retain history |
| supabase/migrations/202610110004_progress_evidence.sql:43 | supabase/migrations/202610120006_progress_evidence_hardening.sql:16 | 13 | Historical migration replacement: retain history |
| supabase/migrations/202610120008_community_workflows.sql:156 | supabase/migrations/202610130010_guided_workflows.sql:318 | 12 | Historical migration replacement: retain history |
| supabase/migrations/202609280004_user_bookmarks_reports_shares.sql:100 | supabase/migrations/202609280005_fix_report_comment_overload.sql:5 | 12 | Historical migration replacement: retain history |
| apps/web-express/src/routes/idea.ts:6 | apps/web-express/src/routes/profile.ts:11 | 12 | Inspect duplicated behavior before extraction |
| apps/web-express/src/routes/admin.ts:7 | apps/web-express/src/routes/api.ts:33 | 12 | Inspect duplicated behavior before extraction |
| supabase/migrations/202610250001_staff_assignment.sql:59 | supabase/migrations/202610250002_urgent_assignment_sla.sql:7 | 11 | Historical migration replacement: retain history |

## Execution and dependency evidence

Commands ran in a separate source snapshot with external service fetch blocked and synthetic credentials. No hosted data was modified. Full check outputs are in `raw/check-results.json` and `raw/node22/check-results.json`.

- Target Node 22.23.4: typecheck passed (14.46s), build passed (10.86s), tests failed (120.46s command duration): 363 tests, 321 pass, 41 fail, one explicit PostgreSQL concurrency skip. The same failure names reproduced on Node24; see `raw/test-outcomes.json`.
- Four existing scoped lint commands passed on the initial environment. These are not a whole-source lint gate.
- Clean frozen pnpm9.15.0 install succeeded in 6.01s. Root pnpm lock resolves Supabase JS2.112.3; standalone app npm lock resolves2.117.2. Node types also differ22.20.1/22.20.5.
- c8 target-runtime coverage: lines/statements70.45%, branches73.15%, functions68.44%, across106 instrumented files (6075 line denominator). See `coverage-node22/coverage-summary.json`. **This is not whole-code coverage**: unexecuted files and VM browser scripts are not reliably included.
- npm audit against the standalone deployment lock reports high body-parser1.20.8 (GHSA-27r3-jxmh-p828) and moderate ip-address (GHSA-rxp7-6hxx-x8q5), no critical advisory. See `raw/dependency-audit.json`. Both have available fixes. Reachability was reviewed, no exploit attempted.
- Outdated commands produced empty JSON; this is not sufficient to certify current maintenance health.
- Secret scans of the tracked snapshot and Git history returned zero findings outside existing exclusions. See `raw/secret-findings-paths.json`; secret values are not included.
- Built startup served account landing via school selection (200); fake-database readiness exceeded3s under blocked external access, then process shut down cleanly. See `raw/onboarding-start.json` and `raw/start.log`.

## Complete machine-readable tables

- `raw/functions.json`: all3021 functions with path/start/end, CC, nesting, length, parameters and matched Sonar cognition. A missing cognition association is not a measured nonzero score; original Sonar diagnostics remain in `raw/cognitive.json`.
- `raw/measured-modules.json`: all204 modules, fan-in/out, instability, physical size, type/catch counts, churn and maximum complexity.
- `raw/static-metrics.json`: graph edges, SCCs, history and measurement definitions.
- `raw/knip.json`:32 candidate files and19 export/type issue modules; ownership review is required, especially Deno and CLI entry points.

## Largest delivered assets (measured bytes, not a network waterfall)

These are individual files, not necessarily loaded together. Generated bundles and their source modules must not be summed as a page transfer. Gzip sizes are locally measured; Brotli/CDN caching and browser use were not measured.

| Asset | Bytes | gzip bytes |
|---|---:|---:|
| apps/web-express/public/css/base.bundle.css | 269978 | 43955 |
| apps/web-express/public/js/vendor/supabase.js | 211907 | 54172 |
| apps/web-express/public/css/enhancements.bundle.css | 186823 | 35381 |
| apps/web-express/public/css/staff.bundle.css | 102169 | 17246 |
| apps/web-express/public/css/platform.bundle.css | 86054 | 14552 |
| apps/web-express/public/css/modules/platform.css | 77095 | 12926 |
| apps/web-express/public/js/school-customization.js | 62350 | 14259 |
| apps/web-express/public/css/modules/idea.css | 60394 | 10420 |
| apps/web-express/public/js/staff-review.js | 60089 | 13528 |
| apps/web-express/public/js/staff-tools.js | 57841 | 12518 |
| apps/web-express/public/css/modules/pages.css | 54980 | 10108 |
| apps/web-express/public/css/modules/feed.css | 50543 | 9721 |
| apps/web-express/public/css/modules/components.css | 50136 | 7780 |
| apps/web-express/public/js/school-studio-inspector.js | 46078 | 11028 |
| apps/web-express/public/js/animations.js | 43279 | 9646 |
