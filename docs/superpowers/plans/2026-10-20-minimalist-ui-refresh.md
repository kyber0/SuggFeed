# Minimalist UI/UX Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the UI/UX of `apps/web-express` into a clean, minimalist
design with zero gradients and no colored card borders, while preserving all
existing school feedback workflows, accessibility, and responsiveness.

**Architecture:** Update modular CSS files (`tokens.css`, `components.css`,
`pages.css`, `feed.css`, `submit.css`) to eliminate visual noise (conic
gradients, radial spotlights, sheen sweeps, 3D tilts, colored card
borders/glows) and establish a flat, content-first design system with neutral
borders and subtle elevation. Run `scripts/build-styles.cjs` to update
production bundles and enforce design constraints via automated test assertions.

**Tech Stack:** Express, Eta templates, Vanilla CSS modules (CSS Variables /
Design Tokens), Node.js native test runner (`node:test`).

**Spec:** User request: "improve the ui ux of it, but make it just simple and
minimalist, no gradients and colored outlines on cards, plan this very
carefully, use skills on the @.agents/skills".

## Global Constraints

- **No Colored Outlines on Cards:** All cards (`.idea-card`, `.post-card`,
  `.sf-idea-card`, `.card`, `.sip-*-card`) must use clean neutral borders
  (`var(--line)`, `var(--line-2)`, or neutral border tokens) across all states
  (default, hover, active). Hover states must use subtle elevation or neutral
  border shifts, never colored accent rings or glowing borders.
- **Maintain Accessibility & Usability:** WCAG AA contrast (minimum 4.5:1 for
  body copy, 3:1 for large text/icons) must be preserved in both light and dark
  modes. Keyboard focus rings (`:focus-visible`) must remain crisp and
  accessible.
- **Zero Template/Data Regressions:** Do not alter Eta template semantics, data
  bindings, IDs, or form actions. All changes are strictly styling and
  presentation refinement.
- **Bundle Integrity:** After editing CSS modules, execute
  `npm run build:styles` in `apps/web-express` to regenerate `base.bundle.css`
  and `enhancements.bundle.css`.

## Review Focus

1. **Dark Mode Contrast:** Cards and text in `[data-theme="dark"]` must remain
   distinct from canvas backgrounds without relying on bright colored borders.
2. **Card Interactive States:** Removing 3D tilt and spinning conic gradients
   must not leave cards feeling unresponsive; hover states must feature a
   subtle, smooth neutral transform (`translateY(-1px)`) or soft neutral border
   refinement.
3. **Form & Filter Controls:** Removing colored card outlines must not affect
   input focus indicators or active filter chip badges.
4. **Mobile & Viewport Responsiveness:** Spacing and typography adjustments must
   keep card grids and hero sections clean and readable on small screens
   (<768px).
5. **CSS Bundle Build Stability:** `scripts/build-styles.cjs` boundaries
   (`admin.css` and `pages.css`) must be preserved without error.

---

### Task 1: Clean Minimalist Design Tokens

**Files:**

- Modify: `apps/web-express/public/css/modules/tokens.css`
- Test: `apps/web-express/tests/minimalist-ui.test.ts`

**Interfaces:**

- Consumes: Existing token definitions in `:root` and `[data-theme="dark"]`
- Produces: Normalized flat color tokens, neutral card border tokens, flat
  shadows without colored tinting

- [ ] **Step 1: Write the failing test for minimalist design tokens**

Create `apps/web-express/tests/minimalist-ui.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("design tokens enforce neutral card borders and flat shadow tokens", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/tokens.css"),
    "utf8",
  );
  assert.doesNotMatch(css, /linear-gradient/);
  assert.match(css, /--line:/);
  assert.match(css, /--surface-card:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: FAIL or pass initial assertion depending on whether gradients existed
in `tokens.css`.

- [ ] **Step 3: Refine tokens in `tokens.css`**

- In `apps/web-express/public/css/modules/tokens.css`:
  - Ensure `--surface-card` is pure `#ffffff` in light mode and `#1e293b` in
    dark mode.
  - Simplify `--shadow-sm`, `--shadow-md`, and `--shadow-lg` to soft, neutral
    ambient shadows without colored tint.
  - Define `--card-border: var(--line);` and
    `--card-border-hover: var(--line-2);`.
  - Ensure dark mode variables maintain high contrast and neutral borders.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-express/public/css/modules/tokens.css apps/web-express/tests/minimalist-ui.test.ts
