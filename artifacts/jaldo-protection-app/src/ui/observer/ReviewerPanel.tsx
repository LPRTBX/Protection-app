import { useEffect, useRef, useState } from "react";
import { operatorDo, operatorView } from "../../sim/views";
import type { OpenMap } from "../Decisions";
import { jumpTo } from "../jump";
import { REVIEWER_STEPS, type ReviewerStep } from "../nav";
import { PageTitle, NavLink, PanelNavProvider } from "../panelnav";
import { Result, useOutcome } from "../parts";
import { useWorld } from "../world";
import { Decision, FollowThrough, MyWork, Situation, takePendingJump } from "../reviewer/ReviewerApp";
import { PanelFrame, scrollPanelToTop, type FrameProps } from "./PanelFrame";

/** The protection reviewer's workspace, reading only the reviewer projection. Its four steps belong to this panel. */
export function ReviewerPanel(props: Omit<FrameProps, "id" | "title" | "sees" | "children" | "nav" | "footer">) {
  const w = useWorld();
  const v = operatorView(w);
  const [step, setStep] = useState<ReviewerStep>("my-work");
  const [open, setOpen] = useState<OpenMap>({});
  const [outcome, setOutcome] = useOutcome();
  const first = useRef(true);
  const run = (key: string, actionId?: string) => setOutcome(operatorDo(w, key, actionId));
  const nav = {
    id: "obs-reviewer",
    go: (to: string) => { const s = REVIEWER_STEPS.find((x) => x.path === to); if (s) setStep(s.step); },
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    scrollPanelToTop("reviewer");
    const target = takePendingJump();
    if (target && jumpTo(target)) return;
    document.getElementById("obs-reviewer-title")?.focus({ preventScroll: true });
  }, [step]);
  const item = REVIEWER_STEPS.find((s) => s.step === step)!;
  return (
    <PanelNavProvider value={nav}>
      <PanelFrame
        id="reviewer"
        title="Protection reviewer"
        sees="The reviewer's workspace: the request, the decisions they may take, and what happened after."
        {...props}
        nav={
          <nav className="obs-nav" aria-label="Reviewer steps">
            <ul>
              {REVIEWER_STEPS.map((s) => (
                <li key={s.step}><NavLink to={s.path} aria-current={s.step === step ? "page" : undefined}>{s.label}</NavLink></li>
              ))}
            </ul>
          </nav>
        }
        footer={<div className="obs-result" aria-live="polite"><Result outcome={outcome} /></div>}
      >
        <PageTitle>{item.label}</PageTitle>
        {step === "my-work" ? <MyWork v={v} observer /> : null}
        {step === "situation" ? <Situation v={v} observer /> : null}
        {step === "decision" ? <Decision v={v} run={run} open={open} setOpen={setOpen} observer /> : null}
        {step === "follow-through" ? <FollowThrough v={v} observer /> : null}
      </PanelFrame>
    </PanelNavProvider>
  );
}
