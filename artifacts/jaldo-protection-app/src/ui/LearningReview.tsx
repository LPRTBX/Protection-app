import { useState } from "react";
import {
  createLearningRun,
  createLearningMarketingAction,
  createLearningReceivingEvidence,
  formatSydneyTime,
  LEARNING_EVIDENCE,
  LEARNING_REVIEW_REASON,
  LEARNING_UNCERTAINTIES,
  minutesBetween,
  type LearningPolicyVersion,
  type LearningMarketingAction,
  type LearningReceivingEvidence,
  type LearningRun,
  type LearningRunKind,
} from "../sim/learning";
import { Btn, Disclaimer, Panel, StatusChip } from "./parts";

type ReviewProposal = "refine" | "withdraw";

const APPROVAL_ACKNOWLEDGEMENTS = [
  "This is a fixed fictional replay, not a learned or autonomous system.",
  "The proposal changes only which already-available context is connected to a human review.",
  "The rule requests human review only; it does not decide what action, if any, should follow.",
  "I have authority as the fictional Protection reviewer to approve this simulation-only policy change.",
] as const;

function displayTime(value: string): string {
  return formatSydneyTime(value);
}

function displayStamp(value: string): string {
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
  return `${date} · ${formatSydneyTime(value)} Sydney`;
}

function RunTimeline({ run, marketingAction }: { run: LearningRun; marketingAction?: LearningMarketingAction }) {
  const reviewToSummary = minutesBetween(run.reviewAt, run.summaryDeliveredAt);
  return (
      <div className="table-wrap" role="region" aria-label={`Fictional run ${run.number} timeline; scroll horizontally if needed`} tabIndex={0}>
      <table className="lr-timeline">
        <caption className="sr-only">Fictional run {run.number}, policy version {run.policyVersion} event timeline in Sydney local time</caption>
        <thead><tr><th scope="col">Scripted event</th><th scope="col">Simulation time</th><th scope="col">Interpretation</th></tr></thead>
        <tbody>
          <tr><th scope="row">Required context ready</th><td>{displayStamp(run.contextReadyAt)}</td><td>Latest required evidence availability used by the shared learning helper.</td></tr>
          <tr><th scope="row">Human review opened</th><td>{displayStamp(run.reviewAt)}</td><td>{run.policyVersion === 2 ? "V2 opens when the final required context is available." : "V1 waits for its fixed 11:20 batch review."}</td></tr>
          <tr><th scope="row">Separate summary approval</th><td>{displayStamp(run.summaryApprovedAt)}</td><td>A fictional reviewer separately approves the customer-authorised summary for this script.</td></tr>
          {marketingAction ? <>
            <tr><th scope="row">Separate human approval</th><td>{displayStamp(marketingAction.authorisedAt)}</td><td>Fictional reviewer separately approves one simulation-only request for this run.</td></tr>
            <tr><th scope="row">Marketing-system request</th><td>{displayStamp(marketingAction.requestAt)}</td><td>In-memory simulated request only; no live service is contacted and receipt is not inferred.</td></tr>
            <tr><th scope="row">Evidence deadline / timeout</th><td>{displayStamp(marketingAction.evidenceDeadlineAt)}</td><td>{minutesBetween(marketingAction.requestAt, marketingAction.evidenceDeadlineAt)} simulated minutes after request. No acknowledgement is supplied; the fictional fallback is assigned.</td></tr>
          </> : <tr><th scope="row">Marketing-system request</th><td>Not created</td><td>A separate human approval is required; policy activation alone does not send a request.</td></tr>}
          <tr><th scope="row">Authorized support summary delivered</th><td>{displayStamp(run.summaryDeliveredAt)}</td><td>{reviewToSummary} simulated minutes after review; execution is separate from any measured effect.</td></tr>
          <tr><th scope="row">Summary delivery read-back</th><td>{displayStamp(run.summaryVerifiedAt)}</td><td>Fictional delivery execution is confirmed by the scripted read-back. Customer outcome or effect remains unknown and unmeasured.</td></tr>
        </tbody>
      </table>
      <p className="muted">Times and intervals are fixed script outputs, not live measurements. Every simulated request requires separate human approval.</p>
    </div>
  );
}

