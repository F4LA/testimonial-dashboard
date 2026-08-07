# DASHBOARD-SYSTEM — Testimonial Dashboard (Strong Standard)

**Last updated: 2026-08-07**
**Phase: 1 (Foundation) and 2 (Pipeline board + client card) complete and live. Phases 3–5 not built.**

**Living document · Permanent source of truth · Internal use**
Describes how the Testimonial Dashboard actually works: its architecture, every module, every rule, and the reasons behind them. This is not a one-off handover — it is the canonical reference, kept current with every change.

> **How this document stays alive (mandatory rule).** Every change to the dashboard — frontend or `apps-script/` — **must** update this document and its "Last updated" date, and record the decision in [`DECISION-LOG.md`](DECISION-LOG.md), before `git push`. See the full rule in `CLAUDE.md`. A change is not finished until the documentation is updated and pushed.
>
> If anything here contradicts the code, **the code wins** — and this document is out of date and must be corrected.

---

## 0. Starting a new session

1. Point at `/Users/bernardolopez/Desktop/testimonial-dashboard`.
2. Read `CLAUDE.md`, then `context/testimonial-dashboard-spec.md` (what to build), then this file (how it works).
3. `context/testimonial-dashboard-DATA-REFERENCE.md` is useful but **has known errors** — see §9. Verify against the live sheets.

---

## 1. What this is

An internal operations tool for the Strong Standard testimonial process. It replaces the Asana board **and** the multi-tab tracker spreadsheet.

- **Frontend:** vanilla HTML/CSS/JS, no framework, no build step. Hosted on GitHub Pages at `https://f4la.github.io/testimonial-dashboard/`. Repo `F4LA/testimonial-dashboard`. Auto-deploys ~1 min after each push to `main`.
- **Reads:** Google Sheets API v4 with a read-only API key restricted by HTTP referrer to the Pages **origin**. Safe to commit — same posture as Coach Pulse. See §2.4 for why the restriction is origin-level and not path-level.
- **Writes:** a Google Apps Script Web App acting as a proxy. The frontend POSTs; the script appends one row to the event log. This is the only write path.
- **Memory:** the append-only event log. The dashboard has no store of its own and no cache.

### Design principles (from the spec)

Action engine, not a screen · everything has a purpose · one home per question · keep together what belongs together · improve, don't port · everything leaves a trace · one identity: email.

---

## 2. Data sources

| Source | Spreadsheet ID | Tab | Role |
|---|---|---|---|
| Event Log | `17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo` | `Event Log` | The memory. Read + append. |
| Settings | same | `Settings` | Adjustable thresholds. Created by `setupPhase1()`. |
| Active Client Roster | `1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc` | `Roster` | Identity for **active** clients. |
| Mastersheet Data | same | `Mastersheet Data` | Identity **fallback** for former clients. |
| Signal | `17lWPi7o…IKmo` | `Signal` | Read for ONE field: the surfaced folder-03 link (col E). |

The event-log spreadsheet also has `Roster (mirror)` (a names-only column, unused) and `Sheet1`; neither is read.

**Why the Signal tab is read.** The event log records the client folder's *name*, never its URL — `Collection — client video link` only says the link was "surfaced to the Signal sheet". Signal column E holds that URL, and it is what the client card links to. Without it, Gaby cannot click through to folder 03, which is the whole of the video workflow (§4.4). It keys on the roster NAME, so it is joined back through the roster.

### 2.1 Event Log columns

Columns A–E are written by the **live** collection engine. Never rename or reorder.

| Col | Header | Notes |
|---|---|---|
| A | `Client email` | Master key, lowercased. |
| B | `Stage` | A specific sub-event label, not a clean pipeline stage. |
| C | `Date and time` | ONE cell. Format `7 Aug 2026, 6:56` — 24-hour, **no seconds**. |
| D | `Event` | Free text. **This is the "detail" field** the spec described; no separate column was added. |
| E | `Source` | `AUTO` (engine) or `MANUAL - <Name>` (dashboard). |
| F | `Cycle` | **Added by this build.** Blank on all pre-existing rows → folds to 1. |

### 2.2 Roster tab (`A`–`J`)

`First Name · Last Name · Email · Program · Contract Start · Coach · End Date · Client Name · Coach Email · Coach Slack Email`

Column C is the master key. Column J is the coach's **actual Slack address** (may differ from the workspace email) and is what coach notifications use.

