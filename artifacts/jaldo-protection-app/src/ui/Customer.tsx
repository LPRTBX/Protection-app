import { useId, useState } from "react";
import { CONTACT_CHOICES, DURATIONS, FICTIONAL_NOTES, OPERATOR, OPTIONS, type ContactChoice, type Duration } from "../sim/scope";
import { customerView, contactLabel, type CustomerView, type PartStatus } from "../sim/views";
import { CUSTOMER_TABS, go, type CustomerTab } from "./nav";
import { Disclaimer, Result, useOutcome } from "./parts";
import { useWorld } from "./world";

/**
 * The customer's view. Mobile first. It reads ONLY `customerView`: the customer's own request and messages a person approved.
 * No internal state, system name, attempt, reviewer note or other record is ever passed to this component.
 */

const PART_MARK: Record<PartStatus, string> = { "not-started": "○", applying: "◔", confirmed: "✔", unconfirmed: "!" };
const PART_WORD: Record<PartStatus, string> = { "not-started": "Not confirmed yet", applying: "Sent, not confirmed yet", confirmed: "Confirmed", unconfirmed: "Not confirmed yet" };

export function CustomerApp({ tab }: { tab: CustomerTab }) {
  const w = useWorld();
  const v = customerView(w);
  return (
    <div className="phone-stage">
      <div className="viewpoint" role="note">
        <strong>Viewing as: the customer.</strong> {v.scenario === "early-support" ? "Shows only messages a team member approved, and your own choices." : "Shows only your own request and messages a team member approved."}
      </div>
      <div className="phone" data-testid="customer-app">
        <header className="app-head">
          <p className="app-brand">{OPERATOR.name} <span className="app-sub">· Protection</span></p>
        </header>
        <div className="app-body">
          {tab === "today" ? <Today v={v} /> : null}
          {tab === "options" ? <Options v={v} /> : null}
          {tab === "support" ? <Support v={v} /> : null}
          {tab === "updates" ? <Updates v={v} /> : null}
        </div>
        <nav className="tabbar" aria-label="Customer app">
          <ul>
            {CUSTOMER_TABS.map((t) => (
              <li key={t.tab}>
                <a href={`#/customer/${t.tab}`} aria-current={tab === t.tab ? "page" : undefined}>
                  <span aria-hidden="true" className="tab-mark">{{ today: "◉", options: "☰", support: "?", updates: "✉" }[t.tab]}</span>
                  <span>{t.label}</span>
                  {t.tab === "updates" && v.updates.length > 0 ? <span className="sr-only"> ({v.updates.length})</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function StopNow() {
  return (
    <section className="card stop" aria-labelledby="stop-h">
      <h3 id="stop-h">Need to stop right now?</h3>
      <p>This demo cannot apply a real break or contact a real service. In a real service, your operator's own immediate controls and support are available at any time, independently of this app and of any review.</p>
      <a className="btn btn-primary" href="#/customer/support">See Support information</a>
    </section>
  );
}

function Today({ v }: { v: CustomerView }) {
  return (
    <>
      <h1 id="screen-title" tabIndex={-1}>Today</h1>
      <section className={`status-card tone-${v.headline.tone}`} aria-labelledby="headline" data-testid="headline">
        <h2 id="headline">{v.headline.title}</h2>
        <p>{v.headline.body}</p>
      </section>

      {v.invitation ? <Invitation v={v} /> : null}

      {!v.hasRequest && !v.invitation ? (
        <section className="card">
          <h3>Take a break</h3>
          <p>In this demo you can ask for a break and see how each part is authorised, applied and checked. Nothing real is changed.</p>
          <a className="btn btn-primary" href="#/customer/options">See your options</a>
        </section>
      ) : !v.hasRequest ? null : (
        <>
          <section className="card" aria-labelledby="req-h">
            <h3 id="req-h">What you asked for</h3>
            <p>{v.requested}</p>
          </section>
          <section className="card" aria-labelledby="parts-h">
            <h3 id="parts-h">What is confirmed</h3>
            <ul className="parts">
              {v.parts.map((p) => (
                <li key={p.id} data-status={p.status}>
                  <span className={`part-mark part-${p.status}`} aria-hidden="true">{PART_MARK[p.status]}</span>
                  <div>
                    <p className="part-name"><strong>{p.label}</strong>: {PART_WORD[p.status]}</p>
                    <p className="muted">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {v.unconfirmed.length > 0 ? (
            <section className="card" aria-labelledby="unc-h" data-testid="unconfirmed">
              <h3 id="unc-h">Not confirmed yet</h3>
              <ul className="list">{v.unconfirmed.map((u) => <li key={u}>{u}</li>)}</ul>
              <p className="muted">Please do not rely on these yet.</p>
            </section>
          ) : null}
          {v.stopNow ? <StopNow /> : null}
          {v.nextStep ? (
            <section className="card" aria-labelledby="latest-h">
              <h3 id="latest-h">Latest update</h3>
              <p>{v.nextStep}</p>
              <a href="#/customer/updates">All my updates</a>
            </section>
          ) : null}
          <section className="card" aria-labelledby="happen-h">
            <h3 id="happen-h">What happens</h3>
            <ol className="steps">
              {v.steps.map((s) => (
                <li key={s.label} data-state={s.state} aria-current={s.state === "now" ? "step" : undefined}>
                  <span className="sr-only">{s.state === "done" ? "Done: " : s.state === "now" ? "Now: " : "Next: "}</span>{s.label}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}

/**
 * P2: the fixed, supportive invitation, shown only once the in-app channel has reported it delivered. Four DISTINCT choices.
 * Opening this message is not consent and is not recorded; not replying changes nothing.
 */
function Invitation({ v }: { v: CustomerView }) {
  const w = useWorld();
  const [outcome, setOutcome] = useOutcome();
  const inv = v.invitation!;
  return (
    <section className="card invitation" aria-labelledby="inv-h" data-testid="invitation">
      <h2 id="inv-h">{inv.title}</h2>
      <p>{inv.body}</p>
      <p className="muted"><time>{inv.at}</time></p>
      <p className="muted">Opening this message is not a request and does not mean you agree to anything. Not replying changes nothing.</p>
      <h3>What you can do, if you want to</h3>
      <ul className="choices">
        <li>
          <a className="btn btn-quiet" href="#/customer/support">Look at the support information</a>
          <span className="hint">Information only.</span>
        </li>
        <li>
          <span className="btn btn-quiet is-off" aria-disabled="true" role="note">Ask Support to contact me</span>
          <span className="hint">Not available in this prototype: asking for support yourself is not modelled by the accepted kernel yet.</span>
        </li>
        <li>
          <a className="btn btn-quiet" href="#/customer/options">Ask for a break yourself</a>
          <span className="hint">Your own request, with its own approvals. Never started from this message.</span>
        </li>
        <li>
          {v.optedOut ? (
            <p className="note" data-testid="opted-out">You have chosen not to get optional support messages. Nothing about your account changes because of this, and you can change it in Support.</p>
          ) : (
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setOutcome(w.changeContactChoice(CONTACT_CHOICES[1].id))}>No thanks: no more optional support messages</button>
              <span className="hint">Your choice. It does not affect your account.</span>
            </>
          )}
        </li>
      </ul>
      <Result outcome={outcome} />
    </section>
  );
}

function Options({ v }: { v: CustomerView }) {
  const [mode, setMode] = useState<"list" | "form" | "review">("list");
  const [duration, setDuration] = useState<Duration>("7 days");
  const [contact, setContact] = useState<ContactChoice>(CONTACT_CHOICES[0].id);
  const [words, setWords] = useState<string>(FICTIONAL_NOTES[0].text);
  const w = useWorld();
  const [outcome, setOutcome] = useOutcome();
  const wid = useId();

  const send = () => {
    const o = w.submitRequest({ duration, contact, note: words });
    setOutcome(o);
    if (o.ok) go("customer/today");
  };

  if (mode !== "list" && !v.hasRequest) {
    return (
      <>
        <h1 id="screen-title" tabIndex={-1}>{mode === "form" ? "Take a break" : "Check your request"}</h1>
        {mode === "form" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMode("review");
            }}
          >
            <fieldset className="choice">
              <legend>How long?</legend>
              {DURATIONS.map((d) => (
                <label key={d.id} className={duration === d.id ? "on" : ""}>
                  <input type="radio" name="duration" value={d.id} checked={duration === d.id} onChange={() => setDuration(d.id)} />
                  <span><strong>{d.label}</strong><small>{d.detail}</small></span>
                </label>
              ))}
            </fieldset>
            <fieldset className="choice">
              <legend>How may we contact you?</legend>
              {CONTACT_CHOICES.map((c) => (
                <label key={c.id} className={contact === c.id ? "on" : ""}>
                  <input type="radio" name="contact" value={c.id} checked={contact === c.id} onChange={() => setContact(c.id)} />
                  <span><strong>{c.label}</strong><small>{c.detail}</small></span>
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor={`${wid}-words`}>Add a fictional example message (optional)</label>
              <select id={`${wid}-words`} value={words} onChange={(e) => setWords(e.target.value)} aria-describedby={`${wid}-words-h`}>
                {FICTIONAL_NOTES.map((n) => <option key={n.id} value={n.text}>{n.text}</option>)}
              </select>
              <p id={`${wid}-words-h`} className="hint">This review build has no free-text box, so no real details can be entered. Never type real account, health or personal details into a demo. Only the reviewer sees this message.</p>
            </div>
            <div className="actions">
              <button type="submit" className="btn btn-primary">Review your request</button>
              <button type="button" className="btn btn-quiet" onClick={() => setMode("list")}>Back</button>
            </div>
          </form>
        ) : (
          <>
            <dl className="deflist">
              <div><dt>You are asking for</dt><dd>A break from gambling</dd></div>
              <div><dt>For</dt><dd>{duration}</dd></div>
              <div><dt>Contact</dt><dd>{contactLabel(contact)}</dd></div>
              <div><dt>Your message</dt><dd>{words}</dd></div>
            </dl>
            <section className="card" aria-labelledby="after-h">
              <h3 id="after-h">What happens after you send it</h3>
              <ul className="list">
                <li>In this demo, a team member reviews your request. They do not assess or score you.</li>
                <li>In this demo, nothing is applied until that person authorises each action. A real service's immediate controls must not wait for a discretionary review.</li>
                <li>We only tell you something is confirmed once a simulated check in this demo matches. Nothing real is changed.</li>
              </ul>
            </section>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={send}>Send my request</button>
              <button type="button" className="btn btn-quiet" onClick={() => setMode("form")}>Change something</button>
            </div>
            <Result outcome={outcome} />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <h1 id="screen-title" tabIndex={-1}>Protection options</h1>
      <p className="lede">Choose what feels right. In this demo only the break works; the others are information only.</p>
      <ul className="options">
        {OPTIONS.map((o) => (
          <li key={o.id} className="card">
            <h2>{o.label}</h2>
            <p>{o.summary}</p>
            {o.live && v.scenario === "early-support" ? (
              <p className="muted">In this prototype a break you ask for yourself is a separate request with its own approvals, so it is not available alongside this message. It would never be started for you.</p>
            ) : o.live ? (
              v.hasRequest ? (
                <p className="muted">You have already asked for a break. See <a href="#/customer/today">Today</a> for where it is up to.</p>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setMode("form")}>Ask for a break</button>
              )
            ) : (
              <p className="tag">Information only in this prototype</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Support({ v }: { v: CustomerView }) {
  const w = useWorld();
  const [outcome, setOutcome] = useOutcome();
  return (
    <>
      <h1 id="screen-title" tabIndex={-1}>Support</h1>
      <section className="card stop" aria-labelledby="s1">
        <h2 id="s1">Need to stop right now?</h2>
        <p>This demo has no call or chat and cannot apply a real break or contact a real service. In a real service, your operator's own immediate controls and support must be available at any time, independently of this app, of JALDO and of any review.</p>
        <p className="tag">Fictional prototype: nothing here is connected</p>
      </section>
      <section className="card" aria-labelledby="s2">
        <h2 id="s2">Help and self-exclusion information</h2>
        <p>Verified, jurisdiction-specific information about independent help and self-exclusion would appear here. This demo does not include it. JALDO does not perform self-exclusion registration.</p>
      </section>
      <section className="card" aria-labelledby="s3">
        <h2 id="s3">What messages you may get</h2>
        <ul className="list">
          <li><strong>Notices about your request</strong> appear in My updates in the app. They are required and are not optional marketing or outreach.</li>
          <li><strong>Optional support messages</strong> are sent only if your current choice below allows it, and are checked again each time.</li>
          <li><strong>Asking Support yourself</strong> is always your choice to start. It does not depend on anything here.</li>
          <li><strong>Promotional messages</strong> are a separate permission. A break request asks to switch them off.</li>
        </ul>
      </section>
      <section className="card" aria-labelledby="s5">
        <h2 id="s5">Who sees what</h2>
        <ul className="list">
          <li>The team member who reviews your request sees what you sent.</li>
          <li>The systems that apply your break see only your customer reference and the length of the break.</li>
          <li>Nobody scores or rates you. Nothing here decides anything about you.</li>
        </ul>
      </section>
      {v.contact ? (
        <section className="card" aria-labelledby="s4">
          <h2 id="s4">Your contact choice</h2>
          <fieldset className="choice">
            <legend>Optional support messages</legend>
            {CONTACT_CHOICES.map((c) => (
              <label key={c.id} className={v.contact === c.id ? "on" : ""}>
                <input type="radio" name="contact-now" value={c.id} checked={v.contact === c.id} onChange={() => setOutcome(w.changeContactChoice(c.id))} />
                <span><strong>{c.label}</strong><small>{c.detail}</small></span>
              </label>
            ))}
          </fieldset>
          <p className="muted">Changing this never rewrites anything already sent. Later steps use your new choice.</p>
          <Result outcome={outcome} />
        </section>
      ) : null}
    </>
  );
}

function Updates({ v }: { v: CustomerView }) {
  return (
    <>
      <h1 id="screen-title" tabIndex={-1}>My updates</h1>
      <p className="lede">Messages a team member approved. Nothing else appears here.</p>
      {v.updates.length === 0 ? (
        <p className="empty">No updates yet. When you ask for a break, each approved update appears here.</p>
      ) : (
        <ol className="updates" data-testid="updates">
          {v.updates.map((u) => (
            <li key={u.id} className="card">
              <h3>{u.title}</h3>
              <p>{u.body}</p>
              <p className="muted"><time>{u.at}</time></p>
            </li>
          ))}
        </ol>
      )}
      <Disclaimer>Fictional prototype. These messages exist only in this browser tab. Nothing is sent to a phone or email.</Disclaimer>
    </>
  );
}
