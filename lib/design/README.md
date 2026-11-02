# @workspace/design

The JALDO shared design foundation. **ONE FAMILY, NOT FIVE CLONES.**

This package exists so JALDO Main, JALDO Hub, and future JALDO vertical
sites share one presentation layer instead of each maintaining its own
copy — while each still retains enough of its own imagery, content, and
vocabulary to feel native to its market (per
`docs/design/JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md`).

**Status: Phase 1B — visual system approved and tokenized; not yet
consumed.** Nothing in this package is imported by `artifacts/rtbx` or
`artifacts/intelligence-investment-hub` yet — neither app's `index.css`
references `theme.css`, and neither app's local component copies have
changed. Phase 1A established the shared primitives; Phase 1B approves
and writes the actual JALDO colour/typography/radius/spacing/elevation
values. Consumer migration (wiring an app to any of this) remains later,
separate work.

## SHARED (this package's responsibility)

- **Semantic token contract** (`src/tokens/contract.ts`) — the 13 locked
  `--jaldo-*` tokens, now with **approved light/dark values** (Phase 1B)
  and, for every token used as a filled background, a documented
  foreground pairing with its exact WCAG 2.1 contrast ratio. The
  executable CSS lives in `src/tokens/theme.css` (`:root` for light,
  `.dark` for dark) — **not imported by either application yet.**

  **Approved colour palette:**

  | Token                      | Light     | Dark      | Semantic use                      |
  | -------------------------- | --------- | --------- | --------------------------------- |
  | `--jaldo-bg`               | `#FFFFFF` | `#0A1420` | Page / app background             |
  | `--jaldo-surface`          | `#F7F8FA` | `#0F1B2C` | Card / panel background           |
  | `--jaldo-surface-elevated` | `#FFFFFF` | `#142338` | Modal / popover background        |
  | `--jaldo-text`             | `#0B1B33` | `#F3F6FA` | Primary text                      |
  | `--jaldo-text-muted`       | `#5B6B82` | `#9AACC2` | Secondary / caption text          |
  | `--jaldo-border`           | `#E2E6EC` | `#24344A` | Default border / divider          |
  | `--jaldo-primary`          | `#0F2A4A` | `#3E6FA8` | Deep navy — brand chrome, buttons |
  | `--jaldo-secondary`        | `#0F6E6E` | `#2BA3A3` | Teal — operational emphasis       |
  | `--jaldo-accent`           | `#B85510` | `#F0793A` | Warm orange — primary CTA         |
  | `--jaldo-success`          | `#177A4D` | `#34B876` | Positive state                    |
  | `--jaldo-warning`          | `#92680F` | `#D9A227` | Caution state                     |
  | `--jaldo-danger`           | `#C22F2F` | `#E55959` | Error / destructive state         |
  | `--jaldo-info`             | `#253CD0` | `#6577E8` | Neutral informational state       |

  **Foreground rule for filled surfaces** (`--jaldo-on-filled` in
  `theme.css`): accent, success, warning, danger, and info all share one
  rule — **white in light mode, `--jaldo-bg`'s dark value (`#0A1420`) in
  dark mode** — verified to clear WCAG AA (≥4.5:1) for all five in both
  modes (ratios: accent 4.83/6.62, success 5.35/7.29, warning 4.99/8.07,
  danger 5.61/5.21, info 7.97/4.72 — light/dark). **Primary and secondary
  do not follow this shared rule** — each was checked independently
  because the shared rule would have shipped a real AA failure on one of
  them: dark secondary fails with white text (3.06:1) but passes with
  `#0A1420` (6.06:1); dark primary is the reverse (white 5.19:1 passes,
  `#0A1420` 3.57:1 fails). See `contract.ts` for every ratio.

  The original 12-Sep audit's `#DC5F1E` accent candidate was rejected
  (3.69:1 with white, failed AA) — `#B85510`/`#F0793A` replace it, per
  the accessibility resolution this palette was approved against.

  **Radius:** `--jaldo-radius-sm/md/lg/xl` = `4px/6px/10px/14px`
  (mode-agnostic).

  **Spacing:** no new CSS variables — the approved scale (4/8/12/16/24/
  32/48/64) is Tailwind's own default spacing scale; consumers use
  Tailwind's native utilities (`p-4`, `gap-6`, …) directly. Documented as
  `JALDO_SPACING_SCALE_PX` in `contract.ts` for reference only.

  **Elevation:** three restrained levels only — `--jaldo-shadow-sm/md/lg`
  — colour derived from the navy `--jaldo-primary` hue rather than
  generic black. Dark mode uses a much darker, higher-opacity version of
  the same hue (a light navy-tinted shadow would be invisible against an
  already-dark navy surface) — still three levels, no new hue.

  **Typography:** headings **Manrope**, body/UI **Inter** (unchanged —
  already loaded in both apps), technical/data a monospace font where
  operationally useful (e.g. Signal/deployment IDs, timestamps). Sora was
  considered and is **not** used. No font files or `@font-face`/Google
  Fonts `<link>` changes are made by this phase — that's an application
  concern for consumer migration, not this package.

  **Mode strategy:** JALDO Main is **light-first**; JALDO Hub is
  **dark-first**. The token system itself is mode-capable in both
  directions (every token has both a `:root` and a `.dark` value) —
  neither app is required to ship both modes on its first JALDO
  migration.

