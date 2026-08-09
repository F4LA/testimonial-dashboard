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
| task rules, owners, thresholds | `dashboard/alerts.js` | `apps-script/Digest.gs` |
| Stage vocabulary | `dashboard/config.js` | `apps-script/Code.gs` `ALLOWED_STAGES` |

`Digest.gs` `selfCheck()` prints its stage counts and task total so drift is
detectable rather than silent. Run it after any such change.

## Build phases

1. **Foundation** ✅ — repo, Pages, governance docs, read path, write path, Settings tab, identity resolution, the event-log fold.
2. **Pipeline + client card** ✅ — the board (stage computed from events), the client card with its five blocks, notes into the timeline.
3. **Action queue + alerts** ✅ — per-person queue, alert conditions per stage, manual-review flags as tasks, content channel. The Slack digest is written but NOT wired (see DASHBOARD-SYSTEM.md §10.5).
4. Calendar + buffer
5. Recognitions (raffle, reviews, podcast / client of the month)

Build one phase at a time and stop for testing before starting the next.
