/**
 * Testimonial Dashboard — Raffle compliance + the draw (Phase 5)
 *
 * This module still writes nothing itself — it computes and returns. What
 * changed with the draw chunk is that its output now DRIVES writes (the move
 * button, the winner confirmation, the two post-draw tasks), so the four
 * `Raffle — …` strings must be in the proxy's ALLOWED_STAGES. `selfCheck()`
 * asserts they are writable rather than trusting that they were added.
 *
 * ⚠️ MIRRORED IN `apps-script/Digest.gs` (D-088). The conditions, the cohort
 * month, eligibility, the draw-due state and the two post-draw tasks are
 * re-implemented there because a time trigger has no browser. Any change here
 * must be made there in the same commit. `Digest.gs selfCheck()` prints its
 * raffle counts so drift is an alarm, not a silent bug.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE DRAW IS, AND WHAT IT DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------
 * ELIGIBLE = qualifies on all three conditions ∧ in this month's cohort ∧ the
 * PERSON has never won before. Cohort-only is the approved scope: the draw is
 * not "everyone currently qualifying", which would let a client who entered in
 * June win August's raffle (D-100 left this open; the draw chunk closes it).
 *
 * Eligibility is derived from `compliance()` — the SAME function the read-only
 * view has always used. There is no second qualification rule anywhere, and
 * `selfCheck()` proves eligibility can never contain a non-qualifier.
 *
 * THE DRAW PROPOSES, A HUMAN CONFIRMS. `drawFrom()` picks; nothing is written
 * until Gaby confirms. Same pattern as the calendar dates (D-096).
 *
 * SNAPSHOT (spec §4.4). The winner event text freezes the month, the winner,
 * the full eligible list and the winner's three conditions AS THEY READ ON THE
 * DAY. Compliance is live everywhere else, which is right for a working view
 * and wrong for a record — a client who edits their preferences form in
 * September must not retroactively change who was eligible in August.
 *
 * NO UNDO (D-093, open). A confirmed winner cannot be un-confirmed: the log is
 * append-only and no "Raffle — correction" string exists. Out of scope here.
 *
 * ---------------------------------------------------------------------------
 * THE THREE CONDITIONS — and the one thing that is not one
 * ---------------------------------------------------------------------------
 * Entry is photo permission + questionnaire/testimonial + Google review
 * (D-008, hard gate per D-059). Exactly three, and:
 *
 *   • PODCAST CONSENT IS NOT A CONDITION (D-097). Tying raffle entry to podcast
 *     willingness would invent a fourth condition and punish a client for
 *     declining a one-a-month opportunity. `selfCheck()` throws if the string
 *     ever appears in the condition table.
 *
 *   • THE REVIEW CONDITION READS THE SELF-REPORT, NEVER A CONFIRMATION (D-066).
 *     Confirmation is the reviews view's audit layer; a genuine reviewer whose
 *     name cannot be matched must never be excluded. And it reads the
 *     ENGINE-OWNED `Preferences — review self-reported`, not the
 *     dashboard-writable `Review — self-reported` — otherwise a person could
 *     hand-enter a self-report and open the raffle (D-098). `selfCheck()`
 *     throws on that too.
 *
 *   • CONDITION 2 HAS NO EVENT OF ITS OWN. It is the client-video signal the
 *     fold already computes, sourced from `CFG.INPUTS` so there is one
 *     definition. Note what it is NOT: `Collection — client video link` is the
 *     fan-out sharing folder 03 — the single most common Collection string in
 *     the log — and reading it would qualify every client the fan-out has run
 *     for, instantly.
 *
 * ---------------------------------------------------------------------------
 * PARSING THE CLIENT'S ANSWER
 * ---------------------------------------------------------------------------
 * The bridge writes a normalized prefix plus the client's own words:
 * `Yes ("Yes, done")`, `No ("Not yet")`. This module prefers the prefix, and
 * falls back to classifying the raw words when the bridge could not.
 *
 * That fallback is not defensive decoration. Before D-099 the bridge misread
 * "Not yet" and wrote `Unclear answer: "Not yet" — review manually`. Those rows
 * exist. Reading the raw answer resolves them correctly with no backfill.
 *
 * Both photo yes-variants ("use them" and "blur my face") are MET. Only the
 * explicit no is not met. An answer neither side can classify is UNCLEAR, which
 * is NOT the same as a no: it blocks qualification but is reported as needing a
 * human, never as a silent rejection.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("raffle: TDConfig not loaded");
  var S = CFG.STAGES;

  /* ---------- The event strings this module reads ---------- */

  var PREFS = {
    PHOTO:   "Preferences — photo permission",
    REVIEW:  "Preferences — review self-reported",
    // Named ONLY so selfCheck can prove it is absent from the conditions.
    PODCAST: "Preferences — podcast consent"
  };

  /** The client-video signal, taken from the fold's own definition. */
  var VIDEO_INPUT = "video";

  /* ---------- Answer classification ---------- */

  /**
   * → { met: true | false | null, raw: "<client's words>", how: "..." }
   * `met: null` means unclear — a human decides, the raffle stays closed.
   */
  function classify(detail) {
    var d = String(detail == null ? "" : detail).trim();
    if (!d) return { met: null, raw: "", how: "empty" };

    var quoted = /"([^"]*)"/.exec(d);
    var raw = quoted ? quoted[1].trim() : d;

    // 1 · the bridge's normalized verdict, when it reached one
    var norm = /^(Yes|No)\b/i.exec(d);
    if (norm) return { met: /^y/i.test(norm[1]), raw: raw, how: "normalized" };

    // 2 · the client's own words (recovers pre-D-099 "Not yet" rows)
    if (/^y/i.test(raw)) return { met: true,  raw: raw, how: "recovered" };
    if (/^n/i.test(raw)) return { met: false, raw: raw, how: "recovered" };

    return { met: null, raw: raw, how: "unclear" };
  }

  /* ---------- Month arithmetic, in the sheet's timezone ---------- */

  var OFFSET = CFG.TZ_OFFSET_MINUTES * 60000;
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function monthKey(ms) {
    if (!isFinite(ms)) return "";
    var d = new Date(ms + OFFSET);
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2);
  }

  function monthLabel(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
    if (!m) return key || "—";
    return MON[+m[2] - 1] + " " + m[1];
  }

  function currentMonth() { return monthKey(root.TDClock.now()); }

  function isMonthKey(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || "")); }

  /** The month after `key`. Used by the move button's default target. */
  function nextMonth(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
    if (!m) return "";
    var y = +m[1], mo = +m[2] + 1;
    if (mo > 12) { mo = 1; y += 1; }
    return y + "-" + ("0" + mo).slice(-2);
  }

  /** Is `key` strictly before the current month? Drives "the draw is late". */
  function monthIsPast(key) {
    return isMonthKey(key) && key < currentMonth();
  }

  /**
   * The first business day of a month, as the instant that day STARTS in the
   * project's timezone (D-120). Business day = Monday to Friday; holidays are
   * deliberately not modelled — a holiday costs the task one day, and a holiday
   * table is a second thing to maintain that goes stale silently.
   *
   * This is a CALENDAR RULE, not a threshold, which is why it is written in
   * code while every duration in the system lives in the Settings tab. There is
   * no setting that could make "the first business day" mean something else.
   *
   * Returns a timestamp so the comparison is `now >= resumeDate` — a DATE
   * comparison, since the value is midnight in the sheet's timezone rather than
   * an hour offset from some event.
   */
  function firstBusinessDay(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
    if (!m) return NaN;
    var y = +m[1], mo = +m[2] - 1, day = 1;
    // getUTCDay on a UTC-built date: the calendar date is what we asked for, so
    // the weekday is right regardless of where the browser is.
    while ([0, 6].indexOf(new Date(Date.UTC(y, mo, day)).getUTCDay()) >= 0) day++;
    return Date.UTC(y, mo, day) - OFFSET;
  }

  /* ---------- Which month a testimonial belongs to ---------- */

  /**
   * COHORT-BY-ENTRY (D-100): the month of the testimonial's EARLIEST event for
   * this (email, cycle) — in practice `Nomination — logged`, the moment Gaby
   * logged it.
   *
   * Deliberately NOT "the month they qualified". Qualification is unstable
   * under latest-wins: a client who qualifies in August and resubmits the form
   * in September would silently hop cohorts and vanish from August's list,
   * possibly after the draw had already run. Entry is fixed the moment the
   * testimonial exists.
   *
   * MANUAL OVERRIDE (D-100): a real case the automatic rule cannot cover — a
   * client says yes, sends nothing that week, and sends it two weeks later.
   * Gaby moves them to another month's raffle and that move writes an
   * attributed event, so the decision never lives only in her head.
   *
   * The button is a WRITE and ships with the draw chunk. This reader honours
   * the override NOW so the view is correct the moment it lands, with nothing
   * to recompute.
   */
  function monthOf(t) {
    // EVERY move, not just the newest. The newest one alone answers "which
    // month is this client in", but not "which month did they come FROM" — on a
    // round trip (Aug → Sep → Aug) the entry month and the current month are the
    // same, so reporting entry-as-from made the card read "moved from Aug 2026"
    // while sitting in Aug 2026. The previous move is the honest answer.
    var moves = moveTargets(t);
    if (!moves.length) return { month: monthKey(entryTs(t)), moved: false };

    var last = moves[moves.length - 1];
    var prev = moves.length > 1 ? moves[moves.length - 2].month : monthKey(entryTs(t));

    return { month: last.month, moved: true,
             movedBy: root.StateBuilder.actorOf(last.ev),
             movedAt: last.ev.ts, from: prev, note: last.ev.event };
  }

  /**
   * Every event that names a month for this testimonial, oldest first. Events
   * arrive ordered by (timestamp, row), so this order is the order the
   * decisions were made, and the LAST one wins. An event whose text holds no
   * valid month is skipped rather than guessed at — it cannot move anybody.
   *
   * THREE SOURCES, ONE ANSWER (D-120). The raffle's own move button is one of
   * them; the other two come from the pipeline postponement, which moves the
   * client's month as part of the same gesture:
   *
   *   Raffle — month moved            Gaby moves the entry from the raffle view
   *   Pipeline — postponed to month   "yes, but next month" — target month
   *   Pipeline — postponement cancelled   the undo — the month it goes BACK to
   *
   * The postponement deliberately does NOT also write `Raffle — month moved`.
   * A second row saying the same thing is a second thing that can drift, and
   * one of the two could later be superseded alone. After D-120 exactly one
   * function decides a testimonial's month, by reading three strings.
   */
  var MONTH_SOURCES = [S.RAFFLE_MONTH_MOVED, S.PIPELINE_POSTPONED, S.PIPELINE_POSTPONE_CANCELLED];

  function moveTargets(t) {
    var want = MONTH_SOURCES.map(function (s) { return root.StateBuilder.normStage(s); });
    var out = [];
    (t.events || []).forEach(function (ev) {
      var n = root.StateBuilder.normStage(ev.stage);
      if (want.indexOf(n) < 0) return;
      var m = /(\d{4}-\d{2})/.exec(String(ev.event || ""));
      if (m && isMonthKey(m[1])) out.push({ month: m[1], ev: ev, stage: n });
    });
    return out;
  }

  /** Events arrive ordered by (timestamp, row), so the first is the earliest. */
  function entryTs(t) {
    return (t.events && t.events.length) ? t.events[0].ts : NaN;
  }

  /* ---------- The three conditions ---------- */

  function conditionsFor(t) {
    var lbs = t.lastByStage || {};
    function last(str) { return lbs[root.StateBuilder.normStage(str)] || null; }

    /* 1 · photo permission */
    var photoEv = last(PREFS.PHOTO);
    var photo = photoEv ? classify(photoEv.event) : null;

    /* 2 · questionnaire / testimonial — the EXISTING client-video signal.
       Same `arrived` rule the pipeline uses, so the raffle can never disagree
       with the board about whether the video is in. */
    var vid = (t.inputs && t.inputs[VIDEO_INPUT]) || { state: "missing", event: null };
    var videoIn = root.StateBuilder.arrived(vid.state);

    /* 3 · Google review — the SELF-REPORT only (D-066). */
    var reviewEv = last(PREFS.REVIEW);
    var review = reviewEv ? classify(reviewEv.event) : null;

    function state(parsed, ev) {
      if (!ev)               return "missing";
      if (parsed.met === true)  return "met";
      if (parsed.met === false) return "not-met";
      return "unclear";
    }

    // `lower` exists because "Google" is a proper noun — blanket .toLowerCase()
    // on the labels produced "waiting on google review".
    return [
      { key: "photo", n: 1, label: "Photo permission", lower: "photo permission",
        state: state(photo, photoEv),
        answer: photo ? photo.raw : "",
        at: photoEv ? photoEv.ts : NaN,
        empty: "no preferences form yet",
        stages: [PREFS.PHOTO] },

      { key: "questionnaire", n: 2, label: "Questionnaire / testimonial", lower: "the questionnaire video",
        state: videoIn ? "met" : (vid.state === "flagged" ? "unclear" : "missing"),
        answer: videoIn ? (vid.text || "video received") : "",
        at: vid.at,
        empty: "video not received",
        // No event of its own — the fold's definition, not a new string.
        stages: (CFG.INPUTS.filter(function (i) { return i.key === VIDEO_INPUT; })[0] || {}).stages || [] },

      { key: "review", n: 3, label: "Google review (self-reported)", lower: "the Google review",
        state: state(review, reviewEv),
        answer: review ? review.raw : "",
        at: reviewEv ? reviewEv.ts : NaN,
        empty: "no preferences form yet",
        stages: [PREFS.REVIEW] }
    ];
  }

  /** Compliance for one testimonial. Live/computed — never snapshotted here. */
  function compliance(t) {
    var c = conditionsFor(t);
    var met = c.filter(function (x) { return x.state === "met"; }).length;
    var unclear = c.filter(function (x) { return x.state === "unclear"; });
    return {
      conditions: c,
      met: met,
      total: c.length,
      qualifies: met === c.length,
      // Not a qualification blocker so much as a "someone must look" flag.
      needsReview: unclear.length > 0,
      unclear: unclear
    };
  }

  /* ==========================================================================
   * The draw
   * ========================================================================== */

  /**
   * ELIGIBILITY — the one definition.
   *
   * Three independent filters, each with a different reason:
   *   qualifies    — the three conditions (D-008). Read from `compliance()`.
   *   in cohort    — this month's entries only (D-100, cohort-only scope).
   *   never won    — the free month is a prize per PERSON, so a prior win
   *                  excludes them across every cycle and every month.
   *
   * The person-level reading of "already won" is deliberate and is the one
   * judgement call in this function. D-100 establishes that a part-2
   * testimonial is a SEPARATE raffle subject, which settles which testimonial
   * competes — but not whether someone can win a second free month. Excluding
   * the person is the conservative reading: an over-broad exclusion costs
   * someone one month in a monthly raffle, while an over-narrow one hands the
   * same client a second free month, which is a contract change nobody
   * decided. Flagged for Bernardo rather than settled silently.
   */
  function eligibleFrom(entries) {
    return entries.filter(function (e) {
      return e.qualifies && !e.personWon;
    });
  }

  /**
   * Pick one. `rnd` is injectable ONLY so the self-check and the test plan can
   * drive it deterministically; production passes nothing and gets Math.random.
   */
  function drawFrom(eligible, rnd) {
    if (!eligible || !eligible.length) return null;
    var r = (typeof rnd === "function") ? rnd() : Math.random();
    if (!isFinite(r) || r < 0) r = 0;
    var i = Math.floor(r * eligible.length);
    if (i >= eligible.length) i = eligible.length - 1;   // rnd() === 1
    return eligible[i];
  }

  /**
   * The frozen record written into the winner event (spec §4.4).
   *
   * Everything a later reader needs to answer "who was in this draw and why"
   * without recomputing anything: the month, the winner, the full eligible
   * list, and the winner's three conditions with the client's own words. The
   * month is written as YYYY-MM so the record is machine-readable too.
   */
  function snapshotText(month, winner, eligible) {
    function who(e) {
      return e.name + " <" + e.email + ">" + (e.cycle > 1 ? " (part " + e.cycle + ")" : "");
    }
    var conds = winner.compliance.conditions.map(function (c) {
      return c.label + " = " + (c.answer || c.state);
    }).join("; ");

    return "Raffle " + month + " — winner: " + who(winner) + ". " +
      "Drawn from " + eligible.length + " eligible: " +
      eligible.map(who).join(", ") + ". " +
      "Winner's conditions at the draw: " + conds + ".";
  }

  /** The move button's event text. The YYYY-MM is what `monthOf` parses back. */
  function moveText(fromMonth, toMonth) {
    return "Moved to the " + toMonth + " raffle (from " + fromMonth + ")";
  }

  /**
   * The postponement's event text (D-120). The TARGET month comes first for the
   * same reason as `moveText`: `monthOf` takes the first YYYY-MM it finds.
   */
  function postponeText(fromMonth, toMonth) {
    return "Postponed to " + toMonth + " at the client's request (from " + fromMonth + "). " +
           "All their tasks are paused until the first business day of " + monthLabel(toMonth) + ".";
  }

  /** The undo. `backToMonth` FIRST — it is the month the client returns to. */
  function cancelText(backToMonth, fromMonth) {
    return "Postponement cancelled, back to " + backToMonth + " (was " + fromMonth + "). " +
           "Their tasks resume now.";
  }

  /* ---------- The monthly fold ---------- */

  function build(state) {
    var settings = state.settings || {};
    var active = String(settings.activeMonth || "").trim();
    // The setting's own note: blank means the current month.
    var month = isMonthKey(active) ? active : currentMonth();
    var invalidSetting = active !== "" && !isMonthKey(active);

    // Prior wins, by PERSON. Built across every testimonial before any
    // eligibility is computed, because a cycle-1 win must exclude cycle 2.
    var wonBy = {};
    state.testimonials.forEach(function (t) {
      var w = t.recognitions && t.recognitions.raffleWinner;
      if (!w) return;
      var prev = wonBy[t.email];
      if (!prev || w.ts > prev.ts) {
        wonBy[t.email] = { ts: w.ts, cycle: t.cycle, event: w.event || "",
                           actor: root.StateBuilder.actorOf(w) };
      }
    });

    var entries = [];
    state.testimonials.forEach(function (t) {
      var m = monthOf(t);
      var comp = compliance(t);
      entries.push({
        testimonial: t,
        key: t.key,
        name: (t.identity && t.identity.clientName) || t.email,
        email: t.email,
        cycle: t.cycle,
        month: m.month,
        moved: m.moved,
        movedBy: m.movedBy || "",
        movedFrom: m.from || "",
        movedNote: m.note || "",
        entryAt: entryTs(t),
        compliance: comp,
        qualifies: comp.qualifies,
        // Stage is carried so the draw can say WHO it is waiting on and where
        // they are stuck, without the view reaching back into the testimonial.
        terminal: !!(t.stage && t.stage.terminal),
        stageKey: (t.stage && t.stage.key) || "",
        stageLabel: (t.stage && t.stage.label) || "",
        hoursInStage: t.hoursInStage,
        alreadyWon: !!(t.recognitions && t.recognitions.raffleWinner),
        // The person has won at some point — possibly on another cycle.
        personWon: !!wonBy[t.email],
        personWonAt: wonBy[t.email] ? wonBy[t.email].ts : NaN,
        personWonCycle: wonBy[t.email] ? wonBy[t.email].cycle : 0,
        winnerEvent: (t.recognitions && t.recognitions.raffleWinner) || null,
        // Post-draw task state (D-080): independent, neither blocks the other.
        monthAdded:   !!(t.lastByStage || {})[root.StateBuilder.normStage(S.RAFFLE_MONTH_ADDED)],
        messagesSent: !!(t.lastByStage || {})[root.StateBuilder.normStage(S.RAFFLE_MESSAGES)]
      });
    });

    var inMonth = entries.filter(function (e) { return e.month === month; });
    inMonth.sort(function (a, b) {
      if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
      if (b.compliance.met !== a.compliance.met) return b.compliance.met - a.compliance.met;
      return a.name.localeCompare(b.name);
    });

    /* ---------- The draw, for this month ---------- */

    var eligible = eligibleFrom(inMonth);

    // The month's winner is the cohort member carrying the winner event. No
    // month is parsed out of the snapshot: the cohort already answers it, and
    // one source beats two that can disagree.
    //
    // Ordered by WHEN the win was confirmed, not by list position, so "the
    // winner" is the first one confirmed even in the impossible two-winner
    // case. List order would make the answer depend on the display sort, and
    // the Digest mirror does not sort at all — the two would disagree exactly
    // when the data is already wrong and clarity matters most.
    var winners = inMonth.filter(function (e) { return e.alreadyWon; })
      .sort(function (a, b) {
        var at = a.winnerEvent ? a.winnerEvent.ts : Infinity;
        var bt = b.winnerEvent ? b.winnerEvent.ts : Infinity;
        return at - bt;
      });
    var winner = winners[0] || null;

    // Not reachable through the UI (the draw button disappears once a winner
    // exists), so it can only mean a double write or a hand-edited log —
    // exactly the kind of thing that must be visible rather than averaged over.
    var doubleWinner = winners.length > 1 ? winners : null;

    /* WHO IS STILL HOLDING THE MONTH UP.
     *
     * A cohort member is RESOLVED when they qualify, or when they are closed
     * (declined / dropped) — nothing more will happen for them either way.
     * Anyone else is still in flight and the draw waits for them.
     *
     * "Moved to another month" is deliberately NOT tested here: moving someone
     * removes them from this cohort entirely, so it resolves the hold-up by
     * construction. Testing `e.moved` would be a bug — inside this list it
     * means moved INTO this month, and those people still need resolving.
     */
    var unresolved = inMonth.filter(function (e) {
      return !e.qualifies && !e.terminal;
    });

    /* Until now the draw opened the moment ONE person qualified. It went live
     * on 17 August with a single eligible entry while three clients were still
     * working — and confirming a winner freezes a permanent snapshot of who was
     * eligible, so an early draw would have recorded a one-person raffle
     * forever and written out people who had done nothing wrong.
     *
     * The end of the month is the backstop: once it has passed the draw opens
     * regardless, so it can never hang waiting on someone who will never reply.
     */
    var drawState;
    if (winner) {
      drawState = "done";
    } else if (!eligible.length) {
      drawState = "waiting";
    } else if (unresolved.length && !monthIsPast(month)) {
      drawState = "waiting";
    } else {
      drawState = monthIsPast(month) ? "overdue" : "due";
    }

    return {
      month: month,
      monthLabel: monthLabel(month),
      isCurrentMonth: month === currentMonth(),
      isPastMonth: monthIsPast(month),
      nextMonth: nextMonth(month),
      fromSetting: isMonthKey(active),
      invalidSetting: invalidSetting,
      entries: inMonth,
      qualifying: inMonth.filter(function (e) { return e.qualifies; }),
      needsReview: inMonth.filter(function (e) { return e.compliance.needsReview; }),
      movedIn: inMonth.filter(function (e) { return e.moved; }),

      /* the draw */
      eligible: eligible,
      // Qualifies but is out because the person already won — shown, not
      // hidden, so "why is she not in the draw?" has a visible answer.
      excludedPriorWin: inMonth.filter(function (e) { return e.qualifies && e.personWon && !e.alreadyWon; }),
      winner: winner,
      doubleWinner: doubleWinner,
      // The people the draw is waiting on, so the view can name them and offer
      // the buttons that resolve them. Empty once nobody is in flight.
      holdingUp: unresolved,
      drawState: drawState,
      drawDue: drawState === "due" || drawState === "overdue",
      // Everyone, so the view can say what a different month would hold.
      allEntries: entries,
      months: entries.reduce(function (m, e) {
        if (e.month) m[e.month] = (m[e.month] || 0) + 1;
        return m;
      }, {})
    };
  }

  /* ---------- Structural self-check ---------- */

  /**
   * These invariants cannot be left to convention: each one, if broken, opens
   * the raffle to someone who should not be in it. Throwing at load is the
   * point — it can only fire if the code is edited wrongly.
   */
  function selfCheck() {
    var problems = [];
    var probe = conditionsFor({ lastByStage: {}, inputs: {}, events: [] });

    if (probe.length !== 3) {
      problems.push("the raffle has exactly three conditions (D-008), found " + probe.length);
    }

    probe.forEach(function (c) {
      (c.stages || []).forEach(function (s) {
        if (s === PREFS.PODCAST) {
          problems.push("podcast consent is NOT a raffle condition (D-097) — found in '" + c.key + "'");
        }
        if (s === S.REVIEW_SELF_REPORTED) {
          problems.push("condition '" + c.key + "' reads the dashboard-writable '" + S.REVIEW_SELF_REPORTED +
                        "'. The raffle must read the engine-owned preferences event, or a person could " +
                        "hand-enter a self-report and open the raffle (D-066/D-098).");
        }
        if (s === S.REVIEW_CONFIRMED) {
          problems.push("the raffle opens on the self-report, NEVER on a confirmation (D-066) — found in '" + c.key + "'");
        }
        if (s === CFG.ENGINE.CLIENT_VIDEO_LINK) {
          problems.push("'" + CFG.ENGINE.CLIENT_VIDEO_LINK + "' means folder 03 was SHARED, not that the " +
                        "video arrived — reading it would qualify every client the fan-out has run for " +
                        "(condition '" + c.key + "')");
        }
      });
    });

    /* ---------- Draw invariants (the draw chunk) ---------- */

    // Eligibility must be a SUBSET of qualifying, always. This is the invariant
    // that matters most: everything else about the raffle is cosmetic next to
    // handing a free month to someone who did not meet the three conditions.
    var fake = [
      { name: "Q",  email: "q@x",  cycle: 1, qualifies: true,  personWon: false },
      { name: "NQ", email: "nq@x", cycle: 1, qualifies: false, personWon: false },
      { name: "PW", email: "pw@x", cycle: 2, qualifies: true,  personWon: true }
    ];
    var got = eligibleFrom(fake).map(function (e) { return e.name; });

    if (got.indexOf("NQ") >= 0) {
      problems.push("a testimonial that does NOT qualify reached the eligible list (D-008)");
    }
    if (got.indexOf("PW") >= 0) {
      problems.push("someone who has already won reached the eligible list — a prior win " +
                    "excludes the person across every cycle");
    }
    if (got.length !== 1 || got[0] !== "Q") {
      problems.push("eligibility is not exactly 'qualifies and has never won' — got [" + got.join(", ") + "]");
    }

    // The draw can only ever return a member of the list it was given.
    var pick0 = drawFrom(fake.slice(0, 1), function () { return 0; });
    var pickEnd = drawFrom(fake, function () { return 1; });
    if (!pick0 || pick0.name !== "Q") problems.push("drawFrom() did not return the only candidate");
    if (!pickEnd || pickEnd.name !== "PW") problems.push("drawFrom() cannot reach the last candidate (rnd() === 1)");
    if (drawFrom([], function () { return 0; }) !== null) problems.push("drawFrom() must return null on an empty list");

    // The snapshot is the record. Without the month it cannot be read back.
    var snap = snapshotText("2026-08", {
      name: "W", email: "w@x", cycle: 1,
      compliance: { conditions: [{ label: "Photo permission", answer: 'Yes ("sure")', state: "met" }] }
    }, [{ name: "W", email: "w@x", cycle: 1 }]);
    if (snap.indexOf("2026-08") < 0) {
      problems.push("the winner snapshot does not carry the month as YYYY-MM (spec §4.4)");
    }

    // The move event must round-trip through the reader that consumes it,
    // or the button writes a row the cohort silently ignores.
    var mv = moveText("2026-08", "2026-09");
    var back = /(\d{4}-\d{2})/.exec(mv);
    if (!back || back[1] !== "2026-09") {
      problems.push("moveText() does not put the TARGET month first, so monthOf() would " +
                    "read the wrong month back out (D-100)");
    }

    // Driven through monthOf itself, not just the regex: one move, then a round
    // trip, then an unreadable one.
    function fakeT(texts) {
      return { events: texts.map(function (txt, i) {
        return { stage: S.RAFFLE_MONTH_MOVED, event: txt, ts: i + 1, source: "MANUAL - Gaby" };
      }), lastByStage: {} };
    }
    var one = monthOf(fakeT([moveText("2026-08", "2026-09")]));
    if (one.month !== "2026-09" || !one.moved) {
      problems.push("a single move did not read back as 2026-09 (D-100)");
    }
    // `from` on a FIRST move is the entry month, which for this probe is
    // whatever its synthetic timestamps imply — not worth asserting. The round
    // trip below is the case that actually pins `from` down.
    var trip = monthOf(fakeT([moveText("2026-08", "2026-09"), moveText("2026-09", "2026-08")]));
    if (trip.month !== "2026-08") {
      problems.push("the NEWEST move must decide the month, got " + trip.month);
    }
    if (trip.from !== "2026-09") {
      problems.push("after a round trip, `from` must be the PREVIOUS move (2026-09), not the " +
                    "entry month — otherwise the card says 'moved from Aug' while showing Aug. Got " + trip.from);
    }
    if (monthOf(fakeT(["moved to next month"])).moved) {
      problems.push("a move with no readable YYYY-MM must be ignored, not guessed at");
    }

    // The Sheets date coercion (`activeMonth`). Normalised in sheets-reader so
    // every consumer benefits; asserted here because the raffle is what broke.
    if (root.SheetsReader && root.SheetsReader._monthSetting) {
      var ms = root.SheetsReader._monthSetting;
      if (ms(46266) !== "2026-09") problems.push("a Sheets date serial must normalise to YYYY-MM, got " + ms(46266));
      if (ms("2026-08") !== "2026-08") problems.push("a real YYYY-MM must pass through unchanged");
      if (ms("2026-08-01") !== "2026-08") problems.push("an ISO date must normalise to its month");
      if (ms("") !== "") problems.push("blank must stay blank (blank = the current month)");
      if (ms("Septembre") !== "Septembre") {
        problems.push("an unrecognised activeMonth must be returned unchanged, so the invalid-value " +
                      "banner still fires instead of it being swallowed as 'no pin set'");
      }
    }

    // The four strings this chunk writes must be writable. A missing one is
    // the D-092 failure: the button looks fine and the write is refused.
    if (root.EventWriter && root.EventWriter.isAllowedStage) {
      [S.RAFFLE_WINNER, S.RAFFLE_MESSAGES, S.RAFFLE_MONTH_ADDED, S.RAFFLE_MONTH_MOVED]
        .forEach(function (s) {
          if (!root.EventWriter.isAllowedStage(s)) {
            problems.push('"' + s + '" is not a writable dashboard Stage — the raffle ' +
                          "cannot write it (add it to config.js STAGES and to ALLOWED_STAGES " +
                          "in Code.gs, then bump PROXY_VERSION)");
          }
        });
    }

    return problems;
  }

  var problems = selfCheck();
  if (problems.length) throw new Error("raffle.js invariant broken:\n  - " + problems.join("\n  - "));

  root.RaffleFold = {
    build: build,
    compliance: compliance,
    monthOf: monthOf,
    classify: classify,
    monthKey: monthKey,
    monthLabel: monthLabel,
    currentMonth: currentMonth,
    nextMonth: nextMonth,
    monthIsPast: monthIsPast,
    isMonthKey: isMonthKey,
    eligibleFrom: eligibleFrom,
    drawFrom: drawFrom,
    snapshotText: snapshotText,
    moveText: moveText,
    postponeText: postponeText,
    cancelText: cancelText,
    firstBusinessDay: firstBusinessDay,
    selfCheck: selfCheck,
    PREFS: PREFS
  };
})(typeof window !== "undefined" ? window : this);