### 2.3 Mastersheet Data — what it does and does not have

One row **per contract**, so an email can appear many times (today: 466 rows, 323 unique emails, 94 emails with more than one contract, one with eight).

| Need | Where | Note |
|---|---|---|
| Email | col C | header is `Email Address`, not `Email` |
| Coach | col J | |
| Client name | cols A + B | **no full-name column** — built from First + Last |
| Coach Slack | — | **not present** — resolved via the coach→Slack map harvested from the Roster |

`Contract Start` (col G) mixes formats in the same column: `August 5, 2024` **and** `5/6/2026`. The parser handles both and falls back to `Date Purchased` (col F, `M/D/YYYY`).

### 2.4 The API key restriction is origin-level, not path-level

The read key must be restricted to **`https://f4la.github.io/*`**, not `https://f4la.github.io/testimonial-dashboard/*`.

Browsers send only the **origin** as the `Referer` on cross-origin requests — the default `strict-origin-when-cross-origin` policy strips the path before the request leaves the page. Google therefore sees `https://f4la.github.io/` and a path-scoped restriction never matches, failing with *"Requests from referer https://f4la.github.io/ are blocked."* Coach Pulse's key is origin-scoped, which is why it works.

**What this means in practice:** any page hosted on `f4la.github.io` can use this key. That whole host is ours, the key is read-only, it is restricted to the Sheets API alone, and it can only reach spreadsheets that are already link-readable. Path-level scoping is not achievable with a browser-side key; if a stricter boundary is ever needed, the read path has to move behind the Apps Script proxy.

---

## 3. Identity resolution (`dashboard/identity.js`)

Email → `{ clientName, coach, coachSlack }`. Never guesses.

1. **Roster** → active client. Full identity.
2. **Mastersheet Data** → former client. Picks the **most recent contract** by `Contract Start`, falling back to `Date Purchased`, then sheet order. Coach Slack comes from the coach→Slack map.
3. **Neither** → unresolved → manual-review flag.

**Why the fallback exists.** The Roster is a QUERY view filtered to active 1:1 clients; the event log is permanent. Without the fallback, every client would become a false "unmatched" flag the moment their contract ended — burying the real ones. The fallback resolves history; the Roster stays authoritative for anyone active.

A client resolved via the fallback whose coach has no Slack address on file is still **resolved** — only notification routing degrades. That is recorded in `reason`, not treated as a failure.

---

## 4. The fold (`dashboard/state-builder.js`)

Computes all state keyed on **(email, cycle)**. Three rules the real data forced:

### 4.1 Last write wins per (email, cycle, Stage)

The engine can re-run a fan-out and re-append the entire sequence — the live log already contains **two complete runs for the same client**. Counting rows would double-count. Taking the first would keep a stale `Flag:` after a later run succeeded. Only the newest row for a Stage describes reality.

### 4.2 Order is (timestamp, row number), and timestamps are serials

`Date and time` has minute resolution and no seconds, so one fan-out writes several rows sharing a value. Append order is the tiebreaker. Rows with an unparseable date sort last and are counted in setup health rather than silently dropped.

**The column stores date serials, not text.** Sheets coerces the engine's `d MMM yyyy, HH:mm` string into a real datetime on append (so does our proxy). The Event Log is therefore read with `valueRenderOption=UNFORMATTED_VALUE` and the serial converted directly. Reading the formatted value would parse a *display format*, and changing that column's number format would silently turn every timestamp in the log into NaN at once.

A serial holds a **wall-clock time in the spreadsheet's timezone**. It is converted with a fixed −05:00 offset (`America/Guayaquil`, no DST), never with the viewer's local timezone — otherwise "time in stage" and every Phase 3 threshold would be wrong for anyone outside Ecuador. The card renders times back in the same timezone, so the UI always agrees with the sheet.

### 4.3 Stage strings are matched loosely

Every dash variant is normalized to `-`, whitespace collapsed, case folded. The engine writes an em dash (U+2014); exact-matching a typographic character is too fragile for the system's only memory — one hand-typed hyphen would silently drop a row instead of failing loudly.

### 4.4 Computed pipeline stage

Highest rung reached, terminal overriding everything:

| Stage | Entry condition |
|---|---|
| Nominated | `Nomination — logged` |
| Outreach | `Outreach — sent` |
| Invited | `Invite — kickoff sent` **or any of the five fan-out strings** (see below) |
| Collecting | the client video **arrived** — see below |
| Producing | `Collection — complete` |
| Review | all five `Production — …` present |
| Scheduled | `Schedule — week assigned` |
| Published | `Publish — live` |
| Declined / Dropped | `Pipeline — declined` / `Pipeline — dropped` |

**The Invited inference — five strings only.** The confirmation-checkbox fan-out writes exactly five Stage strings, and it fires during Invited, so any one of them proves Invited was reached even though no front-of-pipeline event exists. The engine's other four strings must **never** enter this inference: `Collection — coach form` and `Collection — client video` fire later in the process, and `Confirmation` / `Nomination` are system rows with no client at all. `CFG.ENGINE_FANOUT` is that list, kept separate from `CFG.ENGINE`. Inferred stages are labelled `inferred` in the UI so the inference is never invisible.

**Collecting entry — how the video is detected.** Nothing watches Drive folder 03 (§11), so entry is:

> `Collection — video uploaded` (Gaby marks it) **OR** `Collection — client video` (engine) — whichever appears, in either a `received` or `partial` state.

Today only the manual path fires. Accepting both means detection can be automated later — a folder poll from our own script — with **no downstream change**: the board, the card, and every later phase read the same computed stage either way. `partial` counts as arrived because "video received; transcript not downloaded" means the video *is* there; `flagged` does not.

If events exist but none is a stage-entry event, the stage is **Indeterminate** — the fold does not invent a stage.

### 4.5 Inputs — four states, mirroring the engine

Six Collecting inputs. **Four of the six are written by the engine**; only Everfit data and photos are purely manual pulls, plus the client video which has no automatic source at all.

| Input | Source Stage string | Automatic? |
|---|---|---|
| Client video | `Collection — video uploaded` (manual) / `Collection — client video` (engine, dead) | ❌ Gaby marks it |
| Coach form | `Collection — coach form` | ✅ |
| Everfit data | `Collection — Everfit data` | ❌ Gaby |
| Photos | `Collection — photos received` | ❌ Gaby |
| Meet notes | `Collection — Meet` | ✅ |
| Looms | `Collection — Loom` | ✅ |

State is **not** binary. The live log contains real failures with no `Flag:` prefix, so a "starts with Flag: or it's fine" test silently reports broken inputs as healthy. The four states mirror the engine's own ✅ / ⚠❌ / 🚩 status vocabulary:

| State | Meaning | Real examples from the log |
|---|---|---|
| `received` | arrived and complete | `1 videos, 1 transcripts` · `2 matched by email (2 copied)` |
| `partial` | arrived, a sub-step failed | `1 videos, 0 transcripts, 1 failed` · `Could not download the transcript for …` |
| `flagged` | needs a human before it counts | `Flag: …` · `… — copies failed, review manually` · `FAILED: …` |
| `missing` | no event at all | — |

Classification is per pipe (`StateBuilder.CLASSIFIERS`), following the engine's own branch conditions rather than a generic rule.

A flag is **open only while it is still the newest word** on that input: a later successful run clears it, as does a `Collection — manual review resolved` event whose text names the input.

### 4.6 Production pieces

Five pieces: carousel, story, reel, case study + landing page, weekly email. A `Production — …` event means done; its `Event` text carries the link and comment. When all five exist, `readyForReview` is true and the approval controls open on the card.

---

## 5. Stage vocabulary

Pattern: `<Group> — <specific>`, em dash (U+2014), one space each side. Approved 2026-08-07.

**Engine (read-only to us):** `Collection — folder` · `Collection — client video link` · `Collection — Meet` · `Collection — Loom` · `Collection — coach notice`

**Dashboard-written:**

| Group | Strings |
|---|---|
| Nomination | `logged` · `coach warm-up done` |
| Outreach | `sent` · `client accepted` |
| Invite | `kickoff sent` |
| Collection | `video uploaded` · `Everfit data` · `photos received` · `complete` · `manual review resolved` |
| Production | `carousel` · `story` · `reel` · `case study` · `weekly email` |
| Approval | `approved` · `sent back` |
| Schedule | `week assigned` · `post scheduled` · `email scheduled` · `repost used` |
| Publish | `live` |
| Pipeline | `declined` · `dropped` |
| — | `Note` |
| Raffle | `winner confirmed` · `messages sent` · `month added` |
| Review | `self-reported` · `confirmed` · `unmatched` · `verification done` |
| Podcast | `invited` · `accepted` · `declined` · `scheduled` · `personal note sent` · `recorded` · `published` |
| Client of the month | `winner` · `shout-out` |