git commit -m "style(tokens): streamline minimalist design tokens and flat shadows"
```

---

### Task 2: Minimalist Hero & Clean Header

**Files:**

- Modify: `apps/web-express/public/css/modules/pages.css`
- Modify: `apps/web-express/public/css/modules/components.css`
- Test: `apps/web-express/tests/minimalist-ui.test.ts`

**Interfaces:**

- Consumes: Clean minimalist tokens from Task 1
- Produces: Clean, flat hero section without radial mesh gradients, mouse orbs,
  or header gradient accents

- [ ] **Step 1: Add assertions for hero and header minimalism to
      `minimalist-ui.test.ts`**

Add to `apps/web-express/tests/minimalist-ui.test.ts`:

```typescript
test("hero and header contain no radial or linear gradients", () => {
  const pagesCss = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/pages.css"),
    "utf8",
  );
  const compCss = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/components.css"),
    "utf8",
  );
  assert.doesNotMatch(pagesCss, /radial-gradient/);
  assert.doesNotMatch(compCss, /\.avatar-circle\s*\{[^}]*linear-gradient/);
  assert.doesNotMatch(
    compCss,
    /\.dropdown-user-header\s*\{[^}]*linear-gradient/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: FAIL matching `radial-gradient` in `pages.css` and `linear-gradient`
in `components.css`.

- [ ] **Step 3: Implement clean hero and header styles**

- In `apps/web-express/public/css/modules/pages.css`:
  - Replace the hero background radial-gradient mesh and cursor spotlight
    (`--hero-mouse-x`, `--hero-mouse-y`) with a clean, flat solid background
    (`var(--bg)` or soft neutral).
  - Remove floating decorative background orbs (`.sf-hero-orb-1`,
    `.sf-hero-orb-2`).
  - Keep typography crisp with proper hierarchy and generous whitespace.
- In `apps/web-express/public/css/modules/components.css`:
  - Replace `.avatar-circle` gradient with a clean solid fill:
    `background: var(--navy);` or neutral tone.
  - Replace `.dropdown-menu .dropdown-user-header` gradient with flat
    `background: var(--bg-2);` and a crisp bottom border
    `border-bottom: 1px solid var(--line);`.
  - Replace `.avatar-chip:hover` accent color-mix ring with a clean, subtle
    neutral border transition `border-color: var(--navy);`.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-express/public/css/modules/pages.css apps/web-express/public/css/modules/components.css apps/web-express/tests/minimalist-ui.test.ts
git commit -m "style(hero,header): remove decorative gradients and simplify header"
```

---

### Task 3: Flat Neutral Cards (Feed & Home Idea Cards)

**Files:**

- Modify: `apps/web-express/public/css/modules/pages.css`
- Modify: `apps/web-express/public/css/modules/feed.css`
- Modify: `apps/web-express/public/css/modules/submit.css`
- Test: `apps/web-express/tests/minimalist-ui.test.ts`

**Interfaces:**

- Consumes: Flat tokens and neutral border conventions from Tasks 1-2
- Produces: Clean, flat card components without conic borders, radial
  spotlights, sheen sweeps, 3D tilts, or colored hover outlines

- [ ] **Step 1: Add assertions for card styling to `minimalist-ui.test.ts`**

Add to `apps/web-express/tests/minimalist-ui.test.ts`:

```typescript
test("idea and post cards have no spinning conic borders, spotlights, or colored outlines", () => {
  const pagesCss = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/pages.css"),
    "utf8",
  );
  const feedCss = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/feed.css"),
    "utf8",
  );
  assert.doesNotMatch(pagesCss, /conic-gradient/);
  assert.doesNotMatch(pagesCss, /sfBorderSpin/);
  assert.doesNotMatch(pagesCss, /sfCardShineSweep/);
  assert.doesNotMatch(pagesCss, /\.sf-card-tilt-wrap\s*\{[^}]*perspective/);
  // Post cards in feed.css should not have colored hover border
  assert.doesNotMatch(
    feedCss,
    /\.post-card:hover\s*\{[^}]*border-color:\s*#b8cbdc/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: FAIL matching `conic-gradient`, `sfBorderSpin`, `sfCardShineSweep`,
etc.

- [ ] **Step 3: Implement flat card styles**

- In `apps/web-express/public/css/modules/pages.css`:
  - In `.sf-card-tilt-wrap`: remove `perspective: 900px`,
    `transform-style: preserve-3d`. Remove pseudo-element
    `.sf-card-tilt-wrap::before` (which houses the spinning conic gradient).
  - In `.sf-idea-card`:
    - Remove `will-change: transform;` and 3D tilt transforms.
    - Set `border: 1px solid var(--line);` (clean flat border).
    - Remove `.sf-idea-card::before` (radial-gradient spotlight).
    - Remove `.sf-idea-card::after` (sheen sweep animation).
    - Simplify `.sf-idea-card:hover` to a calm, subtle hover:
      `border-color: var(--line-2); transform: translateY(-2px); box-shadow: var(--shadow-sm);`.
      No colored borders.
- In `apps/web-express/public/css/modules/feed.css`:
  - In `.post-card`: set border to `1px solid var(--line);` and remove colored
    hover border `#b8cbdc`. Use neutral hover
    `border-color: var(--line-2); transform: translateY(-1px); box-shadow: var(--shadow-sm);`.
  - In `.idea-card`: ensure hover uses neutral border and flat elevation.
- In `apps/web-express/public/css/modules/submit.css`:
  - Remove all `linear-gradient` backgrounds from submit cards (`.sip-cat-card`,
    `.sip-anon-card`, `.sip-review-card`, `.sip-tracking-card`).
  - In `.sip-cat-card--selected`: use solid brand or neutral accent border
    (`1.5px solid var(--navy);` or `var(--ink)`) instead of multi-stop colored
    gradients or colored glowing rings.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-express/public/css/modules/pages.css apps/web-express/public/css/modules/feed.css apps/web-express/public/css/modules/submit.css apps/web-express/tests/minimalist-ui.test.ts
git commit -m "style(cards): eliminate conic borders, spotlights, and colored outlines"
```

---

### Task 4: Minimalist Buttons, Badges, & Action States

**Files:**

- Modify: `apps/web-express/public/css/modules/components.css`
- Modify: `apps/web-express/public/css/modules/pages.css`
- Modify: `apps/web-express/public/css/modules/submit.css`
- Modify: `apps/web-express/public/css/modules/roadmap.css`
- Test: `apps/web-express/tests/minimalist-ui.test.ts`

**Interfaces:**

- Consumes: Simplified design tokens
- Produces: Solid, clean action buttons and category badges without gradient
  fills

- [ ] **Step 1: Add assertions for button and badge styling to
      `minimalist-ui.test.ts`**

Add to `apps/web-express/tests/minimalist-ui.test.ts`:

```typescript
test("buttons and submit elements use flat solid backgrounds without gradients", () => {
  const submitCss = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/submit.css"),
    "utf8",
  );
  const compCss = fs.readFileSync(
    path.join(__dirname, "../public/css/modules/components.css"),
    "utf8",
  );
  assert.doesNotMatch(submitCss, /linear-gradient/);
  assert.doesNotMatch(compCss, /\.btn-primary[^{]*\{[^}]*linear-gradient/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: FAIL matching gradients in `submit.css`.

- [ ] **Step 3: Implement flat solid buttons and badges**

- In `apps/web-express/public/css/modules/submit.css`:
  - Replace all `linear-gradient` declarations (progress bars, primary submit
    button, step headers) with crisp, solid values (e.g.
    `background: var(--navy);` or `background: var(--success);`).
- In `apps/web-express/public/css/modules/components.css`:
  - Ensure `.btn-primary` and `.btn-primary-sm` use solid
    `background: var(--navy);` and `:hover` uses solid
    `background: var(--navy-2);`.
- In `apps/web-express/public/css/modules/roadmap.css`:
  - Replace any progress bar gradients with clean flat solid colors.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node -r ts-node/register/transpile-only --test apps/web-express/tests/minimalist-ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-express/public/css/modules/components.css apps/web-express/public/css/modules/pages.css apps/web-express/public/css/modules/submit.css apps/web-express/public/css/modules/roadmap.css apps/web-express/tests/minimalist-ui.test.ts
git commit -m "style(buttons): convert buttons and badges to flat solid styling"
```

---

### Task 5: Style Bundle Rebuild & Full Regression Verification

**Files:**

- Modify: `apps/web-express/public/css/base.bundle.css` (generated)
- Modify: `apps/web-express/public/css/enhancements.bundle.css` (generated)
- Test: `apps/web-express/tests/*.test.ts`

**Interfaces:**

- Consumes: Updated CSS module files
- Produces: Fresh compiled CSS bundles matching source modules

- [ ] **Step 1: Rebuild CSS bundles**

Run command in `apps/web-express`: `npm run build:styles`

- [ ] **Step 2: Verify bundles contain no card gradients or conic borders**

Run:

```typescript
test("compiled bundles contain no conic gradients or shiny card sweeps", () => {
  const base = fs.readFileSync(
    path.join(__dirname, "../public/css/base.bundle.css"),
    "utf8",
  );
  const enhancements = fs.readFileSync(
    path.join(__dirname, "../public/css/enhancements.bundle.css"),
    "utf8",
  );
  assert.doesNotMatch(enhancements, /conic-gradient/);
  assert.doesNotMatch(enhancements, /sfCardShineSweep/);
});
```

- [ ] **Step 3: Run the entire test suite**

Run command in `apps/web-express`: `npm test` Expected: ALL test suites pass
(including client build, typecheck, and all 57+ unit/integration tests).

- [ ] **Step 4: Commit**

```bash
git add apps/web-express/public/css/*.bundle.css apps/web-express/tests/minimalist-ui.test.ts
git commit -m "chore(styles): rebuild bundles and verify full test suite passes"
```
