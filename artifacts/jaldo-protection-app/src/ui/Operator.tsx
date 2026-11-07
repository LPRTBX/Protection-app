import { useState } from "react";
import { operatorDo, operatorView } from "../sim/views";
import { Decisions, NextSteps, type OpenMap } from "./Decisions";
import { jumpTo } from "./jump";
import { Empty, Panel, Result, useOutcome } from "./parts";
import { Authority, AuditHistory, PoliciesPanel, RequestPanel, RequestSummary, ResponsibilityBlock, ReviewPanel, Viewpoint } from "./ReviewerParts";
import { useWorld } from "./world";

/** The operator workspace: review a submitted request, check policies, confirm authority, approve specific actions. */
export function Operator() {
  const w = useWorld();
  const v = operatorView(w);
  const [outcome, setOutcome] = useOutcome();
  const [open, setOpen] = useState<OpenMap>({});
  const run = (key: string, actionId?: string) => setOutcome(operatorDo(w, key, actionId));

  if (v.status === "none") {
    return (
      <>
        <Viewpoint />
        <Panel title="Review queue" status="implemented">
          {v.scenario === "early-support" ? (
            <>
              <Empty>No review requests are waiting. In this scenario an upstream source sends one. The simulated source's event is admitted from Simulation controls; nothing exists until then.</Empty>
              <p><a className="btn btn-primary" href="#/simulation">Open Simulation controls</a></p>
            </>
          ) : (
            <>
              <Empty>No requests are waiting. In this prototype a request arrives when the customer sends one from the customer view.</Empty>
              <p><a className="btn btn-primary" href="#/customer/options">Open the customer view</a></p>
            </>
          )}
        </Panel>
        <Authority v={v} />
      </>
    );
  }

  return (
    <>
      <Viewpoint />
      <nav className="jump" aria-label="On this page">
        <ul>
          {["next", ...(v.review ? ["why"] : []), ...(v.status === "owner_accepted" ? ["actions"] : []), "policies", "request", "authority", "record"].map((id) => (
            <li key={id}><a href={`#${id}`} onClick={(e) => { e.preventDefault(); jumpTo(id); }}>{{ next: "Needs a person", why: "Why review", actions: "Decide", policies: "Requirements", request: "Request", authority: "Authority", record: "Audit history" }[id]}</a></li>
          ))}
        </ul>
      </nav>

      <Panel title="Review queue" status="implemented" id="queue">
        <RequestSummary v={v} />
        <NextSteps v={v} onJump={jumpTo} />
        <ResponsibilityBlock v={v} run={run} />
      </Panel>

      {v.review ? <ReviewPanel r={v.review} /> : null}

      {v.status === "owner_accepted" ? <Decisions v={v} run={run} open={open} setOpen={setOpen} /> : null}

      <PoliciesPanel v={v} />

      <RequestPanel v={v} />

      <Authority v={v} />

      <AuditHistory v={v} />

      <div className="toast-space" aria-hidden="true" />
      {outcome ? <div className="toast"><Result outcome={outcome} /></div> : <Result outcome={null} />}
    </>
  );
}
