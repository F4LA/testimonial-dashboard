# Phase 5 · Raffle — the DRAW (first WRITE chunk)

> **Note added 2026-08-19 — the body below is left as written.** This is a dated
> handoff, not a living document, so it is not rewritten after the fact. One path in
> it has since moved: `apps-script/engine-prefs-form-bridge.gs` no longer exists in
> this repo. The engine's code is versioned in `F4LA/testimonial-system` under
> `engine/`, and that patch is kept for its reasoning in `engine/history/`. The draw
> itself shipped, so this brief is spent.

**Handoff note, written 2026-08-09/10.** The compliance half is shipped and validated;
the draw is not started. This file exists so a fresh session can pick the work up
without the conversation that produced it. Read it alongside `CLAUDE.md`,
`DASHBOARD-SYSTEM.md` §10.9, and the system repo's `decision-log.md`.

---

## State at handoff

**Shipped and validated live** (dashboard repo, `main`):

| Commit | What |
|---|---|
| `438a438` | D-099 — bridge classifier fix (`"Not yet"` now parses as No) |
| `235c031` | Phase 5 raffle **compliance** view, read-only |
| `089dd9e` | fix: the two review signals read as contradictory on the card |
| `0f21a30` | append-only rule written into this repo's change-log header |

**Engine side:** `apps-script/engine-prefs-form-bridge.gs` is installed and live
(five triggers). Validated twice — Event Log rows 85–87 (all Yes) and rows 88–90
(the `"Not yet"` re-test, row 89 = `No ("Not yet")`).

**System decision log top: D-102.** Relevant rows: D-097 (podcast not a raffle
condition) · D-098 (the bridge) · D-099 (classifier fix, validated) · **D-100 (raffle
month assignment — read this one, it governs the draw's cohort)** · D-101 + D-102
(append-only, absolute + session-boundary clause).

**Not started:** everything in this brief.

### What already exists that this chunk must reuse, not re-derive

- `dashboard/raffle.js` — `RaffleFold.compliance(t)` returns the three conditions and
  `qualifies`. **Draw eligibility = this, filtered to the cohort, minus prior winners.**
  One source, not two.
- `RaffleFold.monthOf(t)` — cohort-by-entry, and it **already honours** a
  `Raffle — month moved` override event. The reader is done; only the button is missing.
- `RaffleFold.selfCheck()` — throws at load on four invariants. Keep it passing.
- `dashboard/raffle-view.js` — the `#/raffle` monthly view.
- Client card Recognitions block — `dashboard/client-card.js`.

---

## ⚠️ Before writing ANY code: the live ALLOWED_STAGES pre-flight

The repo can be ahead of the deployed Web App (D-092 — this exact gap caused a silent
failure once). Check the **deployment**, not the repo.

1. **Negative control first:** POST a known-invalid stage string to the deployed v4
   proxy and confirm it is **rejected**. A check that cannot fail proves nothing.
2. Then confirm each string below is **present live**.

Strings this chunk writes:

| String | Expected |
|---|---|
| `Raffle — winner confirmed` | in `config.js` since v1 |
| `Raffle — messages sent` | in `config.js` since v1 |
| `Raffle — month added` | in `config.js` since v1 |
| **`Raffle — month moved`** | **added to `config.js` last chunk, deliberately NOT in the proxy — expect it MISSING** |

**If anything is missing:** add to `ALLOWED_STAGES` + `config.js`, bump
`PROXY_VERSION` to **5**, and redeploy by **editing the existing deployment
`…qll5X-MnC3gZ` (pencil → New version)** — never "New deployment" (D-092).
**Report the plan and the findings before doing it.** Bernardo pre-approved the bump.

---

## Build — three parts

### 1 · The move-to-next-month button (D-100)

In the monthly raffle view, each client gets a **"Move to next month's raffle"** button.
It writes `Raffle — month moved`, attributed to the actor, with the target month as
`YYYY-MM` in the event text (that is the format the reader already parses).

The operational case it exists for: a client says yes, sends nothing that week, and
sends it two weeks later. Today the team decides that by hand and it lives only in
Gaby's head. **Confirmation dialog on click** — it changes which month someone competes in.

Confirm the reader already honours it before wiring (it does; verify, don't assume).

### 2 · The draw — manual on purpose

- **Scope (approved: cohort-only).** Eligible = qualifies on all three conditions
  **AND** belongs to this month's cohort (respecting any `month moved` override)
  **AND** has not already won. This resolves the question D-100 left open.
- The system builds the eligible list and runs the random draw; **Gaby confirms** the
  winner with one click. System proposes, human confirms — same as the calendar dates.
- **Snapshot at the draw** (spec §4.4): who qualified on the day is frozen into the
  event detail as part of confirming the winner, so later changes never alter the record.
- Writes `Raffle — winner confirmed`.

### 3 · Post-draw parallel tasks (D-080) — fire at once, NO chaining

Both fire from the winner confirmation. **Neither blocks the other.**

- **To Miguel:** add one extra month in the Master Sheet + leave the note. **The
  dashboard never touches the Master Sheet** — it hands Miguel the task with the note
  text ready to paste. Marking done writes `Raffle — month added`.
- **To Gaby:** send the winner message + the non-winner thank-you messages (SOP
  templates, ready to paste into Everfit). Marking done writes `Raffle — messages sent`.

Two independent tasks in the respective queues, wired into the v2 task engine (D-094).

---

## Rules

- **Every write goes through the proxy, attributed.** No anonymous writes. Confirm the
  actor rides on each one.
- **Podcast consent is not involved anywhere here** (D-097). Assertion if it leaks in.
- **⚠️ D-088 applies to this chunk.** It emits tasks and a "draw is due" state, so the
  digest now has something raffle-shaped to say. The qualification + draw-due logic must
  live in **both** the dashboard fold **and** `apps-script/Digest.gs`, with `selfCheck()`
  comparing them — **in the same commit**. Do not create a silent second source. If the
  digest is not being wired in this chunk, **say so explicitly and state exactly what the
  digest owes.**
- **Forward-only / no-undo (D-093, open):** a confirmed winner cannot be un-confirmed
  today. Note it; do not solve it here.
- **Known limit (D-100):** the bridge writes no cycle, so a cycle-2 preferences
  submission attaches to cycle 1. Harmless at launch, wrong on the first re-nomination.

## Test plan

Against the current pre-launch data — **all 8 test clients join the wipe AFTER this
validates, so test first, wipe after**:

1. Inject a synthetic all-three-met client into the cohort; confirm the draw lists
   **exactly** the eligible set.
2. Confirm the winner confirmation writes the **snapshot** and fires **both** parallel
   tasks to the right owners.
3. Confirm **move-to-next-month** pulls a client out of this cohort and into the next.

Report the ALLOWED_STAGES findings and the event strings **before** writing, then the
validation results.

## Closing

**No decision-log row per chunk.** One row closes the whole raffle section (compliance
+ draw) once this validates — propose that row's content at that point.
