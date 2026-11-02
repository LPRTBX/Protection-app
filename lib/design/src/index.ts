/**
 * @workspace/design — JALDO shared design foundation (Phase 1A).
 *
 * Presentation-only. See ../README.md for what this package is and is not.
 */

// Shared utility
export { cn } from './lib/utils';

// Shared primitives (Phase 1A slice: Button, Badge, Card, Table, Tooltip,
// Separator only — see README for what remains local to each app for now)
export {
  Button,
  buttonVariants,
  type ButtonProps,
} from './components/ui/button';
export { Badge, badgeVariants, type BadgeProps } from './components/ui/badge';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from './components/ui/card';
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './components/ui/table';
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/ui/tooltip';
export { Separator } from './components/ui/separator';

// Maturity / data-authority presentation (Phase 0 two-axis model)
export {
  MaturityBadge,
  DELIVERY_MATURITY_VALUES,
  DATA_AUTHORITY_STATUS_VALUES,
  type MaturityBadgeProps,
  type DeliveryMaturity,
  type DataAuthorityStatus,
} from './components/maturity-badge';
