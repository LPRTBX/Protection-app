import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { PanelId } from "./changes";

/** A panel's own saved scroll positions survive it being hidden (a hidden element loses its scroll offset). */
const saved: Partial<Record<PanelId, number>> = {};

export interface FrameProps {
  id: PanelId;
  title: string;
  sees: string;
  visible: boolean;
  /** "Updated" chip shown briefly after a real change in this panel. */
  pulse: boolean;
  /** Updates that arrived while this panel was hidden. */
  unseen: number;
  nav?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * One role's panel: its own header, navigation, scroll region and results area. Panels never share navigation or scroll. The
 * scroll region is a focusable, named region so it can be scrolled from the keyboard.
 */
export function PanelFrame({ id, title, sees, visible, pulse, unseen, nav, footer, children }: FrameProps) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && visible) el.scrollTop = saved[id] ?? 0;
  }, [visible, id]);
  return (
    <section id={`panel-${id}`} className={`obs-panel panel-${id}`} aria-labelledby={`panel-${id}-h`} data-panel={id} hidden={!visible}>
      <header className="obs-panel-head">
        <div>
          <h2 id={`panel-${id}-h`}>{title}</h2>
          <p className="muted obs-sees">{sees}</p>
        </div>
        <span className={`obs-pulse ${pulse ? "on" : ""}`} data-testid={`pulse-${id}`} aria-hidden="true">{pulse ? "Updated" : ""}</span>
        {unseen > 0 ? <span className="obs-unseen" data-testid={`unseen-${id}`}>{unseen} new</span> : null}
      </header>
      {nav}
      <div
        ref={scroller}
        id={`panel-${id}-scroll`}
        className="obs-scroll"
        data-panel-scroll
        tabIndex={0}
        role="region"
        aria-label={`${title} screen`}
        onScroll={(e) => { saved[id] = (e.currentTarget as HTMLDivElement).scrollTop; }}
      >
        {children}
      </div>
      {footer}
    </section>
  );
}

export const scrollPanelToTop = (id: PanelId) => { saved[id] = 0; const el = document.getElementById(`panel-${id}-scroll`); if (el) el.scrollTop = 0; };
