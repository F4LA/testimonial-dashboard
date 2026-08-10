/**
 * Testimonial Dashboard — Raffle compliance (Phase 5)
 *
 * ⚠️ READ-ONLY. This module computes and returns; it writes nothing, touches
 * no proxy, and needs no ALLOWED_STAGES check. The draw, the snapshot, and the
 * post-draw tasks are the next chunk.
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
 *     the log — and reading it would qualify every invited client instantly.
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
    var moved = t.lastByStage
      ? t.lastByStage[root.StateBuilder.normStage(S.RAFFLE_MONTH_MOVED)]
      : null;
    if (moved) {
      var m = /(\d{4}-\d{2})/.exec(String(moved.event || ""));
      if (m && isMonthKey(m[1])) {
        return { month: m[1], moved: true, movedBy: root.StateBuilder.actorOf(moved),
                 movedAt: moved.ts, from: monthKey(entryTs(t)), note: moved.event };
      }
    }
    return { month: monthKey(entryTs(t)), moved: false };
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

    return [
      { key: "photo", n: 1, label: "Photo permission",
        state: state(photo, photoEv),
        answer: photo ? photo.raw : "",
        at: photoEv ? photoEv.ts : NaN,
        empty: "no preferences form yet",
        stages: [PREFS.PHOTO] },

      { key: "questionnaire", n: 2, label: "Questionnaire / testimonial",
        state: videoIn ? "met" : (vid.state === "flagged" ? "unclear" : "missing"),
        answer: videoIn ? (vid.text || "video received") : "",
        at: vid.at,
        empty: "video not received",
        // No event of its own — the fold's definition, not a new string.
        stages: (CFG.INPUTS.filter(function (i) { return i.key === VIDEO_INPUT; })[0] || {}).stages || [] },

      { key: "review", n: 3, label: "Google review (self-reported)",
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

  /* ---------- The monthly fold ---------- */

  function build(state) {
    var settings = state.settings || {};
    var active = String(settings.activeMonth || "").trim();
    // The setting's own note: blank means the current month.
    var month = isMonthKey(active) ? active : currentMonth();
    var invalidSetting = active !== "" && !isMonthKey(active);

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
        alreadyWon: !!(t.recognitions && t.recognitions.raffleWinner)
      });
    });

    var inMonth = entries.filter(function (e) { return e.month === month; });
    inMonth.sort(function (a, b) {
      if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
      if (b.compliance.met !== a.compliance.met) return b.compliance.met - a.compliance.met;
      return a.name.localeCompare(b.name);
    });

    return {
      month: month,
      monthLabel: monthLabel(month),
      isCurrentMonth: month === currentMonth(),
      fromSetting: isMonthKey(active),
      invalidSetting: invalidSetting,
      entries: inMonth,
      qualifying: inMonth.filter(function (e) { return e.qualifies; }),
      needsReview: inMonth.filter(function (e) { return e.compliance.needsReview; }),
      movedIn: inMonth.filter(function (e) { return e.moved; }),
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
                        "video arrived — reading it would qualify every invited client (condition '" + c.key + "')");
        }
      });
    });

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
    isMonthKey: isMonthKey,
    selfCheck: selfCheck,
    PREFS: PREFS
  };
})(typeof window !== "undefined" ? window : this);
