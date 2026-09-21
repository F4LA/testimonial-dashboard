/**
 * Testimonial Dashboard — Reviews view (Phase 5, D-066)
 *
 * Renders `ReviewsFold.build()`. Two writes live here, both dashboard-owned
 * and both an audit layer, never a raffle gate (see reviews.js):
 *   CONFIRM   → `Review — confirmed`
 *   UNMATCHED → `Review — unmatched`
 * Plus one system-level marker, not tied to any one client:
 *   VERIFY DONE → `Review — verification done`
 *
 * No confirmation dialog on Confirm/Unmatched — unlike the raffle's winner
 * pick or the calendar's "mark published", flipping this later costs nothing:
 * the log is append-only and the newer write always wins (D-066). A dialog on
 * every row of a weekly chore would just be friction.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("reviews-view: TDConfig not loaded");
  var S = CFG.STAGES;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function pill(text, kind) { return '<span class="badge badge--' + kind + '">' + esc(text) + "</span>"; }

  function fmtDays(n) {
    if (n === null) return "never";
    if (n < 1) return "today";
    var d = Math.floor(n);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  /* ---------- Weekly-check card ---------- */

  function checkCard(rv) {
    var cls = rv.needsVerificationRun ? "warn" : "ok";
    var note = rv.needsVerificationRun
      ? "<strong>Due.</strong> " + rv.pending.length + " client" + (rv.pending.length === 1 ? "" : "s") +
        " said yes and " + (rv.pending.length === 1 ? "is" : "are") + " still waiting on you."
      : rv.pending.length
        ? rv.pending.length + " waiting, checked recently enough — not due yet."
        : "Nothing waiting on you right now.";

    return '<div class="card card--check is-' + cls + '">' +
      '<div class="check__dot"></div><div>' +
      '<div class="check__label">Weekly Google review check — last run ' + esc(fmtDays(rv.daysSinceVerification)) + "</div>" +
      '<div class="check__detail">' + note + "</div>" +
      (rv.aggregateCount
        ? '<div class="check__detail">Google Business Profile total: <strong>' + esc(rv.aggregateCount) +
          "</strong> <span class=\"sub\">(typed in by hand in the Settings tab — a reality check, not a count this reads live)</span></div>"
        : "") +
      '<button type="button" class="btn" data-review="verify">Mark this week\u2019s check done</button>' +
      "</div></div>";
  }

  /* ---------- The pending / confirmed / unmatched table ---------- */

  function row(e) {
    var statusPill = e.auditState === "confirmed" ? pill("confirmed", "ok")
                    : e.auditState === "unmatched" ? pill("unmatched", "warn")
                    : pill("waiting", "muted");
    var link = '<a href="#/client/' + encodeURIComponent(e.key) + '">' + esc(e.name) + "</a>";
    var self = esc(e.selfAnswer || "yes") + (isFinite(e.selfAt) ? ' <span class="sub">(' +
      esc(root.ClientCard.fmtWhen(e.selfAt)) + ")</span>" : "");
    var auditNote = e.auditNote ? '<div class="sub">' + esc(e.auditNote) + "</div>" : "";

    return "<tr>" +
      "<td>" + link + "</td>" +
      "<td>" + self + "</td>" +
      "<td>" + statusPill + auditNote + "</td>" +
      '<td><button type="button" class="btn btn--sm" data-review="confirm" data-key="' + esc(e.key) + '">Confirmed</button> ' +
      '<button type="button" class="btn btn--sm" data-review="unmatched" data-key="' + esc(e.key) + '">Can\u2019t find it</button></td>' +
      "</tr>";
  }

  function table(entries, emptyText) {
    if (!entries.length) return '<p class="empty">' + esc(emptyText) + "</p>";
    return '<table class="table"><thead><tr><th>Client</th><th>Self-reported</th><th>Status</th><th></th></tr></thead>' +
      "<tbody>" + entries.map(row).join("") + "</tbody></table>";
  }

  function footerNote(rv) {
    var bits = [];
    if (rv.saidNo)  bits.push(rv.saidNo + " said no");
    if (rv.unclear) bits.push(rv.unclear + " gave an unclear answer");
    if (rv.missing) bits.push(rv.missing + " haven\u2019t filled the preferences form yet");
    if (!bits.length) return "";
    return '<p class="section__sub">Not shown above, no action needed: ' + esc(bits.join(", ")) + ".</p>";
  }

  function render(state) {
    var rv = root.ReviewsFold.build(state.testimonials, state.settings, state.systemEvents, root.TDClock.now());
    root.ReviewsView._rv = rv;

    return '<section class="section"><h2>Reviews</h2>' +
      '<p class="section__sub">Two signals, kept apart on purpose (D-066): what the client SELF-REPORTED on the ' +
      "preferences form (already gates the raffle, unaffected by anything here), and whether a human has since " +
      "CONFIRMED a real Google review by matching a name — an audit layer, never a gate.</p>" +
      checkCard(rv) +
      "<h3>Waiting on you (" + rv.pending.length + ")</h3>" +
      table(rv.pending, "Nothing waiting on you.") +
      "<h3>Confirmed (" + rv.confirmed.length + ")</h3>" +
      table(rv.confirmed, "No confirmed reviews yet.") +
      "<h3>Couldn\u2019t match (" + rv.unmatched.length + ")</h3>" +
      table(rv.unmatched, "Nothing flagged as unmatched.") +
      footerNote(rv) +
      "</section>";
  }

  /* ---------- Wiring ---------- */

  var wired = false;

  function wire(state) {
    if (wired) return;
    wired = true;
    var host = document.getElementById("app");
    if (!host) return;

    host.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-review]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-review");
      function say(m, c) { root.Dialog.feedback(btn, m, c); }

      if (act === "verify") {
        btn.disabled = true;
        say("Writing…", "");
        root.EventWriter.appendEvent({
          email: "", stage: S.REVIEW_VERIFICATION,
          event: "Weekly Google review check run", cycle: 1
        }).then(function (res) {
          say(res.message, res.verified ? "ok" : "warn");
          btn.disabled = false;
          if (res.verified && root.TDApp) root.TDApp.reload();
        }).catch(function (err) { say(err.message, "bad"); btn.disabled = false; });
        return;
      }

      if (act === "confirm" || act === "unmatched") {
        var key = btn.getAttribute("data-key");
        var t = root.TDApp.state.byKey[key];
        if (!t) { say("Could not find that testimonial.", "bad"); return; }
        var stage = act === "confirm" ? S.REVIEW_CONFIRMED : S.REVIEW_UNMATCHED;
        var text = act === "confirm" ? "Matched a Google review by name" : "Could not find/match a review";
        btn.disabled = true;
        say("Writing…", "");
        root.EventWriter.appendEvent({
          email: t.email, stage: stage, event: text, cycle: t.cycle
        }).then(function (res) {
          say(res.message, res.verified ? "ok" : "warn");
          btn.disabled = false;
          if (res.verified && root.TDApp) root.TDApp.reload();
        }).catch(function (err) { say(err.message, "bad"); btn.disabled = false; });
        return;
      }
    });
  }

  root.ReviewsView = { render: render, wire: wire, _rv: null };
})(typeof window !== "undefined" ? window : this);