- **Presentation primitives** (`src/components/ui/`) — Phase 1A ships
  exactly six: `Button`, `Badge`, `Card`, `Table`, `Tooltip`, `Separator`.
  Each was verified semantically identical between the existing
  `artifacts/rtbx/src/components/ui/` and
  `artifacts/intelligence-investment-hub/src/components/ui/` copies
  before being canonicalized here (formatting-only differences: quote
  style, semicolons, trailing commas, import order). The remaining ~45
  shadcn-derived components in each app are deliberately **not** migrated
  in this phase.

  Two classes of dead/app-specific presentation hooks found in the source
  copies were **not** carried into the shared `button.tsx`/`badge.tsx`:
  - `hover-elevate` / `active-elevate-2`, and the arbitrary-value
    references `[border-color:var(--button-outline)]` /
    `[border-color:var(--badge-outline)]` — confirmed genuinely undefined
    in both apps (no `@utility` rule, no plain CSS class, and absent from
    Main's actual built production CSS). These, and the `@replit`
    comments explaining their now-removed "no hover" rationale, were
    dropped.
  - `border-primary-border` on the default `Button` variant — this one is
    **not** dead everywhere: it resolves in Hub today via
    `--color-primary-border: hsl(var(--primary-border))`, defined in both
    Hub's light and dark blocks, but Main defines neither token, so it
    was inert there. Rather than either deleting real Hub behavior or
    inventing a shared value to imitate it, it was removed from the
    shared copy as an app-specific styling dependency that is not a
    genuinely shared contract — the default variant now uses the plain
    `border` utility (backed by `--color-border`, which **is** defined
    identically in both apps today). Hub's own local `button.tsx` is
    unchanged and untouched; when Hub migrates onto `@workspace/design`,
    its border treatment will be mapped deliberately onto the approved
    `--jaldo-*` token system rather than carried forward as-is.

- **Maturity / data-authority presentation** (`MaturityBadge`) — renders
  the Phase 0 two-axis model (Delivery Maturity × Data/Authority Status)
  as two neutral, plain-text badges. It assigns no colour semantics to any
  status and never implies "verified," "certified," or "live production"
  beyond what the caller's own supplied status value already states.
- **Future reusable JALDO brand primitives** — this package is the
  intended eventual home for a shared `Logo`/`Wordmark`, CTA-button
  treatments, and further shared primitives. **Approved production
  wordmark artwork now exists** (Phase 2C, `docs/design/JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md`)
  and is wired into JALDO Main only, at
  `artifacts/rtbx/src/components/brand/wordmark.tsx` +
  `artifacts/rtbx/public/brand/` — it has **not** been moved into this
  shared package, since Hub has not yet adopted it; doing so remains a
  future step once Hub's own branding is migrated. Favicon/app-icon
  treatment for JALDO Main now derives from this mark; Hub's `favicon.png`/
  `favicon.svg` are unchanged.
- **Iconography** — `lucide-react` is confirmed as the canonical icon set
  ecosystem-wide (Phase 1B). It was already the sole icon library in both
  apps' `package.json`s; no vertical may introduce its own icon set.

## NOT SHARED

- **Application shells** — `group-shell.tsx` (Main) and `app-layout.tsx`
  (Hub) solve different problems (public marketing IA vs. role-gated
  operational IA) and are not merged into one shared shell.
- **Navigation IA** — each app's own navigation structure stays local.
- **Hub auth/authorization** — this package has no dependency on Clerk,
  `hub_access_grants`, `useHubPrincipal`, or any Hub-principal/session
  logic, and never will.
- **Core logic** — no dependency on `@workspace/db`, Core's schema, or any
  Signal/Decision/Action/Evidence/Outcome/Learning data model.
- **API / data fetching** — no dependency on `@workspace/api-client-react`
  or any generated API client. This package is presentation-only; it
  receives data as props.
- **Vertical-specific imagery/copy** — sector content stays in each
  vertical's own site.
- **Customer operational logic** — nothing here reads or renders real
  customer/deployment data.

## Deferred (explicitly out of scope for Phase 1B)

A `Logo`/`Wordmark` **component or SVG** (the design brief is locked, §
above — the artwork/component is not), a dedicated `CTAButton` component,
any public-site or Hub shell, **actually wiring** light/dark mode into
either app (the token _values_ for both modes are approved and written;
consuming them is not), typography migration (Manrope is approved as a
direction; no font file, `@font-face`, or Google Fonts `<link>` change was
made to either app), the remaining ~45 shadcn primitives, and removal of
either app's local component copies. The current RTBX inline wordmark
(`group-shell.tsx`) does **not** become this package's `Logo` — no `Logo`
exists here yet. "Prospect CTA" and "Open JALDO Hub" remain
interaction/content classes for now; they can be built from the shared
`Button` primitive later rather than requiring a dedicated CTA component.

## Tailwind v4 source discovery — verify during consumer migration

Both apps use Tailwind CSS v4's CSS-first configuration (`@import
"tailwindcss"` + `@theme inline` in each app's own `index.css`; there is no
`tailwind.config.js` anywhere in this repository). Tailwind v4 generates
utility CSS only for class names it discovers by scanning source files —
today that scan only covers each app's own `src/` tree.

Once an application begins importing `@workspace/design`'s `.tsx`
components at runtime, **Tailwind v4 source discovery for this package
must be verified, not assumed.** Because this package resolves to
`lib/design/src/**/*.tsx` outside each app's own `src/` directory,
confirm during that consumer-migration phase that:

- every class name used inside `@workspace/design` (e.g. `bg-primary`,
  `border-destructive-border`, `min-h-9`) actually appears in the
  consuming app's generated CSS output, and
- if it does not, explicit `@source` registration (Tailwind v4's
  mechanism for scanning files outside an app's default root) is added to
  that app's `index.css` for `lib/design/src`.

This is **not done yet** — no application imports this package's
components yet, so there is nothing to verify yet, and neither app's
`index.css` is modified by this phase. This note exists so the consumer
migration phase does not silently ship components whose classes are
missing from the built CSS. The same applies to `theme.css` (added Phase
1B): it is not imported by either app, and `lib/design/package.json`'s
`exports` map does not yet expose it — both are additions for whichever
phase actually starts consumer migration.

## Status colour — never alone

Reaffirmed from `docs/design/JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md`:
`--jaldo-success`/`warning`/`danger`/`info` must always be paired with a
label, icon, or shape — never colour alone — especially in governed Hub
views where a colour-blind operator must still distinguish an Outcome's
result correctly. `MaturityBadge` already follows this (plain-text
badges, no colour-only signal); any future status-colour component must
too.

## ONE FAMILY, NOT FIVE CLONES

The approved palette, typography, radius, spacing, and elevation above
are locked ecosystem-wide — no vertical site, and no future governed
workspace, may introduce its own colours, radius scale, or shadow system.
What varies by vertical is imagery, sector vocabulary, and which of the
approved tokens gets more visual emphasis (e.g. a vertical leaning more
teal or more orange within this same set) — never a new token or value.

## Consuming this package

Not wired into either app's runtime yet. Once a consuming change is
authorized:

```ts
import { Button, Card, MaturityBadge, cn } from '@workspace/design';
```

Sub-path export for the token contract alone (no React, no side effects):

```ts
import { JALDO_TOKEN_CONTRACT } from '@workspace/design/tokens/contract';
```
