import { createContext, useContext, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { navigate } from "./nav";

/**
 * Navigation inside one panel of the observer view. Three panels share one document, so none of them can use the URL hash for
 * its own screens: each keeps its own current screen, and links inside it ask its context to change that screen. Outside a
 * panel (the normal single-role experiences) the same links are ordinary hash links, so nothing else changes.
 */
export interface PanelNav { id: string; go: (to: string) => void }
const Ctx = createContext<PanelNav | null>(null);
export const PanelNavProvider = ({ value, children }: { value: PanelNav; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export const usePanelNav = () => useContext(Ctx);
/** True inside an observer panel. */
export const useEmbedded = () => useContext(Ctx) !== null;

/** Go to a screen by its path (for example "reviewer/decision"), in the panel if there is one, otherwise by hash. */
export function useGo(): (to: string) => void {
  const c = useContext(Ctx);
  return c ? c.go : (to) => navigate(`#/${to}`);
}

export function NavLink({ to, onClick, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const c = useContext(Ctx);
  // Inside a panel the link is a panel-scoped fragment, never a page route: a host that turns "#/route" links into page navigation
  // (the isolated preview does, to survive sandboxed frames) must not take the panel out of the observer view.
  const href = c ? `#${c.id}-${to.replace(/\//g, "-")}` : `#/${to}`;
  return <a href={href} {...rest} onClick={c ? (e: MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); onClick?.(e); c.go(to); } : onClick} />;
}

/** A screen title: the page's h1 normally, a panel heading (h2) inside the observer view, so the page keeps one h1. */
export function PageTitle({ children }: { children: ReactNode }) {
  const c = useContext(Ctx);
  return c ? <h2 id={`${c.id}-title`} className="page-title" tabIndex={-1} data-panel-title>{children}</h2> : <h1 id="screen-title" tabIndex={-1}>{children}</h1>;
}
