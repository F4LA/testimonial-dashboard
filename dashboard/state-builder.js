/**
 * Testimonial Dashboard — State Builder (the fold)
 *
 * Reads the event log and computes all state, keyed on (email, cycle).
 * This is the base every later phase reads from. Nothing here is stored;
 * the event log is the only memory.
 *
 * Three rules that the real data forced:
 *
 * 1. LAST WRITE WINS per (email, cycle, Stage).
 *    The engine can re-run a fan-out and re-append the whole sequence — the
 *    live log already contains two complete runs for the same client. Counting
 *    rows would double-count; taking the first would keep a stale "Flag:" after
 *    a later run succeeded. Only the newest row for a Stage describes reality.
 *
 * 2. ORDER IS (timestamp, row number).
 *    "Date and time" has minute resolution and no seconds, so a single fan-out
 *    writes several events sharing one timestamp. Append order breaks the tie.
 *
 * 3. STAGE IS COMPUTED, NEVER STORED — derived only from which events exist.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("state-builder: TDConfig not loaded");

  var S = CFG.STAGES;

  var MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  /**
   * Normalize a Stage string for comparison: unify every dash variant,
   * collapse whitespace, lowercase.
   *
   * The engine writes an em dash (U+2014). Exact-matching a typographic
   * character is too fragile for the system's only memory — one hand-typed
   * hyphen would silently drop a row out of the fold instead of failing loudly.
   */
  function normStage(s) {
    return String(s || "")
      .replace(/[-‐‑‒–—―−]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /** "7 Aug 2026, 6:56" (24-hour, no seconds) — the engine's format. */
  function parseEventDate(s) {
    if (!s) return NaN;
    var t = String(s).trim();
    var m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mo != null) return new Date(+m[3], mo, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
    }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    var d = Date.parse(t);
    return isFinite(d) ? d : NaN;
  }

  function isFlag(ev) {
    return String(ev && ev.event || "").trim().indexOf(CFG.FLAG_PREFIX) === 0;
  }

  function actorOf(ev) {
    var src = String(ev && ev.source || "");
    return src.indexOf(CFG.SOURCE_MANUAL) === 0
      ? src.slice(CFG.SOURCE_MANUAL.length).trim()
      : "";
  }

  var ENGINE_STAGES = [
    S.ENGINE.FOLDER, S.ENGINE.CLIENT_VIDEO_LINK,
    S.ENGINE.MEET, S.ENGINE.LOOM, S.ENGINE.COACH_NOTICE
  ].map(normStage);

  /* ---------- Per-testimonial fold ---------- */

  function foldOne(email, cycle, events, identity) {
    // events arrive already sorted by (timestamp, rowNumber)
    var lastByStage = {};      // normalized stage → newest event
    var repeats = {};          // normalized stage → how many rows exist
    var notes = [];
    var i, ev, k;

    for (i = 0; i < events.length; i++) {
      ev = events[i];
      k = normStage(ev.stage);
      lastByStage[k] = ev;                       // later rows overwrite earlier
      repeats[k] = (repeats[k] || 0) + 1;
      if (k === normStage(S.NOTE)) notes.push(ev);
    }

    function last(stageStr) { return lastByStage[normStage(stageStr)] || null; }
    function has(stageStr)  { return !!last(stageStr); }

    /* --- Collecting inputs --- */
    // A resolution event clears a flag only if it is newer than the flagged
    // row and names the input. Convention for the Event text of
    // "Collection — manual review resolved": start it with the input label.
    var resolution = last(S.COLLECTION_FLAG_RESOLVED);

    function inputState(stageStr, inputKey, inputLabel) {
      var e = last(stageStr);
      if (!e) return { state: "missing", event: null, at: NaN, flagText: "" };
      if (!isFlag(e)) return { state: "received", event: e, at: e.ts, flagText: "" };

      if (resolution && resolution.ts >= e.ts) {
        var txt = String(resolution.event || "").toLowerCase();
        if (txt.indexOf(inputKey.toLowerCase()) >= 0 ||
            txt.indexOf(inputLabel.toLowerCase()) >= 0) {
          return { state: "received", event: resolution, at: resolution.ts, flagText: "", resolved: true };
        }
      }
      return { state: "flagged", event: e, at: e.ts, flagText: e.event };
    }

    var inputs = {
      // The engine's "client video link" means the folder was SHARED, not that
      // the client uploaded. The upload is a separate, 100% manual mark.
      video:     inputState(S.COLLECTION_VIDEO,      "video",     "client video"),
      coachForm: inputState(S.COLLECTION_COACH_FORM, "coachform", "coach form"),
      everfit:   inputState(S.COLLECTION_EVERFIT,    "everfit",   "everfit data"),
      photos:    inputState(S.COLLECTION_PHOTOS,     "photos",    "photos"),
      meet:      inputState(S.ENGINE.MEET,           "meet",      "meet notes"),
      loom:      inputState(S.ENGINE.LOOM,           "loom",      "looms")
    };

    var folderEv     = last(S.ENGINE.FOLDER);
    var videoLinkEv  = last(S.ENGINE.CLIENT_VIDEO_LINK);
    var coachNoticeEv= last(S.ENGINE.COACH_NOTICE);

    /* --- Production pieces --- */
    var pieceStage = {
      carousel:    S.PRODUCTION_CAROUSEL,
      story:       S.PRODUCTION_STORY,
      reel:        S.PRODUCTION_REEL,
      caseStudy:   S.PRODUCTION_CASE_STUDY,
      weeklyEmail: S.PRODUCTION_WEEKLY_EMAIL
    };
    var pieces = {};
    var piecesDone = 0;
    for (k in pieceStage) {
      if (!Object.prototype.hasOwnProperty.call(pieceStage, k)) continue;
      var pe = last(pieceStage[k]);
      pieces[k] = {
        done:  !!pe,
        text:  pe ? pe.event : "",
        by:    pe ? actorOf(pe) : "",
        at:    pe ? pe.ts : NaN
      };
      if (pe) piecesDone++;
    }
    var allPiecesDone = piecesDone === CFG.PIECES.length;

    /* --- Pipeline stage (computed) --- */
    // The engine only starts writing at the confirmation checkbox, which fires
    // during Invited. So any engine collection row proves Invited was reached,
    // even though the front-of-pipeline events do not exist for legacy rows.
    var engineFanoutSeen = false;
    for (i = 0; i < ENGINE_STAGES.length; i++) {
      if (lastByStage[ENGINE_STAGES[i]]) { engineFanoutSeen = true; break; }
    }

    var ladder = [
      { key: "nominated",  label: "Nominated",  ev: last(S.NOMINATION_LOGGED) },
      { key: "outreach",   label: "Outreach",   ev: last(S.OUTREACH_SENT) },
      { key: "invited",    label: "Invited",    ev: last(S.INVITE_KICKOFF) ||
                                                    (engineFanoutSeen ? (folderEv || videoLinkEv) : null),
                                                inferred: !last(S.INVITE_KICKOFF) && engineFanoutSeen },
      { key: "collecting", label: "Collecting", ev: last(S.COLLECTION_VIDEO) },
      { key: "producing",  label: "Producing",  ev: last(S.COLLECTION_COMPLETE) },
      { key: "review",     label: "Review",     ev: allPiecesDone ? lastPieceEvent(pieces) : null },
      { key: "scheduled",  label: "Scheduled",  ev: last(S.SCHEDULE_WEEK_ASSIGNED) },
      { key: "published",  label: "Published",  ev: last(S.PUBLISH_LIVE) }
    ];

    var reached = null;
    for (i = 0; i < ladder.length; i++) if (ladder[i].ev) reached = ladder[i];

    var declined = last(S.PIPELINE_DECLINED);
    var dropped  = last(S.PIPELINE_DROPPED);
    var terminalEv = null, terminalType = "";
    if (declined || dropped) {
      terminalEv = (!dropped || (declined && declined.ts >= dropped.ts)) ? declined : dropped;
      terminalType = (terminalEv === declined) ? "declined" : "dropped";
    }

    var stage;
    if (terminalEv) {
      stage = { key: CFG.TERMINAL.key, label: CFG.TERMINAL.label, at: terminalEv.ts,
                terminal: true, type: terminalType, note: terminalEv.event, inferred: false };
    } else if (reached) {
      stage = { key: reached.key, label: reached.label, at: reached.ev.ts,
                terminal: false, inferred: !!reached.inferred };
    } else {
      // Events exist but none is a stage-entry event. Do not invent a stage.
      stage = { key: "indeterminate", label: "Indeterminate", at: NaN,
                terminal: false, inferred: false };
    }

    /* --- Open flags (a flag is open only if it is still the newest word) --- */
    var flags = [];
    ["meet", "loom", "video", "coachForm", "everfit", "photos"].forEach(function (key) {
      if (inputs[key] && inputs[key].state === "flagged") {
        flags.push({
          email: email, cycle: cycle, input: key,
          text: inputs[key].flagText, at: inputs[key].at,
          stage: inputs[key].event ? inputs[key].event.stage : ""
        });
      }
    });

    var newest = events.length ? events[events.length - 1] : null;

    return {
      key:        email + "::" + cycle,
      email:      email,
      cycle:      cycle,
      identity:   identity,
      stage:      stage,
      hoursInStage: isFinite(stage.at) ? (Date.now() - stage.at) / 36e5 : NaN,
      inputs:     inputs,
      folderEvent:      folderEv,
      videoLinkEvent:   videoLinkEv,
      coachNoticeEvent: coachNoticeEv,
      pieces:     pieces,
      piecesDone: piecesDone,
      allPiecesDone: allPiecesDone,
      // Spec §4.2: when all five pieces have their link the testimonial moves
      // itself to Review. Surfaced here; acting on it is Phase 2.
      readyForReview: allPiecesDone && !has(S.APPROVAL_APPROVED) && !terminalEv,
      collectionComplete: has(S.COLLECTION_COMPLETE),
      approved:   has(S.APPROVAL_APPROVED),
      sentBack:   has(S.APPROVAL_SENT_BACK),
      published:  has(S.PUBLISH_LIVE),
      flags:      flags,
      notes:      notes,
      events:     events,
      lastByStage: lastByStage,
      repeats:    repeats,
      lastActivityAt: newest ? newest.ts : NaN
    };
  }

  function lastPieceEvent(pieces) {
    var best = null;
    for (var k in pieces) {
      if (!Object.prototype.hasOwnProperty.call(pieces, k)) continue;
      if (pieces[k].done && (!best || pieces[k].at > best.ts)) best = { ts: pieces[k].at };
    }
    return best;
  }

  /* ---------- Public: fold the whole log ---------- */

  /**
   * @param {Object} data  output of SheetsReader.loadAll()
   * @returns {Object} the base state every later phase reads from
   */
  function build(data) {
    var idx = root.Identity.build(data.roster, data.mastersheet);

    // 1 · stamp timestamps, then sort by (timestamp, row number)
    var events = data.events.map(function (e) {
      var ts = parseEventDate(e.dateRaw);
      return Object.assign({}, e, { ts: ts, tsValid: isFinite(ts) });
    });
    var unparseableDates = events.filter(function (e) { return !e.tsValid; });

    events.sort(function (a, b) {
      var av = a.tsValid ? a.ts : Infinity;   // undated rows sort last
      var bv = b.tsValid ? b.ts : Infinity;
      if (av !== bv) return av - bv;
      return a.rowNumber - b.rowNumber;
    });

    // 2 · group by (email, cycle)
    var groups = {};
    var order = [];
    events.forEach(function (e) {
      var key = e.email + "::" + e.cycle;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(e);
    });

    // 3 · fold each group
    var testimonials = order.map(function (key) {
      var first = groups[key][0];
      return foldOne(first.email, first.cycle, groups[key], idx.resolve(first.email));
    });

    // 4 · rollups
    var byStage = {};
    CFG.PIPELINE.forEach(function (s) { byStage[s.key] = 0; });
    byStage[CFG.TERMINAL.key] = 0;
    byStage.indeterminate = 0;

    var unresolved = [];
    var openFlags = [];
    testimonials.forEach(function (t) {
      byStage[t.stage.key] = (byStage[t.stage.key] || 0) + 1;
      if (!t.identity.resolved) unresolved.push(t);
      openFlags = openFlags.concat(t.flags);
    });

    return {
      testimonials:  testimonials,
      byKey:         testimonials.reduce(function (m, t) { m[t.key] = t; return m; }, {}),
      byStage:       byStage,
      unresolved:    unresolved,
      openFlags:     openFlags,
      identity:      idx,
      settings:      data.settings,
      settingsTabExists: data.settingsTabExists,
      eventHeaders:  data.eventHeaders,
      cycleColumnPresent: (data.eventHeaders || []).length > CFG.EVENT_COLS.CYCLE,
      counts: {
        events:      events.length,
        testimonials: testimonials.length,
        clients:     Object.keys(testimonials.reduce(function (m, t) { m[t.email] = 1; return m; }, {})).length,
        roster:      data.roster.length,
        mastersheet: data.mastersheet.length,
        unparseableDates: unparseableDates.length
      },
      unparseableDates: unparseableDates,
      loadedAt: data.loadedAt
    };
  }

  root.StateBuilder = {
    build: build,
    normStage: normStage,
    parseEventDate: parseEventDate,
    isFlag: isFlag,
    actorOf: actorOf
  };
})(typeof window !== "undefined" ? window : this);
