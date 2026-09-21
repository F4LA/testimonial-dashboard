/**
 * Testimonial Dashboard — Podcast + Client of the Month view (Phase 5, D-068)
 *
 * Renders `PodcastFold.build()`. Writes here:
 *   MARK WINNER        → `Client of the month — winner`  (one confirmation —
 *                         it is the one write in this view naming a person as
 *                         a winner, same category as the raffle's)
 *   podcast chain (×6)  → `Podcast — invited/accepted/declined/scheduled/
 *                         personal note sent/recorded/published`, no dialog —
 *                         independent markers, not a wizard (see podcast.js)
 *   SHOUT-OUT SENT      → `Client of the month — shout-out`, no dialog
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("podcast-view: TDConfig not loaded");
  var S = CFG.STAGES;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pill(text, kind) { return '<span class="badge badge--' + kind + '">' + esc(text) + "</span>"; }

  var CHAIN_LABEL = {
    PODCAST_INVITED: "Invited", PODCAST_ACCEPTED: "Accepted", PODCAST_DECLINED: "Declined",
    PODCAST_SCHEDULED: "Scheduled", PODCAST_NOTE_SENT: "Personal note sent",
    PODCAST_RECORDED: "Recorded", PODCAST_PUBLISHED: "Published"
  };
  var CHAIN_ORDER = ["PODCAST_INVITED", "PODCAST_ACCEPTED", "PODCAST_DECLINED",
                      "PODCAST_SCHEDULED", "PODCAST_NOTE_SENT", "PODCAST_RECORDED", "PODCAST_PUBLISHED"];

  function consentPill(c) {
    return c.state === "yes" ? pill("open to it", "ok")
         : c.state === "no" ? pill("declined consent", "bad")
         : c.state === "unclear" ? pill("unclear answer", "warn")
         : pill("no preferences form yet", "muted");
  }

  function candidateRow(c, month) {
    return "<tr><td>" + esc(c.name) + "</td><td>" + consentPill(c.consent) + "</td>" +
      '<td><button type="button" class="btn btn--sm" data-podcast="win" data-key="' + esc(c.key) +
      '" data-month="' + esc(month) + '">Client of the month</button></td></tr>';
  }

  function winnerBlock(m) {
    var w = m.winner;
    var chainRow = CHAIN_ORDER.map(function (k) {
      var done = !!w.chain[k];
      return '<button type="button" class="btn btn--sm ' + (done ? "is-on" : "") +
        '" data-podcast="chain" data-stage="' + esc(S[k]) + '" data-key="' + esc(w.key) + '">' +
        (done ? "\u2713 " : "") + esc(CHAIN_LABEL[k]) + "</button>";
    }).join(" ");

    return '<div class="card card--check is-ok"><div class="check__dot"></div><div>' +
      '<div class="check__label">' + esc(m.label) + "\u2019s Client of the Month: <strong>" + esc(w.name) + "</strong></div>" +
      '<div class="check__detail">Podcast consent: ' + consentPill(w.consent) + "</div>" +
      '<div class="check__detail" style="margin-top:6px">' + chainRow + "</div>" +
      '<div class="check__detail" style="margin-top:6px">' +
      '<button type="button" class="btn btn--sm ' + (w.shoutout ? "is-on" : "") +
      '" data-podcast="shoutout" data-key="' + esc(w.key) + '">' +
      (w.shoutout ? "\u2713 Shout-out sent" : "Mark shout-out sent") + "</button></div>" +
      "</div></div>";
  }

  function monthSection(m) {
    var head = "<h3>" + esc(m.label) + " (" + m.candidates.length +
      (m.candidates.length === 1 ? " candidate" : " candidates") + ")</h3>";
    if (m.winner) return head + winnerBlock(m);

    var rows = m.candidates.map(function (c) { return candidateRow(c, m.month); }).join("");
    return head +
      '<p class="section__sub">The vote happens in Slack, by hand — one pick per coach, most-voted wins, ' +
      "ties go to Joey then Bernardo. This list is what goes in that thread. Click the winner\u2019s button " +
      "once the vote is in.</p>" +
      '<table class="table"><thead><tr><th>Client</th><th>Podcast consent</th><th></th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>";
  }

  function render(state) {
    var pc = root.PodcastFold.build(state);
    root.PodcastView._pc = pc;

    if (!pc.months.length) {
      return '<section class="section"><h2>Podcast &amp; Client of the Month</h2>' +
        '<p class="empty">No testimonial has all five pieces done yet — nothing to vote on.</p></section>';
    }

    return '<section class="section"><h2>Podcast &amp; Client of the Month</h2>' +
      '<p class="section__sub">One month per cohort (same month a testimonial\u2019s raffle entry uses), ' +
      "not the calendar month production happens to finish in (D-068).</p>" +
      pc.months.slice().reverse().map(monthSection).join("") +
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
      var btn = e.target.closest ? e.target.closest("[data-podcast]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-podcast");
      function say(m, c) { root.Dialog.feedback(btn, m, c); }

      function write(t, stage, text) {
        btn.disabled = true;
        say("Writing…", "");
        root.EventWriter.appendEvent({ email: t.email, stage: stage, event: text || "", cycle: t.cycle })
          .then(function (res) {
            say(res.message, res.verified ? "ok" : "warn");
            btn.disabled = false;
            if (res.verified && root.TDApp) root.TDApp.reload();
          }).catch(function (err) { say(err.message, "bad"); btn.disabled = false; });
      }

      if (act === "win") {
        var key = btn.getAttribute("data-key"), month = btn.getAttribute("data-month");
        var t = root.TDApp.state.byKey[key];
        if (!t) { say("Could not find that testimonial.", "bad"); return; }
        root.Dialog.confirm({
          title: "Mark Client of the Month",
          body: (t.identity.clientName || t.email) + " for " + month + ".",
          consequences: [
            "Meant to record a decision already made in the Slack vote — not to make it here",
            "Nothing stops marking a second person for the same month; check the Slack thread first"
          ],
          confirmLabel: "Confirm winner"
        }).then(function (res) {
          if (!res) { say("Cancelled.", ""); return; }
          write(t, S.COTM_WINNER, "Chosen client of the month — " + month);
        });
        return;
      }

      if (act === "chain" || act === "shoutout") {
        var key2 = btn.getAttribute("data-key");
        var t2 = root.TDApp.state.byKey[key2];
        if (!t2) { say("Could not find that testimonial.", "bad"); return; }
        var stage2 = act === "shoutout" ? S.COTM_SHOUTOUT : btn.getAttribute("data-stage");
        write(t2, stage2, "");
        return;
      }
    });
  }

  root.PodcastView = { render: render, wire: wire, _pc: null };
})(typeof window !== "undefined" ? window : this);
