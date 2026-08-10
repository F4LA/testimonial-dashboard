# DECISION LOG — Testimonial Dashboard

Chronological record of decisions and changes to the dashboard (frontend and `apps-script/`).
**Most recent entry on top.** Each entry: date · what changed · why.

> **Mandatory:** every change to the dashboard adds an entry here and updates `DASHBOARD-SYSTEM.md` (see the rule in `CLAUDE.md`). A change is not finished until the documentation is updated and pushed.

> **⚠️ Append-only, absolutely (D-101).** **A past entry's text is never rewritten, edited, or deleted** — not to correct it, not to add new information, not even to record that what it describes was later validated. Unlike the system log (`F4LA/testimonial-system` `decision-log.md`), this file has **no Status column**, so there is exactly one place for new information about an old entry: **a NEW entry at the top**, referencing the old one.
>
> *Why:* the log records what was known **when**, not a tidied-up version written with hindsight. An entry edited after the fact stops being usable as evidence of what anyone knew at the time — which is the whole reason it exists. Same instinct as the Event Log being append-only: a mis-marked event is annotated, never rewritten.
>
> This does **not** apply to the living documents, which are meant to be rewritten in place: `DASHBOARD-SYSTEM.md`, `CLAUDE.md`, and the system repo's `project-brain.md`.

---

## 2026-08-10 — Phase 5: the raffle DRAW, validated live; then two fixes it exposed

**The write half of the raffle** (`fad352d`), and the follow-up commit for the two defects the live test found. The system log closes the whole raffle section in one row (D-103); this entry is the repo-side record.

### What shipped

Three parts, frontend and `Digest.gs` **in the same commit** as D-088 requires:

1. **Move to another month** (D-100) — per-row button in `#/raffle`, confirmation-dialogued, writing `Raffle — month moved` with the target as `YYYY-MM`. Latest-wins, so a second move supersedes the first.
2. **The draw** — eligible = qualifies on all three ∧ in this month's cohort ∧ the **person** has never won. Cohort-only closes the scope question D-100 left open. Derived from the same `compliance()` the read-only view always used, so there is one qualification rule and `selfCheck()` proves a non-qualifier can never reach the eligible list. The system draws; a human confirms. The winner event freezes month + winner + the full eligible list + the winner's conditions in the client's own words (spec §4.4).
3. **Post-draw, parallel** (D-080) — Miguel's Master Sheet month and Gaby's messages as two independent flows, never chained, actioned in the queue.

Plus a month-level draw-due state (`waiting/due/overdue/done`) with **no Settings threshold** — "eligible entries exist and no winner" is a fact, and a month that ended undrawn is late by the calendar; a Bernardo review task if two winners are ever recorded; and the client card showing a past win **above** the live conditions, so the two cannot read as contradicting each other (the `089dd9e` failure class). `PROXY_VERSION` 5 adds `Raffle — month moved` to `ALLOWED_STAGES`, redeployed by editing deployment `…qll5X-MnC3gZ` (D-092).

### The pre-flight paid for itself

