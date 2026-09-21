/**
 * Testimonial Dashboard — Podcast + Client of the Month (Phase 5, D-068)
 *
 * ⚠️ MIRRORED IN `apps-script/Digest.gs` (D-088). The candidate grouping and
 * the two system tasks are re-implemented there. Any change here must be
 * made there in the same commit.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT (D-068)
 * ---------------------------------------------------------------------------
 * THE VOTE HAPPENS IN SLACK, BY HAND. Coaches vote on a short candidate list,
 * one pick each, most-voted wins; ties go to Joey, then Bernardo. This module
 * does not run a vote or count anything — it only shows the candidate pool so
 * whoever posts the Slack thread has the list ready, and it writes the
 * RESULT once a human says who won.
 *
 * THE MONTH is the same cohort-by-entry concept the raffle uses
 * (`RaffleFold.monthOf`), not the calendar month production happens to
 * finish in — D-068 is explicit that the vote lands at the end of the
 * production cycle, which routinely spills into the following calendar
 * month. Reusing the raffle's month function means there is exactly one
 * definition of "which month is this testimonial in" in the whole system.
 *
 * CANDIDATES = all five pieces done, not terminal. Approval and scheduling
 * are NOT required (D-068: "the vote is never blocked waiting on the landing
 * page or on Joey's approval"). A month with exactly one candidate still
 * needs a human click — D-068's "single testimonial = default winner" is a
 * documented outcome for whoever runs the vote, not something this module
 * decides on its own; a human still confirms it, same click as any other
 * month.
 *
 * NO REPEAT-WIN EXCLUSION. Unlike the raffle (a prior winner is barred every
 * cycle after), D-068 never says a past Client of the Month cannot win
 * again — nothing here invents that rule.
 *
 * THE PODCAST CHAIN is six independent markers (invited / accepted /
 * declined / scheduled / recorded / published), each its own write, matching
 * the calendar's "mark posted" pattern rather than a strict wizard — Bernardo
 * and Joey know the real sequence better than a state machine would guess.
 * The shout-out is separate and unconditional: D-068 says a client who can't
 * or won't do the podcast still gets the shout-out + case study.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("podcast: TDConfig not loaded");
  var S = CFG.STAGES;

  var PODCAST_KEYS = ["PODCAST_INVITED", "PODCAST_ACCEPTED", "PODCAST_DECLINED",
                       "PODCAST_SCHEDULED", "PODCAST_NOTE_SENT", "PODCAST_RECORDED", "PODCAST_PUBLISHED"];

  function norm(s) { return root.StateBuilder.normStage(s); }

  /** This testimonial's podcast consent, read the same way reviews.js reads
   *  the review self-report — the engine-owned preferences event, never
   *  guessed. `RaffleFold.PREFS.PODCAST` is the SAME string raffle.js names
   *  ONLY so its own selfCheck can prove the raffle never reads it. */
  function consentFor(t) {
    var ev = (t.lastByStage || {})[norm(root.RaffleFold.PREFS.PODCAST)] || null;
    if (!ev) return { state: "missing", answer: "" };
    var c = root.RaffleFold.classify(ev.event);
    return { state: c.met === true ? "yes" : (c.met === false ? "no" : "unclear"), answer: c.raw };
  }

  /** Mirror of client-card.js's own podcast reduce, kept independent here
   *  rather than reused, so this module has no load-order dependency on
   *  client-card.js — a view file should never be a data dependency. */
  function podcastChain(t) {
    var lbs = t.lastByStage || {};
    var out = {};
    PODCAST_KEYS.forEach(function (k) {
      var ev = lbs[norm(S[k])];
      if (ev) out[k] = ev;
    });
    return out;
  }

  /**
   * One entry per cohort month that has at least one candidate. `winner` is
   * the candidate in that month carrying a `Client of the month — winner`
   * event — at most one, since a human is expected to check before marking
   * a second (this module does not enforce it; see `dSelfCheckPodcast_` for
   * why it deliberately doesn't).
   */
  function build(state) {
    var candidates = (state.testimonials || []).filter(function (t) {
      return t.allPiecesDone && !t.stage.terminal;
    });

    var byMonth = {};
    candidates.forEach(function (t) {
      var mo = root.RaffleFold.monthOf(t).month;
      (byMonth[mo] || (byMonth[mo] = [])).push(t);
    });

    var months = Object.keys(byMonth).sort().map(function (mo) {
      var group = byMonth[mo];
      var winner = group.filter(function (t) {
        return t.recognitions && t.recognitions.cotmWinner;
      })[0] || null;

      return {
        month: mo, label: root.RaffleFold.monthLabel(mo),
        candidates: group.map(function (t) {
          return { key: t.key, name: t.identity.clientName || t.email, consent: consentFor(t) };
        }),
        winner: winner ? {
          key: winner.key, name: winner.identity.clientName || winner.email,
          consent: consentFor(winner), chain: podcastChain(winner),
          shoutout: (winner.lastByStage || {})[norm(S.COTM_SHOUTOUT)] || null,
          wonAt: winner.recognitions.cotmWinner.ts
        } : null,
        voteDue: !winner && group.length > 0
      };
    });

    return { months: months, pending: months.filter(function (m) { return m.voteDue; }) };
  }

  /* ---------- Structural self-check ---------- */

  function selfCheck() {
    var problems = [];

    [S.COTM_WINNER, S.COTM_SHOUTOUT].concat(PODCAST_KEYS.map(function (k) { return S[k]; }))
      .forEach(function (s) {
        if (!s) { problems.push("a podcast/COTM stage constant is missing from config.js STAGES"); return; }
        if (root.EventWriter && root.EventWriter.isAllowedStage && !root.EventWriter.isAllowedStage(s)) {
          problems.push('"' + s + '" is not a writable dashboard Stage — add it to ALLOWED_STAGES in Code.gs and bump PROXY_VERSION');
        }
      });

    return problems;
  }

  var problems = selfCheck();
  if (problems.length) throw new Error("podcast.js invariant broken:\n  - " + problems.join("\n  - "));

  root.PodcastFold = { build: build, consentFor: consentFor, podcastChain: podcastChain, selfCheck: selfCheck };
})(typeof window !== "undefined" ? window : this);
