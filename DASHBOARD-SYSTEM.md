# DASHBOARD-SYSTEM — Testimonial Dashboard (Strong Standard)

**Last updated: 2026-08-07**
**Phase: 1 (Foundation) complete and wired to the live sheets. Phases 2–5 not built.**

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

The event-log spreadsheet also has `Signal` (the ephemeral checkbox layer that triggers the engine), `Roster (mirror)` (a names-only column, unused), and `Sheet1`. Phase 1 reads none of them.

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

### 4.2 Order is (timestamp, row number)

`Date and time` has minute resolution and no seconds, so one fan-out writes several events sharing a timestamp. Append order is the tiebreaker. Rows with an unparseable date sort last and are counted in setup health rather than silently dropped.

### 4.3 Stage strings are matched loosely

Every dash variant is normalized to `-`, whitespace collapsed, case folded. The engine writes an em dash (U+2014); exact-matching a typographic character is too fragile for the system's only memory — one hand-typed hyphen would silently drop a row instead of failing loudly.

### 4.4 Computed pipeline stage

Highest rung reached, terminal overriding everything:

| Stage | Entry condition |
|---|---|
| Nominated | `Nomination — logged` |
| Outreach | `Outreach — sent` |
| Invited | `Invite — kickoff sent` **or any engine collection event** (see below) |
| Collecting | `Collection — video uploaded` |
| Producing | `Collection — complete` |
| Review | all five `Production — …` present |
| Scheduled | `Schedule — week assigned` |
| Published | `Publish — live` |
| Declined / Dropped | `Pipeline — declined` / `Pipeline — dropped` |

**The Invited inference.** The engine only starts writing at the confirmation checkbox, which fires during Invited. So any engine collection row proves Invited was reached, even though no front-of-pipeline event exists. Without this, every client in the log today would be stage-less. Inferred stages are labelled `inferred` in the UI so the inference is never invisible.

If events exist but none is a stage-entry event, the stage is **Indeterminate** — the fold does not invent a stage.

### 4.5 Inputs and flags

Six Collecting inputs: client video, coach form, Everfit data, photos (dashboard-written) plus Meet notes and Looms (engine-written).

A row whose `Event` starts with `Flag:` means that input is **not** complete. A flag is **open only while it is still the newest word** on that input: a later successful run, or a `Collection — manual review resolved` event naming the input, clears it.

### 4.6 Production pieces

Five pieces: carousel, story, reel, case study + landing page, weekly email. A `Production — …` event means done; its `Event` text carries the link and comment. When all five exist, `readyForReview` is true (acting on it is Phase 2).

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
| Collection | `video uploaded` · `coach form received` · `Everfit data` · `photos received` · `complete` · `manual review resolved` |
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

`Collection — video uploaded` (the client actually uploaded, 100% manual) is deliberately distinct from the engine's `Collection — client video link` (the folder was shared).

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
app.js                  ← orchestrator: load → fold → render
styles.css              ← light/dark aware, no framework
dashboard/
├── config.js           ← sheet ids, column maps, Stage vocabulary, defaults
├── sheets-reader.js    ← parallel Sheets API fetch + parsers (no interpretation)
├── identity.js         ← email → name/coach/Slack, Roster then Mastersheet
├── state-builder.js    ← THE FOLD: events → state keyed on (email, cycle)
├── event-writer.js     ← the only write path + write-then-verify
└── renderer.js         ← Phase 1 foundation view
apps-script/
└── Code.gs             ← Web App proxy + one-time setupPhase1()
context/                ← build spec + data reference (inputs, not runtime)
```

Two modules beyond the four named in the brief: `identity.js` (identity resolution is its own concern with two sources and a recency rule) and `event-writer.js` (the write path needed a home that was neither config nor renderer).

`apps-script/Code.gs` **is** the source of truth for the deployed script. Edit here, paste into the editor, redeploy, log it.

---

## 9. Known errors in `context/testimonial-dashboard-DATA-REFERENCE.md`

Found by verifying against the live sheets on 2026-08-07. The file is otherwise accurate.

1. **Roster spreadsheet ID is wrong** — position 28 is a lowercase `l`; it must be a capital `I`. The documented id returns 404. Correct: `1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc`.
2. **`Roster (mirror)` does exist.** The file says it does not. It is a names-only column with no header, in the event-log spreadsheet. Unused, but the tab list is 4 tabs, not 3.
3. **Mastersheet Data has no Client Name and no Coach Slack Email column** — both must be derived (see §2.3).
4. It does not mention that the engine **re-runs and re-appends** whole fan-outs (see §4.1), or that `Contract Start` mixes date formats (§2.3).

---

## 10. Phase 1 UI

Not the dashboard — the foundation made visible, so the plumbing can be tested before Phase 2 builds on it:

- **Setup health** — API key, Web App URL, event-log read, Cycle column, Settings tab, Roster, Mastersheet, timestamp parsing.
- **Counts** — events, testimonials, distinct clients, open flags, unresolved identities.
- **Person picker** — mandatory before any write.
- **Settings** — live values with `default` / `from tab` provenance per key.
- **Computed state** — one row per (email, cycle): identity, stage (+ `inferred` badge), input dots, pieces, flags, event count.
- **Manual review** — unresolved identities and open collection flags.
- **Write path test** — previews the exact row before sending, then confirms it landed.

---

## 11. Not built yet

Phases 2–5: pipeline board, client card, action queue, Slack digest, calendar + buffer, raffle, reviews, podcast / client of the month. See the spec §8.

Out of scope by decision (spec §9): aggregate metrics, published-content performance.
