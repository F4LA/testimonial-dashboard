# DASHBOARD-SYSTEM — Testimonial Dashboard (Strong Standard)

**Last updated: 2026-08-18**
**Phase: 1–4 complete and live (Foundation · Pipeline board + client card · Action queue + alerts · Calendar + buffer). The Slack digest is written but NOT wired. Phase 5 in progress: the raffle (compliance + the draw) is built; reviews and podcast / client of the month are not.**

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
| F | `Cycle` | Added in Phase 1. Blank on all pre-existing rows → folds to 1. |
| G | `Week` | **Added in Phase 4.** ISO Monday, e.g. `2026-08-17`. Blank = no week assigned. |

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
| Invited | `Outreach — client accepted` |
| Collecting | `Invite — kickoff sent` **or any of the five fan-out strings** (see below) |
| Producing | `Collection — complete` |
| Review | all five `Production — …` present |
| Scheduled | `Schedule — week assigned` |
| Published | `Publish — live` |
| Declined / Dropped | `Pipeline — declined` / `Pipeline — dropped` |

**⚠️ The ladder moved up one rung.** Until this change Invited meant "the kickoff fired" and Collecting meant "the client's video arrived". Production showed why that was wrong: Jennifer Dickey sat in a column labelled **Invited** with the coach form, the Meet notes and the Looms already in — 3 of 6 inputs. The label was lying; she was collecting.

Now **Invited is the client saying yes** (nothing has been sent yet — the ball is ours, which is why `CFG.PIPELINE` gives that column to Gaby, not to the client), and **Collecting starts at the kickoff**, which is exactly the moment inputs can begin arriving. **The client video is no longer a stage gate at all** — it went back to being one of the six inputs and nothing more.

**The ladder is walked forward, and the last rung with an event wins** — it is not "the most recent event by date". So a client whose kickoff (12 Aug) predates their recorded acceptance (13 Aug) still lands in Collecting, because Collecting sits later on the ladder. A client with a kickoff and no recorded acceptance also lands in Collecting rather than breaking. Both are verified against live data.

**The Collecting inference — five strings only.** The confirmation-checkbox fan-out writes exactly five Stage strings and fires at kickoff, so any one of them proves Collecting was reached even when no `Invite — kickoff sent` row exists. The engine's other four strings must **never** enter this inference: `Collection — coach form` and `Collection — client video` fire later in the process, and `Confirmation` / `Nomination` are system rows with no client at all. `CFG.ENGINE_FANOUT` is that list, kept separate from `CFG.ENGINE`. Inferred stages are labelled `inferred` in the UI so the inference is never invisible.

**`collectingEntry`.** The fold exposes the event that put a testimonial into Collecting (the kickoff, or the fan-out when no kickoff row exists) on the testimonial object. Flow 5 reads it rather than re-deriving the condition — "has collection started?" has exactly one answer.

The Collecting → Producing gate (§4.6, three blockers) is untouched by this change.

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

### 4.6 What gates Collecting → Producing

Spec §4.1 conjoins "all required inputs present" with Gaby's check. **"Required" is not "all six."**

| Input | Gates Producing? |
|---|---|
| Client video | ✅ **required** — no video, no testimonial |
| Everfit data | ✅ **required** — Gaby's manual pull |
| Photos | ✅ **required** — Gaby's manual pull |
| Coach form · Meet notes · Looms | ❌ **never** |

**Automatic-input flags must never block.** The engine fetched whatever existed and flagged the rest; a flag there frequently means *this client has none* — no Loom was ever recorded, no Gemini note carries their email. Nobody can resolve that, so gating on it would strand the testimonial in Collecting permanently. Benjamin Jayne is the live case: Meet and Looms both flagged, neither resolvable.

The asymmetry that makes this safe: **a manual input can always be satisfied by the person; an automatic one cannot.** Gating only on manual inputs plus the video can never produce a state no human can exit.

`Collection — complete` stays its **own explicit event**, not something derived from the two manual dots. The dots are arrival facts; the button is Gaby's judgment that her part is done. Deriving it would make marking photos silently advance the pipeline stage.

The gate lives at the point of action (`ClientCard.collectionLock`), not in the fold. Enforcing it in the fold would mean an event that exists but does not take effect, and would let the stage **regress** if an input later re-flagged — breaking the monotonic ladder. A `partial` video counts as present; a `flagged` one does not.

### 4.7 Production pieces

Five pieces: carousel, story, reel, case study + landing page, weekly email. A `Production — …` event means done; its `Event` text carries the link and comment. When all five exist, `readyForReview` is true and the approval controls open on the card.

### 4.8 `postponement` — computed once, read everywhere (D-120)

The fold exposes `t.postponement = { pending, month, resumeDate, waiting, count }`. It is **not a stage**: a postponed client keeps the stage they were in, because they said yes and nothing about their position changed.

- **`pending`** — the newest `Pipeline — postponed to month` has no cancellation after it and **no `Outreach — sent` after it**. It is never switched off by the calendar; see §10.4c for what that would break.
- **`month`** — whatever `RaffleFold.monthOf` resolves, *never* the event's own payload. So if the month is later moved from the raffle view, the return month moves with it, by construction rather than by keeping two values in step.
- **`resumeDate`** — the first business day of that month, in the sheet's timezone.
- **`waiting`** — pending and the resume date has not arrived. This is what dims the card and stops the age counter.

`hoursInStage` is overridden in the same pass: `NaN` while waiting, and counted from `resumeDate` afterwards. Every consumer (board sort, card age, digest) reads that one field, so none of them has to know about postponements.

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
| Pipeline | `declined` · `dropped` · `postponed to month` · `postponement cancelled` |
| — | `Note` |
| Raffle | `winner confirmed` · `messages sent` · `month added` |
| Review | `self-reported` · `confirmed` · `unmatched` · `verification done` |
| Podcast | `invited` · `accepted` · `declined` · `scheduled` · `personal note sent` · `recorded` · `published` |
| Client of the month | `winner` · `shout-out` |

**`Approval — …` is Joey's pipeline stage; `Review — …` is Google reviews.** The spec calls both "Review". They are unrelated, so the vocabulary separates them. The pipeline stage still *displays* as "Review".

`Collection — video uploaded` (the client actually uploaded — manual, because nothing watches folder 03) is deliberately distinct from the engine's `Collection — client video link`, which only means the folder was *shared*.

There is **no** dashboard `coach form` string: the engine's `Collection — coach form` is authoritative and is read directly. A missed one is corrected with `Collection — manual review resolved`.

**The two `Pipeline — postpone…` strings are NOT terminal** (D-120). `declined` and `dropped` close a testimonial; these two pause one. A postponed client said *yes* — they are still on the board, in the same column, and they come back on their own.

**Both carry a month as `YYYY-MM`, and the target month comes FIRST in the event text**, because `RaffleFold.monthOf()` parses the first one it finds. `postponed to month` carries the month the client asked for; `postponement cancelled` carries the month they return to, so one write both ends the pause and restores the raffle entry.

**43 dashboard strings.** Both the frontend (`config.js`) and Apps Script (`Code.gs`) hold the list and reject anything outside it, plus all nine engine strings. The two lists are kept in lockstep.

A re-nomination needs no new string — it is `Nomination — logged` with cycle 2.

---

## 6. The write path

