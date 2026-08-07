/**
 * Testimonial Dashboard — Sheets Reader
 *
 * Parallel-fetches the source sheets via the Google Sheets API v4 and
 * normalizes them into plain JS objects. This module does no interpretation:
 * it reads rows and shapes them. All meaning is added in state-builder.js.
 *
 * Sources:
 *   Event Log        — the append-only memory (required)
 *   Roster           — active 1:1 clients, identity (required)
 *   Mastersheet Data — every contract ever, identity fallback (required)
 *   Settings         — adjustable thresholds (OPTIONAL, may not exist yet)
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

  function buildUrl(sheetId, tab, range) {
    var target = tab + (range ? "!" + range : "");
    return BASE + "/" + sheetId + "/values/" + encodeURIComponent(target) +
           "?key=" + encodeURIComponent(CFG.API_KEY);
  }

  function fetchSheet(sheetId, tab, range) {
    return fetch(buildUrl(sheetId, tab, range))
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

  /** Never rejects — resolves to [] if the tab is missing or unreadable.
   *  Used for Settings, which does not exist until the one-time setup runs. */
  function fetchSheetOptional(sheetId, tab, range) {
    return fetchSheet(sheetId, tab, range).catch(function (err) {
      if (root.console) root.console.warn("[sheets-reader] optional tab unavailable [" + tab + "]: " + err.message);
      return null;   // null (not []) so callers can tell "missing" from "empty"
    });
  }

  /* ---------- Parsers ---------- */

  /**
   * Event Log rows.
   *
   * rowNumber is the real 1-based spreadsheet row. It is the tiebreaker for
   * ordering: "Date and time" has minute resolution and no seconds, so several
   * events can share a timestamp. Append order is truth; never lose it.
   */
  function parseEventLog(rows) {
    var C = CFG.EVENT_COLS;
    var out = [];
    for (var i = 1; i < rows.length; i++) {          // row 0 is the header
      var r = rows[i];
      var email = cell(r, C.EMAIL).toLowerCase();
      var stage = cell(r, C.STAGE);
      if (!email && !stage) continue;                // skip blank rows
      var rawCycle = cell(r, C.CYCLE);
      var cycle = parseInt(rawCycle, 10);
      out.push({
        email:     email,
        stage:     stage,
        dateRaw:   cell(r, C.DATE),
        event:     cell(r, C.EVENT),
        source:    cell(r, C.SOURCE),
        // Blank cycle folds to 1 — that is every row the engine has ever
        // written, since the column did not exist when they were written.
        cycle:     (isFinite(cycle) && cycle > 0) ? cycle : CFG.DEFAULT_CYCLE,
        cycleBlank: rawCycle === "",
        rowNumber: i + 1
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
   * Mastersheet Data — one row PER CONTRACT, so an email can appear many times
   * (94 of 323 emails do today; one has 8). Rows are kept as-is here; picking
   * the most recent contract is identity.js's job.
   *
   * Neither a full-name column nor a coach Slack column exists here.
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
   * Settings tab: a plain Key | Value sheet. Missing keys fall back to
   * CFG.SETTINGS_DEFAULTS, so a partial tab is safe.
   *
   * @returns {{values:Object, exists:boolean, fromTab:string[]}}
   */
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
      if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;  // ignore unknown keys
      var num = Number(raw);
      settings[key] = (typeof CFG.SETTINGS_DEFAULTS[key] === "number" && isFinite(num)) ? num : raw;
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
      fetchSheet(S.EVENT_LOG.id,   S.EVENT_LOG.tab),
      fetchSheet(S.ROSTER.id,      S.ROSTER.tab),
      fetchSheet(S.MASTERSHEET.id, S.MASTERSHEET.tab),
      fetchSheetOptional(S.SETTINGS.id, S.SETTINGS.tab)
    ]).then(function (r) {
      var settings = parseSettings(r[3]);
      return {
        events:      parseEventLog(r[0]),
        roster:      parseRoster(r[1]),
        mastersheet: parseMastersheet(r[2]),
        settings:    settings.values,
        settingsTabExists: settings.exists,
        settingsFromTab:   settings.fromTab,
        // Header row as it actually is right now — used to detect whether the
        // additive Cycle column has been added yet.
        eventHeaders: (r[0] && r[0][0]) ? r[0][0].slice() : [],
        loadedAt: new Date()
      };
    });
  }

  root.SheetsReader = {
    loadAll: loadAll,
    fetchSheet: fetchSheet,
    // Parsers exposed for the write-then-verify check and for offline tests
    // that run the fold against a real snapshot of the sheets.
    _parseEventLog:   parseEventLog,
    _parseRoster:     parseRoster,
    _parseMastersheet:parseMastersheet,
    _parseSettings:   parseSettings
  };
})(typeof window !== "undefined" ? window : this);
