/**
 * The Protection overview on the main JALDO site is the primary partner-facing front door. The app links back to it so a
 * visitor who lands here directly can see how the operating model, operator workspace and customer app connect.
 * Override at build time with VITE_PROTECTION_OVERVIEW_URL (for example, a review deployment).
 */
const FALLBACK = "https://wearejaldo.com/protection";
export const OVERVIEW_URL: string = (import.meta.env?.VITE_PROTECTION_OVERVIEW_URL as string | undefined) || FALLBACK;
export const OVERVIEW_LABEL = "Explore JALDO Protection";