`dashboard/event-writer.js` → Apps Script Web App → one appended row.

Guarantees, enforced on **both** sides:

1. **No anonymous writes.** An actor from `PEOPLE` (Gaby, Miguel, Joey, Bernardo) is required. `Source` becomes `MANUAL - <Name>`. The picker remembers the choice in `localStorage`.
2. **No engine impersonation.** `Stage` must be in the approved dashboard vocabulary; the five engine strings are explicitly excluded.
3. **Header guard.** `Code.gs` re-checks that A–E are exactly the expected headers before every write, and refuses if they drifted.
4. **Read the response, then verify.** The POST is a normal readable fetch — Apps Script *does* return `access-control-allow-origin: *` on its redirect target, verified live. `Content-Type` stays `text/plain` so it remains a CORS "simple request": Apps Script does not answer OPTIONS, so anything that triggers a preflight fails.

This replaced `mode:"no-cors"`, inherited from Coach Pulse, which made every reply opaque. A real server error like `{"ok":false,"message":"Unknown action: requestFanout"}` was invisible and had to be *inferred* seconds later from a row that never appeared — which is exactly how the fan-out bridge failed on 2026-08-08 with no visible error at all. The server's own message is now reported first; re-reading the log stays as the second check. If the readable fetch ever fails at the network/CORS layer it falls back to an opaque send, so a write is never lost.

**`PROXY_VERSION` is 7** — the two postponement strings (D-120) were added to `ALLOWED_STAGES`. Redeployed by editing the existing deployment `…qll5X-MnC3gZ` → **New version** (D-092), never "New deployment". Until that redeploy runs, both postponement buttons fail in production: the strings exist in the repo and not in the vocabulary the live Web App actually enforces.

**Proxy version handshake.** `Code.gs` exposes `PROXY_VERSION`; `config.js` holds `EXPECTED_PROXY_VERSION`. The dashboard pings on load and shows a red banner naming the redeploy steps when they differ. A Web App serves its **deployed** version, so editing `Code.gs` without redeploying silently keeps the old code running — that mismatch has now cost time twice (the coach form trigger, then this). Bump `PROXY_VERSION` whenever an action is added or changed.

**Feedback is shown where the action happened.** Every result appears as a fixed toast (errors persist until dismissed, successes fade), beside the button that was clicked, and in the view's result strip. The result element used to live only at the bottom of the client card — several screens below a button near the top — so errors read as "nothing happened".

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
| `videoSnoozeDays` | 2 | Flow 3 · how many days a snoozed video check stays quiet |
| `activeMonth` | *(blank)* | e.g. `2026-08`; blank = current month |

Values in the tab win. Missing keys fall back to `SETTINGS_DEFAULTS` in `config.js`, so a partial tab is safe. Unknown keys in the tab are ignored. **These are defaults to be tuned in the tab, not in code.**

### ⚠️ `activeMonth` and the Sheets date coercion

Typing `2026-08` into that cell — exactly what its own note tells you to do — makes Sheets **convert it to a date**, so the value read back is the serial `46266`, not the string. Every reader tested it against `YYYY-MM`, failed, and fell back silently: the raffle showed the wrong cohort behind an "invalid value" banner, and `flows.js roundDeadline` put the wrong month into the deadline a **coach** is told. One coercion, two silent failures, found during the live raffle draw test.

`parseSettings` now normalises it in the one place a raw cell becomes a value (`sheets-reader.js monthSetting`, mirrored as `Digest.gs dMonthSetting_`), so no consumer can miss it. It accepts a real `YYYY-MM`, a date serial, an ISO date, or a `Date`. **Anything unrecognised is returned unchanged on purpose** — genuine nonsense like `Septembre` must still fail the readers' test and still raise the banner, rather than being swallowed as "no pin set". Both `selfCheck()`s assert all five cases.

Operators can still enter it either way now, but the cell is cleanest as plain text (`'2026-08` with a leading apostrophe, or Format → Number → Plain text).

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
├── dialog.js           ← the confirmation dialog (3 moves only — see §10.6)
├── alerts.js           ← THE RULES: state → owned, thresholded tasks
├── queue-view.js       ← the per-person action queue
└── renderer.js         ← shell, nav, actor picker, routing, foundation view
apps-script/
├── Code.gs             ← Web App proxy + one-time setupPhase1()
├── Digest.gs           ← daily per-owner Slack digest (NOT wired)
├── engine-signal-poll.gs                  ← NOT ours; the fan-out bridge
├── engine-fix-logEvent.gs                 ← NOT ours; a repair for the engine
└── engine-one-time-coach-form-trigger.gs  ← NOT ours; a repair for the engine
context/                ← build spec + data reference (inputs, not runtime)
```

Routes are hash-based, re-rendering from state already in memory (no refetch):
`#/queue` (default) · `#/board` · `#/client/<email>::<cycle>` · `#/foundation`.

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

Each card carries the name, coach, badges (`part N`, `inferred`, `former`, `unresolved`, flag count, `ready`), a stage-appropriate middle (input dots in **Collecting only**, a piece progress bar in Producing/Review, the closing note when terminal), and **time in stage** coloured amber at 72h and red at 168h — a stuck testimonial is visible at a glance.

The dots are **Collecting only**. They used to show in Invited too, which was right under the old ladder: Invited then meant the kickoff had fired, so inputs could already be arriving. Since the ladder moved up a rung (§4.4), Invited means the client said yes and nothing has been sent — no folder, no fan-out — so it is `0/6` by construction. A row of empty dots that can only ever read `0/6` informs nothing.

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

## 10.4 Action queue (`#/queue`) — the default view

Spec §5: *"the dashboard is the home — the action queue is always there when someone opens it."* An action engine opens on the work, so `#/queue` is the landing route and the Pipeline is one click away.

It defaults to **the signed-in person's own list** — a queue showing everyone's work is a report, not a worklist. Owner tabs switch, `Everyone` shows all.

Each task carries one owner, a plain-language title, the reason, a link to the client card, and — where a single write settles it — an inline action button that appends the same event the card would.

### The rules — see §10.4b for the v2 ladders (`dashboard/flows.js`)

*(The table below is the superseded Phase-3 model, kept only for history.)*

#### Superseded

Two invariants, both from spec §5: **every task has exactly one owner** (an alert with no owner is spam), and **every threshold comes from the Settings tab**, never from code.

| Stage | Task | Owner | Threshold |
|---|---|---|---|
| Nominated | Nudge the coach — warm-up not done | Gaby | `nominationWarmupHours` |
| Outreach | Follow up — no answer | Gaby | `outreachFollowupHours` |
| Invited | **Check folder 03 for the video** | Gaby | `inviteUploadFollowupHours` |
| Collecting | Fill the coach form | **the coach** | `collectingStaleHours` |
| Collecting | Pull Everfit data / photos | Gaby | `collectingStaleHours` |
| Collecting | Mark collection complete *(appears only once the gate is satisfied)* | Gaby | `collectingStaleHours` |
| Producing | Each unfinished piece | its owner, **in the content channel** | `producingPieceHours` |
| Review | Approve | Joey | `approvalPendingHours` |
| Scheduled | Schedule the post / the email | Gaby | `approvalPendingHours` |
| any | Manual-review flag · unresolved identity · unattributed engine flag | Gaby | none — always `review` |