**`Approval — …` is Joey's pipeline stage; `Review — …` is Google reviews.** The spec calls both "Review". They are unrelated, so the vocabulary separates them. The pipeline stage still *displays* as "Review".

`Collection — video uploaded` (the client actually uploaded — manual, because nothing watches folder 03) is deliberately distinct from the engine's `Collection — client video link`, which only means the folder was *shared*.

There is **no** dashboard `coach form` string: the engine's `Collection — coach form` is authoritative and is read directly. A missed one is corrected with `Collection — manual review resolved`.

**41 dashboard strings.** Both the frontend (`config.js`) and Apps Script (`Code.gs`) hold the list and reject anything outside it, plus all nine engine strings. The two lists are kept in lockstep.

A re-nomination needs no new string — it is `Nomination — logged` with cycle 2.

---

## 6. The write path

`dashboard/event-writer.js` → Apps Script Web App → one appended row.

Guarantees, enforced on **both** sides:

1. **No anonymous writes.** An actor from `PEOPLE` (Joey, Miguel, Gaby, Bernardo, Sofi) is required. `Source` becomes `MANUAL - <Name>`. The picker remembers the choice in `localStorage`.
2. **No engine impersonation.** `Stage` must be in the approved dashboard vocabulary; the five engine strings are explicitly excluded.
3. **Header guard.** `Code.gs` re-checks that A–E are exactly the expected headers before every write, and refuses if they drifted.
4. **Write then verify.** Apps Script Web Apps return no CORS headers, so the POST uses `mode:"no-cors"` and the response is unreadable (same as Coach Pulse). Fire-and-forget alone would let a silent failure look like success, so every write is confirmed by re-reading the log (up to 4 attempts with backoff).

**Timestamps are generated server-side by Apps Script** using `getSpreadsheetTimeZone()`, formatted `d MMM yyyy, H:mm`. Never by the browser. This keeps dashboard rows in the same clock and format as engine rows without introducing a new timezone.

Concurrent appends are serialized with `LockService`.

---

## 7. Settings

A `Key | Value | Notes` tab in the event-log spreadsheet, created by `setupPhase1()`.

| Key | Default | Meaning |
|---|---|---|
| `nominationWarmupHours` | 24 | Coach warm-up overdue |
| `outreachFollowupHours` | 72 | No client response to outreach |
| `inviteUploadFollowupHours` | 96 | No video upload after kickoff |
| `collectingStaleHours` | 120 | A Collecting input still missing |
| `producingPieceHours` | 168 | A production piece overdue |
| `approvalPendingHours` | 72 | Joey's approval pending |
| `bufferTargetWeeks` | 4 | Healthy calendar buffer |
| `activeMonth` | *(blank)* | e.g. `2026-08`; blank = current month |

Values in the tab win. Missing keys fall back to `SETTINGS_DEFAULTS` in `config.js`, so a partial tab is safe. Unknown keys in the tab are ignored. **These are defaults to be tuned in the tab, not in code.**

---

## 8. File layout

```
index.html              ← shell + module load order
app.js                  ← orchestrator: load → fold → render, hash routing
styles.css              ← light/dark aware, no framework
dashboard/
├── config.js           ← sheet ids, column maps, Stage vocabulary, defaults
├── sheets-reader.js    ← Sheets API fetch + parsers (no interpretation)
├── identity.js         ← email → name/coach/Slack, Roster then Mastersheet
├── state-builder.js    ← THE FOLD: events → state keyed on (email, cycle)
├── event-writer.js     ← the only write path + write-then-verify
├── pipeline-board.js   ← the board: one card per testimonial, by stage
├── client-card.js      ← the five blocks + every action
└── renderer.js         ← shell, nav, actor picker, routing, foundation view
apps-script/
├── Code.gs             ← Web App proxy + one-time setupPhase1()
└── engine-one-time-coach-form-trigger.gs  ← NOT ours; a repair for the engine
context/                ← build spec + data reference (inputs, not runtime)
```

Routes are hash-based, re-rendering from state already in memory (no refetch):
`#/board` · `#/client/<email>::<cycle>` · `#/foundation`.