export function LearningReview() {
  const [history, setHistory] = useState<readonly LearningRun[]>([]);
  const [projection, setProjection] = useState<"internal" | "customer">("internal");
  const [activeVersion, setActiveVersion] = useState<LearningPolicyVersion>(1);
  const [v1FirstComplete, setV1FirstComplete] = useState(false);
  const [v2Proposed, setV2Proposed] = useState(false);
  const [dryRunComplete, setDryRunComplete] = useState(false);
  const [approved, setApproved] = useState(false);
  const [activated, setActivated] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const [acknowledgements, setAcknowledgements] = useState<boolean[]>(() => APPROVAL_ACKNOWLEDGEMENTS.map(() => false));
  const [reviewMessage, setReviewMessage] = useState("No run has been replayed yet. All events below are invented and browser-local.");
  const [messageTone, setMessageTone] = useState<"info" | "warning" | "danger" | "success">("info");
  const [duplicateReplayAttempted, setDuplicateReplayAttempted] = useState(false);
  const [duplicateActivationAttempted, setDuplicateActivationAttempted] = useState(false);
  const [processedEventActionKeys, setProcessedEventActionKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [marketingActions, setMarketingActions] = useState<readonly LearningMarketingAction[]>([]);
  const [marketingApprovalChecked, setMarketingApprovalChecked] = useState(false);
  const [duplicateMarketingAttempted, setDuplicateMarketingAttempted] = useState(false);
  const [receivingEvidence, setReceivingEvidence] = useState<"present" | "not-present" | "unknown">("unknown");
  const [evidenceRecords, setEvidenceRecords] = useState<readonly LearningReceivingEvidence[]>([]);
  const [proposalChoice, setProposalChoice] = useState<ReviewProposal>("refine");
  const [proposalDecision, setProposalDecision] = useState<ReviewProposal | null>(null);

  const nextNumber = history.length + 1;
  const latestRun = history[history.length - 1];
  const latestMarketingAction = latestRun ? marketingActions.find((action) => action.runNumber === latestRun.number) : undefined;
  const firstAvailable = !v1FirstComplete && history.length === 0;
  const canRunCurrentVersion = activeVersion === 2
    ? activated
    : firstAvailable || (rolledBack && v1FirstComplete);
  const allAcknowledged = acknowledgements.every(Boolean);
  const evidenceHistoryForLatest = latestRun
    ? evidenceRecords.filter((record) => record.runNumber === latestRun.number)
    : [];
  const evidenceForLatest = evidenceHistoryForLatest[evidenceHistoryForLatest.length - 1];

  function announce(text: string, tone: "info" | "warning" | "danger" | "success" = "info") {
    setReviewMessage(text);
    setMessageTone(tone);
  }

  function replayRun() {
    if (!canRunCurrentVersion) {
      announce("Replay refused: this version is not eligible for a new run. V1 is first-run-only until a reviewed V2 rollback.", "danger");
      return;
    }
    const key: LearningRunKind = activeVersion === 2 ? "next" : rolledBack ? "rollback" : "first";
    const run = createLearningRun(key, nextNumber, activeVersion);
    const runKeys = [
      ...LEARNING_EVIDENCE.map((item) => `run:${run.number}:event:${item.id}`),
      `run:${run.number}:action:authorized-summary`,
    ];
    setProcessedEventActionKeys((previous) => new Set([...previous, ...runKeys]));
    setHistory((previous) => [...previous, run]);
    setMarketingApprovalChecked(false);
    setDuplicateMarketingAttempted(false);
    if (activeVersion === 1 && !v1FirstComplete) setV1FirstComplete(true);
    setDuplicateReplayAttempted(false);
    announce(
      `Fictional run ${run.number} saved immutably with policy V${run.policyVersion}. Marketing receipt remains unverified; its timeout has a fallback reconciliation assignment.`,
      "success",
    );
  }

  function proposeV2() {
    if (!v1FirstComplete || v2Proposed) {
      announce("Proposal refused: V2 can be proposed once, after the first V1 run.", "danger");
      return;
    }
    setV2Proposed(true);
    announce("V2 proposal recorded for dry-run review only. It does not change the active version.", "success");
  }

  function runDryRun() {
    if (!v2Proposed || dryRunComplete) {
      announce("Dry run unavailable: propose V2 first; the scripted dry run is one-time.", "danger");
      return;
    }
    setDryRunComplete(true);
    announce("Dry run complete. Shared helper results show the fixed comparison below; no policy was activated and no run was added to history.", "success");
  }

  function approveV2() {
    if (!dryRunComplete || !allAcknowledged || approved) {
      announce("Approval refused: complete the dry run and every unticked human acknowledgement first. Approval cannot be duplicated.", "danger");
      return;
    }
    setApproved(true);
    announce("Fictional Protection reviewer approval recorded. V2 is approved but not active.", "success");
  }

  function activateV2() {
    if (!approved || activated) {
      setDuplicateActivationAttempted(true);
      announce(activated ? "Duplicate activation refused. V2 was already activated once; no state changed." : "Activation refused: a fictional Protection reviewer must approve V2 first.", "danger");
      return;
    }
    setActiveVersion(2);
    setActivated(true);
    setDuplicateActivationAttempted(false);
    announce("V2 activated for this fictional simulation only. It applies to future runs; saved history is unchanged.", "success");
  }

  function rollbackToV1() {
    if (!activated || activeVersion !== 2 || rolledBack) {
      announce("Rollback refused: rollback is available once after V2 activation and changes future runs only.", "danger");
      return;
    }
    setActiveVersion(1);
    setRolledBack(true);
    announce("V1 restored for future simulation runs only. Existing run records remain unchanged.", "success");
  }

  function attemptDuplicateReplay() {
    if (!latestRun) {
      announce("No prior run exists to replay. No event or action was created.", "warning");
      return;
    }
    const attemptedKeys = [
      ...LEARNING_EVIDENCE.map((item) => `run:${latestRun.number}:event:${item.id}`),
      `run:${latestRun.number}:action:marketing-request`,
      `run:${latestRun.number}:action:authorized-summary`,
    ];
    const duplicate = attemptedKeys.find((key) => processedEventActionKeys.has(key));
    if (!duplicate) {
      announce("Replay refused: no original event/action key was found to replay.", "danger");
      return;
    }
    setDuplicateReplayAttempted(true);
    announce(`Duplicate event/action replay refused for run ${latestRun.number} (${duplicate.split(":").slice(-1)[0]}). Its immutable key already exists; history and counts did not change.`, "danger");
  }

  function recordReceivingEvidence() {
    if (!latestRun || !latestMarketingAction) {
      announce("Evidence record refused: no separately approved simulated marketing request exists for this run.", "danger");
      return;
    }
    if (evidenceForLatest?.result === receivingEvidence) {
      announce(`Duplicate evidence refused for run ${latestRun.number}. The prior finding remains in its history.`, "danger");
      return;
    }
    const record = createLearningReceivingEvidence(latestMarketingAction, receivingEvidence, evidenceHistoryForLatest.length + 1);
    setEvidenceRecords((previous) => [...previous, record]);
    announce(`Fictional receiving-system finding ${record.sequence} manually recorded for run ${latestRun.number} at ${displayTime(record.recordedAt)}: ${receivingEvidence === "present" ? "request present" : receivingEvidence === "not-present" ? "request not present" : "still unknown"}. Earlier findings remain unchanged; this is not a live-system confirmation.`, "success");
  }

  function authorizeMarketingRequest() {
    if (latestRun && marketingActions.some((action) => action.runNumber === latestRun.number)) {
      setDuplicateMarketingAttempted(true);
      announce(`Duplicate action refused for run ${latestRun.number}. Its one-time approval and request record remain unchanged.`, "danger");
      return;
    }
    if (!latestRun || !marketingApprovalChecked) {
      announce("No simulated request created. A run and a separate human reviewer approval are required first.", "danger");
      return;
    }
    const action = createLearningMarketingAction(latestRun);
    setMarketingActions((previous) => [...previous, action]);
    setProcessedEventActionKeys((previous) => new Set([...previous, `run:${latestRun.number}:action:marketing-request`]));
    setMarketingApprovalChecked(false);
    setDuplicateMarketingAttempted(false);
    announce(`Fictional Protection reviewer separately approved one request for run ${latestRun.number}. It exists only in this browser simulation; no service was contacted.`, "success");
  }

  function recordAlertProposal() {
    setProposalDecision(proposalChoice);
    announce(proposalChoice === "refine"
      ? "Human alternative recorded: refine the fictional alert rule for later review. No automatic tightening or activation occurred."
      : "Human alternative recorded: withdraw the fictional alert proposal. No automatic policy change occurred.", "success");
  }

  const firstRun = history[0];
  const improvedRun = history.find((run) => run.policyVersion === 2);
  const v2Comparison = dryRunComplete && firstRun
    ? createLearningRun("next", firstRun.number + 1, 2)
    : null;

  return (
    <div className="learning-review">
      <Panel
        title="Next time: governed learning review"
        status="simulation"
        intro="A scripted, governed-learning walkthrough using fixed fictional evidence. This is not AI, autonomous machine learning, a live policy engine or a connection to real services."
        id="learning-review"
      >
        <fieldset className="lr-choice lr-projection">
          <legend>Choose a separate demonstration view</legend>
          <label>
            <input type="radio" name="learning-projection" value="internal" checked={projection === "internal"} onChange={() => setProjection("internal")} />
            <span><strong>Restricted internal learning</strong><small>Governance, evidence and policy simulation</small></span>
          </label>
          <label>
            <input type="radio" name="learning-projection" value="customer" checked={projection === "customer"} onChange={() => setProjection("customer")} />
            <span><strong>Customer summary preview</strong><small>Only the separately authorised customer-facing summary</small></span>
          </label>
        </fieldset>
        {projection === "internal" ? (
          <>
        <div className="lr-banner">
          <div>
            <span className="lr-kicker">Protection policy review · fictional browser simulation</span>
            <p><strong>Human review stays in control.</strong> A version change needs a dry run, explicit reviewer acknowledgements, approval and a separate activation step.</p>
          </div>
          <StatusChip status="simulation" />
        </div>
        <dl className="lr-grid">
          <div className="lr-fact"><dt>Active for future runs</dt><dd>Policy V{activeVersion}{activeVersion === 1 && rolledBack ? " · rolled back" : ""}</dd></div>
          <div className="lr-fact"><dt>Run history</dt><dd>{history.length} fictional run{history.length === 1 ? "" : "s"} · append-only in this component</dd></div>
        </dl>
        <div className="lr-actions">
          <Btn tone="primary" onClick={replayRun} disabled={!canRunCurrentVersion}>
            {history.length === 0 ? "Run first V1 occurrence" : `Replay fixed sequence with V${activeVersion}`}
          </Btn>
          <span className="muted">Run {nextNumber} will be a fresh simulation occurrence; prior records are retained.</span>
        </div>
        <p className="lr-status" role="status" aria-live="polite" data-tone={messageTone}>{reviewMessage}</p>

        <div className="lr-section">
          <h3>Occurrence and timestamp evidence</h3>
          <p>Occurrence is when an event happened. “Available to team” is when a source made that record available to the fictional team. Connection is separate: information can be available to the team but not connected to its review queue.</p>
          <div className="table-wrap" role="region" aria-label="Fictional evidence timestamps; scroll horizontally if needed" tabIndex={0}>
            <table className="lr-timeline">
              <caption className="sr-only">Fixed fictional evidence occurrence and availability timestamps, Sydney local time</caption>
              <thead><tr><th scope="col">Evidence</th><th scope="col">Occurrence</th><th scope="col">Available to team</th><th scope="col">Before V2</th><th scope="col">After approved V2</th></tr></thead>
              <tbody>{LEARNING_EVIDENCE.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.label}</th>
                  <td>{item.occurredAt.includes("T") ? displayStamp(item.occurredAt) : `03 Nov 2026 · ${item.occurredAt} Sydney`}</td>
                  <td>{displayStamp(item.availableAt)}</td>
                  <td>{item.beforeConnection}.</td>
                  <td>{item.afterConnection}.</td>
                </tr>
              ))}
                <tr>
                  <th scope="row">Earlier-history context not supplied</th>
                  <td>No event record</td><td>Unavailable</td>
                  <td>No record exists to connect.</td>
                  <td>Still unavailable; V2 does not invent missing information.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note">“Unavailable” means there is no source record to connect. “Available but not connected” means the record exists and the team can access it at the source, but it has not reached the review queue. The proposal changes that connection only; it does not change when events occurred.</p>
          <Disclaimer>{LEARNING_REVIEW_REASON}</Disclaimer>
          <p><strong>Still uncertain:</strong></p>
          <ul className="list">{LEARNING_UNCERTAINTIES.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="muted">The reviewer who can approve a policy change is the fictional Protection reviewer with the policy-approval responsibility shown below. A model or other operator cannot approve it.</p>
        </div>

        <div className="lr-section">
          <h3>Version proposal and human decision</h3>
          <p><strong>V1:</strong> waits for its fixed batch review. <strong>Proposed V2:</strong> connects already-available required context and opens review when the final required item arrives. It changes review timing in this script, not the evidence itself.</p>
          <div className="lr-actions">
            <Btn onClick={proposeV2} disabled={!v1FirstComplete || v2Proposed}>Propose V2 after first V1 run</Btn>
            {v2Proposed ? <span className="lr-inline"><StatusChip status="simulation" /> Proposed · inactive</span> : null}
            <Btn onClick={runDryRun} disabled={!v2Proposed || dryRunComplete}>Test proposal as dry run</Btn>
          </div>
          {dryRunComplete && firstRun && v2Comparison ? (
            <div className="card">
              <h4>Dry-run comparison · generated by learning.ts</h4>
              <p>V1 review: <strong>{displayTime(firstRun.reviewAt)}</strong>. V2 review: <strong>{displayTime(v2Comparison.reviewAt)}</strong>.</p>
              <p>Review opens <strong>{minutesBetween(v2Comparison.reviewAt, firstRun.reviewAt)} simulated minutes earlier</strong> in this fixed replay. Scripted repeat-question counts: V1 <strong>{firstRun.repeatQuestions}</strong>, V2 <strong>{v2Comparison.repeatQuestions}</strong>. These are invented script values, not measured customer outcomes or evidence of effect.</p>
              <p className="muted">No activation, restriction, customer inference or automatic rule tightening is performed by a dry run.</p>
            </div>
          ) : null}
          {dryRunComplete ? (
            <fieldset className="lr-checks">
              <legend>Fictional Protection reviewer approval — each acknowledgement starts unticked</legend>
              {APPROVAL_ACKNOWLEDGEMENTS.map((item, index) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={acknowledgements[index]}
                    disabled={approved}
                    onChange={(event) => setAcknowledgements((previous) => previous.map((checked, i) => i === index ? event.target.checked : checked))}
                  />
                  <span>{item}</span>
                </label>
              ))}
              <p className="muted">Only a fictional Protection reviewer with policy approval authority may approve. The customer, an automated process or a support operator without that authority cannot approve this policy.</p>
              <div className="lr-actions">
                <Btn tone="primary" onClick={approveV2} disabled={!allAcknowledged || approved}>Record human reviewer approval</Btn>
                {approved ? <span className="lr-inline"><StatusChip status="simulation" /> Approved, not yet active</span> : null}
              </div>
            </fieldset>
          ) : null}
          <div className="lr-actions">
            <Btn tone="primary" onClick={activateV2} disabled={!approved || activated}>Activate V2 for simulation only</Btn>
            {activated ? <Btn onClick={() => activateV2()}>Attempt duplicate activation</Btn> : null}
            {duplicateActivationAttempted ? <span className="muted">Second activation rejected; active version unchanged.</span> : null}
            <Btn onClick={rollbackToV1} disabled={!activated || activeVersion !== 2 || rolledBack}>Rollback future runs to V1</Btn>
            {rolledBack ? <span className="muted">V1 is active for future runs; earlier runs remain.</span> : null}
          </div>
          <p className="note">Activation is a fictional simulation state only. Rollback affects future runs; it never erases or rewrites saved run history.</p>
        </div>

        <div className="lr-section">
          <h3>Fixed alert example: human alternatives only</h3>
          <div className="card attention">
            <p><strong>Unnecessary / inconclusive alert example.</strong> In this separate fixed fictional example, a reviewer finds the matching pattern was routine and no action was needed. That observation does not prove whether any person was affected. It can support a human proposal to refine or withdraw a rule, not automatic tightening.</p>
            <fieldset className="lr-choice">
              <legend>Choose a human proposal; neither choice changes an active rule</legend>
              <label>
                <input type="radio" name="learning-alert-choice" value="refine" checked={proposalChoice === "refine"} onChange={() => setProposalChoice("refine")} />
                <span><strong>Refine for later review.</strong> Propose a clearer rule and gather human review before any future decision.</span>
              </label>
              <label>
                <input type="radio" name="learning-alert-choice" value="withdraw" checked={proposalChoice === "withdraw"} onChange={() => setProposalChoice("withdraw")} />
                <span><strong>Withdraw the proposal.</strong> Leave the current simulation rule unchanged and do not activate a replacement.</span>
              </label>
            </fieldset>
            <Btn onClick={recordAlertProposal}>Record selected human alternative</Btn>
            {proposalDecision ? <p className="lr-status" role="status">Recorded: {proposalDecision === "refine" ? "refine for later human review" : "withdraw proposal"}. No automatic tightening or activation.</p> : null}
          </div>
        </div>

        <div className="lr-section">
          <h3>Marketing acknowledgement and fallback</h3>
          <p>A version change never sends a marketing request. For each run, a fictional Protection reviewer must separately approve the one-time simulation request below. At its scripted deadline, missing acknowledgement evidence is shown as unresolved and assigned to an accountable Protection Operations fallback. No real system is contacted.</p>
          {latestRun ? (
            <div className="card">
              <p><strong>Latest run {latestRun.number}:</strong> human action approval is separate from policy approval. Only a Protection reviewer with action authority can approve the following simulated request.</p>
              {latestMarketingAction ? (
                <>
                  <p><strong>Separately authorised by:</strong> fictional Protection reviewer at {displayTime(latestMarketingAction.authorisedAt)}. In-memory request at {displayTime(latestMarketingAction.requestAt)}; evidence deadline at {displayTime(latestMarketingAction.evidenceDeadlineAt)}.</p>
                  <p><strong>Fallback assignment:</strong> fictional Protection Operations officer to check the receiving system's own record. Timeout is not success and does not trigger a retry.</p>
                </>
              ) : (
                <fieldset className="lr-checks">
                  <legend>Separate human action approval, not implied by policy approval</legend>
                  <label>
                    <input type="checkbox" checked={marketingApprovalChecked} onChange={(event) => setMarketingApprovalChecked(event.target.checked)} />
                    <span>I am the fictional Protection reviewer and separately approve one simulation-only request for this run.</span>
                  </label>
                  <Btn tone="primary" onClick={authorizeMarketingRequest} disabled={!marketingApprovalChecked}>Approve and record the simulated request</Btn>
                  <p className="muted">Approval creates only a local scripted event. It cannot change an account, contact a customer or call a marketing service.</p>
                </fieldset>
              )}
              {latestMarketingAction ? (
                <>
                  <p className="lr-status" role="status" data-tone={evidenceForLatest?.result === "present" ? "success" : "warning"}>
                    {!evidenceForLatest ? "Unresolved · no receiving-system evidence recorded. Do not claim the request succeeded." : evidenceForLatest.result === "present" ? "Human-recorded fictional evidence: request appears in the receiving-system record. This does not by itself prove the requested outcome." : evidenceForLatest.result === "not-present" ? "Human-recorded fictional evidence: request was not found in the receiving-system record. Its outcome is not confirmed; do not retry automatically." : "Still unresolved: the human record is unknown or inconclusive, so the acknowledgement remains unresolved."} This is not a live-system result.
                  </p>
                  <fieldset className="lr-choice">
                    <legend>Fictional receiving-system evidence found by a human</legend>
                    <label><input type="radio" name="receiving-evidence" value="present" checked={receivingEvidence === "present"} onChange={() => setReceivingEvidence("present")} /><span>Request present in receiving-system record</span></label>
                    <label><input type="radio" name="receiving-evidence" value="not-present" checked={receivingEvidence === "not-present"} onChange={() => setReceivingEvidence("not-present")} /><span>Request not present</span></label>
                    <label><input type="radio" name="receiving-evidence" value="unknown" checked={receivingEvidence === "unknown"} onChange={() => setReceivingEvidence("unknown")} /><span>Still unknown / inconclusive</span></label>
                  </fieldset>
                  <Btn onClick={recordReceivingEvidence} disabled={evidenceForLatest?.result === receivingEvidence}>Manually record new receiving-system evidence</Btn>
                  {evidenceHistoryForLatest.length ? (
                    <div className="lr-evidence-history">
                      <p><strong>Append-only evidence history for this request</strong></p>
                      <ol className="history">{evidenceHistoryForLatest.map((record) => (
                        <li key={`${record.runNumber}-${record.sequence}`}>
                          Finding {record.sequence} at {displayTime(record.recordedAt)}: {record.result === "present" ? "request present in receiving-system record" : record.result === "not-present" ? "request not present in receiving-system record" : "unknown / inconclusive"}
                        </li>
                      ))}</ol>
                    </div>
                  ) : null}
                </>
              ) : <p className="empty">No action or acknowledgement exists until a reviewer separately approves the simulated request.</p>}
              {latestMarketingAction ? (
                <div className="lr-actions">
                  <Btn onClick={authorizeMarketingRequest}>Attempt duplicate action replay</Btn>
                  {duplicateMarketingAttempted ? <span className="muted">Duplicate action rejected; request count and history did not change.</span> : null}
                  {evidenceHistoryForLatest.length ? <span className="muted">New findings append to history; an identical latest finding is refused.</span> : null}
                </div>
              ) : null}
            </div>
          ) : <p className="empty">Run the first fictional occurrence. No request is created until a human separately authorises one.</p>}
        </div>

        <div className="lr-section">
          <h3>Customer-authorized summary · separate from effect</h3>
          <p>The fixed evidence includes explicit customer authorisation and a separate fictional reviewer approval for the support summary. The script records delivery and read-back as execution evidence only. Whether that helped the customer is unknown and unmeasured.</p>
          {latestRun ? (
            <dl className="lr-grid">
              <div className="lr-fact"><dt>Authorized execution</dt><dd>Fictional summary delivered {displayTime(latestRun.summaryDeliveredAt)}; delivery read-back recorded {displayTime(latestRun.summaryVerifiedAt)}.</dd></div>
              <div className="lr-fact"><dt>Effect on customer</dt><dd>Unknown / unmeasured. Delivery confirmation is not an outcome measure.</dd></div>
            </dl>
          ) : <p className="empty">Execution appears after a fictional run is replayed.</p>}
        </div>

        <div className="lr-section">
          <h3>What changed after review</h3>
          <div className="table-wrap" role="region" aria-label="Learning review comparison; scroll horizontally if needed" tabIndex={0}>
            <table className="lr-timeline">
              <caption className="sr-only">Observed issue, proposal, approval and next-run evidence for each learning area</caption>
              <thead><tr><th scope="col">Area</th><th scope="col">Observed issue</th><th scope="col">Proposed adjustment</th><th scope="col">Approval status</th><th scope="col">Next-run evidence</th></tr></thead>
              <tbody>
                <tr>
                  <th scope="row">Recognition</th>
                  <td>V1 waits for a fixed batch even though some source context is available earlier.</td>
                  <td>Connect available required context to the review queue; do not invent unavailable context.</td>
                  <td>{activated ? "Approved and active for this simulation." : approved ? "Approved; activation pending." : dryRunComplete ? "Dry run complete; approval pending." : v2Proposed ? "Proposed; not approved." : "No proposal."}</td>
                  <td>{improvedRun ? `Run ${improvedRun.number} V2 opened at ${displayTime(improvedRun.reviewAt)}; V1 opened at ${displayTime(firstRun!.reviewAt)}.` : v2Comparison ? `Dry run predicts ${minutesBetween(v2Comparison.reviewAt, firstRun!.reviewAt)} minutes earlier; no live replay yet.` : "Awaiting a V2 test and replay."}</td>
                </tr>
                <tr>
                  <th scope="row">Coordination</th>
                  <td>A missing marketing acknowledgement can remain unseen without a clear owner.</td>
                  <td>Keep it unresolved and assign a named accountable fallback to check the receiving record.</td>
                  <td>{activated ? "Included in the approved V2 simulation." : approved ? "V2 approved; inactive." : "Not active; no automatic handoff."}</td>
                  <td>{latestRun ? !latestMarketingAction ? "No marketing action exists until separately approved." : evidenceForLatest ? "Human evidence recorded; the resulting status is stated above." : "Still unresolved pending receiving-system evidence." : "Awaiting a run; no acknowledgement is assumed."}</td>
                </tr>
                <tr>
                  <th scope="row">Customer experience</th>
                  <td>Support handoffs can ask the customer to repeat information they already chose to share.</td>
                  <td>Carry only the customer's explicitly authorised support summary; exclude internal learning.</td>
                  <td>{activated ? "Included in the approved V2 simulation." : approved ? "V2 approved; inactive." : "Not active; summary still needs explicit customer authorisation."}</td>
                  <td>{latestRun ? `Run ${latestRun.number}: ${latestRun.repeatQuestions} scripted repeat prompt${latestRun.repeatQuestions === 1 ? "" : "s"}; delivery read-back ${displayTime(latestRun.summaryVerifiedAt)}. Effect remains unknown.` : "Awaiting run evidence; no customer experience result claimed."}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted">All counts and time intervals above are drawn from <code>learning.ts</code> helper outputs and labelled as simulation values.</p>
          <p className="muted">This sits alongside the existing customer-requested break (P1), operator-originated early-support (P2), and failure-pattern presets. Open <a className="lr-simulation-link" href="#/simulation">Simulation controls</a> to explore those patterns; this walkthrough does not alter their records. The imported preview has no separate high-risk classification scenario, so this example does not invent one.</p>
        </div>

        <div className="lr-section">
          <h3>Immutable run history</h3>
          {history.length ? (
            <>
              <ol className="lr-history">
                {history.map((run) => (
                  <li className="lr-history-item" key={`${run.number}-${run.key}`}>
                    <div className="lr-history-head">
                      <strong>Run {run.number} · {run.key === "first" ? "first occurrence" : run.key === "rollback" ? "after rollback" : "fresh replay"}</strong>
                      <StatusChip status="simulation" />
                    </div>
                    <p>Policy V{run.policyVersion} · {run.repeatQuestions} scripted repeat question{run.repeatQuestions === 1 ? "" : "s"} · review at {displayTime(run.reviewAt)}.</p>
                    <RunTimeline run={run} marketingAction={marketingActions.find((action) => action.runNumber === run.number)} />
                  </li>
                ))}
              </ol>
              <div className="lr-actions">
                <Btn tone="quiet" onClick={attemptDuplicateReplay}>Attempt duplicate event/action replay</Btn>
                {duplicateReplayAttempted ? <span className="muted">Replay rejected; no duplicate was added.</span> : null}
              </div>
            </>
          ) : <p className="empty">No run records yet. The first V1 occurrence can be run once; later versions require review and activation.</p>}
        </div>

        <div className="lr-section lr-privacy">
          <h3>Restricted learning record and customer-visible summary</h3>
          <p><strong>Restricted internal learning:</strong> policy version, scripted timeline, review decision, unresolved receiving-system evidence and human governance record stay in this internal simulation view.</p>
          <p><strong>Customer-visible:</strong> only the separately authorized support summary and its confirmed delivery status are represented. Internal rule details, alert rationale and reviewer discussion are not included in that customer-facing summary.</p>
          <p className="muted">These are separate demonstration projections, not production access controls. Everything is fictional and local to this browser simulation; no customer, receiving system, marketing platform or protection service is contacted.</p>
        </div>
          </>
        ) : (
          <section className="lr-section lr-customer-preview" aria-labelledby="customer-summary-heading">
            <h3 id="customer-summary-heading">Customer-facing summary preview</h3>
            {latestRun ? (
              <>
                <p className="lr-status" role="status">Fictional customer authorisation is recorded in this event sequence. The stand-in channel reports delivery and a matching read-back; this confirms simulated execution only.</p>
                <div className="lr-customer-message">
                  <p><strong>Your support request</strong></p>
                  <p>You asked to speak with Support. The details you chose to share have been included so you do not need to repeat them here.</p>
                  <p className="muted">This preview does not promise a response time or claim that the support interaction helped. It does not show internal policy, alert reasoning or operator-only evidence.</p>
                </div>
              </>
            ) : <p className="empty">No customer summary is shown before the fictional customer authorises sharing and a run records delivery.</p>}
          </section>
        )}
      </Panel>
    </div>
  );
}

export default LearningReview;