Severity is `overdue` past the threshold, `due` inside it, `review` for items with no clock. Both due and overdue are shown: the queue is a worklist, not just an alarm.

**The folder-03 task is the video detection mechanism.** Nothing watches Drive folder 03 (§11), so this standing task for every client in Invited *is* Option A — the human half of Invited → Collecting. It stays one task per client and escalates its wording from "go look" to "nudge the client" once the threshold passes, rather than spawning a second competing row. Its inline action writes `Collection — video uploaded`.

**Manual-review flags never block.** A Meet or Loom flag surfaces so it is not silently lost, and says so in its own text — *"does not block the pipeline — often just means this client has none."* Only the video and Gaby's two manual pulls gate Producing (§4.6).

Closed testimonials raise nothing.

---

## 10.4b The seven flows (Task Model v2, D-090)

`dashboard/flows.js` holds the ladders as readable rules; `alerts.js` walks them. Each flow is a state machine: the clock re-anchors on every action, and the rung depends on which button was pressed and how many times. **A rung produces no task until its threshold passes** — before that, the client is simply inside their window.

Three invariants, asserted rather than assumed:

- **One task per flow per client.** Rungs are sequential.
- **Every owner is a real dashboard user** — Gaby, Miguel, Joey, Bernardo. **Coaches never own tasks**; a coach-dependent step is Gaby's "chase the coach". A coach owner is a bug, and `alerts.js` reports it in `problems`.
- **Every threshold comes from the Settings tab.**

| Flow | Anchor | Ladder |
|---|---|---|
| **1+2 Outreach** | `Nomination — logged` | do outreach → *coach hasn't messaged* ×2 → **Bernardo** · *mark sent* → +24h reply check → *no reply* → FU#1 +24h → FU#2 +48h → tell the coach +48h |
| **3 Video** | `Invite — instructions email sent` | +48h **check folder 03** → *checked, not there* flips to **send the follow-up** → FU#1 → +48h check again → FU#2 → +48h tell the coach. Snooze postpones; a check no longer does. |
| **4 Coach form** | `Collection — coach notice` (engine) | +24h **Gaby** chases → +24h **Bernardo**. Clears itself when the engine writes `Collection — coach form`. |
| **5 Everfit + photos** | entry into **Collecting** | only exists once collection has started; passive reminder to **Gaby**, one soft escalation at `collectingStaleHours`, never leaves her |
| **6 Content** | `Collection — complete` | +5d **Miguel** soft check-in → +7d **Gaby**. **Per client, never per piece.** |
| **7 Approval** | all five pieces done | **Joey** → +48h **Gaby** tells Bernardo → **Bernardo** nudges Joey |
| **Postponed** | the resume date | the ONLY rung a postponed client can produce — see §10.4c |

**Why Flow 3 anchors on the instructions email.** The fan-out shares the folder; the *instructions email* is the client being told what to do. Starting the 48h clock at the fan-out would chase a client who has not been asked yet.

**Flow 3 has two states, and checking no longer makes the card vanish.**

| State | Title | Message shown | Buttons |
|---|---|---|---|
| **A** | *Check if [Client] uploaded their video.* | **no** — there is nothing to send until you know it is missing | `Mark received` · `Checked, not there` · `Remind me in N days` |
| **B** | *Nothing in folder 03 for [Client]. Send the follow-up.* | **yes** — `videoFollowup1` / `videoFollowup2` | `Mark received` · `Follow-up sent` · `Remind me in N days` |

Pressing **Checked, not there** writes the event and moves A → B; the task **does not leave the queue**. Only `Follow-up sent` (or `Mark received`) closes it. State is B whenever the newest check is newer than the newest follow-up, or a check exists and no follow-up does; anything else is A.

*Why:* the check used to re-anchor the clock, so the card disappeared for a full interval — and the follow-up step lived on that same card. Bernardo pressed it and lost sight of sending the follow-up. **A check now postpones nothing.** The only thing that postpones is the explicit snooze (`Collection — video check snoozed`, `videoSnoozeDays` in Settings): while it is live the flow returns no task at all, and when it expires the task comes back to **the state it was in**, not to the start.

**Why Flow 5 waits for Collecting.** It had no precondition at all, so it fired for any testimonial that merely existed — it went out for four freshly nominated clients, one of whom had not even accepted, and its `blocking: true` then leaked those clients into the buffer indicator. It now reads `collectingEntry` from the fold (one source, not re-derived), and the staleness clock counts from **entry into Collecting** — when the task could first exist — rather than from a video or folder event that says nothing about whether Gaby has done her pulls.

**Why Flow 6 is per client.** The five-piece checklist on the card is the detail view and is unchanged. The alert watches the whole package, so Miguel gets one question rather than five clocks. Both rungs measure from day 0, so acknowledging the 5d check-in clears Miguel's rung but does not postpone Gaby's 7d escalation — the escalation is about the work, not the reply. There is deliberately **no landing-page threshold**: landing-page-first is an agreement between Bernardo and Miguel, not a dashboard rule.

### 10.4c "Yes, but next month" — the postponement (D-120)

A client who replies *yes, but start me next month* had no honest button. The reply-check offered two: **"Yes, they're in"** starts the whole collection and chases them for a month, **"No reply"** sends two follow-ups to somebody who did reply. Both are lies, and the first real case (Allen Donald, August 2026) sat untouched in the queue accruing fake delay because pressing either would have caused real damage.

There is now a third: **"Yes, but next month"**, which opens a month picker and writes one event.

**Where it lives.** Two places, and only in **Outreach, Invited and Collecting** — past Collecting the material is already in the house and there is nothing left to pause:

1. the reply-check task in the queue, as a third button beside the other two;
2. the client card, for the whole of the collection — which covers the other known case, a client who accepts, goes quiet, and asks halfway through to move to next month.

**One event, three effects.** `Pipeline — postponed to month`, carrying the target as `YYYY-MM`:

| Effect | How |
|---|---|
| every task stops | one gate in `Flows.evaluate` (below) |
| the raffle entry moves | `RaffleFold.monthOf` reads this event as one of its three month sources |
| Gaby is reminded | the resume rung fires on the first business day of that month |

#### The month is ONE function reading three strings

`monthOf` used to read only `Raffle — month moved` (D-100). It now reads that **plus** the two postponement events, newest-wins, exactly as before. The postponement deliberately does **not** also write a `Raffle — month moved` row: a second row saying the same thing is a second thing that can drift, and one of the two could later be superseded alone. After D-120 a testimonial's month has exactly one answer, computed in one place.

**A consequence worth stating, because it needed no code:** the raffle gate (D-119) walks *this month's cohort*, so a postponed client leaves August's group by construction. No new condition was added to the gate, and none should be — inside a month's group the "moved" mark means moved **into** it, and those people still have to resolve.

#### The gate: one question, above the ladders

```js
var flows = (t.postponement && t.postponement.pending) ? [flowPostponed] : FLOWS;
```

Asked **once**, in `Flows.evaluate`, rather than as a precondition inside each flow. The failure mode of per-flow conditions is the next flow somebody writes, which quietly ignores them. While pending: no outreach, no follow-ups, no video check, no coach form, no Everfit and photos, nothing.

`alerts.js reviewTasks` repeats the gate, because manual-review flags are not walked through `evaluate` and a stale flag is still a task in Gaby's queue.