`apps-script/Code.gs` **is** the source of truth for the deployed script. Edit here, paste into the editor, redeploy, log it.

---

## 9. Known errors in `context/testimonial-dashboard-DATA-REFERENCE.md`

Found by verifying against the live sheets on 2026-08-07. The file is otherwise accurate.

1. **Roster spreadsheet ID is wrong** — position 28 is a lowercase `l`; it must be a capital `I`. The documented id returns 404. Correct: `1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc`.
2. **`Roster (mirror)` does exist.** The file says it does not. It is a names-only column with no header, in the event-log spreadsheet. Unused, but the tab list is 4 tabs, not 3.
3. **Mastersheet Data has no Client Name and no Coach Slack Email column** — both must be derived (see §2.3).
4. It does not mention that the engine **re-runs and re-appends** whole fan-outs (see §4.1), or that `Contract Start` mixes date formats (§2.3).

---

## 10. The views

### 10.1 Pipeline board (`#/board`)

The backbone: one card per active testimonial in its single current position. Eight stage columns plus terminal and indeterminate columns when non-empty. Replaces the Asana board **and** the tracker tab — production tracking is not a separate place, it is the same testimonial in stages 4–6.

Each card carries the name, coach, badges (`part N`, `inferred`, `former`, `unresolved`, flag count, `ready`), a stage-appropriate middle (input dots in Invited/Collecting, a piece progress bar in Producing/Review, the closing note when terminal), and **time in stage** coloured amber at 72h and red at 168h — a stuck testimonial is visible at a glance.

Columns sort **longest-in-stage first**, so the most at-risk card is always on top. A coach filter narrows the board.

### 10.2 Client card (`#/client/<email>::<cycle>`)

Everything about one client in one place — spec §4.2's five blocks:

1. **Header** — name, cycle label, coach + Slack, computed stage with `inferred` badge and time in stage, and the links out: **Drive folder 03** (from the Signal tab) plus every finished piece. The dashboard links to where files live; it never stores copies.
2. **Input checklist** — the six inputs with their four-state status, the engine's own detail text, who marked it, and when. `Mark received` for the manual ones, `Resolve` for flagged ones. Below it, **Mark collection complete** — the lock that unlocks Producing.
3. **Production checklist** — the five pieces with owners. **Pasting the link is what marks the piece done** — one gesture, not two. When all five have a link, the approval controls open: Approve, or Send back (feedback required).
4. **Timeline** — every event newest-first, engine rows and human notes woven together, with `Flag:` rows and manual rows marked by their left border. A note can be written straight from here.
5. **Recognitions** — review, raffle, and podcast status, kept strictly separate and never merged. Read-only until Phase 5.

Plus **Advance** (the front-of-pipeline steps the engine never writes, and the Scheduled/Published steps until Phase 4 gives them a calendar) and **Close** (Declined / Dropped, note required).

Every action appends exactly one event and then re-reads the log to confirm it landed. Nothing is ever updated in place.

### 10.3 Foundation (`#/foundation`)

The Phase 1 diagnostics, kept: setup health, log counts, live Settings with `default`/`from tab` provenance, manual review (unresolved identities, open flags, system flags), and the **System events** table — rows the engine writes with an empty client email, which belong to no testimonial.

---

## 11. The collection engine — what is live, and what is dead code

The engine is a container-bound Apps Script on the Signal & Event Log spreadsheet. A working copy of its source is at `~/Downloads/collection-engine.gs.txt`. **Reading that source is not enough to know what runs** — several handlers are only wired up conditionally, and one is deliberately dead. Check the Triggers list, not just the code.

### It writes nine Stage strings, not five

| Stage string | Written by | Live? |
|---|---|---|
| `Collection — folder` | fan-out | ✅ |
| `Collection — client video link` | fan-out — folder 03 **shared** | ✅ |
| `Collection — Meet` | fan-out | ✅ |
| `Collection — Loom` | fan-out | ✅ |
| `Collection — coach notice` | fan-out | ✅ |
| `Collection — coach form` | `onCoachFormSubmit` | ⚠️ trigger missing — see below |
| `Collection — client video` | `onClientVideoSubmit` | ☠️ **dead by decision** |
| `Confirmation` | name doesn't resolve — **empty Client email** | ✅ |
| `Nomination` | monthly nomination posted — **empty Client email** | ✅ |

