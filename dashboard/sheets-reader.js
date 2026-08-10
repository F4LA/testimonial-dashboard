/**
 * Testimonial Dashboard — Sheets Reader
 *
 * Parallel-fetches the source sheets via the Google Sheets API v4 and
 * normalizes them into plain JS objects. This module does no interpretation:
 * it reads rows and shapes them. All meaning is added in state-builder.js.
 *
 * Render modes matter here:
 *   Event Log  → UNFORMATTED_VALUE. "Date and time" is stored as a date
 *                SERIAL, not text — Sheets coerces the engine's string on
 *                append. Reading FORMATTED_VALUE would parse a display
 *                format instead of data, so a change to that column's number
 *                format would silently break every timestamp at once.
 *   Roster /   → FORMATTED_VALUE. Their date columns are read as human
 *   Mastersheet  strings by identity.js (and mix formats), so the displayed
 *                text is what we want.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("sheets-reader: TDConfig not loaded");

  var BASE = "https://sheets.googleapis.com/v4/spreadsheets";

  function cell(row, i) {
    if (!row || i == null || i >= row.length) return "";
    var v = row[i];
    return (v == null) ? "" : String(v).trim();
  }

  function buildUrl(sheetId, tab, range, renderMode) {
    var target = tab + (range ? "!" + range : "");
    return BASE + "/" + sheetId + "/values/" + encodeURIComponent(target) +
           "?key=" + encodeURIComponent(CFG.API_KEY) +
           "&valueRenderOption=" + (renderMode || "FORMATTED_VALUE");
  }

  function fetchSheet(sheetId, tab, range, renderMode) {
    return fetch(buildUrl(sheetId, tab, range, renderMode))
      .then(function (res) {
        if (res.ok) return res.json();
        return res.json().catch(function () { return null; }).then(function (body) {
          var msg = (body && body.error && body.error.message) || ("HTTP " + res.status);
          var err = new Error("Sheets read failed [" + tab + "]: " + msg);
          err.status = res.status;
          throw err;
        });
      })
      .then(function (data) { return (data && data.values) || []; });
  }

  /** Never rejects — resolves to null if the tab is missing or unreadable. */
  function fetchSheetOptional(sheetId, tab, range, renderMode) {
    return fetchSheet(sheetId, tab, range, renderMode).catch(function (err) {
      if (root.console) root.console.warn("[sheets-reader] optional tab unavailable [" + tab + "]: " + err.message);
      return null;
    });
  }

  /* ---------- Parsers ---------- */

  /**
   * Event Log rows.
   *
   * rowNumber is the real 1-based spreadsheet row and is the tiebreaker for
   * ordering: the timestamp has minute resolution and no seconds, so a single
   * fan-out writes several events sharing one value. Append order is truth.
   *
   * dateRaw is left as-is — a number (serial) normally, a string if a cell
   * was ever typed as text. state-builder handles both.
   */
  function parseEventLog(rows) {
    var C = CFG.EVENT_COLS;
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var email = cell(r, C.EMAIL).toLowerCase();
      var stage = cell(r, C.STAGE);
      if (!email && !stage) continue;                 // blank row
      var rawCycle = cell(r, C.CYCLE);
      var cycle = parseInt(rawCycle, 10);
      out.push({
        email:      email,                            // may be "" — engine system rows
        stage:      stage,
        dateRaw:    (r && r.length > C.DATE) ? r[C.DATE] : "",
        event:      cell(r, C.EVENT),
        source:     cell(r, C.SOURCE),
        // Blank cycle folds to 1 — every row the engine has ever written,
        // since the column did not exist when they were written.
        cycle:      (isFinite(cycle) && cycle > 0) ? cycle : CFG.DEFAULT_CYCLE,
        cycleBlank: rawCycle === "",
        // Phase 4 · column G. Structured on purpose: the buffer is the one
        // computation duplicated in Digest.gs, so it must not depend on
        // parsing a token out of free text.
        week:       cell(r, C.WEEK),
        rowNumber:  i + 1
      });
    }
    return out;
  }

  function parseRoster(rows) {
    var C = CFG.ROSTER_COLS;
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var email = cell(r, C.EMAIL).toLowerCase();
      if (!email) continue;
      var first = cell(r, C.FIRST_NAME);
      var last  = cell(r, C.LAST_NAME);
      out.push({
        email:      email,
        firstName:  first,
        lastName:   last,
        clientName: cell(r, C.CLIENT_NAME) || (first + " " + last).trim(),
        program:    cell(r, C.PROGRAM),
        start:      cell(r, C.START),
        end:        cell(r, C.END),
        coach:      cell(r, C.COACH),
        coachEmail: cell(r, C.COACH_EMAIL),
        coachSlack: cell(r, C.COACH_SLACK)
      });
    }
    return out;
  }

  /**
   * Mastersheet Data — one row PER CONTRACT, so an email can appear many
   * times. Picking the most recent is identity.js's job. Neither a full-name
   * column nor a coach Slack column exists here.
   */
  function parseMastersheet(rows) {
    var C = CFG.MASTER_COLS;
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var email = cell(r, C.EMAIL).toLowerCase();
      if (!email) continue;
      var first = cell(r, C.FIRST_NAME);
      var last  = cell(r, C.LAST_NAME);
      out.push({
        email:         email,
        firstName:     first,
        lastName:      last,
        clientName:    (first + " " + last).trim(),
        coach:         cell(r, C.COACH),
        product:       cell(r, C.PRODUCT),
        contractStart: cell(r, C.CONTRACT_START),
        contractEnd:   cell(r, C.CONTRACT_END),
        datePurchased: cell(r, C.DATE_PURCHASED),
        rowNumber:     i + 1
      });
    }
    return out;
  }

  /**
   * Signal tab — the ephemeral trigger layer. We read exactly one thing from
   * it: the surfaced folder-03 / client video link, which is the only place
   * that URL exists (the event log records the folder NAME, not its address).
   * It keys on the roster NAME, so callers join it back through the roster.
   */
  function parseSignal(rows) {
    if (!rows) return [];
    var C = CFG.SIGNAL_COLS;
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var name = cell(r, C.CLIENT_NAME);
      if (!name) continue;
      out.push({
        clientName: name,
        confirmed:  cell(r, C.CONFIRMED),
        processed:  cell(r, C.PROCESSED),
        result:     cell(r, C.RESULT),
        videoLink:  cell(r, C.VIDEO_LINK)
      });
    }
    return out;
  }

  /**
   * A month setting (`activeMonth`) as a clean `YYYY-MM`.
   *
   * ⚠️ Sheets COERCES what the operator types. The setting's own note says
   * "e.g. 2026-08" — and typing exactly that turns the cell into a DATE, so the
   * value arriving here is the serial `46266`, not the string. Every reader then
   * failed its `YYYY-MM` test and silently fell back to the current month: the
   * raffle showed the wrong cohort behind an "invalid value" banner, and
   * `flows.js roundDeadline` quietly put the wrong deadline into the message a
   * COACH receives. One coercion, two silent failures.
   *
   * Normalising here rather than at each reader means there is one definition
   * and no consumer can miss it. `parseSettings` is already where a raw cell
   * becomes a value, so it is the right place.
   *
   * Recognised: an actual `YYYY-MM`, a date serial, an ISO date, a `Date`.
   * ANYTHING ELSE IS RETURNED UNCHANGED — deliberately, so genuine nonsense
   * ("Septembre") still fails the readers' `YYYY-MM` test and still raises the
   * invalid-value banner instead of being silently swallowed as "blank".
   *
   * ⚠️ Mirrored in `apps-script/Digest.gs` as `dMonthSetting_` (D-088).
   */
  function monthSetting(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;                 // already right

    var m = /^(\d{4})-(\d{2})-\d{2}/.exec(s);                        // ISO date
    if (m) return m[1] + "-" + m[2];

    // A Sheets date serial. The integer part is the wall-clock date in the
    // spreadsheet's own timezone, so reading it back as UTC gives that date
    // with no offset arithmetic to get wrong.
    var n = Number(s);
    if (isFinite(n) && n > 20000 && n < 90000) {
      var d = new Date(Math.round((n - 25569) * 86400000));
      return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2);
    }
    return s;
  }

  /** Settings: a plain Key | Value sheet. Missing keys fall back to defaults. */
  function parseSettings(rows) {
    var settings = {};
    var fromTab = [];
    for (var k in CFG.SETTINGS_DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(CFG.SETTINGS_DEFAULTS, k)) {
        settings[k] = CFG.SETTINGS_DEFAULTS[k];
      }
    }
    if (rows === null) return { values: settings, exists: false, fromTab: fromTab };

    for (var i = 1; i < rows.length; i++) {
      var key = cell(rows[i], 0);
      var raw = cell(rows[i], 1);
      if (!key || raw === "") continue;
      if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;   // ignore unknown keys
      var num = Number(raw);
      settings[key] = (typeof CFG.SETTINGS_DEFAULTS[key] === "number" && isFinite(num)) ? num : raw;
      if (key === "activeMonth") settings[key] = monthSetting(raw);
      fromTab.push(key);
    }
    return { values: settings, exists: true, fromTab: fromTab };
  }

  /* ---------- Public ---------- */

  function loadAll() {
    var S = CFG.SHEETS;
    if (!CFG.API_KEY || CFG.API_KEY.indexOf("PASTE_") === 0) {
      return Promise.reject(new Error(
        "No Sheets API key configured. Set TDConfig.API_KEY in dashboard/config.js."
      ));
    }
    return Promise.all([
      fetchSheet(S.EVENT_LOG.id,   S.EVENT_LOG.tab, null, "UNFORMATTED_VALUE"),
      fetchSheet(S.ROSTER.id,      S.ROSTER.tab),
      fetchSheet(S.MASTERSHEET.id, S.MASTERSHEET.tab),
      fetchSheetOptional(S.SETTINGS.id, S.SETTINGS.tab),
      fetchSheetOptional(S.SIGNAL.id,   S.SIGNAL.tab)
    ]).then(function (r) {
      var settings = parseSettings(r[3]);
      return {
        events:      parseEventLog(r[0]),
        roster:      parseRoster(r[1]),
        mastersheet: parseMastersheet(r[2]),
        signal:      parseSignal(r[4]),
        settings:    settings.values,
        settingsTabExists: settings.exists,
        settingsFromTab:   settings.fromTab,
        eventHeaders: (r[0] && r[0][0]) ? r[0][0].slice() : [],
        loadedAt: new Date()
      };
    });
  }

  root.SheetsReader = {
    loadAll: loadAll,
    fetchSheet: fetchSheet,
    // Exposed for the write-then-verify check and for offline tests that run
    // the fold against a real snapshot of the sheets.
    _parseEventLog:    parseEventLog,
    _parseRoster:      parseRoster,
    _parseMastersheet: parseMastersheet,
    _parseSignal:      parseSignal,
    _parseSettings:    parseSettings,
    _monthSetting:     monthSetting
  };
})(typeof window !== "undefined" ? window : this);