#### Pending ends with the outreach, NEVER with the date

`postponement.pending` is true while the newest `postponed to month` has no `postponement cancelled` and **no `Outreach — sent` after it**.

> ⚠️ If pending expired on the resume date instead, then on 1 September the old August ladder would re-arm and the client would be handed a follow-up thirty days overdue, anchored on an outreach from the month they explicitly asked to skip. **The date does exactly one thing: it lets Gaby's task appear.**

#### The resume rung

| | |
|---|---|
| Owner | **Gaby** |
| Condition | `pending` **and** today ≥ `resumeDate` |
| Title | *"Send the outreach to [Client], they asked to move to this month."* — plus *", they have asked to move month N times"* when N > 1 |
| Copy | **`outreachInitial`**, the same approved D-109 text the `start` and `retry` rungs hand over. No new copy was written |
| Closes with | **"Outreach sent"** → `Outreach — sent`, which ends the postponement and restarts the normal ladder from *today* |

**No new Settings key, deliberately.** Every other rung waits a threshold measured from an event; this one waits for a date already in the data. A duration setting here would be a second, softer answer to a question the client already answered. `hours: 0` with the resume date as the anchor, so it appears that morning and not before, and escalates the way every zero-threshold rung does — `waitedHours` climbs, so an untouched one rises in the queue.

**`resumeDate` = the first Monday-to-Friday of the month**, at midnight in the sheet's timezone, compared as a date. Holidays are **not** modelled: a holiday costs the task one day, and a holiday table is a second thing to maintain that goes stale in silence. This is the one piece of new *timing* written in code rather than Settings, and it is a calendar rule, not a threshold — there is no setting that could make "the first business day" mean something else.

#### On the board

The client does **not** change column and no new column exists. While pending and before the resume date:

- the card is **dimmed** and sinks to the bottom of its column, with a **"waiting for Sep 2026"** chip built from the data;
- the **age counter stops** — a number climbing on someone who asked to be left until next month reads as neglect, and they are not late. It shows `paused · resumes Sep 1`;
- the column header **separates them**: `Outreach 1 · 1 waiting for Sep 2026`;
- they are out of the buffer and out of the production blockers, for the same reason the Everfit task stopped firing before the kickoff (D-117): somebody who is not in play this month cannot be allowed to colour the number that says what is holding publication up.

From the resume date they rejoin the normal counts, and their age runs from **`resumeDate`** — not from the August event, which would resurface as a month of invented delay the morning the task appears.

#### Cancelling

A **"Cancel the postponement"** link on the client card, visible only while pending. It writes `Pipeline — postponement cancelled` carrying the month they return to, so a single write both ends the pause and restores the raffle entry.

It exists because this button silences a client for a whole month and switches off every task that would otherwise tell you so. Without an undo, one misclick removes somebody from the work with nothing left to raise a flag.

There is **no cap** on postponements, and the dialog shows the history (*"already been postponed once, from Aug 2026"*) as information rather than a block.

### Copy provenance

Every template records where its wording came from, because the sources disagree.

| Template | Source |
|---|---|
| **Initial outreach** (the first invitation) | **D-109**, approved in the governance repo |
| Outreach follow-up #1, #2 | **SOP §2.5**, verbatim wording on v2's relative clock |
| Video follow-up #1, #2 | **SOP §3** "Follow-Up System for Uploads" |
| Tell the coach (no response) · Coach form follow-up · Tell the coach (no video) | **v2 spec** |
| Raffle winner · raffle non-winner | **D-106**, approved in the governance repo |

**The first invitation** (`outreachInitial`) is handed to Gaby on the outreach flow's `start` and `retry` rungs — the same action either way, so both offer the same copy. Later rungs do **not** inherit it: `reply-check` has no copy, and `fu1`/`fu2` keep their own SOP wording.

Its placeholders are **multi-word** — `[Client First Name]` and `[Coach Name]` — because that is how the copy was approved. `render()` therefore matches `[\w ]+` rather than `\w+`. Widening is safe: an unrecognised placeholder is still returned unchanged, which is the existing "a gap is visible rather than a silent blank" behaviour. Both are **aliases** of the values the card already uses, so the message and the card can never disagree about who the client or the coach is.

**Two messages on one step.** A task can carry more than one approved message, via `templates: [...]` instead of `template:`. The raffle post-draw task is the first: Gaby sends the winner text **and** the non-winner text in the same sitting (D-080 — they go out together, not in sequence). `evaluate()` renders each into `task.copies`, and the queue draws one labelled button per message — **"Copy the WINNER message"** and **"Copy the NON-WINNER message"**. The labels are deliberately explicit: sending the winner text to a non-winner is the one mistake this step can make, and two buttons reading "Copy message" would invite it. Single-template steps keep the plain **"Copy message"** label and are unchanged.

⚠️ **Approved copy is stored character for character.** `outreachInitial` and both raffle messages carry typographic apostrophes (U+2019), and the winner message carries an ellipsis (U+2026) and two emoji; the older SOP templates carry straight quotes. Nothing here should be "normalised" — silently changing an approved client-facing message is the drift the provenance field exists to prevent.

**No `NONE`-source templates remain.** Every step that hands over copy now has approved wording, so the *"No approved message exists for this step yet"* empty state is currently unreachable. It stays in the code for the next step that needs it.

⚠️ **The video follow-ups live in SOP revisions 1–4, not revision 5** — that section was dropped in the newest file. Searching only the newest revision misses them.

SOP §2.5 has **three** follow-ups anchored to Wednesday/Friday/Monday around the Sunday raffle deadline. v2 deliberately moved to relative-per-client timing, so FU#1 and FU#2 keep their wording and **FU#3 was dropped** — its text says the deadline has already passed, which is false on a relative clock.

SOP §3's upload cadence is **48h / 48h / 48h**, which matches v2's Flow 3 exactly. As with outreach, the SOP's **third** client message is dropped — v2 replaces it with the tell-the-coach step.

**One edit to the SOP wording:** both upload messages used an em dash (`busy—just`), which v2 forbids. Replaced with a comma, preserving the voice. `Flows.checkTemplates()` asserts no template contains an em dash.

### The kickoff checklist — two steps, and the second starts the video clock

`ClientCard.kickoffBlock` renders the tail of Flow 1+2 as an ordered checklist, because these are two different acts:

1. **Fire the fan-out** — confirmed, because it reaches outside the team (§10.6).
2. **Send the instructions email, confirm on Everfit, mark it here** — with SOP §3's *"Send Confirmation via Everfit"* copy on a Copy button.

**Step 2 writes `Invite — instructions email sent`, which is what starts Flow 3.** The fan-out only shares the folder; this is the client actually being told what to do, so anchoring the 48h video check here avoids chasing someone who has not been asked yet. Before this existed nothing wrote that event, so Flow 3 could never start.

`Flows.checkTemplates()` asserts no template contains an em dash, per v2.

---

## 10.8 Calendar + buffer (Phase 4)

