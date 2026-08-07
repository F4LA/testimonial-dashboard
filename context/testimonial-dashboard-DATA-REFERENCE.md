# Testimonial Dashboard — Real Data Reference

This file records the ACTUAL structure of the live sheets, captured from the real spreadsheets on Aug 7, 2026. It answers the open questions from the Phase 1 read-back. Trust these observed facts over any assumption. Everything here is real, not remembered.

---

## 1 · Spreadsheet: "Testimonial Collection — Signal & Event Log"

- **Spreadsheet ID:** `17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo`
- **Tabs (exact names):** `Signal` · `Event Log` · `Sheet1`
  (There is no "Roster (mirror)" tab — ignore any earlier reference to one.)

### Tab: `Event Log` (the append-only memory the dashboard reads/writes)

**Exactly 5 columns. "Date and time" is ONE cell (a single column), not two.**

| Col | Header | Notes |
|-----|--------|-------|
| A | `Client email` | The master key. Lowercased email. |
| B | `Stage` | NOT a clean pipeline stage — a specific sub-event label (see vocabulary below). |
| C | `Date and time` | Single cell, e.g. `7 Aug 2026, 6:57`. |
| D | `Event` | Free-text detail: the human-readable result, flag text, trace, or link. This is where the long payload already lives. |
| E | `Source` | `AUTO` for engine-written rows. |

**Real rows (Benjamin Jayne, one full fan-out run — this is the actual current vocabulary):**

```
Client email                  | Stage                        | Date and time     | Event                                                                 | Source
benjamin.s.jayne@gmail.com    | Collection — folder          | 7 Aug 2026, 6:56  | Folder created: Benjamin Jayne — benjamin.s.jayne@gmail.com — 2026-08  | AUTO
benjamin.s.jayne@gmail.com    | Collection — client video link | 7 Aug 2026, 6:56 | Folder 03 shared (anyone with link – editor); link surfaced to the Signal sheet | AUTO
benjamin.s.jayne@gmail.com    | Collection — Meet            | 7 Aug 2026, 6:57  | Flag: 0 Gemini notes matched. Trace — membership@strongstandard.com: 0 candidate doc(s) | brent@strongstandard.com: 0 candidate doc(s) | ceci@strongstandard.com: 0 candidate doc(s) | miguel@strongstandard.com: 0 candidate doc(s) | jackie@strongstandard.com: 0 candidate doc(s) | bernardo@strongstandard.com: 2 candidate doc(s) | drjoey@strongstandard.com: 2 candidate doc(s) | AUTO
benjamin.s.jayne@gmail.com    | Collection — Loom            | 7 Aug 2026, 6:57  | Flag: no Looms found by name "Benjamin Jayne"                          | AUTO
benjamin.s.jayne@gmail.com    | Collection — coach notice    | 7 Aug 2026, 6:57  | DM sent to Bernardo                                                    | AUTO
```

**What this tells the fold:**

- The engine currently writes only Collecting-phase sub-events, each as its own `Stage` string. The current `Stage` vocabulary for the four fan-out pipes plus the folder is:
  - `Collection — folder` (folder created)
  - `Collection — client video link` (client folder shared + video link surfaced)
  - `Collection — Meet` (Meet/Gemini notes retrieval; may be a success or a `Flag:` line)
  - `Collection — Loom` (Loom retrieval; may be a success or a `Flag:` line)
  - `Collection — coach notice` (coach DM sent)
- **Flags live in the `Event` text**, prefixed with `Flag:`. A row whose `Event` starts with `Flag:` is a manual-review / not-completed signal for that pipe. Example above: Meet found 2 candidate docs under bernardo@ and drjoey@ but matched 0 to Benjamin → a real manual-review case the dashboard should surface as a task.
- The front-of-pipeline stages (Nominated, Outreach, Invited) have NO rows here today — the engine starts at the confirmation checkbox. The dashboard creates those events when a person acts.

### Tab: `Signal` (the ephemeral trigger layer — Gaby's checkbox)

Columns observed:

| Col | Header |
|-----|--------|
| A | `Client (roster name)` — NAME, not email (dropdown from the roster) |
| B | `Confirmed` — checkbox (TRUE/FALSE) |
| C | `Processed` — timestamp once the fan-out ran |
| D | `Result` — the fan-out summary (e.g. "✅ folder · ✅ video link · 🚩 Meet (0 — flag) · 🚩 Loom (0 — flag) · ✅ coach notice") |
| E | `Client video link` — the client's Drive folder / video link |

Note: the Signal tab keys on the roster NAME; the engine translates name → email via the roster (email is the master key everywhere else).

---

## 2 · Spreadsheet: "Active Client Roster" (identity resolution)

- **Spreadsheet ID:** `1VxxqmOVuXffLOpPvMWnSUHhyhkjlajtBeBoSV3xk1fc`
- **Tabs:** `Roster` (the one to read) · `Mastersheet Data` (raw source)
- The `Roster` tab is a QUERY view over `Mastersheet Data` (array formula), filtered to active 1:1 clients. Read the `Roster` tab.

**Columns on the `Roster` tab:**

| Col | Header | Use |
|-----|--------|-----|
| A | `First Name` | |
| B | `Last Name` | |
| C | `Email` | **master key** — join to Event Log's `Client email` |
| D | `Program` | e.g. "1:1 Coaching" |
| E | `Contract Start` | |
| F | `Coach` | first name (Brent, Ceci, Miguel, Jackie, Joey, Bernardo…) |
| G | `End Date` | |
| H | `Client Name` | full name (matches the Signal tab's roster name) |
| I | `Coach Email` | e.g. brent@strongstandard.com |
| J | `Coach Slack Email` | the coach's ACTUAL Slack address (may differ from the workspace email, e.g. brentmomb@gmail.com) — use this for coach notifications |

Identity resolution: Event Log `Client email` (col A) → roster `Email` (col C) → gives Client Name (H), Coach (F), Coach Slack Email (J). If an email has no roster match → raise a manual-review flag, never guess.

---

## 3 · Writing new events (dashboard → Event Log)

- Append rows in the SAME 5-column shape. Additive only — never rename/reorder the existing columns.
- **`Source` column convention for human actions:** write `MANUAL - <Name>` (e.g. `MANUAL - Gaby`, `MANUAL - Miguel`, `MANUAL - Joey`, `MANUAL - Bernardo`). Engine rows stay `AUTO`. This makes the timeline instantly readable (system vs person).
- **`Stage` column for dashboard-written events:** use a clear, consistent vocabulary for the events the dashboard introduces (nomination, outreach sent, kickoff email sent, video received, collection complete, each piece done, approved/sent-back, week assigned, scheduled-post, scheduled-email, published, repost used, note, raffle winner, raffle messages sent, month-added, review verification, podcast invited/accepted/scheduled/recorded/published, client-of-the-month winner, shout-out done, declined/dropped). Propose the exact strings and confirm before writing.
- **`detail` / `cycle`:** the `Event` column already carries the free-text detail the spec called "detail," so a separate `detail` column may be unnecessary — confirm whether to reuse `Event` or still add a dedicated column. `cycle` is genuinely new: append it as a new column at the end; blank on existing engine rows folds to cycle 1; a re-nomination opens cycle 2. Confirm the approach before adding columns.

---

## 4 · Settings tab

Does not exist yet. Create it (in the Signal & Event Log spreadsheet, a new tab, e.g. `Settings`) with the adjustable thresholds (defaults for now), buffer target (4 weeks), and active month.

---

## 5 · Mapping current Stage strings → pipeline stages (for the fold)

The dashboard's pipeline stage is COMPUTED from events. The current engine strings all fall under the Collecting stage:

- `Collection — folder`, `Collection — client video link`, `Collection — Meet`, `Collection — Loom`, `Collection — coach notice` → all belong to **Collecting** (they are the fan-out sub-events / input-checklist items).
- A `Collection — client video link` row means the client folder exists and the video link is surfaced (video received is a separate future event when the client actually uploads — confirm how "video received" is detected vs. just "folder shared").
- Rows whose `Event` starts with `Flag:` → the corresponding input is NOT complete; surface as manual-review tasks.
- Front stages (Nominated/Outreach/Invited) and everything after Collecting (Producing, Review, Scheduled, Published) will be dashboard-written events, not present in today's data.