Only the **five fan-out strings** imply the Invited stage. The two form events fire later in the process and must never be used for that inference.

### ☠️ `onClientVideoSubmit` is dead code — do not install it

**Authority: decisions D-059, D-063, D-065.** The client video does **not** arrive through a Google Form. D-059 rejected a Forms file-upload question because it forces a client Google login — worse for a 40+/low-tech audience — so the client uploads **directly into their `03 · Client video` Drive folder** via the link in the kickoff email (D-063), validated live in incognito with no login (D-065). D-054's English rewrite renamed the old handler rather than deleting it.

Dead inventory:

| Item | Status |
|---|---|
| `onClientVideoSubmit` (lines 919–972) | dead — abandoned form flow |
| `CLIENT_FORM_SHEET_ID` · `CLIENT_FORM_HDR_EMAIL` · `CLIENT_FORM_HDR_VIDEO` | dead properties |
| `Collection — client video` | never written in the real flow |
| `'Client video (their story)'` status line | orphaned — only the dead handler calls `markStatus_` for it |
| `formRow_` (1003–1021) | **keep** — shared with `onCoachFormSubmit` |

Re-running `installTriggers()` would **resurrect** this handler whenever `CLIENT_FORM_SHEET_ID` is still set, and it deletes every trigger before recreating them. Do not run it. Use `apps-script/engine-one-time-coach-form-trigger.gs` instead, which is additive.

### Nothing watches Drive folder 03

There is no folder watch, no periodic scan, and Apps Script has no Drive change trigger. The only time-driven trigger in the engine sends the monthly nomination message. Every `DriveApp` folder iteration in the source is write-path plumbing (create folder, copy template, find subfolder, read the status file); none enumerates folder 03.

**Consequence:** when a client uploads their video, *nothing fires*. See §4.4 for how Collecting entry is detected.

### Engine bug: `logEvent_` and the ambient spreadsheet

`logEvent_` originally resolved the Event Log through `SpreadsheetApp.getActiveSpreadsheet()`. That returns the spreadsheet the *running trigger* is attached to, not the script's container — so `onSignalEdit` (attached to Signal & Event Log) logged fine, while `onCoachFormSubmit` (attached to the coach form responses file) found no `Event Log` tab, hit `if (!tab) return;`, and dropped every write silently, with status Completed and no error. Folder-04 routing still worked because it uses DriveApp.

Fixed 2026-08-07 by resolving the log by id via a new `SIGNAL_SHEET_ID` Script Property — see `apps-script/engine-fix-logEvent.gs`. The same fix makes the time-driven `Nomination` events reliable, since `getActiveSpreadsheet()` can be null in that context.

**Consequence for reading this system:** an engine handler running to Completed does **not** mean it wrote an event. Verify in the Event Log itself.

### ⚠️ Open launch gap: the coach form trigger

As of 2026-08-07 the engine's Triggers list holds only `onSignalEdit` and `sendMonthlyNominationMessage`. **`onCoachFormSubmit` is absent.** Unlike the video handler, this one was never abandoned — the coach form is one of the five collected inputs and the fan-out DMs each coach a link to it. Without the trigger, coach responses at launch are silently lost: nothing routes them to folder 04 and no event is written. Repair steps live in `apps-script/engine-one-time-coach-form-trigger.gs`. This is a launch issue independent of the dashboard.

---

## 12. Not built yet

**Phase 3** — action queue + alerts: the per-person queue, alert conditions per stage, manual-review flags as tasks, the daily per-owner Slack digest, the content channel for production. Includes the "check folder 03 for uploads" task for clients sitting in Invited.

**Phase 4** — calendar + buffer: the queue view and month view, system-proposed dates, the automatic buffer, the suggestion + dropdown fill. The card's Schedule/Publish buttons are a stopgap until this exists.

**Phase 5** — recognitions: raffle (auto compliance, manual draw, snapshot, parallel post-draw tasks), reviews (two separate signals, pushed weekly verification), podcast + client of the month.

**Planned upgrade, post-launch** — automatic detection of the client video by polling Drive folder 03 from *our* standalone script (never the live engine). Needs Drive access for the Membership account and an `AUTO - dashboard` Source convention. The fold already accepts the event either way, so it lands with no downstream change.

Out of scope by decision (spec §9): aggregate metrics, published-content performance.
