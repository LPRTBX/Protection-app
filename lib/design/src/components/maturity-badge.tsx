import * as React from 'react';

import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

/**
 * Delivery maturity — "how far along the build actually is."
 *
 * Locked by `docs/design/JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md`. See that
 * document for full definitions of each value; this module only supplies
 * the display label, never a colour or an implied endorsement.
 */
export const DELIVERY_MATURITY_VALUES = [
  'concept',
  'functional-prototype',
  'working-proof',
  'deployable',
  'production-evidenced',
] as const;

export type DeliveryMaturity = (typeof DELIVERY_MATURITY_VALUES)[number];

const DELIVERY_MATURITY_LABELS: Record<DeliveryMaturity, string> = {
  concept: 'Concept',
  'functional-prototype': 'Functional Prototype',
  'working-proof': 'Working Proof',
  deployable: 'Deployable',
  'production-evidenced': 'Production-Evidenced',
};

/**
 * Data / authority status — "what is actually backing the data or
 * authority a surface shows," independent of delivery maturity.
 *
 * Locked by `docs/design/JALDO-DESIGN-SYSTEM-DIRECTION-v1.0.md`.
 */
export const DATA_AUTHORITY_STATUS_VALUES = [
  'illustrative',
  'synthetic',
  'core-backed',
  'external-integrated',
  'production',
] as const;

export type DataAuthorityStatus = (typeof DATA_AUTHORITY_STATUS_VALUES)[number];

const DATA_AUTHORITY_STATUS_LABELS: Record<DataAuthorityStatus, string> = {
  illustrative: 'Illustrative',
  synthetic: 'Synthetic',
  'core-backed': 'Core-backed',
  'external-integrated': 'External-Integrated',
  production: 'Production',
};

export interface MaturityBadgeProps {
  /** Which of the five delivery-maturity stages this surface is at. */
  deliveryMaturity: DeliveryMaturity;
  /** Which of the five data/authority statuses actually backs this surface. */
  dataAuthorityStatus: DataAuthorityStatus;
  className?: string;
}

/**
 * Renders both Phase 0 maturity dimensions as two neutral, plain-text
 * badges — never a single combined label, and never colour-coded by
 * status. No colour semantics are assigned to any value here: every
 * badge uses the same neutral `outline` variant regardless of which
 * value is supplied, so this component cannot itself imply "verified,"
 * "certified," or "live production" for any status. If a caller wants
 * that meaning conveyed, the supplied `dataAuthorityStatus` value
 * (`"production"`) is what says so — this component only ever displays
 * it plainly, exactly as given, never with added emphasis.
 */
export function MaturityBadge({
  deliveryMaturity,
  dataAuthorityStatus,
  className,
}: MaturityBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Badge variant="outline">
        {DELIVERY_MATURITY_LABELS[deliveryMaturity]}
      </Badge>
      <Badge variant="outline">
        {DATA_AUTHORITY_STATUS_LABELS[dataAuthorityStatus]}
      </Badge>
    </span>
  );
}
