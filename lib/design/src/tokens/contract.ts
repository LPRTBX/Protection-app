/**
 * JALDO semantic design token contract.
 *
 * This module documents the canonical `--jaldo-*` tokens locked by
 * `docs/design/JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md` and, as of Phase 1B,
 * their approved light/dark values, executable in `./theme.css`.
 *
 * This file is documentation/metadata, not a stylesheet — it contains no
 * CSS and is never imported by either application's `index.css`. The
 * actual CSS custom properties live in `./theme.css`, which is also not
 * wired into either app yet (Phase 1B ships the tokens; consumer
 * migration is separate, later work).
 *
 * Every colour value below passed a direct WCAG 2.1 contrast calculation
 * against its documented `foreground` pairing before approval — see the
 * `foreground.wcagRatio` field on each entry. None of these ratios were
 * estimated.
 */

export interface JaldoTokenForeground {
  /** Foreground colour used when this token is a filled background (e.g. a button or chip), light mode. */
  readonly light: string;
  /** Foreground colour used when this token is a filled background, dark mode. */
  readonly dark: string;
  /** WCAG 2.1 contrast ratio of `light`-on-`light value` and `dark`-on-`dark value`, calculated directly. */
  readonly wcagRatio: {
    readonly light: number;
    readonly dark: number;
  };
  /** True for the five tokens (accent + all four status colours) that share the single approved --jaldo-on-filled rule (white in light, --jaldo-bg dark in dark). False means this token's foreground was checked independently and does NOT follow that shared rule. */
  readonly usesSharedFilledRule: boolean;
}

export interface JaldoTokenDefinition {
  /** The CSS custom property name, e.g. `--jaldo-bg`. Defined in `./theme.css`. */
  readonly cssVariable: string;
  /** What this token is for, at the level a page author needs to pick correctly. */
  readonly semanticUse: string;
  /** Approved light-mode value. */
  readonly light: string;
  /** Approved dark-mode value. */
  readonly dark: string;
  /** Present only for tokens used as a filled background needing a documented, contrast-checked text colour. */
  readonly foreground?: JaldoTokenForeground;
}

/**
 * The 13 locked JALDO semantic colour tokens, approved for Phase 1B.
 * Order and grouping matches `JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md`.
 */
