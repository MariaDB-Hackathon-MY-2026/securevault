# Auth and Dashboard Design System

## Purpose

This document extracts the design system currently implemented across the authenticated product flow, from auth to dashboard, so future UI work extends one consistent language instead of adding new patterns ad hoc.

Scope reviewed:

- `secure-vault/src/app/(auth)`
- `secure-vault/src/app/(dashboard)`
- `secure-vault/src/components/auth`
- `secure-vault/src/components/dashboard`
- `secure-vault/src/components/settings`
- `secure-vault/src/components/files`
- `secure-vault/src/components/activity`
- `secure-vault/src/components/trash`
- `secure-vault/src/components/ui`
- `secure-vault/src/app/globals.css`
- `secure-vault/src/app/layout.tsx`

## Design Summary

The current product UI reads as a security-focused editorial workspace:

- Mono-first typography and compact controls create a technical, trustworthy tone.
- Outer shells are sharp, bordered, and lightly translucent.
- Content modules inside those shells lean softer through rounded cards and inputs.
- The primary brand accent is a warm yellow/gold.
- State accents rely on emerald for success, amber for warning, and destructive red for errors.
- Motion is restrained and utility-driven rather than decorative.

This is already a recognizable system. The gap is not taste, but codification.

## Foundations

### Color System

Primary theme tokens live in `secure-vault/src/app/globals.css`.

| Role | Current token or pattern | Current usage |
| ---- | ------------------------ | ------------- |
| App background | `--background`, `--foreground` | Base page surfaces and text |
| Primary brand accent | `--primary`, `--primary-foreground` | Primary buttons, progress fill, glow accents |
| Secondary and muted surfaces | `--secondary`, `--muted`, `--accent` | Hover, active, subdued surfaces |
| Borders and fields | `--border`, `--input`, `--ring` | Panel borders, inputs, focus states |
| Semantic danger | `--destructive` | Errors and destructive buttons |
| Sidebar palette | `--sidebar-*` | Reserved for shell/navigation use |

Additional hard-coded accent colors are also part of the current visual language and should be treated as implemented conventions until they are tokenized:

- Teal and sky glows in the auth shell
- Emerald for verified and success states
- Amber for pending and warning states
- Red for weak password and destructive messaging

### Typography

Typography is effectively mono-first today.

- `html` applies `font-mono`, and `JetBrains Mono` is bound to `--font-mono`.
- `Geist Sans` and `Geist Mono` are loaded in `secure-vault/src/app/layout.tsx`, but the visible app voice is still driven by monospace styles.

| Role | Style used today |
| ---- | ---------------- |
| App voice | Monospace-first |
| Dashboard/Auth eyebrow | `text-xs uppercase tracking-[0.3em] text-muted-foreground` |
| Page title | `text-3xl font-semibold` |
| Auth card title | `text-2xl` |
| Card title | `text-lg font-semibold` |
| Body copy | `text-sm text-muted-foreground` |
| Labels | `text-xs` |
| Buttons | `text-xs font-medium` |

### Shape Language

The implemented shape system has two layers:

- Structural chrome is square or nearly square.
- Contained content modules are rounded.

| Surface type | Shape |
| ------------ | ----- |
| Buttons | `rounded-none` |
| Dashboard shell panels | square edges |
| Mobile drawer | `rounded-none` override |
| Cards | `rounded-lg` |
| Inputs | `rounded-md` |
| Badges and progress pills | `rounded-full` |
| Dialogs, dropdowns, toasts | `rounded-md` or `rounded-lg` |

This should be treated as a deliberate rule for now: square outer shell, softer inner component surfaces.

### Borders, Shadows, Blur

Three surface treatments repeat throughout the app:

- Shell panels: `border border-border/60 bg-background/95 backdrop-blur`
- Auth cards: `border-border/70 bg-background/88 shadow-xl shadow-slate-950/5 backdrop-blur`
- Standard cards: `border border-border bg-card shadow-sm`

The system relies on thin borders more than large shadows. Blur is used to support layered glass-like surfaces, not heavy frosted-glass theatrics.

### Spacing

The spacing rhythm is consistent and should stay standardized:

| Usage | Pattern |
| ----- | ------- |
| Page sections | `gap-6` |
| Forms and card internals | `gap-4` |
| Field label to input | `gap-2` |
| Shell padding | `p-4` mobile, `p-6` desktop |
| Card padding | `p-6` |

### Motion

Motion is minimal and functional:

- Dialogs and overlays fade and zoom.
- Buttons and inputs use short transition utilities.
- Skeletons pulse.
- The pending verification badge uses a small `animate-ping` indicator.
- Password strength bars animate width changes.

## Surface Patterns

### Auth

The auth experience uses a single centered card on a decorative full-viewport canvas.

Rules:

- Use a full-screen background with subtle radial glows and a faint grid texture.
- Keep auth content constrained to a narrow form card, currently `max-w-sm`.
- Use one dominant primary action per screen.
- Keep secondary route switching as small supporting text below the form.
- Keep validation and status feedback close to the related field or action.

Auth page pattern:

1. Decorative shell background
2. Centered translucent card
3. Card header with title and short description
4. Compact vertical form with `grid gap-4`
5. Full-width primary submit button
6. Small inline route-switch text

### Dashboard Shell

The dashboard uses a responsive workspace shell:

- `max-w-7xl` centered container
- Mobile top bar plus drawer below `lg`
- Persistent sidebar at `lg` and above
- Main content panel as a bordered translucent surface

The navigation panel is the main reusable dashboard shell primitive. It is shared between desktop sidebar and mobile drawer.

### Dashboard Page Header

Every dashboard route should use the same header composition:

1. Eyebrow label in uppercase tracked small text
2. Page title in `text-3xl font-semibold`
3. Short supporting paragraph in muted small text

This pattern is already established in:

- `Files`
- `Trash`
- `Activity`
- `Settings`

### Dashboard Content Sections

Default section container: `Card`

Use cards for:

- informational modules
- forms
- settings groups
- placeholder feature blocks
- session/device entries when the content needs emphasis

Standard card composition:

1. `CardHeader`
2. `CardTitle`
3. `CardDescription`
4. `CardContent`

### Forms

Current form system:

- Outer form: `grid gap-4`
- Each field group: `grid gap-2`
- Labels above inputs
- Buttons align to content width with `w-fit` in settings
- Auth submit buttons expand full width

Use this as the default form rhythm everywhere unless a workflow explicitly needs dense inline controls.

### Status and Feedback

The current app has three status patterns:

| Pattern | Use case | Existing example |
| ------- | -------- | ---------------- |
| Badge status | compact persistent state | email verification badge |
| Shared status notice | warnings, confirmations, and form-level errors | auth errors, email verification notice, settings session feedback |
| Toast feedback | transient async status | auth and settings action toasts |

Standard semantic colors already in use:

- Success: emerald
- Warning: amber
- Error: destructive red
- Neutral informational surfaces: muted or background-based

### Loading States

Loading states use simple `Skeleton` blocks that mimic the final layout with the same overall section rhythm.

Current routes with loading states:

- `Files`
- `Activity`
- `Settings`

When adding new loading states, keep skeleton proportions aligned with the actual loaded layout.

## Component Reference

### Button

Source: `secure-vault/src/components/ui/button.tsx`

Implemented traits:

