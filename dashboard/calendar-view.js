/**
 * Testimonial Dashboard — Calendar view (Phase 4)
 *
 * One data source, two shapes, a toggle — not two things to maintain.
 *   Queue (primary) — what's next, in order. The weekly rhythm.
 *   Month (secondary) — the at-a-glance grid.
 *
 * Both render `CalendarFold.build(state)`. Days never appear: a testimonial
 * occupies "week of Aug 17" and nothing finer.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("calendar-view: TDConfig not loaded");
  var S = CFG.STAGES;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(id) { return document.getElementById(id); }

  var view = { mode: "queue", months: 0 };

  /* ---------- Buffer strip ---------- */

  function bufferStrip(cal) {
    var b = cal.buffer;
    var cls = b.healthy ? "ok" : (b.weeks <= b.target - 2 ? "bad" : "warn");
    var pips = "";
    for (var i = 0; i < Math.max(b.target, b.weeks); i++) {
      pips += '<span class="pip ' + (i < b.weeks ? "pip--on" : "pip--off") + '"></span>';
    }
    return '<div class="buffer buffer--' + cls + '">' +
      '<div class="buffer__n">' + b.weeks + "</div>" +
      '<div class="buffer__body">' +
        '<div class="buffer__label">complete week' + (b.weeks === 1 ? "" : "s") +
          " ahead · target " + b.target + "</div>" +
        '<div class="buffer__pips">' + pips + "</div>" +
        '<div class="buffer__note">' +
          (b.healthy
            ? "Healthy. Counting from " + esc(root.CalendarFold.label(b.startWeek)) + "."
            : "Below target. The streak stops at " + esc(root.CalendarFold.label(b.firstGapWeek)) +
              " because that week is " + esc(b.firstGapReason) + ".") +
        "</div>" +
      "</div>" +
      (b.healthy ? "" :
        '<button class="btn btn--sm" data-cal="fill" data-week="' + esc(b.firstGapWeek) +
        '" data-trigger="buffer-low">Suggest a fill</button>') +
      "</div>";
  }

  /* ---------- One week, as a row or a cell ---------- */

  function weekBadges(w) {
    var out = "";
    if (w.published) return '<span class="badge badge--ok">published</span>';
    if (w.complete)  out += '<span class="badge badge--ok">content ready</span>';
    else             out += '<span class="badge badge--warn">' + w.piecesDone + "/5 pieces</span>";
    out += w.checks.instagram ? '<span class="badge badge--ok">IG ✓</span>'
                              : '<span class="badge badge--muted">IG</span>';
    out += w.checks.email ? '<span class="badge badge--ok">email ✓</span>'
                          : '<span class="badge badge--muted">email</span>';
    if (w.atRisk) out += '<span class="badge badge--bad">at risk</span>';
    if (w.collision) out += '<span class="badge badge--bad">collision: ' + esc(w.collision.join(", ")) + "</span>";
    return out;
  }

  function weekActions(w) {
    if (w.published) return "";
    var a = [];
    if (!w.checks.instagram) {
      a.push('<button class="btn btn--sm" data-cal="check" data-stage="' + esc(S.SCHEDULE_POST) +
             '" data-key="' + esc(w.testimonial.key) + '">Instagram scheduled</button>');
    }
    if (!w.checks.email) {
      a.push('<button class="btn btn--sm" data-cal="check" data-stage="' + esc(S.SCHEDULE_EMAIL) +
             '" data-key="' + esc(w.testimonial.key) + '">Email scheduled</button>');
    }
    a.push('<button class="btn btn--sm" data-cal="move" data-key="' + esc(w.testimonial.key) +
           '" data-week="' + esc(w.key) + '">Move</button>');
    if (w.complete && w.scheduledChecks) {
      a.push('<button class="btn btn--sm btn--danger" data-cal="publish" data-key="' +
             esc(w.testimonial.key) + '">Published</button>');
    }
    return a.join("");
  }

  /* ---------- Queue view ---------- */

  function queueView(cal) {
    var rows = [];

    cal.proposals.forEach(function (p) {
      rows.push('<li class="wk wk--proposal">' +
        '<div class="wk__when">' + esc(p.label) + '<div class="sub">proposed</div></div>' +
        '<div class="wk__main"><div class="wk__name">' + esc(p.name) + "</div>" +
        '<div class="sub">' + (p.complete ? "content ready" : p.piecesDone + "/5 pieces") +
        " · not yet assigned</div></div>" +
        '<div class="wk__side">' +
          '<button class="btn btn--sm btn--ok" data-cal="accept" data-key="' + esc(p.testimonial.key) +
          '" data-week="' + esc(p.week) + '">Accept</button>' +
          '<button class="btn btn--sm" data-cal="move" data-key="' + esc(p.testimonial.key) +
          '" data-week="' + esc(p.week) + '">Choose another</button>' +
        "</div></li>");
    });

    // Walk forward from this week so gaps are visible as gaps.
    var last = cal.weekKeys.length ? cal.weekKeys[cal.weekKeys.length - 1] : cal.today;
    var k = cal.today, guard = 0;
    while (k <= last && guard++ < 104) {
      var w = cal.byWeek[k];
      if (w) {
        rows.push('<li class="wk' + (w.atRisk ? " wk--risk" : "") + (w.published ? " wk--done" : "") + '">' +
          '<div class="wk__when">' + esc(w.label) +
            (k === cal.today ? '<div class="sub">this week</div>' : "") + "</div>" +
          '<div class="wk__main">' +
            '<a class="wk__name" href="#/client/' + encodeURIComponent(w.testimonial.key) + '">' +
              esc(w.name) + "</a>" +
            '<div class="wk__badges">' + weekBadges(w) + "</div>" +
          "</div>" +
          '<div class="wk__side">' + weekActions(w) + "</div></li>");
      } else {
        rows.push('<li class="wk wk--empty">' +
          '<div class="wk__when">' + esc(root.CalendarFold.label(k)) + "</div>" +
          '<div class="wk__main"><span class="sub">empty</span></div>' +
          '<div class="wk__side"><button class="btn btn--sm" data-cal="fill" data-week="' + esc(k) +
          '" data-trigger="gap">Suggest a fill</button></div></li>');
      }
      k = root.CalendarFold.addWeeks(k, 1);
    }

    if (!rows.length) rows.push('<li class="wk wk--empty"><div class="wk__main"><span class="sub">Nothing scheduled yet.</span></div></li>');
    return '<ul class="wks">' + rows.join("") + "</ul>";
  }

  /* ---------- Month view ---------- */

  function monthView(cal) {
    var base = new Date(root.CalendarFold.keyToMs(cal.today) + CFG.TZ_OFFSET_MINUTES * 60000);
    var y = base.getUTCFullYear(), m = base.getUTCMonth() + view.months;
    var first = new Date(Date.UTC(y, m, 1));
    var MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

    var weeks = [];
    var cursor = root.CalendarFold.mondayKey(Date.UTC(y, m, 1) - CFG.TZ_OFFSET_MINUTES * 60000);
    for (var i = 0; i < 6; i++) {
      var d = new Date(root.CalendarFold.keyToMs(cursor) + CFG.TZ_OFFSET_MINUTES * 60000);
      if (i > 0 && d.getUTCMonth() !== first.getUTCMonth() && d > first) break;
      weeks.push(cursor);
      cursor = root.CalendarFold.addWeeks(cursor, 1);
    }

    var cells = weeks.map(function (k) {
      var w = cal.byWeek[k];
      var isNow = k === cal.today;
      if (!w) {
        return '<div class="mcell' + (isNow ? " is-now" : "") + '">' +
          '<div class="mcell__wk">' + esc(root.CalendarFold.label(k)) + "</div>" +
          '<div class="mcell__empty">empty</div>' +
          '<button class="btn btn--sm" data-cal="fill" data-week="' + esc(k) + '" data-trigger="gap">Fill</button>' +
          "</div>";
      }
      return '<div class="mcell' + (isNow ? " is-now" : "") + (w.atRisk ? " is-risk" : "") +
        (w.published ? " is-done" : "") + '">' +
        '<div class="mcell__wk">' + esc(root.CalendarFold.label(k)) + "</div>" +
        '<a class="mcell__name" href="#/client/' + encodeURIComponent(w.testimonial.key) + '">' +
          esc(w.name) + "</a>" +
        '<div class="mcell__badges">' + weekBadges(w) + "</div></div>";
    }).join("");

    return '<div class="monthbar">' +
        '<button class="btn btn--sm" data-cal="month" data-delta="-1">←</button>' +
        "<strong>" + MONTHS[((m % 12) + 12) % 12] + " " + (y + Math.floor(m / 12)) + "</strong>" +
        '<button class="btn btn--sm" data-cal="month" data-delta="1">→</button>' +
        '<span class="sub">One testimonial per week. Days are never scheduled.</span>' +
      "</div>" +
      '<div class="mgrid">' + cells + "</div>";
  }

  /* ---------- Shell ---------- */

  function render(state) {
    var cal = root.CalendarFold.build(state);
    root.CalendarView._cal = cal;

    var vacated = cal.vacated.length
      ? '<section class="section section--danger"><h3>A week was freed up</h3>' +
        cal.vacated.map(function (v) {
          return '<p class="section__sub">' + esc(v.label) + " is now empty — " + esc(v.name) +
            " moved to " + esc(root.CalendarFold.label(v.movedTo)) + ". " +
            '<button class="btn btn--sm" data-cal="fill" data-week="' + esc(v.week) +
            '" data-trigger="week-vacated">Suggest a fill</button></p>';
        }).join("") + "</section>"
      : "";

    var toggle =
      '<div class="calbar">' +
        '<div class="qtabs">' +
          '<button class="qtab' + (view.mode === "queue" ? " is-on" : "") + '" data-cal="mode" data-mode="queue">Queue</button>' +
          '<button class="qtab' + (view.mode === "month" ? " is-on" : "") + '" data-cal="mode" data-mode="month">Month</button>' +
        "</div>" +
        '<span class="sub">' + cal.scheduled.length + " scheduled · " +
        cal.proposals.length + " awaiting a week</span>" +
      "</div>";

    return bufferStrip(cal) + vacated + toggle +
      '<section class="section">' +
        (view.mode === "queue" ? queueView(cal) : monthView(cal)) +
      "</section>" +
      '<div id="calResult" class="result"></div>';
  }

  /* ---------- Actions ---------- */

  var wired = false;
  var ctx = { state: null };

  function wire(state) {
    ctx.state = state;
    if (wired) return;
    var host = el("app");
    if (!host) return;
    wired = true;

    host.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-cal]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-cal");
      var cal = root.CalendarView._cal;
      var st = ctx.state;
      function say(m, c) { root.Dialog.feedback(btn, m, c); }

      if (act === "mode")  { view.mode = btn.getAttribute("data-mode"); root.TDApp.rerender(); return; }
      if (act === "month") { view.months += Number(btn.getAttribute("data-delta")); root.TDApp.rerender(); return; }

      if (act === "fill") {
        var week = btn.getAttribute("data-week");
        var s = root.CalendarFold.suggestFill(cal, st, week, btn.getAttribute("data-trigger"));
        if (s.empty) { say("Nothing available to fill " + s.label + " — no ready testimonial and no repost on file.", "warn"); return; }
        var opts = [s.candidate].concat(s.alternatives).slice(0, 12).map(function (c) {
          return { value: c.entry.testimonial.key,
                   label: c.name + "  ·  " + (c.kind === "repost" ? "repost" : c.kind === "ready" ? "ready now" : "not ready yet") };
        });
        root.Dialog.confirm({
          title: "Fill " + s.label,
          body: s.trigger === "week-vacated"
            ? "That week was freed up by a move. Fill it now or leave it empty."
            : "The buffer is below target. Filling this week restores it.",
          consequences: ["Suggested: " + s.candidate.name + " (" + s.candidate.kind + ")"],
          select: { label: "Who goes in this week?", options: opts, placeholder: "— choose —" },
          confirmLabel: "Assign this week"
        }).then(function (res) {
          if (!res) { say("Left empty.", ""); return; }
          var t = st.byKey[res.selected];
          var isRepost = t && t.published;
          writeWeek(btn, say, t, isRepost ? S.SCHEDULE_REPOST : S.SCHEDULE_WEEK_ASSIGNED, week,
                    isRepost ? "Repost scheduled for " + s.label : "Assigned to " + s.label);
        });
        return;
      }

      if (act === "accept") {
        var t1 = st.byKey[btn.getAttribute("data-key")];
        writeWeek(btn, say, t1, S.SCHEDULE_WEEK_ASSIGNED, btn.getAttribute("data-week"),
                  "Accepted the proposed week");
        return;
      }

      if (act === "move") {
        // A move inside Scheduled is a FREE move — no blocking confirmation.
        // It does fire an active notice afterwards, from the vacated list.
        var t2 = st.byKey[btn.getAttribute("data-key")];
        var from = btn.getAttribute("data-week");
        var weeks = [];
        var k = cal.today;
        for (var i = 0; i < 16; i++) {
          var occupied = cal.byWeek[k] && k !== from;
          weeks.push({ value: k, label: root.CalendarFold.label(k) + (occupied ? "  ·  taken by " + cal.byWeek[k].name : (k === from ? "  ·  current" : "  ·  free")) });
          k = root.CalendarFold.addWeeks(k, 1);
        }
        root.Dialog.confirm({
          title: "Move " + (t2.identity.clientName || t2.email),
          body: "Pick the new week. Moving is free; the week they leave becomes empty and the dashboard will offer to fill it.",
          select: { label: "New week", options: weeks, placeholder: "— choose a week —" },
          input: { label: "Why (optional)", placeholder: "e.g. making room for a launch" },
          confirmLabel: "Move"
        }).then(function (res) {
          if (!res) return;
          if (cal.byWeek[res.selected] && res.selected !== from) {
            say(root.CalendarFold.label(res.selected) + " is already taken by " +
                cal.byWeek[res.selected].name + ". One testimonial per week.", "bad");
            return;
          }
          writeWeek(btn, say, t2, S.SCHEDULE_WEEK_ASSIGNED, res.selected,
                    res.value || ("Moved from " + root.CalendarFold.label(from)));
        });
        return;
      }

      if (act === "check") {
        var t3 = st.byKey[btn.getAttribute("data-key")];
        var stage = btn.getAttribute("data-stage");
        var isIG = stage === S.SCHEDULE_POST;
        writeWeek(btn, say, t3, stage, "",
                  isIG ? "Instagram scheduled (reel, carousel and stories)" : "Weekly email scheduled");
        return;
      }

      if (act === "publish") {
        // Scheduled → Published stays a CONFIRMED move (move taxonomy).
        var t4 = st.byKey[btn.getAttribute("data-key")];
        root.Dialog.confirm({
          title: "Mark published",
          body: "This closes the production journey for " + (t4.identity.clientName || t4.email) + ".",
          consequences: [
            "The testimonial leaves the active calendar",
            "There is no reverse event — this cannot be unmarked",
            "They stay alive in Reviews, Raffle and Podcast"
          ],
          tone: "danger", confirmLabel: "Mark published",
          input: { label: "Detail (optional)", placeholder: "e.g. collab post with @client" }
        }).then(function (res) {
          if (!res) { say("Cancelled.", ""); return; }
          writeWeek(btn, say, t4, S.PUBLISH_LIVE, "", res.value);
        });
        return;
      }
    });

    function writeWeek(btn, say, t, stage, week, text) {
      if (!t) { say("Could not find that testimonial.", "bad"); return; }
      btn.disabled = true;
      say("Writing…", "");
      root.EventWriter.appendEvent({
        email: t.email, stage: stage, event: text || "", cycle: t.cycle, week: week || ""
      }).then(function (res) {
        say(res.message, res.verified ? "ok" : "warn");
        btn.disabled = false;
        if (res.verified && root.TDApp) root.TDApp.reload();
      }).catch(function (err) { say(err.message, "bad"); btn.disabled = false; });
    }
  }

  root.CalendarView = { render: render, wire: wire, _view: view, _cal: null };
})(typeof window !== "undefined" ? window : this);
