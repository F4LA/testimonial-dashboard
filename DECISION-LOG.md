# DECISION LOG — Testimonial Dashboard

Chronological record of decisions and changes to the dashboard (frontend and `apps-script/`).
**Most recent entry on top.** Each entry: date · what changed · why.

> **Mandatory:** every change to the dashboard adds an entry here and updates `DASHBOARD-SYSTEM.md` (see the rule in `CLAUDE.md`). A change is not finished until the documentation is updated and pushed.

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
