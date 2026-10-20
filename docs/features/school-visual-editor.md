# School visual editor

The platform operator enables the editor for a school. Active school administrators with the existing MFA requirements can then use **School settings → Customize workspace**. No new permissions are granted by presentation settings.

## Workspace versus screen

- **Workspace · all screens:** Colors & theme, school identity, participation settings, email content and locked platform branding/navigation.
- **This screen:** the selected page's layout and actual components. Conditional or unavailable components are marked unavailable rather than pretending they exist in the current view.
- Nine previews: Home, Community ideas, Roadmap, Idea detail, Student profile, Submit idea, School updates, Private messages, and Staff workspace. Staff board's existing narrow-screen fallback still applies; desktop preview exposes its board controls.

Choose a device and light/dark appearance in the toolbar. Edit mode selects components; Preview mode demonstrates navigation without real submissions, account changes or messages. All example records are fictional.

## Theme

Colors & theme offers presets and paired native color pickers/hex fields for primary, secondary, page background, card surface, raised surface, text, muted text, borders and links. Light and dark schemes are independent. Text, muted text and links require at least 4.5:1 against each supported surface. Button foregrounds are derived for contrast. Invalid combinations remain visible as feedback but cannot be saved or published.

Choose bounded corners and Brand, Inter or system typeface. These settings cover resolved student and school staff/admin screens, with school settings taking its published presentation through its independent authorization route. SuggFeed's own wordmark, platform operator pages, shared account pages without school context, and other schools retain their identity. Semantic security and workflow state colors are not editable.

Invitation/digest buttons may use the published light-theme primary and derived readable foreground; existing sender, consent and idempotency controls are unchanged. Email delivery was not exercised for this feature.

## Page and component controls

Each page supports balanced/expanded/focused content, compact/comfortable/airy spacing and outlined/soft/flat cards. Roadmap supports a default view; explicit view links continue to win.

Select a component to override spacing, use a card/raised/transparent surface, or choose text alignment. Reset removes that component's override. The preview shows only properties allowed by the component registry; real user names, ideas and private messages cannot be rewritten by the visual editor.

Optional informational sections have visibility switches. Essential navigation, form fields, membership and moderation controls remain governed by their existing systems. Hidden sections appear faded in edit mode so they can be selected; Preview/published mode hides them. Presentation visibility does not disable backend functionality.

Home sections and feed sidebar blocks can move within their approved sibling group using keyboard-accessible Earlier/Later controls. Their DOM order changes with their reading/tab order; sections cannot be dragged into unrelated containers. Categories/questions/links retain their existing ordering controls.

## Saving and deployment

Save draft → Preview → Review & publish. Theme and layout changes stay private until publication. Existing conflict detection, undo/redo, restoration, editor rollout, policy review and tenant authorization remain active. Cosmetic edits do not clear policy approval. Existing configurations without `design` keep their existing appearance until an administrator chooses to customize.

Deploy both additive migrations in order:
1. `202610210001_school_visual_design.sql`
2. `202610210002_school_component_styles.sql`

These extend strict SQL validation and publication summaries without rewriting accounts, existing drafts or immutable published versions. Both have been applied and recorded on the connected project for this implementation. Build generated assets through the existing Express build. No new dependencies.
