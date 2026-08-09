/**
 * Testimonial Dashboard — Event Writer (the only write path)
 *
 * Posts to the Apps Script Web App, which appends one row to the Event Log.
 * The frontend never touches the sheet directly.
 *
 * Three guarantees enforced here:
 *
 * 1. NO ANONYMOUS WRITES. Every append carries an actor, and Source is
 *    written as "MANUAL - <Name>". A write without an actor is refused
 *    before it leaves the browser.
 *
 * 2. THE DASHBOARD CANNOT IMPERSONATE THE ENGINE. Stage must be one of the
 *    approved dashboard strings. The five engine strings are explicitly
 *    excluded, so a bug can never forge an AUTO-looking collection event.
 *
 * 3. WRITE THEN VERIFY. Apps Script Web Apps don't return CORS headers, so
 *    the POST goes out with mode:"no-cors" and the response is unreadable
 *    (same as Coach Pulse). Fire-and-forget alone would let a silent failure
 *    look like success, so every write is confirmed by re-reading the log.
 *
 * The timestamp is generated server-side by Apps Script using the
 * spreadsheet's own timezone — never by the browser. That keeps dashboard
 * rows in the same clock and format as the engine's rows without
 * introducing a new timezone.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("event-writer: TDConfig not loaded");

  /* ---------- Approved Stage vocabulary ---------- */

  // All NINE engine strings, not just the five fan-out ones. The dashboard
  // must never be able to forge any event the engine owns — including the
  // two form-driven ones and the two system-level ones.
  var ENGINE_SET = {};
  Object.keys(CFG.ENGINE).forEach(function (k) {
    ENGINE_SET[CFG.ENGINE[k]] = true;
  });

  var ALLOWED = {};
  Object.keys(CFG.STAGES).forEach(function (k) {
    var v = CFG.STAGES[k];
    if (typeof v === "string" && !ENGINE_SET[v]) ALLOWED[v] = true;
  });

  function isAllowedStage(stage) {
    return Object.prototype.hasOwnProperty.call(ALLOWED, stage);
  }

  /* ---------- Actor (person picker) ---------- */

  function getActor() {
    try {
      var v = root.localStorage && root.localStorage.getItem(CFG.ACTOR_STORAGE_KEY);
      return (v && CFG.PEOPLE.indexOf(v) >= 0) ? v : "";
    } catch (e) { return ""; }
  }

  function setActor(name) {
    if (CFG.PEOPLE.indexOf(name) < 0) throw new Error("Unknown person: " + name);
    try { root.localStorage.setItem(CFG.ACTOR_STORAGE_KEY, name); } catch (e) {}
    return name;
  }

  function clearActor() {
    try { root.localStorage.removeItem(CFG.ACTOR_STORAGE_KEY); } catch (e) {}
  }

  /* ---------- Write ---------- */

  function post(payload) {
    return fetch(CFG.WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      // With no-cors the only permitted Content-Type is text/plain.
      // Apps Script reads e.postData.contents regardless, so JSON still works.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Append one event to the Event Log.
   *
   * @param {Object} o
   * @param {string} o.email   client email (master key)
   * @param {string} o.stage   one of the approved dashboard Stage strings
   * @param {string} o.event   free text — the detail (link, note, flag, name)
   * @param {number} [o.cycle] defaults to 1
   * @param {boolean} [o.verify=true] re-read the log to confirm the row landed
   * @returns {Promise<{ok:boolean, verified:boolean, row:Object|null, message:string}>}
   */
  function appendEvent(o) {
    var actor = getActor();
    var email = String(o && o.email || "").trim().toLowerCase();
    var stage = String(o && o.stage || "").trim();
    var text  = String(o && o.event || "").trim();
    var cycle = parseInt(o && o.cycle, 10);
    if (!isFinite(cycle) || cycle < 1) cycle = CFG.DEFAULT_CYCLE;

    if (!actor)  return Promise.reject(new Error("No person selected. Every action must be attributed — pick who is acting first."));
    if (!email)  return Promise.reject(new Error("Missing client email."));
    if (!stage)  return Promise.reject(new Error("Missing Stage."));
    if (!isAllowedStage(stage)) {
      return Promise.reject(new Error(
        ENGINE_SET[stage]
          ? 'Refused: "' + stage + '" belongs to the collection engine. The dashboard never writes engine events.'
          : 'Refused: "' + stage + '" is not in the approved Stage vocabulary.'
      ));
    }
    if (!CFG.WEB_APP_URL || CFG.WEB_APP_URL.indexOf("PASTE_") === 0) {
      return Promise.reject(new Error("No Apps Script Web App URL configured. Set TDConfig.WEB_APP_URL."));
    }

    var payload = {
      action: "appendEvent",
      email:  email,
      stage:  stage,
      event:  text,
      cycle:  cycle,
      actor:  actor              // Apps Script writes Source as "MANUAL - <actor>"
    };

    var verify = (o.verify !== false);

    return post(payload)
      .then(function () {
        if (!verify) return { ok: true, verified: false, row: null, message: "Sent (not verified)." };
        return confirmWrite(email, stage, actor, cycle);
      });
  }

  /**
   * Re-read the tail of the Event Log and look for the row we just wrote.
   * Retries briefly — Apps Script append and Sheets API read are not instant.
   */
  function confirmWrite(email, stage, actor, cycle, attempt) {
    attempt = attempt || 1;
    var MAX = 4;
    var wait = 900 * attempt;

    return new Promise(function (resolve) { setTimeout(resolve, wait); })
      .then(function () {
        var S = CFG.SHEETS.EVENT_LOG;
        return root.SheetsReader.fetchSheet(S.id, S.tab, null, "UNFORMATTED_VALUE");
      })
      .then(function (rows) {
        var parsed = root.SheetsReader._parseEventLog(rows);
        var want = CFG.SOURCE_MANUAL + actor;
        for (var i = parsed.length - 1; i >= 0 && i > parsed.length - 40; i--) {
          var r = parsed[i];
          if (r.email === email && r.stage === stage && r.source === want && r.cycle === cycle) {
            return { ok: true, verified: true, row: r,
                     message: "Confirmed in the Event Log at row " + r.rowNumber + "." };
          }
        }
        if (attempt < MAX) return confirmWrite(email, stage, actor, cycle, attempt + 1);
        return { ok: false, verified: false, row: null,
                 message: "The write was sent but no matching row appeared in the Event Log. Check the Apps Script deployment and its execution log." };
      })
      .catch(function (err) {
        return { ok: false, verified: false, row: null,
                 message: "Could not verify the write: " + err.message };
      });
  }

  /**
   * Ask the proxy to queue this client for the collection engine's fan-out.
   *
   * The dashboard cannot tick the Signal checkbox and expect the engine to
   * react — Apps Script onEdit triggers never fire for script-made edits. The
   * proxy writes the row a human tick would write; the engine's poll picks it
   * up within a minute.
   *
   * @param {string} clientName  EXACT roster Client Name (rosterByName_ needs
   *                             exactly one match and never approximates)
   */
  function requestFanout(clientName) {
    var actor = getActor();
    if (!actor) return Promise.reject(new Error("No person selected. Every action must be attributed."));
    if (!clientName) return Promise.reject(new Error("Missing client name."));
    if (!CFG.WEB_APP_URL || CFG.WEB_APP_URL.indexOf("PASTE_") === 0) {
      return Promise.reject(new Error("No Apps Script Web App URL configured."));
    }
    return post({ action: "requestFanout", clientName: clientName, actor: actor })
      .then(function () {
        // no-cors hides the response, so confirm by re-reading the Signal tab
        return confirmQueued(clientName);
      });
  }

  /** Re-read the Signal tab until the queued row appears. */
  function confirmQueued(clientName, attempt) {
    attempt = attempt || 1;
    var MAX = 4;
    return new Promise(function (r) { setTimeout(r, 900 * attempt); })
      .then(function () {
        var S = CFG.SHEETS.SIGNAL;
        return root.SheetsReader.fetchSheet(S.id, S.tab);
      })
      .then(function (rows) {
        var parsed = root.SheetsReader._parseSignal(rows);
        for (var i = parsed.length - 1; i >= 0; i--) {
          if (parsed[i].clientName.toLowerCase() === String(clientName).toLowerCase()) {
            var done = !!parsed[i].processed;
            return { ok: true, queued: true, processed: done,
                     message: done
                       ? "The engine has already run the fan-out for " + clientName + "."
                       : "Queued " + clientName + " in the Signal sheet. The engine runs the fan-out within a minute." };
          }
        }
        if (attempt < MAX) return confirmQueued(clientName, attempt + 1);
        return { ok: false, queued: false,
                 message: "The request was sent but no Signal row appeared. Check the Apps Script execution log — and Gaby can still tick the checkbox by hand." };
      })
      .catch(function (err) {
        return { ok: false, queued: false, message: "Could not verify: " + err.message };
      });
  }

  root.EventWriter = {
    appendEvent: appendEvent,
    requestFanout: requestFanout,
    getActor:    getActor,
    setActor:    setActor,
    clearActor:  clearActor,
    isAllowedStage: isAllowedStage,
    allowedStages: function () { return Object.keys(ALLOWED).sort(); }
  };
})(typeof window !== "undefined" ? window : this);
