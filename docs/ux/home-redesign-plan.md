# Home landing page redesign plan

Status: approved design reference. See `home-ideas-implementation.md` for delivered scope, checks and remaining limitations.

## Goal

Home should feel welcoming, polished and immediately useful. Students should understand their school context, primary action and anything needing attention within seconds. Keep SuggFeed visible alongside school branding and preserve the established Home / Ideas / Profile navigation.

## Current problems

- Personal activity and the marketing hero read as separate interfaces.
- Share feedback, Share an idea and Submit suggestion repeat the same action.
- Tracking, introduction and community browsing compete for attention.
- Large containers, nested borders and repeated headings lengthen the page.

## Page composition

### 1. Shared header

Keep Home / Ideas / Profile. Show compact school identity alongside SuggFeed. Keep school switching in the account menu. Do not add a school banner or a Submit button to desktop/mobile primary navigation.

### 2. Cohesive welcome area

Use a balanced desktop composition: purpose, headline and actions on the left; relevant activity or an illustration on the right. On mobile, order purpose and primary action before supporting content.

Default headline: **Your ideas can shape your campus.**

Supporting text: Share what could be better, support useful suggestions, and follow your school’s progress.

Respect published school welcome content and branding.

| Student state | Presentation |
| --- | --- |
| Visitor | Explain participation, permitted browsing and sign-in |
| New signed-in student | Welcome and simple first contribution |
| Returning student | Recent identified ideas and personal activity link |
| Reply needed | Compact actionable private-question reminder |
| Access paused | Accurate explanation and permitted next step |

Do not turn zero counts into attention banners. Unavailable data must not appear as zero activity. Keep private activity scoped to the verified account and school.

### 3. Contribution and tracking

Integrate existing Share/Track functionality into the welcome composition. Share an idea opens the existing submission flow directly. A few school category shortcuts may preselect a topic. Track an idea opens a compact labeled tracking panel. Avoid a second oversized container repeating instructions. Keep tracking codes private and preserve receipt recovery and submission idempotency.

### 4. Community highlights

Show three to six published ideas with category, consistent public stage label, readable title, short description, persistent support control and clear detail/discussion destination. Supporting must not trigger card navigation. Use one card system shared with Ideas. Provide View all ideas; keep full search and advanced filtering on Ideas.

### 5. Published progress

Show a compact See what’s moving forward section using real school updates or completed outcomes, evidence where available, dates and stage labels. Link to Progress. Omit this section when no genuine published information exists. Do not invent metrics, testimonials or outcomes.

### 6. How it works

Use Share → School review → Follow progress. Retain the existing reference-inspired page-turn motion for this explanation. Make it more prominent for newcomers and secondary/collapsed for returning students. A receipt does not imply approval; do not promise uncommitted response times.

### 7. Help and footer

Sugi stays bottom-right without covering mobile navigation or content. Opening/closing preserves page position. Keep help, privacy and terms accessible. Avoid competing floating controls.

## Visual direction

Minimal, warm and precise. One consistent content width, aligned headings, generous separation between major sections and compact card interiors. Fewer nested borders. Asymmetric desktop hero and clear single-column mobile layout. Use published school colors, with primary actions emphasized and semantic colors reserved for actual states. Maintain equal care in light/dark themes.

One h1; short section headings; comfortable body text; restrained metadata. Long school names and idea titles wrap. Use a lightweight SuggFeed illustration of an idea becoming progress; keep it clearly illustrative. Avoid stock photography, fabricated dashboard figures and decorations resembling controls.

## Motion

Reuse the existing animation system. Coordinate headline/supporting copy/action entrances. The illustration has a brief staged animation that settles. Activity appears gently. Cards have short stagger and subtle hover/press feedback. Support actions respond immediately and reconcile with server state. Tracking has distinct opening, loading, result and retry states. Motion never delays navigation or hides essential content; reduced motion uses readable static presentation and restrained fades.

## Mobile

At 320px and above: school context/headline, primary action, attention reminder if applicable, recent activity, community highlights, published progress and help. No page overflow or automatic carousel. Comfortable targets; no oversized empty hero. Tracking stays accessible with the keyboard open. Sugi and the bottom bar cannot cover important controls.

## Implementation order

1. Unify hero, activity and Share/Track entry points.
2. Refine typography, spacing, cards, color and responsive behavior.
3. Cover visitor, newcomer, returning, unavailable-data and empty-school states.
4. Integrate motion, loading, focus and reduced-motion handling.
5. Update the school editor preview using the actual shared Home components.

## Planned acceptance criteria

Students can identify their school and primary action immediately. Every action has a valid destination. Account/school privacy, voting and submission safeguards remain intact. Long content, empty data, dark mode and reduced motion work. School customization does not break layout.

This is a source-informed plan, not a claim of usability testing. Real-student evaluation and physical-device behavior remain to be evaluated. Automated verification requires a separate request.
