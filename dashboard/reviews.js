/**
 * Testimonial Dashboard — Google Reviews tracking (Phase 5, D-066)
 *
 * ⚠️ MIRRORED IN `apps-script/Digest.gs` (D-088). The pending list and the
 * weekly-check-due rule are re-implemented there because a time trigger has
 * no browser. Any change here must be made there in the same commit.
 *
 * ---------------------------------------------------------------------------
 * TWO SIGNALS, NEVER COLLAPSED (D-066)
 * ---------------------------------------------------------------------------
 * 1. SELF-REPORT — "the client said yes/no on the preferences form". Read
 *    from the ENGINE-OWNED `Preferences — review self-reported` (D-098),
 *    never from the dashboard-writable `Review — self-reported` — that
 *    string exists in the Stage vocabulary for a possible future manual
 *    override, but this module does not write or read it, and neither does
 *    the raffle (raffle.js's own selfCheck already throws if the raffle ever
 *    reads it). This is the SAME event raffle.js reads for its review
 *    condition — reusing it, not a second source of the same answer.
 *
 * 2. CONFIRMATION — "a human matched a real Google review to this client by
 *    name". Google gives no automatic match, so Gaby does this by hand,
 *    weekly, best-effort. Writes ONE of two dashboard-owned events:
 *      `Review — confirmed`   — found it, matched by name
 *      `Review — unmatched`   — said yes, but could not find/match a review
 *    Confirmation is an AUDIT layer, NOT a raffle gate (D-066) — a genuine
 *    reviewer whose name cannot be matched must never be excluded from a
 *    raffle they already qualified for on the self-report alone.
 *
 * `Review — verification done` is a THIRD, separate event: a system-level
 * marker (empty email, same bucket as the engine's `Confirmation` rows) that
 * Gaby ran her weekly best-effort check, whether or not it found anything
 * new. Without it, a quiet week where nothing changed looks identical to a
 * week nobody checked — this is what lets `needsCheck` tell those apart.
 *
 * WHO NEEDS CHECKING: self-reported YES, and no confirmation/unmatched event
 * yet, on a testimonial that is not terminal. Last-write-wins between
 * `confirmed` and `unmatched` — Gaby can flip a decision later (she found it
 * after all, or a second look shows it was never really there), and the log
 * stays append-only history either way.
 *
 * THE AGGREGATE COUNT (D-066's "reality check") is a plain number Gaby types
 * into the Settings tab by hand after checking the Google Business Profile —
 * there is no API integration here, and inventing one is out of scope. This
 * module only reads and displays it; the Settings tab is the only writer.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("reviews: TDConfig not loaded");
  var S = CFG.STAGES;

  /** The engine-owned self-report event. Same string raffle.js reads. */
  var PREFS_REVIEW = "Preferences — review self-reported";

  function norm(s) { return root.StateBuilder.normStage(s); }

  /** One testimonial's review status. Exposed for the digest mirror to test against. */
  function statusFor(t) {
    var lbs = t.lastByStage || {};
    function last(str) { return lbs[norm(str)] || null; }

    var selfEv = last(PREFS_REVIEW);
    var self = selfEv ? root.RaffleFold.classify(selfEv.event) : null;
    var selfState = !selfEv ? "missing" : (self.met === true ? "yes" : (self.met === false ? "no" : "unclear"));

    var confirmedEv = last(S.REVIEW_CONFIRMED);
    var unmatchedEv = last(S.REVIEW_UNMATCHED);
    var auditState = "none", auditAt = NaN, auditNote = "";
    if (confirmedEv || unmatchedEv) {
      var newer = (confirmedEv && (!unmatchedEv || confirmedEv.ts >= unmatchedEv.ts)) ? confirmedEv : unmatchedEv;
      auditState = (newer === confirmedEv) ? "confirmed" : "unmatched";
      auditAt = newer.ts;
      auditNote = newer.event || "";
    }

    return {
      key: t.key, email: t.email, cycle: t.cycle,
      name: (t.identity && t.identity.clientName) || t.email,
      selfState: selfState, selfAnswer: self ? self.raw : "", selfAt: selfEv ? selfEv.ts : NaN,
      auditState: auditState, auditAt: auditAt, auditNote: auditNote,
      needsCheck: selfState === "yes" && auditState === "none"
    };
  }

  /**
   * Mirror of raffle.js's `build`-level shape. `list` is any array of
   * testimonial-like objects (state.testimonials on the dashboard,
   * dFold_()'s list in Digest.gs) — statusFor() only reads lastByStage and
   * identity, so both sides can call the exact same function shape.
   */
  function build(list, settings, systemEvents, now) {
    var verifyDays = (settings && settings.reviewVerificationDays) || 7;

    var entries = (list || [])
      .filter(function (t) { return !(t.stage && t.stage.terminal); })
      .map(statusFor);

    var pending = entries.filter(function (e) { return e.needsCheck; })
      .sort(function (a, b) {
        var av = isFinite(a.selfAt) ? a.selfAt : Infinity;
        var bv = isFinite(b.selfAt) ? b.selfAt : Infinity;
        return av - bv;   // longest-waiting first
      });

    var lastVerification = null;
    (systemEvents || []).forEach(function (e) {
      if (norm(e.stage) !== norm(S.REVIEW_VERIFICATION)) return;
      if (!lastVerification || e.ts > lastVerification.ts) lastVerification = e;
    });

    var daysSince = lastVerification ? (now - lastVerification.ts) / 86400000 : Infinity;

    return {
      entries: entries,
      pending: pending,
      confirmed: entries.filter(function (e) { return e.auditState === "confirmed"; }),
      unmatched: entries.filter(function (e) { return e.auditState === "unmatched"; }),
      saidNo: entries.filter(function (e) { return e.selfState === "no"; }).length,
      unclear: entries.filter(function (e) { return e.selfState === "unclear"; }).length,
      missing: entries.filter(function (e) { return e.selfState === "missing"; }).length,
      lastVerification: lastVerification,
      daysSinceVerification: isFinite(daysSince) ? daysSince : null,
      verifyTargetDays: verifyDays,
      // Nudge only when there is something to check AND the check is overdue.
      // A clean quiet week with zero pending never nags Gaby for nothing.
      needsVerificationRun: pending.length > 0 && daysSince >= verifyDays,
      aggregateCount: (settings && settings.reviewAggregateCount) || ""
    };
  }

  /* ---------- Structural self-check ---------- */

  function selfCheck() {
    var problems = [];

    // The three events this module writes/reads must exist in the Stage
    // vocabulary, and must never be the raffle's own condition string.
    [S.REVIEW_CONFIRMED, S.REVIEW_UNMATCHED, S.REVIEW_VERIFICATION].forEach(function (s) {
      if (!s) problems.push("a Review stage constant is missing from config.js STAGES");
      if (root.EventWriter && root.EventWriter.isAllowedStage && !root.EventWriter.isAllowedStage(s)) {
        problems.push('"' + s + '" is not a writable dashboard Stage — add it to ALLOWED_STAGES in ' +
                      "Code.gs (it already should be, per D-066/D-098) and bump PROXY_VERSION");
      }
    });

    // needsCheck must require BOTH a yes self-report and no audit decision —
    // never true from either alone.
    var yesNoAudit = statusFor({ key: "x", email: "x", cycle: 1, identity: {},
      lastByStage: (function () {
        var m = {};
        m[norm(PREFS_REVIEW)] = { ts: 1, event: 'Yes ("sure")' };
        return m;
      })()
    });
    if (!yesNoAudit.needsCheck) problems.push("a yes self-report with no audit event must need a check");

    var yesConfirmed = statusFor({ key: "x", email: "x", cycle: 1, identity: {},
      lastByStage: (function () {
        var m = {};
        m[norm(PREFS_REVIEW)] = { ts: 1, event: 'Yes ("sure")' };
        m[norm(S.REVIEW_CONFIRMED)] = { ts: 2, event: "" };
        return m;
      })()
    });
    if (yesConfirmed.needsCheck) problems.push("a confirmed review must not still need a check");

    return problems;
  }

  var problems = selfCheck();
  if (problems.length) throw new Error("reviews.js invariant broken:\n  - " + problems.join("\n  - "));

  root.ReviewsFold = { build: build, statusFor: statusFor, selfCheck: selfCheck, PREFS_REVIEW: PREFS_REVIEW };
})(typeof window !== "undefined" ? window : this);
