# Testimonial Dashboard — Project Context

This repo is the **Strong Standard Testimonial Dashboard**. It replaces the Asana board and the multi-tab testimonial spreadsheet with one integrated tool.

Read `context/testimonial-dashboard-spec.md` before doing anything. It is the **build spec and source of truth for what to build**. `context/testimonial-dashboard-DATA-REFERENCE.md` records the real shape of the live sheets — but verify it against the live sheets, it has known errors (see `DECISION-LOG.md`, 2026-08-07).

The source of truth for **how the dashboard actually behaves** is `DASHBOARD-SYSTEM.md` (living document). The change log is `DECISION-LOG.md`.

Stack: vanilla HTML/CSS/JS · no framework · no build step · GitHub Pages · Google Sheets API (read) · Apps Script Web App (write).

Always start by confirming you read the context before proposing any action.

---

## ⚠️ DOCUMENTATION RULE (mandatory on every change)

Any change to the dashboard — frontend (`index.html`, `app.js`, `styles.css`, `dashboard/*.js`) or backend (`apps-script/*.gs`):

1. `git pull` before starting.
2. Apply the change.
3. Update `DASHBOARD-SYSTEM.md` to reflect the new behavior, and update its "Last updated" date.
4. Add an entry to `DECISION-LOG.md` with the date, what changed, and why.
5. `git push`.

**A change is not finished until the documentation is updated and pushed.**

---

## Hard rules specific to this system

1. **The event log is append-only.** Never update, delete, or reorder a row. Every action writes a new row.
2. **Additive changes only to the Event Log.** Columns A–E (`Client email`, `Stage`, `Date and time`, `Event`, `Source`) are written by the **live** collection engine. Never rename or reorder them. New columns go at the end. `Code.gs` refuses to write if the header drifts.
3. **The dashboard never writes an engine Stage string.** The five `Collection — folder | client video link | Meet | Loom | coach notice` values belong to the engine. Both the frontend and Apps Script reject them.
4. **Stage is computed, never stored.** It is derived only from which events exist for an (email, cycle).
5. **No anonymous writes.** Every write carries an actor; `Source` is `MANUAL - <Name>`. Engine rows stay `AUTO`.
6. **Never guess an identity.** Email is the master key. If it resolves in neither the Roster nor Mastersheet Data, raise a manual-review flag.
7. **Do not read a legacy sheet column as if it were a live process.** Validate against the spec and the real event log. This risk is registered in the spec (§6) and has already bitten once.
8. **Thresholds live in the Settings tab, not in code.** `SETTINGS_DEFAULTS` in `config.js` is only a fallback for missing keys.

## ⚠️ Two sources of truth — change BOTH

`apps-script/Digest.gs` re-implements the fold and the alert rules, because a
time trigger has no browser and cannot load `dashboard/state-builder.js`.

**Any change to the fold, the stage ladder, the input classifiers, the
Collecting gate, or the alert rules MUST be made in both places:**

| Rule | Frontend | Apps Script |
|---|---|---|
| fold, ladder, classifiers | `dashboard/state-builder.js` | `apps-script/Digest.gs` |
| Collecting → Producing gate | `dashboard/client-card.js` `collectionLock` | `apps-script/Digest.gs` |
| task rules, owners, thresholds | `dashboard/alerts.js` | `apps-script/Digest.gs` `dTasks_` |
| the v2 ladders, rung for rung | `dashboard/flows.js` | `apps-script/Digest.gs` `dFlow*_` |
| owners are ONLY Gaby/Miguel/Joey/Bernardo | `dashboard/alerts.js` | `apps-script/Digest.gs` `D_PEOPLE` + `dResolveDm_` |
| raffle: conditions, answer classifier | `dashboard/raffle.js` | `apps-script/Digest.gs` `dRaffleConditions_` / `dClassify_` |
| raffle: cohort month + `month moved` | `dashboard/raffle.js` `monthOf` / `moveTargets` | `apps-script/Digest.gs` `dMonthOf_` |
| the `activeMonth` setting (Sheets date coercion) | `dashboard/sheets-reader.js` `monthSetting` | `apps-script/Digest.gs` `dMonthSetting_` |
| raffle: eligibility + draw-due state | `dashboard/raffle.js` `eligibleFrom` / `build` | `apps-script/Digest.gs` `dEligibleFrom_` / `dRaffle_` |
| raffle: the two parallel post-draw tasks | `dashboard/flows.js` + `dashboard/alerts.js` | `apps-script/Digest.gs` `dTasks_` |
| Stage vocabulary | `dashboard/config.js` | `apps-script/Code.gs` `ALLOWED_STAGES` |

`Digest.gs` `selfCheck()` prints its stage counts, task total, the raffle counts
(month · cohort · qualifying · eligible · draw state · winner) and a **task
fingerprint**, so drift is detectable rather than silent. It also runs
`dSelfCheckRaffle_()` for the structural invariants.

**After ANY change to either side, compare the fingerprints.** In the browser
console on the dashboard:

```js
Alerts.fingerprint(TDApp.state)
```

and diff it against the block `selfCheck()` prints. They must be identical — if
they are not, the digest is telling the team something the queue does not say.

## Build phases

1. **Foundation** ✅ — repo, Pages, governance docs, read path, write path, Settings tab, identity resolution, the event-log fold.
2. **Pipeline + client card** ✅ — the board (stage computed from events), the client card with its five blocks, notes into the timeline.
3. **Action queue + alerts** ✅ — per-person queue, alert conditions per stage, manual-review flags as tasks, content channel. The Slack digest is written but NOT wired (see DASHBOARD-SYSTEM.md §10.5).
4. **Calendar + buffer** ✅ — the week strip, the two buffer metrics, week assignment (column G).
5. Recognitions — **raffle ✅ (compliance + the draw, with the Digest mirror)**; reviews and podcast / client of the month not started.

Build one phase at a time and stop for testing before starting the next.
