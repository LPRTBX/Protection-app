/**
 * In-page navigation for the "On this page" links. A link to a collapsed section must reveal it and move keyboard focus to
 * something focusable inside it; a link to an action or prepared message takes focus to its "Review this action" entry; a link to a panel
 * takes focus to its heading. Focus is moved without a second scroll.
 */
export function jumpTo(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  if (el instanceof HTMLDetailsElement) el.open = true;
  // Inside an observer panel, scroll that panel only: the page and the other panels keep their own scroll positions.
  const scroller = el.closest<HTMLElement>("[data-panel-scroll]");
  if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  else el.scrollIntoView({ block: "start" });
  let target: HTMLElement | null = null;
  if (el instanceof HTMLDetailsElement) target = el.querySelector("summary");
  else if (el.querySelector(":scope > details.review-action > summary")) target = el.querySelector(":scope > details.review-action > summary");
  else if (el.hasAttribute("tabindex")) target = el;
  else {
    const heading = el.querySelector<HTMLElement>("h2, h3");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      target = heading;
    }
  }
  target?.focus({ preventScroll: true });
  return true;
}
