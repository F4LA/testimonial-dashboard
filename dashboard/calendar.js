/**
 * Testimonial Dashboard — Calendar + buffer (Phase 4)
 *
 * Scheduling is BY WEEK. A testimonial occupies one week and the model has no
 * concept of a day: every week is keyed by its ISO Monday, "2026-08-17", read
 * from column G — never parsed out of free text.
 *
 * TWO METRICS, DELIBERATELY DISTINCT (rule 4). Conflating them is the bug this
 * module exists to prevent:
 *
 *   occupied — a testimonial is assigned to this week, complete or not.
 *              Governs assignment, so two testimonials cannot collide.
 *   complete — that testimonial has all five pieces done.
 *              Governs buffer health, and nothing else.
 *
 * occupied-but-not-complete is the NORMAL case: a date gets proposed while
 * production is still running. That week is at-risk, it does not count toward
 * the buffer, and it BREAKS the streak rather than being skipped.
 *
 * A third flag rides alongside: `scheduledChecks`, true only when BOTH manual
 * checks are marked (Instagram covering reel + carousel + stories as one, and
 * email). They are independent, both required, and can be marked days apart.
 * They do NOT affect the buffer — a week whose content is finished counts even
 * if Gaby has not done her scheduling clicks yet.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("calendar: TDConfig not loaded");
  var S = CFG.STAGES;

  var DAY = 864e5;
  var WEEK = 7 * DAY;
  var OFFSET = CFG.TZ_OFFSET_MINUTES * 60000;

  /* ---------- Week arithmetic, all in the sheet's timezone ---------- */

  /** The ISO Monday of the week containing this instant. */
  function mondayKey(ms) {
    var d = new Date(ms + OFFSET);              // UTC parts now read as local wall time
    var day = d.getUTCDay();                    // 0 = Sunday
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  }

  /** "2026-08-17" → the instant of that Monday, 00:00 local. */
  function keyToMs(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) - OFFSET;
  }

  function addWeeks(key, n) { return mondayKey(keyToMs(key) + n * WEEK); }

  function isValidKey(key) {
    var ms = keyToMs(key);
    return isFinite(ms) && mondayKey(ms) === key;
  }

  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /** "week of Aug 17" — the only way a week is ever shown. Never a day range. */
  function label(key) {
    var ms = keyToMs(key);
    if (!isFinite(ms)) return key;
    var d = new Date(ms + OFFSET);
    return "week of " + MON[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function currentWeek() { return mondayKey(root.TDClock.now()); }

  /* ---------- Per-testimonial scheduling state ---------- */

  function norm(s) { return root.StateBuilder.normStage(s); }

  /** The week this testimonial currently holds, or "" — last write wins. */
  function assignedWeek(t) {
    var e = t.lastByStage[norm(S.SCHEDULE_WEEK_ASSIGNED)];
    return (e && isValidKey(e.week)) ? e.week : "";
  }

  /** Every week this testimonial has ever held, oldest first. */
  function weekHistory(t) {
    var out = [];
    t.events.forEach(function (e) {
      if (norm(e.stage) === norm(S.SCHEDULE_WEEK_ASSIGNED) && isValidKey(e.week)) {
        out.push({ week: e.week, ts: e.ts, by: root.StateBuilder.actorOf(e) });
      }
    });
    return out;
  }

  function checks(t) {
    var post  = !!t.lastByStage[norm(S.SCHEDULE_POST)];
    var email = !!t.lastByStage[norm(S.SCHEDULE_EMAIL)];
    return { instagram: post, email: email, both: post && email };
  }

  /* ---------- The fold ---------- */

  function build(state) {
    var settings = state.settings;
    var target = settings.bufferTargetWeeks || 4;
    var today = currentWeek();

    var byWeek = {};
    var scheduled = [];      // holds a week
    var awaiting = [];       // approved, no week yet — these get proposals
    var vacated = [];

    state.testimonials.forEach(function (t) {
      if (t.stage.terminal) return;

      var week = assignedWeek(t);
      var c = checks(t);
      var entry = {
        testimonial: t,
        name: t.identity.clientName || t.email,
        complete: t.allPiecesDone,
        checks: c,
        published: t.published,
        piecesDone: t.piecesDone
      };

      if (week) {
        scheduled.push(Object.assign({ week: week }, entry));
        // Two testimonials on one week should be impossible, but if a race
        // ever produced it, surface it rather than silently dropping one.
        if (byWeek[week]) {
          byWeek[week].collision = (byWeek[week].collision || [byWeek[week].name]).concat(entry.name);
        } else {
          byWeek[week] = Object.assign({ key: week, label: label(week) }, entry);
        }
      } else if (t.approved && !t.published) {
        awaiting.push(entry);
      }

      // A move leaves its old week empty. Detect it from the history rather
      // than storing a "vacated" event — last-write-wins keeps only the newest
      // assignment, but the full ordered event list is still there.
      var hist = weekHistory(t);
      for (var i = 0; i < hist.length - 1; i++) {
        if (hist[i].week !== week) {
          vacated.push({ week: hist[i].week, label: label(hist[i].week),
                         name: entry.name, movedTo: week, at: hist[i + 1].ts });
        }
      }
    });

    // Mark derived flags per occupied week.
    Object.keys(byWeek).forEach(function (k) {
      var w = byWeek[k];
      w.occupied = true;
      w.scheduledChecks = w.checks.both;
      // Rule 7: at-risk does not clear until BOTH checks are marked.
      w.atRisk = !(w.complete && w.scheduledChecks);
    });

    // A vacated week only matters if nothing else took it since.
    vacated = vacated.filter(function (v) { return !byWeek[v.week]; });

    /* --- Buffer: consecutive COMPLETE weeks, starting at the first
       non-Published week >= this week. An at-risk or empty week stops it. --- */
    var cursor = today;
    var guard = 0;
    while (byWeek[cursor] && byWeek[cursor].published && guard++ < 260) cursor = addWeeks(cursor, 1);
    var bufferStart = cursor;
    var count = 0;
    while (byWeek[cursor] && byWeek[cursor].complete && guard++ < 260) {
      count++;
      cursor = addWeeks(cursor, 1);
    }

    var buffer = {
      weeks: count,
      target: target,
      healthy: count >= target,
      startWeek: bufferStart,
      firstGapWeek: cursor,
      firstGapReason: byWeek[cursor] ? "at-risk" : "empty"
    };

    /* --- Proposals, computed as a BATCH so two can never collide (rule 5).
       Placed after the last occupied week, preserving queue order rather than
       backfilling gaps. Nothing is written; occupancy-on-proposal is achieved
       by proposing all of them together. --- */
    var lastOccupied = Object.keys(byWeek).sort().reverse()[0];
    var next = (lastOccupied && lastOccupied >= today) ? addWeeks(lastOccupied, 1) : today;
    var taken = {};
    var proposals = awaiting
      .slice()
      .sort(function (a, b) { return (a.testimonial.stage.at || 0) - (b.testimonial.stage.at || 0); })
      .map(function (e) {
        var g = 0;
        while ((byWeek[next] || taken[next]) && g++ < 260) next = addWeeks(next, 1);
        taken[next] = true;
        var week = next;
        next = addWeeks(next, 1);
        return Object.assign({ week: week, label: label(week) }, e);
      });

    return {
      today: today,
      byWeek: byWeek,
      scheduled: scheduled.sort(function (a, b) { return a.week < b.week ? -1 : 1; }),
      awaiting: awaiting,
      proposals: proposals,
      vacated: vacated,
      buffer: buffer,
      settings: settings,
      // handy for views and for the digest's selfCheck comparison
      weekKeys: Object.keys(byWeek).sort()
    };
  }

  /* ---------- Fill suggestions — ONE function, TWO triggers (rule 6) ---------- */

  /**
   * @param {Object} cal     build() output
   * @param {Object} state   StateBuilder output
   * @param {string} week    the week to fill
   * @param {string} trigger "buffer-low" | "week-vacated"
   */
  function suggestFill(cal, state, week, trigger) {
    // First choice: a testimonial that is ready and waiting for a week.
    var ready = cal.awaiting.filter(function (e) { return e.complete; });
    var notReady = cal.awaiting.filter(function (e) { return !e.complete; });

    // Otherwise the oldest repost by last-used date. "Used" is the later of
    // its publication and any later reuse.
    var reposts = state.testimonials
      .filter(function (t) { return t.published && !t.stage.terminal; })
      .map(function (t) {
        var pub = t.lastByStage[norm(S.PUBLISH_LIVE)];
        var re = t.lastByStage[norm(S.SCHEDULE_REPOST)];
        var used = Math.max(pub ? pub.ts : 0, re ? re.ts : 0);
        return { testimonial: t, name: t.identity.clientName || t.email, lastUsed: used };
      })
      .sort(function (a, b) { return a.lastUsed - b.lastUsed; });

    var candidates = []
      .concat(ready.map(function (e) { return { kind: "ready", name: e.name, entry: e }; }))
      .concat(notReady.map(function (e) { return { kind: "not-ready", name: e.name, entry: e }; }))
      .concat(reposts.map(function (r) { return { kind: "repost", name: r.name, entry: r, lastUsed: r.lastUsed }; }));

    return {
      week: week,
      label: label(week),
      trigger: trigger,
      candidate: candidates[0] || null,
      alternatives: candidates.slice(1),
      empty: candidates.length === 0
    };
  }

  root.CalendarFold = {
    build: build,
    suggestFill: suggestFill,
    mondayKey: mondayKey,
    keyToMs: keyToMs,
    addWeeks: addWeeks,
    isValidKey: isValidKey,
    label: label,
    currentWeek: currentWeek,
    assignedWeek: assignedWeek,
    checks: checks
  };
})(typeof window !== "undefined" ? window : this);
