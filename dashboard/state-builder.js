/**
 * Testimonial Dashboard — State Builder (the fold)
 *
 * Reads the event log and computes all state, keyed on (email, cycle).
 * This is the base every view reads from. Nothing here is stored; the event
 * log is the only memory.
 *
 * Rules the real data forced:
 *
 * 1. LAST WRITE WINS per (email, cycle, Stage). The engine re-runs fan-outs
 *    and re-appends the whole sequence — the live log holds several complete
 *    runs for the same client. Counting rows double-counts; taking the first
 *    keeps a stale "Flag:" after a later run succeeded.
 *
 * 2. ORDER IS (timestamp, row number). Timestamps have minute resolution and
 *    no seconds, so one fan-out writes several rows sharing a value.
 *
 * 3. TIMESTAMPS ARE DATE SERIALS holding a wall-clock time in the
 *    spreadsheet's timezone. They are converted with a fixed offset, never
 *    with the viewer's local timezone.
 *
 * 4. STAGE IS COMPUTED, NEVER STORED.
 *
 * 5. ONLY THE FIVE FAN-OUT STRINGS IMPLY INVITED. The engine's two form
 *    events fire later in the process and must never leak into that.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("state-builder: TDConfig not loaded");

  var S = CFG.STAGES;
  var E = CFG.ENGINE;

  var MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  /**
   * Normalize a Stage string for comparison: unify every dash variant,
   * collapse whitespace, lowercase. The engine writes an em dash (U+2014);
   * exact-matching a typographic character is too fragile for the system's
   * only memory — one hand-typed hyphen would silently drop a row.
   */
  function normStage(s) {
    return String(s || "")
      .replace(/[-‐‑‒–—―−]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  var OFFSET_MS = CFG.TZ_OFFSET_MINUTES * 60000;

  /** A wall-clock time in the sheet's timezone → a real UTC instant. */
  function wallToMs(y, mo, d, h, mi, s) {
    return Date.UTC(y, mo, d, h || 0, mi || 0, s || 0) - OFFSET_MS;
  }

  /**
   * Accepts a Sheets date serial (a number — the normal case) or a display
   * string (if a cell was ever typed as text). Serial epoch is 1899-12-30;
   * 25569 is the Unix epoch in that scale.
   */
  function parseEventDate(v) {
    if (typeof v === "number" && isFinite(v)) {
      return Math.round((v - 25569) * 86400000) - OFFSET_MS;
    }
    var t = String(v == null ? "" : v).trim();
    if (!t) return NaN;

    var m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mo != null) return wallToMs(+m[3], mo, +m[1], +m[4], +m[5], +(m[6] || 0));
    }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return wallToMs(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));

    var n = Number(t);
    if (isFinite(n) && n > 20000 && n < 90000) return Math.round((n - 25569) * 86400000) - OFFSET_MS;

    var d = Date.parse(t);
    return isFinite(d) ? d : NaN;
  }

  function isFlag(ev) {
    return String((ev && ev.event) || "").trim().indexOf(CFG.FLAG_PREFIX) === 0;
  }

  function actorOf(ev) {
    var src = String((ev && ev.source) || "");
    return src.indexOf(CFG.SOURCE_MANUAL) === 0
      ? src.slice(CFG.SOURCE_MANUAL.length).trim()
      : "";
  }

  /* ==========================================================================
   * Four-state input classification
   *
   * Mirrors the engine's own ✅ / ⚠ / ❌ / 🚩 semantics rather than inventing
   * one. Binary "starts with Flag: or fine" is wrong: the live log contains
   * real failures with no Flag: prefix, e.g.
   *   Loom │ "Could not download the transcript for …"   ← video found, no transcript
   *   Loom │ "1 videos, 0 transcripts, 1 failed"
   *   Meet │ "… — copies failed, review manually"        ← the engine calls this a real problem
   *
   *   received — arrived and complete
   *   partial  — arrived but a sub-step failed; usable, worth noticing
   *   flagged  — needs a human decision before it counts
   *   missing  — no event at all
   * ========================================================================== */

  var CLASSIFIERS = {
    plain: function (t) {
      return /^Flag:/.test(t) ? "flagged" : "received";
    },
    video: function (t) {
      if (/^Flag:/.test(t)) return "flagged";
      if (/^Could not move the uploaded file/.test(t)) return "partial";
      if (/transcript not downloaded/.test(t))         return "partial";
      return "received";
    },
    coachForm: function (t) {
      return /^Flag:/.test(t) ? "flagged" : "received";
    },
    meet: function (t) {
      if (/^Flag:/.test(t))                      return "flagged";
      if (/copies failed, review manually/.test(t)) return "flagged";
      if (/^FAILED/.test(t))                     return "flagged";
      if (/^Could not /.test(t))                 return "partial";
      return "received";
    },
    loom: function (t) {
      if (/^Flag:/.test(t))                            return "flagged";
      if (/^FAILED/.test(t))                           return "flagged";
      if (/^Could not download the transcript/.test(t)) return "partial";
      if (/,\s*\d+\s+failed/.test(t))                  return "partial";
      return "received";
    }
  };

  /** States that mean the thing physically arrived. */
  function arrived(state) { return state === "received" || state === "partial"; }

  /* ---------- Per-testimonial fold ---------- */

  function foldOne(email, cycle, events, identity) {
    var lastByStage = {};        // normalized stage → newest event
    var repeats = {};
    var notes = [];
    var i, ev, k;

    for (i = 0; i < events.length; i++) {
      ev = events[i];
      k = normStage(ev.stage);
      lastByStage[k] = ev;                        // later rows overwrite earlier
      repeats[k] = (repeats[k] || 0) + 1;
      if (k === normStage(S.NOTE)) notes.push(ev);
    }

    function last(stageStr) { return lastByStage[normStage(stageStr)] || null; }
    function has(stageStr)  { return !!last(stageStr); }

    /** Newest event across any of the Stage strings that satisfy an input. */
    function newestOf(stageList) {
      var best = null;
      for (var n = 0; n < stageList.length; n++) {
        var e = last(stageList[n]);
        if (e && (!best || e.ts > best.ts || (e.ts === best.ts && e.rowNumber > best.rowNumber))) best = e;
      }
      return best;
    }

    /* --- Collecting inputs --- */
    // A resolution event clears a flag when it is newer than the flagged row
    // and names the input. Convention for the Event text of
    // "Collection — manual review resolved": start it with the input label.
    var resolution = last(S.COLLECTION_FLAG_RESOLVED);

    var inputs = {};
    CFG.INPUTS.forEach(function (inp) {
      var e = newestOf(inp.stages);
      if (!e) {
        inputs[inp.key] = { state: "missing", event: null, at: NaN, text: "", by: "", resolved: false };
        return;
      }
      var state = (CLASSIFIERS[inp.classifier] || CLASSIFIERS.plain)(String(e.event || "").trim());

      if (state === "flagged" && resolution && resolution.ts >= e.ts) {
        var txt = String(resolution.event || "").toLowerCase();
        if (txt.indexOf(inp.key.toLowerCase()) >= 0 || txt.indexOf(inp.label.toLowerCase()) >= 0) {
          inputs[inp.key] = {
            state: "received", event: resolution, at: resolution.ts,
            text: resolution.event, by: actorOf(resolution), resolved: true
          };
          return;
        }
      }
      inputs[inp.key] = {
        state: state, event: e, at: e.ts,
        text: e.event, by: actorOf(e), resolved: false
      };
    });

    var folderEv      = last(E.FOLDER);
    var videoLinkEv   = last(E.CLIENT_VIDEO_LINK);
    var coachNoticeEv = last(E.COACH_NOTICE);

    /* --- Production pieces --- */
    var pieces = {};
    var piecesDone = 0;
    var lastPieceTs = NaN;
    CFG.PIECES.forEach(function (p) {
      var pe = last(p.stage);
      pieces[p.key] = {
        done: !!pe,
        text: pe ? pe.event : "",
        link: pe ? extractLink(pe.event) : "",
        by:   pe ? actorOf(pe) : "",
        at:   pe ? pe.ts : NaN
      };
      if (pe) {
        piecesDone++;
        if (!isFinite(lastPieceTs) || pe.ts > lastPieceTs) lastPieceTs = pe.ts;
      }
    });
    var allPiecesDone = piecesDone === CFG.PIECES.length;

    /* --- Pipeline stage (computed) --- */
    // ONLY the five fan-out strings imply Collecting. The engine's two form
    // events fire later in the process; letting them in here would jump a
    // testimonial forward on evidence that says nothing about the kickoff.
    var fanoutEv = newestOf(CFG.ENGINE_FANOUT);
    var kickoffEv = last(S.INVITE_KICKOFF);

    // THE LADDER MOVED UP ONE RUNG. Until this change, Invited meant "the
    // kickoff fired" and Collecting meant "the client's video arrived" — so a
    // client with the coach form, the Meet notes and the Looms already in sat
    // in a column labelled Invited. The label was lying: they were collecting.
    //
    // Now Invited is the client SAYING YES (nothing has been sent yet, the ball
    // is ours), and Collecting starts when the kickoff fires — which is exactly
    // when inputs can begin to arrive. The client video stops being a stage
    // gate; it goes back to being one of the six inputs and nothing more.
    var acceptedEv = last(S.OUTREACH_ACCEPTED);
    var collectingEv = kickoffEv || fanoutEv;

    var ladder = [
      { key: "nominated",  label: "Nominated",  ev: last(S.NOMINATION_LOGGED) },
      { key: "outreach",   label: "Outreach",   ev: last(S.OUTREACH_SENT) },
      { key: "invited",    label: "Invited",    ev: acceptedEv },
      { key: "collecting", label: "Collecting", ev: collectingEv, inferred: !kickoffEv && !!fanoutEv },
      { key: "producing",  label: "Producing",  ev: last(S.COLLECTION_COMPLETE) },
      { key: "review",     label: "Review",     ev: allPiecesDone ? { ts: lastPieceTs } : null },
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
      stage = { key: CFG.INDETERMINATE.key, label: CFG.INDETERMINATE.label, at: NaN,
                terminal: false, inferred: false };
    }

    /* --- Open flags --- */
    var flags = [];
    CFG.INPUTS.forEach(function (inp) {
      var s = inputs[inp.key];
      if (s.state === "flagged") {
        flags.push({ email: email, cycle: cycle, input: inp.key, label: inp.label,
                     text: s.text, at: s.at, stage: s.event ? s.event.stage : "" });
      }
    });

    var newest = events.length ? events[events.length - 1] : null;

    return {
      key:        email + "::" + cycle,
      email:      email,
      cycle:      cycle,
      identity:   identity,
      videoLink:  "",                       // filled from the Signal tab in build()
      stage:      stage,
      hoursInStage: isFinite(stage.at) ? (root.TDClock.now() - stage.at) / 36e5 : NaN,
      // The event that put this testimonial INTO Collecting — the kickoff, or
      // the fan-out when no kickoff row exists. Exposed here rather than
      // re-derived inside a flow so "has collection started?" has exactly one
      // answer: flows.js reads this, it does not recompute it.
      collectingEntry: collectingEv,
      inputs:     inputs,
      inputsArrived: CFG.INPUTS.filter(function (i2) { return arrived(inputs[i2.key].state); }).length,
      folderEvent: folderEv,
      videoLinkEvent: videoLinkEv,
      coachNoticeEvent: coachNoticeEv,
      pieces:     pieces,
      piecesDone: piecesDone,
      allPiecesDone: allPiecesDone,
      // Spec §4.2: when all five pieces have their link the testimonial moves
      // itself to Review, with every link already gathered for Joey.
      readyForReview: allPiecesDone && !has(S.APPROVAL_APPROVED) && !terminalEv,
      collectionComplete: has(S.COLLECTION_COMPLETE),
      approved:   has(S.APPROVAL_APPROVED),
      sentBack:   has(S.APPROVAL_SENT_BACK),
      published:  has(S.PUBLISH_LIVE),
      recognitions: {
        reviewSelfReported: last(S.REVIEW_SELF_REPORTED),
        reviewConfirmed:    last(S.REVIEW_CONFIRMED),
        reviewUnmatched:    last(S.REVIEW_UNMATCHED),
        raffleWinner:       last(S.RAFFLE_WINNER),
        cotmWinner:         last(S.COTM_WINNER),
        podcast: ["PODCAST_INVITED","PODCAST_ACCEPTED","PODCAST_DECLINED","PODCAST_SCHEDULED",
                  "PODCAST_RECORDED","PODCAST_PUBLISHED"].reduce(function (m, kk) {
          var e2 = last(S[kk]); if (e2) m[kk] = e2; return m;
        }, {})
      },
      flags:      flags,
      notes:      notes,
      events:     events,
      lastByStage: lastByStage,
      repeats:    repeats,
      lastActivityAt: newest ? newest.ts : NaN
    };
  }

  /** First URL in an Event text — pieces are marked done by pasting a link. */
  function extractLink(text) {
    var m = String(text || "").match(/https?:\/\/[^\s,;"'<>]+/);
    return m ? m[0] : "";
  }

  /* ---------- Public: fold the whole log ---------- */

  function build(data) {
    var idx = root.Identity.build(data.roster, data.mastersheet);

    // 1 · stamp timestamps, then sort by (timestamp, row number)
    var events = data.events.map(function (e) {
      var ts = parseEventDate(e.dateRaw);
      return Object.assign({}, e, { ts: ts, tsValid: isFinite(ts) });
    });
    var unparseableDates = events.filter(function (e) { return !e.tsValid; });

    events.sort(function (a, b) {
      var av = a.tsValid ? a.ts : Infinity;      // undated rows sort last
      var bv = b.tsValid ? b.ts : Infinity;
      if (av !== bv) return av - bv;
      return a.rowNumber - b.rowNumber;
    });

    // 2 · split off system rows. `Confirmation` and an unresolved coach-form
    //     selector are written with an EMPTY client email. They belong to no
    //     testimonial; folding them by email would invent a phantom one.
    var systemEvents = [];
    var clientEvents = [];
    events.forEach(function (e) {
      if (e.email) clientEvents.push(e); else systemEvents.push(e);
    });

    // 3 · group by (email, cycle)
    var groups = {};
    var order = [];
    clientEvents.forEach(function (e) {
      var key = e.email + "::" + e.cycle;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(e);
    });

    // 4 · fold each group
    var testimonials = order.map(function (key) {
      var first = groups[key][0];
      return foldOne(first.email, first.cycle, groups[key], idx.resolve(first.email));
    });

    // 5 · attach the folder-03 link from the Signal tab (keyed on roster name)
    var linkByName = {};
    (data.signal || []).forEach(function (s) {
      if (s.clientName && s.videoLink) linkByName[s.clientName] = s.videoLink;
    });
    testimonials.forEach(function (t) {
      t.videoLink = linkByName[t.identity.clientName] || "";
    });

    // 6 · rollups
    var byStage = {};
    CFG.PIPELINE.forEach(function (s) { byStage[s.key] = 0; });
    byStage[CFG.TERMINAL.key] = 0;
    byStage[CFG.INDETERMINATE.key] = 0;

    var unresolved = [];
    var openFlags = [];
    testimonials.forEach(function (t) {
      byStage[t.stage.key] = (byStage[t.stage.key] || 0) + 1;
      if (!t.identity.resolved) unresolved.push(t);
      openFlags = openFlags.concat(t.flags);
    });

    var systemFlags = systemEvents.filter(isFlag);

    return {
      testimonials: testimonials,
      byKey:        testimonials.reduce(function (m, t) { m[t.key] = t; return m; }, {}),
      byStage:      byStage,
      unresolved:   unresolved,
      openFlags:    openFlags,
      systemEvents: systemEvents,
      systemFlags:  systemFlags,
      identity:     idx,
      roster:       data.roster,
      settings:     data.settings,
      settingsTabExists: data.settingsTabExists,
      eventHeaders: data.eventHeaders,
      cycleColumnPresent: (data.eventHeaders || []).length > CFG.EVENT_COLS.CYCLE,
      counts: {
        events:       events.length,
        clientEvents: clientEvents.length,
        systemEvents: systemEvents.length,
        testimonials: testimonials.length,
        clients:      Object.keys(testimonials.reduce(function (m, t) { m[t.email] = 1; return m; }, {})).length,
        roster:       data.roster.length,
        mastersheet:  data.mastersheet.length,
        signal:       (data.signal || []).length,
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
    actorOf: actorOf,
    arrived: arrived,
    extractLink: extractLink,
    CLASSIFIERS: CLASSIFIERS
  };
})(typeof window !== "undefined" ? window : this);
