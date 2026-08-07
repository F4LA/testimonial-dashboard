# DECISION LOG — Testimonial Dashboard

Chronological record of decisions and changes to the dashboard (frontend and `apps-script/`).
**Most recent entry on top.** Each entry: date · what changed · why.

> **Mandatory:** every change to the dashboard adds an entry here and updates `DASHBOARD-SYSTEM.md` (see the rule in `CLAUDE.md`). A change is not finished until the documentation is updated and pushed.

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