`#/calendar`. One data source, two shapes, a toggle: **Queue** (primary — what's next in order) and **Month** (secondary — the at-a-glance grid).

**Scheduling is BY WEEK.** A testimonial occupies one week, keyed by its ISO Monday, and the model has no concept of a day. One testimonial per week, enforced on assignment. Weeks are only ever shown as *"week of Aug 17"*.

**The week lives in column G**, not in the Event text. It is validated server-side as a real ISO Monday before any write. That matters because the buffer is the one computation duplicated in `Digest.gs` — it must read a clean structured value, not parse a token out of free text.

### Two metrics, deliberately distinct (`dashboard/calendar.js`)

| Flag | Meaning | Governs |
|---|---|---|
| `occupied` | a testimonial is assigned to this week, complete or not | assignment — stops two colliding |
| `complete` | that testimonial has all five pieces done | **buffer health, and nothing else** |
| `scheduledChecks` | **both** manual checks marked | at-risk clearing |
| `atRisk` | `occupied && !(complete && scheduledChecks)` | display |

**occupied-but-not-complete is the normal case** — a date gets proposed while production is still running.

**Buffer** = consecutive `complete` weeks, starting at the first non-Published week ≥ this week. An at-risk or empty week **breaks the streak** rather than being skipped, so a later complete week does not count. Verified: weeks 0,1 complete → week 2 at-risk → week 4 complete gives a buffer of **2**, not 3.

### The strip answers "what do I do", not just "what is it"

The number alone misdirects. A single at-risk week can dam several ready weeks behind it, and *"buffer 2, stopped at Aug 17"* reads as **go produce more content** when the actual fix is **unblock one week** — the opposite action, and the expensive one.

So the fold also reports `blockedBy`, `behindGap`, `wouldBe` and `fix`, and the strip leads with them. **None of this changes the arithmetic** — `buffer.weeks` is untouched.

| Situation | What the strip says |
|---|---|
| At-risk gap, content behind | *"Week of Aug 17 is blocking the queue. Karen Nosek is at 3/5, still needs the case study + landing page and weekly email. **2 ready weeks are waiting behind it** (Amy Lang, Tammera Hood), so the fix is to finish that one piece set, not to produce more. Unblocking it takes the buffer to 5."* → **Open Karen Nosek** |
| At-risk gap, nothing behind | Same, minus the dammed-content clause. Unblocking takes it to 3. |
| Empty gap, content behind | *"Week of Aug 17 is empty, and 1 ready week sits behind it (Karen Nosek). Filling or moving one forward takes the buffer to 3."* → **Suggest a fill** |
| Genuinely short | *"Below target and nothing is queued behind week of Aug 10. This one needs new content."* → **Suggest a fill** |

Only the last case should send anyone to produce. `wouldBe` is computed for **both** kinds of gap: finishing an at-risk week and filling an empty one unblock the same streak.

**The checks do not affect the buffer.** A week whose content is finished counts even if the scheduling clicks are still pending — but it stays at-risk until both are marked (rule 7).

### The two scheduling checks

**Instagram** covers reel + carousel + stories as **one** check. **Email** is the other. Independent, both required, markable days apart, both manual — the dashboard does not integrate with GoHighLevel or Instagram. Each writes its own event: `Schedule — post scheduled` and `Schedule — email scheduled`.

### Proposals and fills

**Proposals are computed as a batch**, in approval order, each getting a distinct week placed after the last occupied week. Nothing is written, so occupancy-on-proposal is achieved without an anonymous write — two testimonials can never be proposed the same week. Gaby accepts with one click, or picks another.

**Moving inside Scheduled is a free move** — no blocking confirmation. It fires an active notice that the old week is now empty, offering the same fill suggestion. **`suggestFill()` is one function with two triggers**: `buffer-low` and `week-vacated`. Candidate order: a ready testimonial first, otherwise the oldest repost by last-used date, with the rest available in a dropdown.

**Scheduled → Published stays a confirmed move.** Retiring the client-card stopgaps did not make it free.

### Retired in Phase 4

The client card's stopgap `Assign a week` / `Post scheduled` / `Email scheduled` / `Published` buttons are gone, along with the publish confirmation that guarded them. Verified no other module references those stages except `state-builder.js`, which only reads them for the ladder.

---

## 10.9 Raffle — compliance and the draw (Phase 5)

`dashboard/raffle.js` (the fold) · `dashboard/raffle-view.js` (`#/raffle`) · the client card's Recognitions block · `dashboard/flows.js` + `dashboard/alerts.js` (the tasks) · `apps-script/Digest.gs` (the mirror).

**Compliance computes; the draw writes.** The compliance half still derives everything from events that already exist. The draw half adds **two writes from the raffle view** (`Raffle — month moved`, `Raffle — winner confirmed`) and **three task-completion writes from the queue** (`Raffle — month added`, `Raffle — messages sent`). All four `Raffle —` strings are in the proxy's `ALLOWED_STAGES` as of **`PROXY_VERSION` 5**.

### The three conditions

Entry is **photo permission + questionnaire/testimonial + Google review** (D-008, hard gate per D-059).

| # | Condition | Reads |
|---|---|---|
| 1 | Photo permission | `Preferences — photo permission` |
| 2 | Questionnaire / testimonial | the **existing** client-video signal — `CFG.INPUTS.video.stages`, i.e. `Collection — video uploaded` (live) or `Collection — client video` (dead alias). **No new event.** |
| 3 | Google review | `Preferences — review self-reported` |

Three things this must never do, each enforced by `selfCheck()`, which **throws at module load** rather than warning:

- **Podcast consent is not a condition** (D-097). Tying entry to podcast willingness would invent a fourth condition and punish a client for declining a one-a-month opportunity.
- **The review condition reads the self-report, never a confirmation** (D-066). Confirmation is the reviews view's audit layer; a genuine reviewer whose name cannot be matched must never be excluded.
- **It reads the engine-owned `Preferences — review self-reported`, not the dashboard-writable `Review — self-reported`** (D-098) — otherwise a person could hand-enter a self-report and open the raffle.

And the trap it is built around: **`Collection — client video link` is the fan-out sharing folder 03**, not the video arriving. It is the most common Collection string in the log; reading it would qualify every invited client instantly. `selfCheck()` throws if it appears. All four guards were verified by sabotaging a copy of the module and confirming each throws.

### Reading the client's answer

The bridge writes a normalized prefix plus the client's own words — `Yes ("Yes, done")`, `No ("Not yet")`. The fold prefers the prefix and **falls back to classifying the raw words** when the bridge could not. That fallback resolves the pre-D-099 `Unclear answer: "Not yet"` rows correctly with **no backfill**.

Four states, and the distinction matters: `met` · `not-met` · **`unclear`** · `missing`. **An unreadable answer is not a no.** It blocks entry and is surfaced for a human, never treated as a silent refusal. Both photo yes-variants (*use them* / *blur my face*) are met; only the explicit no is not.

### Which month a testimonial belongs to (D-100)

The month is the Settings `activeMonth` (`YYYY-MM`); **blank means the current month**, exactly as that setting's own note already says. A date-coerced cell is normalised before it gets here (§7); a genuinely unreadable value falls back to the current month and says so on screen.

A testimonial belongs to the month of its **earliest event** for that `(email, cycle)` — cohort-by-entry, in practice `Nomination — logged`. Deliberately **not** the month it qualified: qualification is unstable under latest-wins, so a client who qualified in August and resubmitted the form in September would silently hop cohorts and vanish from August's list, possibly after the draw ran. Entry is fixed the moment the testimonial exists.

`cycle` is **not** a calendar concept — it is 1, 2, 3 per client. What it contributes is that a client's part-2 testimonial is a separate raffle subject.

**The manual override ships as a button.** A real case the automatic rule cannot cover: a client says yes, sends nothing that week, sends it two weeks later. **Move to another month** on each row in `#/raffle` writes an attributed `Raffle — month moved` event carrying the target `YYYY-MM` — the decision never lives only in Gaby's head. Latest-wins, so a second move supersedes the first. The offered targets are next month, the month after, and the current month when a past cohort is pinned. It is hidden for anyone who has already won, whose cohort is part of a settled record.

`RaffleFold.moveText()` puts the **target** month first, because the reader takes the first `\d{4}-\d{2}` in the text. `selfCheck()` asserts that round-trip, so the button can never write a row the cohort silently ignores. A move whose text holds no readable month is skipped rather than guessed at.

`monthOf` reads **every** move, not just the newest. The newest decides the month; the one before it is what "moved from" reports. Using the *entry* month for that was wrong on a round trip (Aug → Sep → Aug), where it produced "moved from Aug 2026" on a card sitting in Aug 2026. Both views also drop the clause entirely when it would name the month already on screen.

### The draw

**Eligible = qualifies on all three ∧ in this month's cohort ∧ the person has never won.** Cohort-only is the approved scope (it closes what D-100 left open): "everyone currently qualifying" would let a June entrant win August. Eligibility is derived from the same `compliance()` the read-only view has always used — there is no second qualification rule, and `selfCheck()` proves a non-qualifier can never reach the eligible list.

**"Already won" is read per PERSON, across every cycle and month.** D-100 settles which testimonial competes (a part-2 testimonial is a separate subject) but not whether someone can win twice. The conservative reading is used deliberately: an over-broad exclusion costs someone one month in a monthly raffle, while an over-narrow one hands out a second free month, which is a contract change nobody decided. Entries excluded this way are **shown, not hidden**, so "why is she not in the draw?" has a visible answer.

**The draw proposes, a human confirms.** `Run the draw` picks at random and shows the name in a confirmation dialog; nothing is written until Gaby confirms. Cancelling writes nothing and the next click draws afresh — inherent to propose-then-confirm, stated in the dialog rather than hidden, and only a confirmed draw is ever in the log.

**The snapshot is the record** (spec §4.4). The winner event text freezes the month, the winner, the full eligible list and the winner's three conditions in the client's own words. Everything else about the raffle is live, which is right for a working list and wrong for a record: a client editing their preferences form in September must not retroactively change who was eligible in August. The client card shows a past win **above** the live conditions and says which is which, so the two can never read as contradicting each other (the failure fixed in `089dd9e`).

**Draw-due state, and why one eligible entry is not enough.**

| State | When |
|---|---|
| `done` | a winner is recorded |
| `waiting` | nobody is eligible **or** someone in the cohort is still unresolved and the month has not ended |
| `due` | eligible entries exist and everyone is resolved |
| `overdue` | the month has ended and no winner was drawn |

A cohort member is **resolved** when they qualify, or when they are closed (declined / dropped) — nothing more will happen either way. Anyone else is still in flight and holds the draw.

*Why:* the draw used to open the moment **one** person qualified. It went live on 17 August with a single eligible entry while three clients were still working. The damage is not the noise — confirming a winner **freezes a permanent snapshot** of who was eligible, so an early draw records a one-person raffle forever and writes out people who did nothing wrong.

**"Moved to another month" is deliberately not tested as a resolution.** Moving someone removes them from the cohort entirely, so it resolves the hold-up by construction. Testing the entry's `moved` flag would be a bug: inside this list it means moved **into** this month, and those people still need resolving.

**The end of the month is the backstop.** Once it has passed the draw opens regardless, so it can never hang waiting on someone who will never reply.

`build()` returns **`holdingUp`** — the unresolved entries, each with their stage and how long they have been in it. While the draw is waiting, the raffle view names them, says where each is stuck, and puts the **Move to another month** button beside each one: the wait has to be actionable, not a wall. **No task is generated while waiting** — the reason lives in the raffle view, not in anyone's queue.

No Settings key is involved: "everyone is resolved" and "the month has ended" are both facts, not timing policy, so hard rule 8 is not engaged. Two recorded winners in one month is impossible through the UI, so it is surfaced as a **Bernardo review task** rather than averaged over; both implementations name the **earliest-confirmed** winner so they cannot disagree about which one counts.

### After the draw — two tasks, in parallel (D-080)

Both fire from the winner confirmation and **neither blocks the other** — they are two separate flows, not one ladder, precisely because the old SOP sent the winner message only after the contract was updated.

| Owner | Task | Marking it done writes |
|---|---|---|
| Miguel | add one extra month in the client Master Sheet + leave the note | `Raffle — month added` |
| Gaby | the winner message + the non-winner thank-yous, through Everfit | `Raffle — messages sent` |

**The dashboard never touches the Master Sheet** — it hands Miguel the task with the note text ready to paste. Both are actioned **in the queue**, like every other task; the raffle view shows their state and links there, so there is one write path per action rather than two.

**Gaby's two client-facing messages are wired** (D-106): her task hands over both, as two separately labelled copy buttons — *Copy the WINNER message* and *Copy the NON-WINNER message*. See §10.4b Copy provenance for the multi-message pattern.

### Digest (D-088) — the raffle now lives in TWO places

The draw emits tasks and a draw-due state, so `Digest.gs` is no longer raffle-blind and **is now a genuine second source of truth for the raffle**. Both halves shipped in the same commit.

| Rule | Frontend | `Digest.gs` |
|---|---|---|
| answer classifier | `raffle.js classify` | `dClassify_` |
| the three conditions | `raffle.js conditionsFor` | `dRaffleConditions_` |
| compliance / qualifies | `raffle.js compliance` | `dCompliance_` |
| cohort month + override | `raffle.js monthOf` / `moveTargets` | `dMonthOf_` |
| the `activeMonth` setting | `sheets-reader.js monthSetting` | `dMonthSetting_` |
| eligibility | `raffle.js eligibleFrom` | `dEligibleFrom_` |
| the draw-due state | `raffle.js build` | `dRaffle_` |
| the two post-draw tasks | `flows.js flowRaffleMonth` / `flowRaffleMessages` | `dTasks_` |
| the month-level draw task | `alerts.js raffleTasks` | `dTasks_` |

`Digest.gs selfCheck()` prints **month · cohort · qualifying · eligible · draw state · winner · raffle-task count** and runs `dSelfCheckRaffle_()`, which re-asserts the invariants structurally (three conditions, no podcast, no dashboard-writable review string, no `client video link`, eligibility ⊆ qualifying, the D-099 `"Not yet"` case, and the month-moved round-trip). Compare its numbers against `RaffleFold.build(state)` in the browser console after any change to either side.

**One asymmetry to know about:** the frontend's post-draw tasks use the standard `hours: 0` rung, so they appear once the winner event's timestamp has passed, while the digest has no clock gate. In production Apps Script stamps the row at write time so the two always agree; they diverge only under a simulated clock (`?sim=`), which the digest has no equivalent of.

### Known limits

- The bridge writes no cycle, so a blank cycle folds to 1 and a client's **cycle-2** preferences submission would attach to cycle 1. Harmless at launch, wrong on the first re-nomination (D-100).
- **A confirmed winner cannot be un-confirmed** (D-093, open). The log is append-only and no `Raffle — correction` string exists. Deliberately not solved here.

---

## 10.5 Daily Slack digest (`apps-script/Digest.gs`) — written, NOT wired

Spec §5: one DM per person per day with only their own items, plus production items in the existing testimonial-management channel. Same mechanism as the monthly nomination scheduler — an Apps Script time trigger through the existing bot.

**Nothing is installed and nothing sends** until `installDigestTrigger()` is run deliberately. `previewDigest()` returns exactly what would be posted and sends nothing; run it first, every time.

### What goes out

| # | To | Content |
|---|---|---|
| 1 | each of Gaby · Miguel · Joey · Bernardo | a DM with **their own** tasks, grouped overdue / due / reminders / needs review |
| 2 | **Gaby and Bernardo** (`DIGEST.SUMMARY_TO`) | a **second, separate** DM: the whole team's tasks grouped by person, with the day's totals |

Two messages rather than one longer one, deliberately: the first has to stay actionable, and burying Gaby's own items inside everyone else's would defeat it.

**No group channel is posted to.** The testimonial collection channel is reserved for the monthly nomination message, and the private channel this once targeted no longer exists. `CONTENT_CHANNEL_ID` is left empty and **nothing reads it** — the channel code was removed rather than left behind a flag, so there is no dormant path that could start posting by accident. `installDigestTrigger()` no longer demands it.

A person with no tasks gets no DM, and a day with nothing open sends **nothing at all** — not even a "nothing to do" summary. Verified with an empty log: zero Slack calls.

### Addresses, and why a coach cannot be reached

`DIGEST.PEOPLE_SLACK` is the **only** place an address is ever resolved; `dResolveDm_` has no roster fallback and refuses any name outside `D_PEOPLE`. Combined with `dTasks_` rerouting non-person owners to Gaby, a coach cannot be messaged by two independent mechanisms (D-094). `dSelfCheckSend_()` asserts both, and `installDigestTrigger()` refuses to install if either fails.

Still required before it can run: the `SLACK_BOT_TOKEN` script property in the **dashboard's** Apps Script project (properties are per project — the engine's token lives in the engine's project).

### ⚠️ It duplicates the fold — the main maintenance risk in this repo

A time trigger has no browser, so `Digest.gs` cannot reuse `state-builder.js`. It re-implements the same fold in Apps Script: last-write-wins, `(timestamp, row)` ordering, the five-fan-out Invited inference, the four-state inputs, the Collecting gate, **the full v2 task ladders**, the raffle, and **the postponement** — `dMonthOf_`'s three month sources, `dPostponement_`, `dFirstBusinessDay_`, the gate in `dEvaluate_` and `dReviewTasks_`, and `dFlowPostponed_`. **That is a genuine second source of truth.** Change any of those and both must change.

`dSelfCheckPostponement_()` asserts the D-120 invariants structurally, on synthetic data built relative to *now* — a month far ahead is still waiting, a month already past has resumed — because the digest has no simulated clock (there is no URL to put `?sim=` on when a trigger fires it). It proves: a pending client generates exactly **zero** tasks before the resume date and exactly **one** after; a control client of the same shape *does* generate work, so the zero is not vacuous; the outreach ends the pause and the date does not; and both postponement events move the month.

`selfCheck()` also asserts it against the **live** log: a postponed client's cohort must equal the month they were postponed to, and a waiting client must own no tasks at all.

### How drift is caught: the task fingerprint

`selfCheck()` prints one `owner|flow|rung|severity|clientKey` line per task, sorted. `Alerts.fingerprint(TDApp.state)` in the browser console produces the identical string. **If they differ, the digest is telling the team something the queue does not say.** It also prints the stage counts, the raffle counts, and runs `dSelfCheckRaffle_()`.

Verified equal across 18 scenarios covering every rung of every flow: the outreach ladder (start → retry → Bernardo → reply-check → fu1 → fu2 → coach-told), the video ladder, both coach-form rungs, the manual pulls (pending / stale / complete), content (check-in → escalate), approval (approve → escalate → Bernardo), the review flags, both raffle post-draw tasks, and terminal.

### ⚠️ It once DM'd a coach

Until the v2 port, `dTasks_` assigned *"fill the coach form"* to the **coach**, and `dResolveDm_` resolved their address from roster column J — so the first live digest would have cold-messaged a coach a task the system is designed never to give them (D-094). The v1 rules also disagreed with the queue everywhere else: one task per production **piece** instead of one per client, no overdue tier, no escalations.

Both halves of the coach bug are now closed, independently: `dTasks_` reroutes any non-person owner to Gaby and records it in `problems`, and `dResolveDm_` refuses to resolve anyone outside `D_PEOPLE`. Structural, not conventional — a future edit would have to defeat both.

---

## 10.6 Stage moves: what blocks, what confirms, what flows

Three distinct mechanisms. Confusing them is how a system either nags people into clicking through warnings, or lets a destructive action happen by accident.

| Move | Mechanism |
|---|---|
| *(new)* → Nominated | flows |
| Nominated → Outreach | flows |
| Outreach → **Invited** | 🔴 **confirm** — fires the fan-out |
| Invited → Collecting | flows |
| Collecting → **Producing** | 🔒 **hard block** — see §4.6 |
| Producing → Review | *automatic* — computed when all five pieces have links |
| Review → approved | flows (send-back requires feedback: validation, not a confirm) |
| approved → Scheduled | flows |
| Scheduled → **Published** | 🔴 **confirm** |
| any → **Declined / Dropped** | 🔴 **confirm** + required note |
| Outreach / Invited / Collecting → **postponed** | 🔴 **confirm** + month picker (§10.4c) — reversible, uniquely, by cancelling |

**Hard block ≠ confirmation.** A hard block is a disabled control that names what is missing — you cannot proceed. A confirmation is a move you *can* make, shown with its consequences first.

**Three confirmations across the whole pipeline, on purpose.** A dialog that appears on every action stops being read, and then it protects nothing. Confirmations are reserved for moves that are outward-facing or that cannot be reversed.

- **Invited** — creates the Drive folder, shares folder 03 anyone-with-link-Editor, DMs a real coach.
- **Declined / Dropped** — leaves the active board; there is no reopen event, so returning means a re-nomination into the next cycle.
- **Published** — closes the production journey, and see below.

**⚠️ There is no reverse event anywhere in the vocabulary.** The ladder is forward-only by design — append-only log, monotonic stage. A mis-marked step cannot be unmarked, only annotated with a note. That is why Published confirms despite not being outward-facing. If corrections are ever needed, a `Pipeline — correction` event that voids a prior one would be the shape, and it is a fold change.

### The simulated clock (`?sim=`)

Every rule that asks "how long has this been waiting?" reads `TDClock.now()`, never `Date.now()`. One seam, so a simulated clock is exact rather than approximated by shifting event timestamps.

```
https://f4la.github.io/testimonial-dashboard/?sim=+60h#/queue
```

Accepts `+60h` · `60h` · `2d` · `90m` · `-24h` · `60` (hours by default). A literal `+` in a query string decodes to a space, so the parser tolerates both and the URL works as typed. The `?sim=` goes **before** the `#`.

**Writes are refused while shifted.** A time-shifted view plus a live action button is a footgun: a task can look overdue when it is not, and the follow-up would go out early. Reading is safe, acting is not, so the simulation is strictly read-only and says so in a banner.

**What time alone changes.** Time controls whether a rung *appears* and how urgent it looks. **The wording of a ladder advances on button presses, not on the clock** — v2 is press-driven. Exactly one task rewrites itself on time alone: Flow 5's Everfit/photos escalation at `collectingStaleHours`.

### Drag-and-drop

Not built. Every move today is a labelled button on the client card. Drag is planned as an **enhancement after launch**: it replaces the button as the way to *initiate* a move and lands on the same confirmation and block layer, unchanged. Sequenced deliberately — the functional base ships first, drag follows.

---

## 10.7 Opening a card: manual entry into Nominated

Testimonials are derived purely from event-log groups, so before this existed a client with no events had no card at all — and the "Log nomination" button lived *on* the card. Every client on the board had arrived via an engine fan-out.

**+ Add client to Nominated** on the board picks from the **Active Client Roster** — a dropdown, never free text, because identity is the master key and is never guessed. It writes `Nomination — logged`, which is what brings the card into existence.

**Cycle rule:** cycle 1 normally; `max(cycle) + 1` if the client has prior testimonials; **refused while any prior cycle is still active**, since one client cannot have two live testimonials. Clients with a live testimonial are filtered out of the dropdown entirely.

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

### The preferences-form bridge (Phase 5 groundwork)

`apps-script/engine-prefs-form-bridge.gs` — additive, engine-side. `onPrefsFormSubmit` turns the client's own form answers into events, because nothing else ever did: the raffle and reviews views assume those signals exist in the log and they never have.

Writes `Preferences — photo permission`, `Preferences — review self-reported`, `Preferences — podcast consent`, and `Preferences — unresolved` for an identity failure. Reads **by header**, not index. **Podcast consent feeds the podcast chain only — it is not a raffle condition** (D-097). Raffle condition 2 is the existing client-video event; no new event for it.

The group is deliberate: `Review — self-reported` is dashboard-writable, so putting the form's answer there would let a person forge a self-report and open the raffle. D-066's "never merged" holds structurally this way.

Depends on the D-085 `logEvent_` fallback — this trigger is bound to the responses sheet, so `getActiveSpreadsheet()` returns the wrong file. `checkPrefsFormWiring()` asserts the fix is deployed before anything is installed.

**Installed and validated live 2026-08-09.** A real submission wrote three events; the email resolved to the **typed** address rather than the submitter's logged-in Google account, confirming the master key end to end. **Idempotency: none, deliberately** — a resubmission appends three more events and the latest-wins fold keeps the newest as truth, the older ones as history.

**Carry-forward for the alerts side of Phase 5:** `Preferences — unresolved` is written but surfaces to nobody. It must become a Gaby task (spec §5).

**Answer classification (fixed 2026-08-09, D-099).** `prefsYesNo_` normalizes to `Yes` / `No` / unclear, and `prefsDetail_` always preserves the client's raw wording: `No ("Not yet")`. The negative branch is `/^n(o|ot)?\b/` — the `ot` alternative exists because the review question's negative option is **"Not yet"**, which the original `/^n(o)?\b/` missed (no word boundary between the `o` and the `t`), logging the commonest negative answer as manual-review noise. All seven of the live form's closed options classify; free text still flags. **Anything reading these events should parse the raw answer in the detail text, not the normalized prefix** — that keeps readers correct independently of this function.

**Known limit — no cycle value.** `logEvent_` appends five columns, so column F is blank on every bridge row, and a blank cycle folds to 1. Correct for every client at launch; **wrong on the first re-nomination**, where a cycle-2 submission would attach to cycle 1. Tracked as a Phase 5 open item (D-100).

### The engine's triggers (five, as of 2026-08-09)

`onSignalEdit` · `onCoachFormSubmit` · `processPendingSignals` · the weekly nomination · `onPrefsFormSubmit`.

`onClientVideoSubmit` exists in the source but is **dead code and not installed** — the video path became a direct upload to the client's Drive folder with no form. Source presence is not evidence of a live path; check the Triggers list.

*Resolved: the coach-form trigger was recorded here on 2026-08-07 as an open launch gap (absent from the Triggers list, so responses would have been silently lost). It was installed and validated end-to-end the same day, and the `logEvent_` silent no-op behind it was fixed as D-085.*

---

## 11.5 The fan-out bridge — how the dashboard fires the engine

Moving a client to Invited fires the collection engine's fan-out, so Gaby never touches the Signal sheet.

**The obvious route does not work.** Having the dashboard tick the Confirmed checkbox cannot fire `onSignalEdit`: **Apps Script onEdit triggers fire only for edits made by a human in the UI, never for edits made by a script or by the Sheets API.** The box would go green and nothing would run.

**How it actually works:**

1. The card's explicit **fire step** (never a drag, never a side effect) shows a confirmation naming the consequences, then calls the proxy's `requestFanout`.
2. The proxy writes what a human tick writes — roster name in column A, **boolean** `true` in column B, `Processed` left empty — into the **first empty pre-made row (13–30)**. Never appended: an appended row holds a text `"TRUE"` that the engine's `confirmed !== true` check rejects, and Gaby could not use it as the manual fallback.
3. The engine's `processPendingSignals` poll (every minute, `apps-script/engine-signal-poll.gs`) picks it up and runs the same `fanOut_` the checkbox does.
4. The dashboard then writes `Invite — kickoff sent`.

**Order matters:** the fan-out is queued *first*. If the kickoff event were written first and queueing failed, the card would claim Invited with nothing behind it. This way a failed kickoff write is self-healing — the engine's own fan-out rows arrive and the Invited inference picks the stage up regardless.

**Chosen over a Web App endpoint on the engine** because it adds no public endpoint to a live script, and the rollback is free: delete the poll trigger (`removeSignalPollTrigger()`) and Gaby ticks the checkbox exactly as before, with no code change.

**Double-fire protection, three independent layers:**

1. **Dashboard** — the fire step only renders when no fan-out event and no `Invite — kickoff sent` exists for that (email, cycle).
2. **Proxy** — refuses if a row for that client is already pending, or was already processed this calendar month.
3. **Engine** — the pre-existing `Processed` guard, claimed *before* the work runs, under the same script lock the checkbox path takes so the poll and a manual tick cannot race.

---

## 12. Not built yet

**Phase 3 remainder** — the Slack digest exists but is not wired; see §10.5 for the three values still needed.

**Phase 5 remainder** — recognitions: **reviews** (the two separate signals, the pushed weekly verification task) and **podcast + client of the month** (the candidates view, the mark-the-winner click that fires the chain, the shout-out task). The raffle half is built — see §10.9.

**Carried into the reviews chunk** — `Preferences — unresolved` is written by the bridge but nobody is told; it must surface as a Gaby task (D-098 carry-forward).

**Planned upgrade, post-launch** — automatic detection of the client video by polling Drive folder 03 from *our* standalone script (never the live engine). Needs Drive access for the Membership account and an `AUTO - dashboard` Source convention. The fold already accepts the event either way, so it lands with no downstream change.

Out of scope by decision (spec §9): aggregate metrics, published-content performance.
