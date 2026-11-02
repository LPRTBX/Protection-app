export interface NavItem {
  route: string;
  label: string;
  hint: string;
}
/** The six destinations. Each viewpoint has its own route and its own projection; none is a filtered copy of another. */
export const NAV: readonly NavItem[] = [
  { route: "guide", label: "Start here", hint: "The journey in seven steps" },
  { route: "customer", label: "Customer app", hint: "What the customer sees" },
  { route: "operator", label: "Operator workspace", hint: "Review, check, authorise" },
  { route: "operations", label: "Protection Operations", hint: "Execution, evidence, gaps" },
  { route: "simulation", label: "Simulation controls", hint: "Stand-in systems and the clock" },
  { route: "about", label: "About this prototype", hint: "Screens, roles, boundaries" },
];
export const CUSTOMER_TABS = [
  { tab: "today", label: "Today" },
  { tab: "options", label: "Protection options" },
  { tab: "support", label: "Support" },
  { tab: "updates", label: "My updates" },
] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number]["tab"];

export interface Route {
  route: string;
  tab: CustomerTab;
}
export function routeOf(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/");
  const route = NAV.some((n) => n.route === parts[0]) ? parts[0] : "guide";
  const tab = (CUSTOMER_TABS.find((t) => t.tab === parts[1])?.tab ?? "today") as CustomerTab;
  return { route, tab };
}
export const go = (path: string) => {
  window.location.hash = `#/${path}`;
};