- Square silhouette
- Compact height
- `text-xs` density
- Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`
- Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

Usage guidance:

- `default` for primary actions
- `outline` for secondary shell actions like logout or revoke
- `ghost` for utility icon controls
- `destructive` for dangerous actions
- `link` for intentional text-link treatments instead of custom underlined links

### Card

Source: `secure-vault/src/components/ui/card.tsx`

Role:

- default dashboard content container
- auth form container when enhanced with glass styles
- fallback pattern for error and not-found pages

### Input and Label

Sources:

- `secure-vault/src/components/ui/input.tsx`
- `secure-vault/src/components/ui/label.tsx`

Implemented traits:

- Inputs are `h-10`, bordered, lightly rounded, and use visible focus rings.
- Labels are compact and small, matching the app's dense editorial UI.

### Badge

Source: `secure-vault/src/components/ui/badge.tsx`

Use badges for compact state communication, not for long-form alerts.

### Status Notice

Source: `secure-vault/src/components/ui/status-notice.tsx`

Use this for page-level and form-level messaging that needs stronger treatment than inline text:

- success confirmations
- warning blocks
- destructive or failed action states

### EmailVerificationStatus

Source: `secure-vault/src/components/auth/email-verification-status.tsx`

This is the clearest current example of a reusable status primitive with two display modes:

- `badge` for compact state chips
- `notice` for full-width contextual messaging

This component should be used as the reference pattern when building future account-status messaging.

### Dialog

Source: `secure-vault/src/components/ui/dialog.tsx`

Current usage:

- mobile navigation drawer

The base dialog is rounded, but the dashboard drawer intentionally overrides it to become square and edge-aligned.

### Progress

Source: `secure-vault/src/components/ui/progress.tsx`

Dashboard storage now uses this shared primitive. Future progress indicators should default to it unless a stronger reason exists.

### Skeleton

Source: `secure-vault/src/components/ui/skeleton.tsx`

Use skeletons for shape approximation only. Match the real layout's spacing and grid structure.

### Toast Feedback

Sources:

- `secure-vault/src/components/ui/sonner.tsx`
- `secure-vault/src/hooks/use-action-toast.ts`

Action feedback is standardized through loading, error, and success toasts tied to form submission states.

Use toasts for:

- async action progress
- transient success confirmation
- transient non-inline failure messaging

Use inline messaging when the feedback needs to stay anchored to a specific field or block.

## Consistency Rules Going Forward

These rules should guide all new auth and dashboard UI work.

### 1. Use tokens first

Prefer semantic tokens from `globals.css` over direct utility colors for standard surfaces, text, and component states.

Use direct utility colors only for:

- warning and success accents not yet tokenized
- decorative shell glows
- clearly scoped one-off visualization states

### 2. Preserve the current shell hierarchy

- Outer workspace and auth shells should stay sharp, bordered, and atmospheric.
- Inner feature modules can remain softer and rounded.

If the team later wants a fully square system, that should be done as a deliberate refactor across `Card`, `Input`, `Dialog`, `Toast`, `DropdownMenu`, and `Progress`, not piecemeal.

### 3. Reuse the page-header pattern

Every dashboard page should begin with:

- eyebrow
- title
- short supporting copy

Do not invent alternate page-header styles without a strong product reason.

### 4. Keep the form rhythm stable

- `grid gap-4` for forms
- `grid gap-2` per field group
- label above control
- one primary action per form block

### 5. Standardize state messaging

Prefer shared status treatments over raw one-off text.

Recommended pattern:

- badge for compact persistent state
- notice panel for workflow-blocking or page-level context
- toast for transient completion/progress feedback

### 6. Reuse primitives before custom utility stacks

Before building custom UI, check whether the app already has:

- `Button`
- `Card`
- `Input`
- `Label`
- `Badge`
- `Dialog`
- `Progress`
- `Skeleton`

### 7. Match loading states to real layouts

Skeleton screens should preserve:

- the same spacing rhythm
- the same column structure
- major conditional blocks when possible

## Known Drift and Cleanup Backlog

These issues do not erase the current system, but they are the main sources of inconsistency today.

1. Typography intent is not fully codified. Sans fonts are loaded, but the visible app voice is globally monospace-first.
2. Radius is not token-driven. `--radius` is `0`, but several primitives still use fixed rounded utility classes.
3. Status and accent colors are partly hard-coded rather than fully semantic.
4. A few state visuals still rely on direct emerald, amber, and red utility classes because those tokens are not fully abstracted yet.
5. Dashboard navigation hover and active states are still visually close and may need stronger separation as the information architecture grows.
6. The global shell-to-content radius split is now documented, but it still depends on component-level classes rather than a single radius token strategy.

## Recommended Baseline for Future Work

Until the system is refactored further, treat this as the canonical baseline:

- Mono-first typography
- Warm yellow primary accent
- Bordered translucent shell panels
- Rounded internal cards and inputs
- Compact controls and dense spacing
- Editorial dashboard headers
- Emerald success, amber warning, destructive error
- Minimal, purposeful motion

Building to this baseline will keep auth and dashboard visually coherent while the component library matures.