The live `ALLOWED_STAGES` check ran **before** any code was written (D-092's lesson). A negative control confirmed the vocabulary gate can actually fail — an invented stage, an engine-owned stage and an unattributed write were all rejected — and `Raffle — month moved` was confirmed missing from the deployment, exactly as predicted. Worth recording that **the proxy has no dry-run**: reaching the stage check with a *valid* string appends a row, so a string can only be confirmed present by writing one. That is why the three pre-existing raffle strings were deliberately **not** probed, and why the one acceptance check that was run used the real move payload on test data rather than a throwaway.

### Validated live, end to end, pre-wipe

Rows 91 and 106 (both moves, supersede confirmed), 107 (winner **Karen Nosek**, drawn from 2 eligible), 108 and 109 (both post-draw tasks — Miguel's marked first, Gaby's confirmed still standing, then marked). The snapshot was checked by **rebuilding the pre-draw state from rows 1–106 alone** and recomputing the eligible set independently: it matches what the event froze, so the record is a true account of the moment and not merely well-formed. `Digest.gs` agreed on the winner, the draw state and both task states.

### The D-088 comparison found a real bug

Running both implementations over identical event rows across nine scenarios: with two winners recorded, **the two sides named different people** — the frontend by display-sort order, the digest by sheet order. Both now take the **earliest-confirmed** win. Exactly the class of divergence the guard exists to catch, and it would never have surfaced from reading either file.

### Two defects the live test exposed — fixed in the follow-up commit

**1 · `activeMonth` was silently defeated by a Sheets date coercion.** Typing `2026-09` — what the setting's own note instructs — makes Sheets store the **serial `46266`**. Every reader tested it against `YYYY-MM`, failed, and fell back silently. Two consequences, one of them outward-facing: the raffle showed the wrong cohort behind an "invalid value" banner, and **`flows.js roundDeadline` put the wrong month into the deadline a COACH is told**. Normalised now in the one place a raw cell becomes a value (`sheets-reader.js monthSetting`, mirrored as `dMonthSetting_`), accepting a real `YYYY-MM`, a date serial, an ISO date or a `Date`. **Anything unrecognised is returned unchanged on purpose** — nonsense like `Septembre` must still fail the readers' test and still raise the banner rather than be swallowed as "no pin set".

**2 · `movedFrom` reported the entry month instead of the previous override.** On a round trip (Aug → Sep → Aug) that made the card read *"moved from Aug 2026"* while sitting in Aug 2026. `monthOf` now walks **every** move: the newest decides the month, the one before it is what "moved from" reports, and a move with no readable month is skipped rather than guessed at. Both views also drop the clause entirely when it would name the month already on screen.

Both fixes are asserted in **both** `selfCheck()`s, so neither can regress quietly.

### Still open

- **No undo on a confirmed winner** (D-093) — the log is append-only and no `Raffle — correction` string exists.
- **The bridge writes no cycle** (D-100) — a cycle-2 preferences submission attaches to cycle 1. Harmless at launch, wrong on the first re-nomination.
- **Gaby's two client-facing templates have no approved copy.** Declared `NONE`-source, so the queue says *"no approved message exists for this step yet"* rather than inventing words in her voice. Paste the SOP wording into `TEMPLATES.raffleWinnerMessage` / `raffleNonWinnerMessage` and the buttons light up with no other change.
- **Re-drawing is possible by design** — the pick happens on click and is shown in the dialog, so cancelling and clicking again gives a different name. Inherent to propose-then-confirm; stated in the dialog, and only a confirmed draw is ever logged.

All eight test clients and every row above join the 2026-08-10 wipe.

---

## 2026-08-09 — D-099 validated live; the log's append-only rule made absolute

**The fix is confirmed on the branch that was actually broken.** The preferences form was resubmitted with `"Not yet"` on the review question, and **Event Log row 89** wrote `No ("Not yet")` — a clean No with the client's raw wording preserved, not an unclear flag. **Zero `Unclear answer` rows remain anywhere in the log.**

Two behaviours neither D-098 nor D-099 had ever exercised live were confirmed in passing:

- **Non-idempotency works as designed** — the resubmission appended three fresh rows (88–90). Nothing overwritten, nothing deduped.
- **Latest-wins got its first real test** — row 86 says `Yes`, row 89 says `No`, same `(email, cycle, Stage)`. The newest answer counts; the older stays in the timeline as history.

It also validated the raffle view for free, on the one path only tested synthetically: **Cameron moved from 2/3 to 1/3 with no code change.** His review condition renders `✕ Google review (self-reported)` and the sentence rewrote itself to *"Waiting on the questionnaire video and the Google review."* — the latest-wins read, the raw-answer parse, and the live-not-snapshotted rule all working together on real data.

### The process correction

New information about D-099 was first written **into the D-099 row itself**. That breaks the log's own first rule — *append-only, never edit a past row* — and the rule exists precisely so the log records what was known when, not a tidied-up version written with hindsight. A row edited after the fact can no longer be trusted as evidence of what anyone knew at the time.

Reverted: **D-099's Decision and Context columns are now byte-identical to when they were first written** (verified against the commit that added them), and the live confirmation lives in the **Status** column — the one edit the rule permits on a past row:

```
Active — validated live Aug 9 (Event Log row 89, "Not yet" → clean No)
```

Audited the neighbours while there: **D-098 and D-100 are byte-identical to as-written.** This entry carries the detail, since a change log has no Status column.

**The rule is absolute from here:** a past row's text is never rewritten. New information about an old decision goes in Status, or in a new row.

---

## 2026-08-09 — Phase 5: raffle compliance (read-only half)

The automatic "who qualifies" computation and its two surfaces — the client card's Recognitions block and a monthly `#/raffle` view. **Writes nothing**: no proxy call, no `PROXY_VERSION` bump, no `ALLOWED_STAGES` check (that moves to the first write chunk). The draw, the snapshot, and the parallel post-draw tasks are next.

Full behaviour in `DASHBOARD-SYSTEM.md` §10.9. The decisions worth recording here:

**Condition 2 got no new event.** It reads `CFG.INPUTS.video.stages`, the fold's own definition of "the video is in", so the raffle can never disagree with the pipeline board about the same fact.

**Four invariants are enforced by a `selfCheck()` that throws at load**, not by convention — each one, if broken, lets somebody into the draw who should not be there: podcast consent is never a condition (D-097); the review condition never reads a confirmation (D-066); it never reads the dashboard-writable `Review — self-reported` (D-098); and it never reads `Collection — client video link`, which is the fan-out sharing folder 03 and would qualify every invited client. **Each guard was verified by sabotage** — a copy of the module edited to break each rule, confirming all four throw, and the clean file still loads.

**Unclear is a third state, not a no.** The fold prefers the bridge's normalized prefix and falls back to the client's raw words, which resolves the pre-D-099 `Unclear answer: "Not yet"` rows with no backfill. A genuinely unreadable answer blocks entry and is surfaced for a human — never silently rejected.

**Monthly scoping (D-100):** `activeMonth` from Settings, blank = current month; a testimonial belongs to the month of its **earliest event**, not the month it qualified — qualification is unstable under latest-wins and would let clients hop cohorts after a draw. The manual "moved to month X" override is **already respected by the reader** although nothing writes it yet, so the view is correct the moment the button ships.

**`Digest.gs` unchanged and needs no change** — read-only, no task, no alert, so no second source of truth is created. Flagged: the moment the digest says anything raffle-shaped, D-088 requires the logic in both places in the same commit.

**Verified** against the live log by unit-testing the fold on eight cases: Cameron Colbo 2/3 (photo ✓, review ✓, no video); Benjamin Jayne the inverse 1/3; a synthetic all-three-met using the *blur my face* variant → qualifies; a legacy unclear row recovering to a clean No; a genuinely unreadable answer staying unclear; an explicit photo No; the month override; and the fan-out trap correctly **not** satisfying condition 2.

**Files:** `dashboard/raffle.js` · `dashboard/raffle-view.js` · `dashboard/client-card.js` · `dashboard/renderer.js` · `dashboard/config.js` · `index.html` · `styles.css`

---

## 2026-08-09 — Bridge classifier fix: "Not yet" was not a No (D-099)

Found while verifying the raffle compliance view, by pulling the **live form's actual option strings** instead of the wording everyone had been repeating.

The Google-review question's negative option is **`"Not yet"`**, not `"No"`. The bridge's negative branch was `/^n(o)?\b/`, which does **not** match it — there is no word boundary between the `o` and the `t`. So the most common negative answer in the whole form was written to the event log as:

```
Unclear answer: "Not yet" — review manually
```

Manual-review noise pointed at Gaby, for a perfectly clear answer, on every client who had not yet left a review.

It failed **safe** for the raffle — unclear is not a Yes, so nobody could wrongly qualify — but the log was wrong, and the log is the memory.

**Fixed** to `/^n(o|ot)?\b/` and re-tested against all **seven** closed options the live form actually offers:

| Answer | Before | After |
|---|---|---|
| `Yes, you can use my before/after photos` | Yes | Yes |
| `Yes, you can use them, but please blur my face` | Yes | Yes |
| `No, I'd rather not share them (…won't be entered…)` | No | No |
| `Yes, done` | Yes | Yes |
| **`Not yet`** | **UNCLEAR** | **No** |
| `Yes, I'd be open to it` | Yes | Yes |
| `No, I'd rather not` | No | No |

Every closed option classifies; genuine free text (`"maybe later"`) still flags for review, which is the branch's real job.

**The lesson worth keeping.** D-098's live validation answered **"Yes" to every question**, so the negative branch was never executed. A passing happy-path test is not coverage of the branch that matters — and the option strings should have been read off the live form from the start, which is exactly what found this.

No schema change, no trigger change (a re-paste of the same file), proxy and `PROXY_VERSION` untouched.

**Files:** `apps-script/engine-prefs-form-bridge.gs`

---

## 2026-08-09 — Kickoff checklist completed; Flow 3 can now start

Adding SOP §3's Everfit confirmation message surfaced a gap: **nothing anywhere wrote `Invite — instructions email sent`**, so Flow 3's clock could never start and the video ladder was unreachable. The walkthrough had described a "Mark email sent" button that did not exist.

`kickoffBlock` is now an ordered two-step checklist:

1. **Fire the fan-out** — confirmed, since it reaches outside the team.
2. **Send the instructions email, confirm on Everfit, mark it** — with the SOP copy on a Copy button, then a button writing `Invite — instructions email sent`.

They are two different acts, and only the second means the client has been told what to do. Anchoring the 48h video check there rather than on the fan-out avoids chasing someone who has not been asked.

**Verified:** all eight live clients show *step 2 of 2* (they were fanned out but never marked); marking it flips the card to *kickoff complete, video clock running*; and with `?sim=+60h` Flow 3 then produces *"Check if Cameron Colbo uploaded their video."* — which produced nothing before. All templates render, none empty, none containing an em dash.

**Files / commits:** `dashboard/client-card.js` · `dashboard/flows.js`

---

## 2026-08-09 — Phase 5 groundwork: the preferences-form bridge

**The gap.** Spec §4.4 and §4.5 read as if the system "already knows" each client's photo permission, questionnaire, and review self-report. It does not. Verified against the engine source: its **nine** Stage strings contain no preferences handler, no `PREFS_FORM` property, and no trigger. Those answers have lived only in the responses sheet. Left alone, the raffle would show every client as *not qualified* forever — the same failure class as D-085, where the coach form routed correctly and silently wrote no event.

**Built** (`apps-script/engine-prefs-form-bridge.gs`, additive, engine-side, paste-and-install): `onPrefsFormSubmit` reads the responses **by header** — the columns already shifted once when the podcast question was added, so indexes are unsafe — resolves the master-key email through the Active Client Roster, and writes one event per signal. No existing function is modified; the proxy and `PROXY_VERSION` are untouched, since this writes through `logEvent_` directly rather than through the write proxy.

**Vocabulary — a dedicated `Preferences — ` group**, not a reuse of `Review — self-reported`:

| Event | Feeds |
|---|---|
| `Preferences — photo permission` | raffle condition 1 · client card |
| `Preferences — review self-reported` | raffle condition 3 · reviews view |
| `Preferences — podcast consent` | podcast chain **only** — not a raffle condition (D-097) |
| `Preferences — unresolved` | identity failure, empty email, system bucket |

The group is a structural guarantee, not a naming preference. `Review — self-reported` already exists in the dashboard's ALLOWED_STAGES, so writing the form's answer under that string would let a **person** hand-enter a "self-report" and open the raffle. D-066 says the two review signals are never merged; keeping the client's own answers in an engine-owned group makes the merge impossible rather than merely discouraged.

**Raffle condition 2 (questionnaire/testimonial) gets no new event** — it is the existing client-video event, which the view chunk reads.

**Idempotency: none, deliberately.** A resubmission appends three more events. The log is append-only and the fold is latest-wins per (email, cycle, Stage), so the newest answer counts and the older ones remain as history.

**D-085 dependency asserted, not assumed.** This trigger is bound to the responses sheet, so `getActiveSpreadsheet()` returns the wrong file — exactly the condition that silently voided the coach form. `checkPrefsFormWiring()` inspects the deployed `logEvent_` for the `SIGNAL_SHEET_ID` fallback and says STOP if it is absent.

**⚠️ Raised for Bernardo:** the responses sheet has an `Email Address` column at index 7, alongside the form's own email question. That is consistent with *"Responder input"* (no login, fine) **and** with *"Verified"* (login required, which would break D-063 for external clients). The sheet cannot distinguish them — the form setting needs a look.

**Confirmed and validated live, same day.** All four strings approved; the trigger is installed (five now). A real submission for Cameron Colbo wrote rows 85-87 — photo permission, review self-reported, podcast consent, all *Yes*. The email resolved to the **typed** `cameron.colbo@gmail.com`, not the logged-in Google account, which settles the `Email Address` question from the data side: identity comes from the master-key question, so a signed-in submitter cannot displace it. The form setting is still worth a look for the *access* half — whether an external client can reach the form at all — but the resolution path is confirmed correct. Cameron Colbo is pre-launch test data and joins the Aug 10 wipe, which now has a fifth location: the preferences responses sheet.

**Carry-forward:** `Preferences — unresolved` is written but nobody is told. It must become a **Gaby task** in the alert engine (spec §5) when the alerts side of Phase 5 is built.

**Files:** `apps-script/engine-prefs-form-bridge.gs`

---

## 2026-08-09 — Video follow-up copy found in the SOP · coachFormUrl set

**Correction.** I reported that no client-facing video-upload follow-ups existed in the SOP. That was wrong. They are in **SOP §3, "Follow-Up System for Uploads"** — I had searched only revision 5, where that section was dropped. The copy lives in revisions 1 through 4.

Its cadence is **48h / 48h / 48h**, matching v2's Flow 3 exactly. Both messages are now wired verbatim, with the SOP's **third** client message dropped — v2 replaces it with the tell-the-coach step, the same treatment as outreach FU#3.

**One wording edit:** both used an em dash (`busy—just`), which v2 forbids. Replaced with a comma, preserving the voice. `checkTemplates()` asserts this and now passes with **zero** empty templates.

**`coachFormUrl` set** to the published responder link. It is placed in `SETTINGS_DEFAULTS` and seeded in `SETTINGS_SEED`, so it works immediately: `parseSettings` skips empty cells and falls back to the default, and the Settings tab can still override it. The coach-form template renders a real link with no placeholder remaining.

**Method note worth keeping:** a document can have several revisions on disk with materially different content, and the newest is not necessarily the most complete. Searching one file and reporting absence was the error; search every revision.

**Files / commits:** `dashboard/flows.js` · `dashboard/config.js` · `apps-script/Code.gs`

---

## 2026-08-09 — A real simulated clock (`?sim=`)

Testing the ladders meant waiting real hours, and the only tool for it was a scratchpad harness that was deleted after the v2 build. Offering to build it rather than building it was the wrong call — the request was to watch a threshold cross, and `?sim=` was tried twice against a feature that did not exist. No query-param handling existed anywhere in the codebase.

**One clock seam.** Every rule that asks how long something has waited now reads `TDClock.now()` — 7 reads in `flows.js`, 1 in `state-builder.js`. Shifting one function is exact; shifting event timestamps, as the old harness did, only approximates it.

**Parser tolerates what a person actually types.** A literal `+` in a query string decodes to a space, so `?sim=+60h`, `?sim= 60h` and `?sim=%2B60h` all work, as do `2d`, `90m`, `-24h` and a bare `60`. An unparseable value shows a banner naming the accepted forms instead of silently doing nothing — which is exactly how the missing feature presented.

**Writes are refused while shifted**, with a banner saying so. A time-shifted view plus a live action button lets someone send a follow-up that is not actually due.

**Clarified, because the behaviour changed at v2:** time controls whether a rung appears and how urgent it looks, but **ladder wording advances on button presses, not on the clock**. The Phase-3 engine rewrote titles on a threshold; v2 is press-driven, matching the spec's flow tables. Exactly one task rewrites on time alone — Flow 5's Everfit/photos escalation.

**Verified end to end:** `?sim=+30h` surfaces Cameron's reply check and his coach-form chase; `+60h` pushes six chases to overdue; `+120h` rewrites eight reminders to *"has been waiting 5 days on your Everfit data and photos"*; `?sim=5d` is identical to `+120h`; a write while shifted is refused.

**Files / commits:** `dashboard/clock.js` · `dashboard/{flows,state-builder,event-writer}.js` · `app.js` · `index.html` · `styles.css`

---

## 2026-08-08 — Fan-out bridge failed silently: three fixes

**Symptom.** Firing the kickoff for Cameron Colbo dimmed the button for a few seconds, then restored it. No Signal row, no message, no error. `previewPendingSignals()` showed `pending: 0` — the engine and its triggers were fine and had nothing to process.

**Root cause: the deployed proxy was running the old code.** POSTing to the live Web App:

```
{"action":"requestFanout"} → {"ok":false,"message":"Unknown action: requestFanout"}
{"action":"appendEvent"}   → {"ok":false,"message":"Unknown or missing actor: \"\"."}
```

`requestFanout_` was added to `apps-script/Code.gs` in the repo, but that file is the *source of truth for* the deployed script, not the running code. The build walkthrough covered pasting `engine-signal-poll.gs` into the engine and never mentioned redeploying the dashboard's own proxy. Same class of failure as the coach form trigger: code updated, deployment not.

**Why nothing was shown.** `mode:"no-cors"` made the reply opaque, so the real error was unreadable. The fallback path polled the Signal tab four times over ~4.5s and wrote *"no Signal row appeared"* into `#cardResult` — which sits at the very bottom of the client card, several screens below the button. The message existed and was unreachable.

*(Method note: the first probe returned a Google 404 page and looked like `doPost` was missing. That was wrong — `curl -L` downgrades POST to GET on a 302, and the Apps Script redirect key is single-use. Following the redirect correctly showed `doPost` healthy.)*

### Three fixes

1. **Read the response.** Apps Script returns `access-control-allow-origin: *` on the redirect target — verified live — so `no-cors` was never necessary. The server's own error is now surfaced first, in under a second, instead of inferred from an absent row. `Content-Type` stays `text/plain` to remain a CORS simple request; Apps Script does not answer OPTIONS, so a preflight would fail. A network/CORS failure falls back to an opaque send so a write is never lost.
2. **Feedback where the action is.** Fixed toast (errors persist, successes fade) + a result beside the clicked button + the view's result strip.
3. **`PROXY_VERSION` handshake.** `Code.gs` reports its version, `config.js` states what it expects, the dashboard pings on load and shows a red banner naming the exact redeploy steps on mismatch. This class of bug fails silently by nature, so it is now detected automatically.

**Verified against the live, still-stale deployment:** the handshake reports `deployed: 0, expected: 2` with the redeploy instructions; `requestFanout` rejects with the actual `"Unknown action: requestFanout"`; `appendEvent` still works.

**The engine needed no changes.** The poll and all four triggers stay exactly as installed. Cameron remained safe in Outreach with no half-done state.

**Files / commits:** `dashboard/{event-writer,dialog,client-card,queue-view,pipeline-board,config}.js` · `app.js` · `index.html` · `styles.css` · `apps-script/Code.gs`

---

## 2026-08-08 — Fan-out bridge, manual entry into Nominated, and the move taxonomy

Item 1 of the v2 redesign. The task-engine rebuild (item 2) has not started; Phase 4 stays untouched.

### The dashboard fires the fan-out — but not the way it was proposed

The plan was for the dashboard to tick the Signal checkbox. **That cannot work:** Apps Script `onEdit` triggers fire only for edits made by a human in the UI, never for edits made by a script or by the Sheets API. The checkbox would turn green and nothing would run — a silent no-op, which is exactly the failure mode that already cost a day with `logEvent_`.

**Option C, chosen.** The proxy writes what a human tick writes (roster name in A, boolean `true` in B, `Processed` empty) into the **first empty pre-made row 13–30**, and a new one-minute poll on the engine picks it up. Never appended: an appended row holds a text `"TRUE"` that the engine's `confirmed !== true` check rejects, and Gaby could not use it as the manual fallback.

Rejected **Option B** (a `doPost` endpoint on the engine) despite its synchronous result: it would add a public endpoint to a live script two days before launch. Option C is purely additive — `onSignalEdit` and `fanOut_` are untouched — and its rollback is free: delete one trigger and the checkbox path is exactly as it was.

**Order of operations:** queue the fan-out first, write `Invite — kickoff sent` second. The reverse would let the card claim Invited with nothing behind it. This way a failed kickoff write is self-healing — the engine's fan-out rows arrive and the Invited inference recovers the stage.

**Three double-fire layers:** the fire step only renders when neither a fan-out event nor a kickoff event exists for that (email, cycle); the proxy refuses if a row is already pending or was processed this month; the engine's pre-existing `Processed` guard claims before working, under the same lock the checkbox takes.

### Move taxonomy: block ≠ confirm ≠ flow

**Confirmations only on outward-facing or irreversible moves — three in the whole pipeline.** A dialog that appears on every action stops being read, and then it protects nothing.

- 🔴 **Invited** — creates the folder, shares folder 03 anyone-with-link-Editor, DMs a real coach
- 🔴 **Declined / Dropped** — leaves the board, note required, no reopen event exists
- 🔴 **Published** — see the reversibility note below
- 🔒 **Collecting → Producing** stays a **hard block**, not a confirmation: a disabled control naming what is missing
- everything else flows

**Firing is a button, never a drag or a card-move side effect.** v2 said moving the card triggers the automation; it reaches outside the team, so it gets an explicit confirmed step. Gaby still never touches the sheet, which is the actual goal.

**⚠️ Registered: there is no reverse event anywhere in the vocabulary.** The ladder is forward-only by design, so a mis-marked step cannot be unmarked, only annotated. That is why Published confirms despite not being outward-facing. A `Pipeline — correction` event would be the shape if corrections are ever wanted; it is a fold change and is not in v2.

**Drag-and-drop is approved but deliberately sequenced after launch.** It replaces the button as the way to *initiate* a move and lands on the same confirmation and block layer, unchanged. Functional base for the 10th; drag as the enhancement.

### Manual entry into Nominated did not exist

Testimonials are derived purely from event-log groups, so a client with no events had no card — and the "Log nomination" button lived *on* the card. Every client on the board had arrived via an engine fan-out. **+ Add client to Nominated** picks from the roster (a dropdown, never free text — identity is never guessed) and writes `Nomination — logged`.

**Cycle rule:** cycle 1 normally, `max(cycle) + 1` for a re-nomination, **refused while a prior cycle is still active** — one client cannot have two live testimonials. Clients with a live testimonial are filtered out of the dropdown.

This was also a prerequisite for testing the bridge: without it there is no fresh client to walk Nominated → Outreach → Invited, and the seven existing clients have all already been fanned out.

### Carried from v2

**Sofi is out of `PEOPLE`** — v2's dashboard users are Gaby, Miguel, Joey, Bernardo. Applied in `config.js`, `Code.gs` and `Digest.gs`. **The reel moves in-house to Miguel**, reverting that part of D-071/D-072.

### Verified before pushing

Roster dropdown offers 126 clients and excludes everyone with a live testimonial · the fire step renders only when no fan-out has run · Declined opens a confirmation, refuses an empty note, and writes nothing on cancel · an ordinary move (Note) opens no dialog and writes directly · the Collecting gate stays a disabled button reading "Waiting on: Everfit data, photos" · `nextCycleFor` refuses an active client and returns cycle 1 for a new one.

**Files / commits:** `dashboard/{dialog,pipeline-board,client-card,event-writer,state-builder,config,renderer}.js` · `apps-script/{Code,Digest,engine-signal-poll}.gs` · `index.html` · `styles.css`

---

## 2026-08-07 — Phase 3: action queue + alerts

**Built:** `dashboard/alerts.js` (the rules), `dashboard/queue-view.js` (the per-person queue), `apps-script/Digest.gs` (the daily Slack digest — written, **not wired**).

### The queue is now the default view

Spec §5 opens with *"the dashboard is the home — the action queue is always there when someone opens it."* An action engine should open on the work, so `#/queue` is the landing route and Pipeline moved one click away. It defaults to the signed-in person's own list — a queue showing everyone's work is a report, not a worklist.

### Two invariants, both from spec §5

**Every task has exactly one owner** — an alert with no owner is spam. Routing follows the spec exactly, including the one that is easy to get wrong: **the coach form task goes to the coach**, not Gaby. Verified live: Amy Lang's coach-form task is owned by Brent.

**Every threshold comes from the Settings tab**, never from code. `SETTINGS_DEFAULTS` only backfills missing keys.

### The folder-03 task is the video detection mechanism

Nothing watches Drive folder 03, so the standing task for every client in Invited **is** Option A — the human half of Invited → Collecting. It stays one task per client and escalates its wording from "check the folder" to "no video after Nh — nudge the client" once `inviteUploadFollowupHours` passes, rather than spawning a second competing row. Its inline action writes `Collection — video uploaded`. Verified: 5 clients in Invited → exactly 5 tasks, all owned by Gaby.

### Manual-review flags surface but never block

Carried forward from the gate decision. A Meet or Loom flag appears as a `review` task so it is not silently lost, and its own text says *"does not block the pipeline — often just means this client has none."* Only Everfit and photos carry the `blocks Producing` badge. Verified on Benjamin: two blocking tasks (both manual pulls), his two flags not among them.

Closed testimonials raise nothing.

### The Slack digest is deliberately not wired

`Digest.gs` is complete and deployable but installs no trigger and sends nothing. `previewDigest()` returns exactly what would be posted, and sends nothing. Posting to Slack reaches real people, so it needs an explicit decision, plus three values that do not exist yet: Slack addresses for the five people, the testimonial-management channel ID, and confirmation to reuse the engine's bot token.

**⚠️ Registered risk: `Digest.gs` duplicates the fold.** A time trigger has no browser, so it cannot reuse `state-builder.js`; it re-implements last-write-wins, the ordering rule, the five-fan-out Invited inference, the four-state inputs, the Collecting gate, and the alert rules. That is a real second source of truth and the largest maintenance hazard in the repo. `selfCheck()` prints its stage counts and task total so drift is detectable rather than silent. Documented in `DASHBOARD-SYSTEM.md` §10.5.

**Verified against live state:** 16 tasks — 0 overdue, 10 due, 6 review; owners Gaby (15) and Brent (1); 0 tasks without an owner.

**Files / commits:** `dashboard/alerts.js` · `dashboard/queue-view.js` · `dashboard/renderer.js` · `apps-script/Digest.gs` · `app.js` · `index.html` · `styles.css` · `CLAUDE.md` · `DASHBOARD-SYSTEM.md`

---

## 2026-08-07 — Collecting → Producing gate · duplicate-write bug fixed

### The gate: automatic-input flags never block

Proposed initially as "all inputs present and unflagged." **Bernardo corrected the scope, and the correction is right.** Meet and Loom flags frequently mean *this client has none* — no Loom was ever recorded, no Gemini note carries their email. Nobody can resolve that, so gating on them would freeze a testimonial in Collecting forever. Benjamin Jayne is the live case: both flagged, neither resolvable.

**What gates Producing:** the client video is present **and** Gaby has marked her manual pulls (Everfit data, photos). Nothing else.

The principle underneath, worth keeping: **a manual input can always be satisfied by the person; an automatic one cannot.** Gating only on manual inputs plus the video can never produce a state no human can exit.

`Collection — complete` stays its **own explicit event** rather than being derived from the two manual dots. The dots are arrival facts; the button is Gaby's judgment that her part is done. Deriving it would make marking photos silently advance the pipeline stage.

The gate lives at the point of action (`ClientCard.collectionLock`), not in the fold. In the fold it would mean an event that exists but does not take effect, and the stage could **regress** if an input later re-flagged, breaking the monotonic ladder. A `partial` video counts as present; a `flagged` one does not. Disabled state names what is outstanding.

Verified against all seven live testimonials: Benjamin's blockers are `["Everfit data","photos"]` — Meet and Loom absent from the list.

### Duplicate-write bug (introduced in Phase 2, found by the video test)

Benjamin's video test appended **three identical rows** (73, 74, 75) from one session. `ClientCard.wire()` attached a delegated click listener to `#app` on **every** render. `#app` is never replaced — only its innerHTML is — so listeners accumulated, and because a successful write triggers a re-render, each subsequent click fired once per prior render.

The log is append-only, so those duplicate rows are permanent; they join the pre-launch cleanup list. State is unaffected (last-write-wins), but the same bug on a `Production — …` link or a `Pipeline — declined` would have been materially worse.

Fixed by attaching the handler exactly once and carrying the current testimonial in a module-level `ctx`. Regression test: five renders followed by one click now produces **one** `appendEvent` call, previously five.

**Files / commits:** `dashboard/client-card.js` · `DASHBOARD-SYSTEM.md` §4.6 · `DECISION-LOG.md`

---

## 2026-08-07 — Engine bug: `logEvent_` silently dropped every write from a form-bound trigger

**Symptom.** The coach form routed correctly to folder 04 but wrote no `Collection — coach form` row. The Executions panel showed the `onCoachFormSubmit` run (TEST 3, 3:37:22 PM) as **Completed with no error**. The live Event Log held 69 rows and zero coach-form rows.

**Root cause, confirmed in the engine source (line 505):**

```js
var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(prop_('EVENTS_TAB'));
if (!tab) return;
```

`getActiveSpreadsheet()` returns the spreadsheet the *running trigger* is attached to, not the script's container. `onSignalEdit` is attached to Signal & Event Log, so the fan-out has always logged fine — which is why 69 rows exist and the bug stayed invisible. `onCoachFormSubmit` is attached to the coach form **responses** file, which has no `Event Log` tab, so `tab` was null and the function returned. Silent, no error, status Completed. Folder-04 routing still worked because that path uses DriveApp, never the sheet.

**Fix:** resolve the log by id instead of by ambient context, via one new Script Property `SIGNAL_SHEET_ID`. Recorded in `apps-script/engine-fix-logEvent.gs`. `prop_()` is called without the optional flag and `openById()` throws on a bad id, so a missing or wrong property now fails **loudly** in the Executions panel rather than skipping the write — silent failure was the entire defect. Nothing else in the engine is touched.

**Second exposure the same fix covers:** in a time-driven trigger `getActiveSpreadsheet()` can be null, which would make the original line throw. That is `sendMonthlyNominationMessage`'s two `Nomination` events; they become reliable too.

**⚠️ Character trap, again.** The id pasted for the new property was `…eGlKmo` (lowercase L) and **404s**. The correct id is `…eGIKmo` (capital I) — verified against the Sheets API, 200 vs 404. Identical to the failure that produced a dead Roster id in the data reference. Any Google id handled in this project should be diffed and probed, never eyeballed.

**Files / commits:** `apps-script/engine-fix-logEvent.gs` · `DECISION-LOG.md`

---

## 2026-08-07 — Phase 2: pipeline board + client card, on the corrected fold

**What was built:** `dashboard/pipeline-board.js` and `dashboard/client-card.js`; `renderer.js` became the shell (nav, actor picker, hash routing) and kept the Phase 1 diagnostics as the Foundation view. Six corrections were applied to the fold first.

### The six fixes

1. **Collecting entry accepts either source.** `Collection — video uploaded` (manual) **OR** `Collection — client video` (engine), in a `received` or `partial` state. `partial` counts — "video received; transcript not downloaded" means the video is there. Accepting both means the planned folder-03 poll drops in later with no downstream change.
2. **Coach form reads the engine's `Collection — coach form`.** The dashboard duplicate `Collection — coach form received` was retired; the vocabulary is now 41 strings, matched in `Code.gs`.
3. **Four-state inputs** — `received` / `partial` / `flagged` / `missing`, classified per pipe from the engine's own branch conditions, mirroring its ✅ / ⚠❌ / 🚩 status vocabulary. The old binary test reported `Could not download the transcript for …` and `… — copies failed, review manually` as healthy; both are real failures with no `Flag:` prefix. Verified against 15 real strings from the live log.
4. **Empty-email rows go to a System events bucket.** `Confirmation` and an unresolved coach-form selector are written with no client email; folding them by email invented a phantom testimonial keyed `::1`. They now surface as manual review on the Foundation view.
5. **Timestamps are read as serials.** The Event Log is fetched with `UNFORMATTED_VALUE` and converted with a fixed −05:00 offset. Previously the fold parsed a *display format*, so changing that column's number format would have NaN'd every timestamp at once; and "time in stage" was computed in the viewer's timezone, wrong for anyone outside Ecuador. Phase 3's thresholds depend on this.
6. **The Invited inference is locked to the five fan-out strings.** `CFG.ENGINE_FANOUT` is separate from `CFG.ENGINE`. The engine's other four (`Collection — coach form`, `Collection — client video`, `Confirmation`, `Nomination`) fire later or carry no client, and must never advance a stage. Asserted in the test: 0 leaked.

Also: all **nine** engine strings are now in the never-write guard on both sides, not just the five fan-out ones.

### New read: the Signal tab

The event log records the client folder's *name*, never its URL. Signal column E holds the surfaced folder-03 link, joined back through the roster by name. Without it the client card cannot link to folder 03 — which is the entire manual video workflow decided above.

### Verified against live data before pushing

7 testimonials, 69 events, all at Invited (inferred), 0 unresolved identities, 6 open flags. The four-state classifier was exercised on 15 real strings; the live log produced genuine variation (`Looms` reading `received`, `partial`, and `flagged` across different clients). Timezone check: serial `46241.28888889` → `7 Aug 2026, 6:56` → `11:56Z`. Frontend and Apps Script vocabularies diff to zero.

### Scope notes

The card exposes stage-advance actions for Scheduled and Published so the pipeline is traversable end to end; Phase 4 replaces them with the calendar. Recognitions is read-only until Phase 5.

**Files / commits:** `dashboard/{config,sheets-reader,state-builder,event-writer,pipeline-board,client-card,renderer}.js` · `app.js` · `index.html` · `styles.css` · `apps-script/Code.gs` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md`

---

## 2026-08-07 — Collecting entry decided · engine dead code recorded · coach form trigger gap found

**Context.** Before building Phase 2, two things had to be settled: what event marks Invited → Collecting, and the exact engine vocabulary the client card's input checklist reads.

### The engine writes nine Stage strings, not the five in the data reference

Extracted from every `logEvent_` call site: the five fan-out strings plus `Collection — coach form`, `Collection — client video`, `Confirmation`, and `Nomination`. The last two write with an **empty Client email**. Documented in `DASHBOARD-SYSTEM.md` §11.

### `onClientVideoSubmit` is dead code — corrected course

Reading the engine source, `Collection — client video` looked like a live video-arrival event and was proposed as the Collecting trigger. **That was wrong.** Bernardo's decision log is the authority: D-059 rejected a Forms file-upload question (it forces a client Google login — worse for a 40+/low-tech audience), D-063 pointed the kickoff email at each client's `03 · Client video` folder, and D-065 validated a no-login upload live in incognito. D-054's English rewrite renamed the old handler instead of deleting it.

**Lesson recorded:** source presence ≠ live behavior. The conditional `if (cf)` around the trigger was the tell, and it was read as "unwired" rather than "deliberately dead." Verify against the Triggers list **and** the decision log, not the source alone.

### Nothing watches folder 03 — confirmed structurally

Only four entry points exist in the engine, and the sole time-driven one sends the monthly nomination. All 15 `DriveApp` iterations are write-path plumbing; none enumerates folder 03. Apps Script has no Drive change trigger. So a client upload fires nothing.

### Decision: Collecting entry is manual now, automated later

**Option A — Gaby marks it — is the primary path.** `Collection — video uploaded`, `MANUAL - Gaby`.

**Why:** volume is tiny (10–15/month), it needs zero new code in a live engine three days before launch, and the fold does not care who writes the event. Collecting entry is defined as `Collection — video uploaded` **OR** `Collection — client video`, whichever appears — so detection can be upgraded later with no downstream rework, and the manual path always remains as an override.

**Option C — poll folder 03 from the dashboard's own standalone script — is the planned upgrade, after launch.** It gets the same capability without touching the engine. Deferred: Drive access for the Membership account and an `AUTO - dashboard` Source convention are unsettled, and neither is needed yet. Option B (polling from inside the live engine) was rejected as unnecessary risk pre-launch.

A poll of either kind must not test "is folder 03 non-empty" — `copyStructure_` copies template files into every subfolder, so 03 is non-empty from creation. The sound test is `getDateCreated()` later than the folder's own creation.

In Phase 3 this becomes a queued task: clients sitting in Invited generate a "check for uploads" item in Gaby's list, with the card linking straight to folder 03; she either marks it received or does a client reach-out.

### ⚠️ Launch gap found: `onCoachFormSubmit` is not installed

The engine's Triggers list holds only `onSignalEdit` and `sendMonthlyNominationMessage`. The missing video trigger is correct; the **missing coach form trigger is not** — that path was never abandoned, and without it coach responses at launch are silently lost. The empty log is not evidence either way (no coach has submitted yet — the test clients belong to Bernardo and Brent, neither of whom filled the form).

Repair is additive and lives in `apps-script/engine-one-time-coach-form-trigger.gs`: a read-only `checkCoachFormWiring()` preflight plus `installCoachFormTriggerOnly()`. **`installTriggers()` must not be re-run** — it deletes every trigger before recreating them (a mid-run failure leaves the fan-out dead) and it reinstalls the dead `onClientVideoSubmit` whenever `CLIENT_FORM_SHEET_ID` is still set. The Triggers UI cannot do this by hand either: it only binds to the script's container spreadsheet, and the coach form responses live in a different file.

**Files / commits:** `apps-script/engine-one-time-coach-form-trigger.gs` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md`

---

## 2026-08-07 — Wired to the live sheets · API key restriction must be origin-level

**What changed:** the read-only Sheets API key and the Apps Script Web App `/exec` URL were committed into `dashboard/config.js`. `setupPhase1()` was run on the Membership account: the `Cycle` header is in F1, the `Settings` tab exists with the 8 defaults, spreadsheet timezone is **America/Guayaquil**. GitHub Pages is live at `https://f4la.github.io/testimonial-dashboard/`.

**The gotcha, and the correction.** The setup instructions originally said to restrict the key to `https://f4la.github.io/testimonial-dashboard/*`. **That can never work.** Browsers send only the *origin* as the `Referer` on cross-origin requests (default `strict-origin-when-cross-origin` strips the path), so Google sees `https://f4la.github.io/` and the path-scoped rule fails with *"Requests from referer https://f4la.github.io/ are blocked."*

Verified by comparing against the key Coach Pulse already runs in production:

| Referer sent | New key | Coach Pulse key |
|---|---|---|
| `https://f4la.github.io/<path>/` | 200 | 200 |
| `https://f4la.github.io/` | **403** | 200 |

**Correct restriction:** `https://f4la.github.io/*`. Consequence: any page on `f4la.github.io` can use the key — that host is entirely ours, the key is read-only, restricted to the Sheets API, and limited to spreadsheets already link-readable. Path scoping is not achievable with a browser-side key. Documented in `DASHBOARD-SYSTEM.md` §2.4.

The restriction is genuinely enforced otherwise — `https://evil.example/` and a request with no referrer both return **403**.

**Live event log at this point:** 43 rows, 5 clients, all `AUTO`, all with a blank `Cycle` (so all fold to cycle 1). Stage counts are uneven — 11 `Collection — Loom` against 8 of each other pipe — which is more of the engine re-running that the fold's last-write-wins rule already handles.

**Files / commits:** `dashboard/config.js` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md` · dc9c619

---

## 2026-08-07 — Phase 1: Foundation

**What was built:** repo scaffolding (`index.html`, `app.js`, `styles.css`, `dashboard/`), governance docs, the read path (Sheets API), the write path (Apps Script proxy), the Settings tab, identity resolution, and the event-log fold keyed on (email, cycle).

**Files:** `index.html` · `app.js` · `styles.css` · `dashboard/{config,sheets-reader,identity,state-builder,event-writer,renderer}.js` · `apps-script/Code.gs` · `CLAUDE.md` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md`

### Decisions taken

**1. Roster spreadsheet ID corrected against the live sheet.**
The data reference documented `…hkjlajt…` (lowercase L). That id returns **404**. The working id, confirmed live and matching what Coach Pulse has deployed, is `…hkjIajt…` (capital i). Verified by calling the Sheets API on both. *Why it matters:* every identity lookup would have failed with an unhelpful 404.

**2. Identity falls back to Mastersheet Data, picking the most recent contract.**
The Roster is a QUERY view filtered to **active** clients; the event log is permanent. Resolving only against the Roster would turn every past client into a false "unmatched" flag. Mastersheet Data has one row **per contract** (94 of 323 emails have more than one; one has eight), so the fallback sorts by `Contract Start` — which mixes `August 5, 2024` and `5/6/2026` formats in the same column — falling back to `Date Purchased`, then sheet order.
Mastersheet Data has **no** full-name column (built from First + Last) and **no** coach Slack column (resolved through a coach→Slack map harvested from the Roster; all six coaches are covered today).

**3. Last-write-wins per (email, cycle, Stage).**
The live log contains **two complete fan-out runs for the same client** (Benjamin Jayne, 6:56 and 8:13 on 7 Aug). The engine re-runs and re-appends. Counting rows would double-count; taking the first would keep a stale `Flag:` after a later run succeeded. Only the newest row for a Stage describes reality. *This was not in the spec or the data reference — it was found in the data.*

**4. Order is (timestamp, row number).**
`Date and time` has minute resolution and no seconds, so one fan-out writes several rows sharing a timestamp. Append order is the tiebreaker. Unparseable dates sort last and are surfaced in setup health rather than dropped.

**5. Stage matching normalizes dashes and whitespace.**
The engine writes an em dash (U+2014). Exact-matching a typographic character is too fragile for the system's only memory — one hand-typed hyphen would silently drop a row from the fold instead of failing loudly.

**6. Any engine collection event implies the Invited stage.**
The engine only starts writing at the confirmation checkbox, which fires during Invited, and the three front stages have no events today. Without this inference every client currently in the log would be stage-less. Inferred stages are badged `inferred` in the UI so the inference is never invisible. Events that match no stage-entry condition yield **Indeterminate** — the fold does not invent a stage.

**7. `Approval — …` for Joey's stage; `Review — …` for Google reviews.**
The spec calls both "Review" (§4.1 stage 6 and §4.5). They are unrelated. The vocabulary separates them; the pipeline stage still displays as "Review".

**8. `Collection — video uploaded`, not `— client video received`.**
Renamed for visual distance from the engine's `Collection — client video link`, which means the folder was *shared*, not that the client uploaded. The upload is 100% manual — nothing detects it today.

**9. No `detail` column; `Event` already is it.**
The spec proposed a sixth `detail` column. `Event` already carries the free-text payload, so adding one would have split the same field in two. **`Cycle` is the only added column** (F), blank on all pre-existing rows and folded to 1.

**10. Timestamps are generated server-side, in the spreadsheet's timezone.**
`Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'd MMM yyyy, H:mm')`. Using the spreadsheet's own timezone guarantees no new timezone is introduced, and the browser clock never reaches the sheet.

**11. Write then verify.**
Apps Script Web Apps return no CORS headers, so the POST is `mode:"no-cors"` and the response is unreadable (same as Coach Pulse). Fire-and-forget alone would let a silent failure look like success, so every write re-reads the log to confirm the row landed.

**12. Two guards against corrupting the live log.**
Both the frontend and Apps Script reject any Stage outside the approved vocabulary, and explicitly reject the five engine strings — the dashboard can never forge an `AUTO`-looking collection event. `Code.gs` also re-checks the A–E headers before every write and refuses if they drifted. The collection engine is live; a non-additive change would break it.

**13. Six modules, not four.**
`identity.js` (two sources plus a recency rule is its own concern) and `event-writer.js` (the write path belonged in neither config nor renderer) were added to the four named in the brief.

**14. Governance docs in English.**
The 21DC docs are in Spanish; the build spec, the Coach Pulse README, and this repo's audience are English. Matching the spec. Say the word to switch.

### Setup still required (outside git)

- Sheets API key, referrer-restricted to `https://f4la.github.io/testimonial-dashboard/*` → `TDConfig.API_KEY`.
- Apps Script Web App deployed from `apps-script/Code.gs` → `TDConfig.WEB_APP_URL`.
- `setupPhase1()` run once to add the `Cycle` header and create the `Settings` tab.

---

## 2026-08-07 — `context/` folder created

Holds the build spec and the real-data reference. Inputs to the build, not runtime code.

**Files:** `context/README.md` · commit `0da26c5`
