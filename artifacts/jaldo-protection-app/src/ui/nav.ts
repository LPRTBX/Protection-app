export interface NavItem {
  route: string;
  label: string;
  hint: string;
  group: "demo" | "roles" | "evidence";
}
/** The route ids are stable so existing direct links keep working. Only the visitor-facing labels and grouping change. */
export const NAV_GROUPS: readonly { id: NavItem["group"]; label: string; note?: string }[] = [
  { id: "demo", label: "Guided demonstration" },
  { id: "roles", label: "Role workspaces", note: "Switching between roles is a demonstration control, not sign-in. A real customer or staff member would open only their own workspace." },
  { id: "evidence", label: "Technical evidence" },
];
/** The seven destinations; "learning" is an optional exploration, not part of the guided journey. Each viewpoint has its own route and its own projection; none is a filtered copy of another. */
export const NAV: readonly NavItem[] = [
  { route: "guide", label: "Guided demonstration", hint: "One recommended journey", group: "demo" },
  { route: "customer", label: "Customer", hint: "My request and updates", group: "roles" },
  { route: "operator", label: "Reviewer", hint: "What needs attention, then decide", group: "roles" },
  { route: "operations", label: "Operations", hint: "Execution, evidence, exceptions", group: "roles" },
  { route: "simulation", label: "Simulation controls", hint: "Stand-in systems and the clock", group: "evidence" },
  { route: "learning", label: "Next time: governed learning", hint: "Separate scripted simulation", group: "evidence" },
  { route: "about", label: "Roles and boundaries", hint: "Permissions, limits, what is not built", group: "evidence" },
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

/** The reviewer role preview: one person, one workspace. Presentation only: this is navigation, not authentication or access control. */
export const REVIEWER_STEPS = [
  { step: "my-work", path: "reviewer", label: "My work", hint: "What is waiting for me" },
  { step: "situation", path: "reviewer/situation", label: "Situation", hint: "What I need to know" },
  { step: "decision", path: "reviewer/decision", label: "Decision", hint: "What I can decide now" },
  { step: "follow-through", path: "reviewer/follow-through", label: "Follow-through", hint: "What happened next" },
] as const;
export type ReviewerStep = (typeof REVIEWER_STEPS)[number]["step"];

export type Experience = { experience: "start" } | { experience: "observe" } | { experience: "reviewer"; step: ReviewerStep } | { experience: "explore" };
/** Which experience a hash belongs to. An empty hash is the front door; every earlier explore route keeps working. */
export function experienceOf(hash: string): Experience {
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "" || parts[0] === "start") return { experience: "start" };
  if (parts[0] === "observe") return { experience: "observe" };
  if (parts[0] === "reviewer") return { experience: "reviewer", step: (REVIEWER_STEPS.find((s) => s.path === `reviewer/${parts[1]}`)?.step ?? "my-work") as ReviewerStep };
  return { experience: "explore" };
}
/** Change route without reloading the document (a hash link inside a sandboxed frame can replace it). */
export const navigate = (hash: string) => {
  try { history.pushState(null, "", hash); window.dispatchEvent(new HashChangeEvent("hashchange")); } catch { window.location.hash = hash; }
};
