/**
 * Testimonial Dashboard — Raffle view (Phase 5)
 *
 * ⚠️ READ-ONLY. Every control here navigates; none writes. The draw button,
 * the snapshot, and the "move to another month" control are the next chunk.
 *
 * The raffle is its own section and is never folded into the pipeline or the
 * reviews view (design principle §2: keep apart what belongs apart). It shares
 * the self-report EVENT with the future reviews view — one event, two readers,
 * which is not merging. Confirmation stays out entirely.
 *
 * What the list is for: it is the eligible list the manual draw runs against.
 * So it has to be honest about three different kinds of "not in the draw" —
 * genuinely not qualified, waiting on a form that never arrived, and an answer
 * nobody could read — because only the third is anyone's fault.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("raffle-view: TDConfig not loaded");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var MARK = { "met": "✓", "not-met": "✕", "unclear": "?", "missing": "·" };
  var KIND = { "met": "ok", "not-met": "bad", "unclear": "warn", "missing": "muted" };

  /* ---------- One condition, as a chip ---------- */

  function chip(c) {
    var title = c.answer ? c.label + ": " + c.answer : c.label + " — " + c.empty;
    return '<span class="cond cond--' + KIND[c.state] + '" title="' + esc(title) + '">' +
      '<span class="cond__m">' + MARK[c.state] + "</span>" + esc(c.label) + "</span>";
  }

  function conditionChips(comp) {
    return '<div class="conds">' + comp.conditions.map(chip).join("") + "</div>";
  }

  /* ---------- Header ---------- */

  function header(r) {
    var sub;
    if (r.invalidSetting) {
      sub = '<strong>The Settings <code>activeMonth</code> value is not a valid YYYY-MM</strong>, ' +
            "so this is showing the current month instead.";
    } else if (r.fromSetting) {
      sub = "Month pinned by the Settings <code>activeMonth</code> value." +
            (r.isCurrentMonth ? "" : " <strong>This is not the current month.</strong>");
    } else {
      sub = "Showing the current month. Pin a different one with <code>activeMonth</code> in the Settings tab.";
    }

    var n = r.qualifying.length;
    return '<section class="section">' +
      '<div class="raffle__head">' +
        '<div><h2>Raffle — ' + esc(r.monthLabel) + "</h2>" +
        '<p class="section__sub">' + sub + "</p></div>" +
        '<div class="raffle__n"><div class="raffle__n__v">' + n + "</div>" +
        '<div class="raffle__n__l">qualif' + (n === 1 ? "ies" : "y") + "</div></div>" +
      "</div>" +
      '<p class="section__sub">Entry is <strong>photo permission + questionnaire/testimonial + Google review</strong> — ' +
      "three conditions, computed live from the event log. The review condition reads the client's " +
      "<strong>self-report</strong>, never a confirmation, so a genuine reviewer whose name cannot be matched " +
      "is never excluded. Podcast consent is not a condition.</p>" +
      "</section>";
  }

  /* ---------- A person's row ---------- */

  function row(e) {
    var comp = e.compliance;
    var cls = "rf" + (e.qualifies ? " rf--in" : "") + (comp.needsReview ? " rf--review" : "");

    var why = "";
    if (!e.qualifies) {
      var missing = comp.conditions.filter(function (c) { return c.state !== "met"; });
      var unclear = missing.filter(function (c) { return c.state === "unclear"; });
      var names = missing.map(function (c) { return c.lower || c.label.toLowerCase(); });
      var list = names.length === 1 ? names[0]
               : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
      why = '<div class="rf__why">Waiting on ' + esc(list) + ".";
      if (unclear.length) {
        why += ' <strong>' + esc(unclear[0].label) + " came back as " +
               '"' + esc(unclear[0].answer) + '"</strong> — nobody could read that as a yes or a no, ' +
               "so it needs a human rather than a decision.";
      }
      why += "</div>";
    }

    var tags = "";
    if (e.alreadyWon) tags += '<span class="badge badge--ok">already won</span>';
    if (e.moved) {
      tags += '<span class="badge badge--warn" title="' + esc(e.movedNote) + '">moved from ' +
        esc(root.RaffleFold.monthLabel(e.movedFrom)) + (e.movedBy ? " by " + esc(e.movedBy) : "") + "</span>";
    }
    if (e.cycle > 1) tags += '<span class="badge badge--muted">part ' + e.cycle + "</span>";

    return '<li class="' + cls + '">' +
      '<div class="rf__who">' +
        '<a class="rf__name" href="#/client/' + encodeURIComponent(e.key) + '">' + esc(e.name) + "</a>" +
        '<div class="sub">' + esc(e.email) + "</div>" + tags +
      "</div>" +
      '<div class="rf__conds">' + conditionChips(comp) + why + "</div>" +
      '<div class="rf__state">' +
        (e.qualifies ? '<span class="badge badge--ok">qualifies</span>'
                     : '<span class="badge badge--muted">' + comp.met + "/" + comp.total + "</span>") +
      "</div></li>";
  }

  /* ---------- Other months, so an empty list is never a dead end ---------- */

  function elsewhere(r) {
    var keys = Object.keys(r.months).filter(function (k) { return k !== r.month; }).sort().reverse();
    if (!keys.length) return "";
    return '<p class="section__sub">Other months in the log: ' +
      keys.map(function (k) {
        return "<strong>" + esc(root.RaffleFold.monthLabel(k)) + "</strong> (" + r.months[k] + ")";
      }).join(" · ") +
      ". A testimonial belongs to the month of its first event; set <code>activeMonth</code> to look at one of these.</p>";
  }

  /* ---------- Render ---------- */

  function render(state) {
    var r = root.RaffleFold.build(state);

    var body;
    if (!r.entries.length) {
      body = '<p class="empty">No testimonial entered the pipeline in ' + esc(r.monthLabel) + ".</p>" + elsewhere(r);
    } else {
      var note = "";
      if (r.needsReview.length) {
        note = '<div class="banner banner--warn"><strong>' + r.needsReview.length + " answer" +
          (r.needsReview.length === 1 ? "" : "s") + " could not be read.</strong> " +
          "An unreadable answer is not a no — it blocks entry until someone looks, " +
          "so it is listed rather than silently rejected.</div>";
      }
      body = note + '<ul class="rflist">' + r.entries.map(row).join("") + "</ul>" + elsewhere(r);
    }

    return header(r) +
      '<section class="section">' + body +
      '<p class="section__sub raffle__foot">Compliance is <strong>live</strong>, not snapshotted — ' +
      "it reflects the log right now. The snapshot is taken at the draw, and what qualified on the day " +
      "of the draw is what counts. The draw itself is deliberately manual and is not built yet.</p>" +
      "</section>";
  }

  function wire() { /* read-only: nothing to wire */ }

  root.RaffleView = { render: render, wire: wire };
})(typeof window !== "undefined" ? window : this);
