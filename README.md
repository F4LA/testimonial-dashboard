# testimonial-dashboard

Strong Standard **Testimonial Dashboard** — one integrated tool replacing the Asana board and the multi-tab testimonial spreadsheet.

**Live:** https://f4la.github.io/testimonial-dashboard/
**Status:** Phase 1 (Foundation) complete. Phases 2–5 not built.

## What this is

An action engine, not a screen to look at. The event log is the memory; the dashboard reads it to compute all state and appends to it when someone acts. Pipeline stage is computed from which events exist, never stored.

## Architecture

- **Frontend:** vanilla HTML/CSS/JS, no framework, no build step, GitHub Pages.
- **Reads:** Google Sheets API v4, read-only key restricted by referrer to the Pages URL (safe to commit — same as Coach Pulse).
- **Writes:** Apps Script Web App proxy. Append-only, attributed, vocabulary-guarded.
- **Identity:** email is the master key, resolved through the Active Client Roster with a Mastersheet Data fallback for former clients. Never guessed.

## File layout

```
index.html              ← shell + module load order
app.js                  ← orchestrator: load → fold → render
styles.css
dashboard/
├── config.js           ← sheet ids, column maps, Stage vocabulary, defaults
├── sheets-reader.js    ← Sheets API fetch + parsers
├── identity.js         ← email → name / coach / coach Slack
├── state-builder.js    ← the fold: events → state keyed on (email, cycle)
├── event-writer.js     ← the only write path, with write-then-verify
└── renderer.js         ← Phase 1 foundation view
apps-script/            ← EXACTLY TWO FILES, both the dashboard's own project
├── Code.gs             ← Web App proxy + one-time setupPhase1()
└── Digest.gs           ← daily per-owner Slack digest
context/                ← build spec + real-data reference (inputs, not runtime)
```

**The collection engine's code is not in this repo.** `apps-script/` holds only the two
files above, both belonging to the dashboard's own standalone Apps Script project. The
engine is a separate project, versioned in `F4LA/testimonial-system` under `engine/`.

## Documentation

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project context and the hard rules |
| `DASHBOARD-SYSTEM.md` | **Living source of truth** for how it behaves |
| `DECISION-LOG.md` | What changed, when, and why |
| `context/testimonial-dashboard-spec.md` | The build spec — what to build |

**A change is not finished until `DASHBOARD-SYSTEM.md` is updated and pushed.**

## Setup (one time, outside git)

1. Create a Google Sheets API key, restrict it to the Sheets API and to the HTTP referrer `https://f4la.github.io/testimonial-dashboard/*` → paste into `TDConfig.API_KEY`.
2. Deploy `apps-script/Code.gs` as a Web App (execute as Me, access Anyone) → paste the `/exec` URL into `TDConfig.WEB_APP_URL`.
3. Run `inspect()` then `setupPhase1()` once in the Apps Script editor — adds the `Cycle` header (column F) and creates the `Settings` tab.