export const JALDO_TOKEN_CONTRACT: readonly JaldoTokenDefinition[] = [
  {
    cssVariable: '--jaldo-bg',
    semanticUse: 'Page / app background.',
    light: '#FFFFFF',
    dark: '#0A1420',
  },
  {
    cssVariable: '--jaldo-surface',
    semanticUse: 'Card / panel background.',
    light: '#F7F8FA',
    dark: '#0F1B2C',
  },
  {
    cssVariable: '--jaldo-surface-elevated',
    semanticUse: 'Modal / popover / elevated card background.',
    light: '#FFFFFF',
    dark: '#142338',
  },
  {
    cssVariable: '--jaldo-text',
    semanticUse: 'Primary text.',
    light: '#0B1B33',
    dark: '#F3F6FA',
    // Not a filled background — documented for completeness as the
    // text/bg pair itself: 17.23:1 (light, on --jaldo-bg) / 17.09:1
    // (dark, on --jaldo-bg dark). Both far exceed AAA.
  },
  {
    cssVariable: '--jaldo-text-muted',
    semanticUse: 'Secondary / caption text.',
    light: '#5B6B82',
    dark: '#9AACC2',
    // On --jaldo-bg: 5.43:1 light (AA, not AAA — avoid for very small
    // muted text), 7.99:1 dark (comfortably AA/near-AAA).
  },
  {
    cssVariable: '--jaldo-border',
    semanticUse: 'Default border / divider.',
    light: '#E2E6EC',
    dark: '#24344A',
  },
  {
    cssVariable: '--jaldo-primary',
    semanticUse:
      'Deep navy direction — primary foundation, brand chrome, primary/secondary buttons.',
    light: '#0F2A4A',
    dark: '#3E6FA8',
    foreground: {
      light: '#FFFFFF',
      dark: '#FFFFFF',
      wcagRatio: { light: 14.48, dark: 5.19 },
      usesSharedFilledRule: false,
    },
    // NOTE: checked independently, not via the accent/status
    // --jaldo-on-filled rule. Dark primary (#3E6FA8) contrasts better
    // with white (5.19:1) than with dark --jaldo-bg (3.57:1, fails AA) —
    // applying the shared rule here would have shipped a failure.
  },
  {
    cssVariable: '--jaldo-secondary',
    semanticUse:
      'Teal direction — operational / secondary emphasis, active nav state.',
    light: '#0F6E6E',
    dark: '#2BA3A3',
    foreground: {
      light: '#FFFFFF',
      dark: '#0A1420',
      wcagRatio: { light: 6.04, dark: 6.06 },
      usesSharedFilledRule: false,
    },
    // NOTE: also checked independently. Dark secondary (#2BA3A3) fails
    // AA with white (3.06:1) but passes with dark --jaldo-bg (6.06:1) —
    // the opposite asymmetry from primary. Confirms these two cannot
    // share one hardcoded rule with each other, let alone with
    // accent/status.
  },
  {
    cssVariable: '--jaldo-accent',
    semanticUse:
      'Warm orange direction — accent / action, primary CTA, key highlight.',
    light: '#B85510',
    dark: '#F0793A',
    foreground: {
      light: '#FFFFFF',
      dark: '#0A1420',
      wcagRatio: { light: 4.83, dark: 6.62 },
      usesSharedFilledRule: true,
    },
  },
  {
    cssVariable: '--jaldo-success',
    semanticUse: 'Positive state (e.g. a resolved Outcome).',
    light: '#177A4D',
    dark: '#34B876',
    foreground: {
      light: '#FFFFFF',
      dark: '#0A1420',
      wcagRatio: { light: 5.35, dark: 7.29 },
      usesSharedFilledRule: true,
    },
  },
  {
    cssVariable: '--jaldo-warning',
    semanticUse: 'Caution state (e.g. an escalation pending).',
    light: '#92680F',
    dark: '#D9A227',
    foreground: {
      light: '#FFFFFF',
      dark: '#0A1420',
      wcagRatio: { light: 4.99, dark: 8.07 },
      usesSharedFilledRule: true,
    },
  },
  {
    cssVariable: '--jaldo-danger',
    semanticUse: 'Error / destructive state.',
    light: '#C22F2F',
    dark: '#E55959',
    foreground: {
      light: '#FFFFFF',
      dark: '#0A1420',
      wcagRatio: { light: 5.61, dark: 5.21 },
      usesSharedFilledRule: true,
    },
  },
  {
    cssVariable: '--jaldo-info',
    semanticUse: 'Neutral informational state.',
    light: '#253CD0',
    dark: '#6577E8',
    foreground: {
      light: '#FFFFFF',
      dark: '#0A1420',
      wcagRatio: { light: 7.97, dark: 4.72 },
      usesSharedFilledRule: true,
    },
  },
] as const;

export type JaldoTokenName =
  (typeof JALDO_TOKEN_CONTRACT)[number]['cssVariable'];

/**
 * Shared foreground rule for filled accent/status surfaces (accent,
 * success, warning, danger, info — the five entries above with
 * `usesSharedFilledRule: true`). Exposed as its own token,
 * `--jaldo-on-filled`, in `./theme.css`, rather than duplicated per
 * colour, per the approved rule: do not invent a separate foreground
 * colour for each status.
 *
 * Primary and secondary are deliberately excluded — see their own
 * `foreground` entries above for why a shared rule does not fit them.
 */
export const JALDO_ON_FILLED = {
  light: '#FFFFFF',
  dark: '#0A1420',
} as const;

/**
 * Radius scale — approved Phase 1B, mode-agnostic (identical in light
 * and dark; corner geometry does not change with colour mode).
 */
export const JALDO_RADIUS_SCALE = {
  sm: '4px',
  md: '6px',
  lg: '10px',
  xl: '14px',
} as const;

export type JaldoRadiusToken = keyof typeof JALDO_RADIUS_SCALE;

/**
 * Spacing scale — approved Phase 1B. Deliberately matches Tailwind's own
 * default spacing scale (4px base) so no parallel/duplicate spacing
 * tokens are introduced; consumers should prefer Tailwind's native
 * spacing utilities (`p-4`, `gap-6`, …) directly rather than a
 * `--jaldo-space-*` custom property. Recorded here for documentation
 * completeness only — `theme.css` does not define spacing variables.
 */
export const JALDO_SPACING_SCALE_PX = [4, 8, 12, 16, 24, 32, 48, 64] as const;

/**
 * Elevation levels — approved Phase 1B, three restrained steps only.
 * Executable values live in `./theme.css` (`--jaldo-shadow-sm/md/lg`);
 * see that file's comments for why the dark-mode shadow colour differs
 * in lightness/opacity from light mode despite sharing the same hue
 * family.
 */
export const JALDO_ELEVATION_LEVELS = ['sm', 'md', 'lg'] as const;

export type JaldoElevationLevel = (typeof JALDO_ELEVATION_LEVELS)[number];
