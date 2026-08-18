/**
 * Testimonial Dashboard — Pipeline Board (Phase 2)
 *
 * The backbone: one card per active testimonial, in its single current
 * position on the journey. Eight active stages plus one terminal column.
 * Replaces the Asana board AND the tracker tab — production tracking is not
 * a separate place, it is the same testimonial in stages 4–6.
 *
 * Stage is read from the fold; nothing is computed here.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("pipeline-board: TDConfig not loaded");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** Time in stage, coloured the way the 21DC tracker ages a row. */
  function ageClass(h) {
    if (!isFinite(h)) return "age--none";
    if (h >= CFG.AGE_RED)   return "age--red";
    if (h >= CFG.AGE_AMBER) return "age--amber";
    return "age--ok";
  }

  function fmtAge(h) {
    if (!isFinite(h)) return "—";
    if (h < 1)  return Math.max(1, Math.round(h * 60)) + "m";
    if (h < 48) return Math.round(h) + "h";
    return Math.round(h / 24) + "d";
  }

  /* ---------- Postponed clients (D-120) ---------- */

  /** Postponed AND the resume day has not arrived — out of play, not late. */
  function isWaiting(t) {
    return !!(t.postponement && t.postponement.pending && t.postponement.waiting);
  }

  function monthName(key) {
    return root.RaffleFold ? root.RaffleFold.monthLabel(key) : (key || "");
  }

  /** The resume day, in the sheet's timezone — never the viewer's. */
  function fmtDay(ts) {
    if (!isFinite(ts)) return "";
    var d = new Date(ts + CFG.TZ_OFFSET_MINUTES * 60000);
    var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return MON[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function dots(t) {
    return CFG.INPUTS.map(function (inp) {
      var s = t.inputs[inp.key];
      var title = inp.label + ": " + s.state + (s.text ? " — " + s.text : "");
      return '<span class="dot dot--' + s.state + '" title="' + esc(title) + '">' +
             esc(inp.short) + "</span>";
    }).join("");
  }

  function card(t) {
    var id = t.identity;
    var name = id.resolved ? id.clientName : t.email;
    var badges = "";
    if (t.cycle > 1)            badges += '<span class="badge badge--cycle">part ' + t.cycle + "</span>";
    if (t.stage.inferred)       badges += '<span class="badge badge--warn" title="No kickoff event exists; inferred from the fan-out">inferred</span>';
    if (!id.resolved)           badges += '<span class="badge badge--bad">unresolved</span>';
    else if (id.source === "mastersheet") badges += '<span class="badge badge--warn" title="Resolved from Mastersheet Data — no longer an active client">former</span>';
    if (t.flags.length)         badges += '<span class="badge badge--bad">' + t.flags.length + " flag" + (t.flags.length > 1 ? "s" : "") + "</span>";
    if (t.readyForReview)       badges += '<span class="badge badge--ok">ready</span>';
    // The client said yes and asked for a later month — not declined, not
    // dropped, and deliberately still in their own column (D-120).
    if (isWaiting(t))           badges += '<span class="badge badge--wait">waiting for ' +
                                  esc(monthName(t.postponement.month)) + "</span>";

    var mid = "";
    // Collecting only. Under the old ladder Invited meant the kickoff had
    // fired, so inputs could already be arriving and the dots were the point.
    // Now Invited means the client said yes and nothing has been sent — no
    // folder, no fan-out, so it is 0/6 by construction. A row of empty dots
    // that can only ever read 0/6 informs nothing.
    if (t.stage.key === "collecting") {
      mid = '<div class="card__dots">' + dots(t) + "</div>" +
            '<div class="card__meta">' + t.inputsArrived + "/" + CFG.INPUTS.length + " inputs</div>";
    } else if (t.stage.key === "producing" || t.stage.key === "review") {
      mid = '<div class="card__bar"><span style="width:' +
            Math.round(100 * t.piecesDone / CFG.PIECES.length) + '%"></span></div>' +
            '<div class="card__meta">' + t.piecesDone + "/" + CFG.PIECES.length + " pieces</div>";
    } else if (t.stage.terminal) {
      mid = '<div class="card__meta">' + esc(t.stage.type) + " — " + esc(t.stage.note || "no note") + "</div>";
    }

    // The age counter STOPS while they wait. A number that keeps climbing on
    // someone who asked to be left until next month reads as neglect, and the
    // whole point of the postponement is that they are not late.
    var age = isWaiting(t)
      ? '<div class="card__age age--none">paused · resumes ' + esc(fmtDay(t.postponement.resumeDate)) + "</div>"
      : '<div class="card__age ' + ageClass(t.hoursInStage) + '">' + fmtAge(t.hoursInStage) + " in stage</div>";

    return '<a class="card card--client' + (isWaiting(t) ? " card--paused" : "") +
      '" href="#/client/' + encodeURIComponent(t.key) + '">' +
      '<div class="card__name">' + esc(name) + "</div>" +
      '<div class="card__coach">' + esc(id.coach || "no coach") + "</div>" +
      (badges ? '<div class="card__badges">' + badges + "</div>" : "") +
      mid +
      age +
      "</a>";
  }

  /**
   * The header separates the two, e.g. "Outreach 1 · 1 waiting for Sep 2026".
   * A postponed client still lives in this column, but counting them among the
   * active ones would overstate what is actually in play this month.
   */
  function column(stage, items) {
    var waiting = items.filter(isWaiting);
    var months = {};
    waiting.forEach(function (t) { if (t.postponement.month) months[t.postponement.month] = 1; });
    var keys = Object.keys(months);

    var count = (items.length - waiting.length) +
      (waiting.length
        ? ' <span class="col__waiting">· ' + waiting.length + " waiting" +
          (keys.length === 1 ? " for " + esc(monthName(keys[0])) : "") + "</span>"
        : "");

    return '<section class="col">' +
      '<header class="col__head"><span class="col__title">' + esc(stage.label) + "</span>" +
      '<span class="col__count">' + count + "</span></header>" +
      (stage.ball ? '<div class="col__ball">ball: ' + esc(stage.ball) + "</div>" : "") +
      '<div class="col__body">' +
      (items.length ? items.map(card).join("") : '<p class="col__empty">—</p>') +
      "</div></section>";
  }

  /**
   * @param {Object} state  StateBuilder.build() output
   * @param {Object} opts   { coach: string filter, showClosed: bool }
   */
  function render(state, opts) {
    opts = opts || {};
    var list = state.testimonials.filter(function (t) {
      if (opts.coach && t.identity.coach !== opts.coach) return false;
      return true;
    });

    var by = {};
    list.forEach(function (t) { (by[t.stage.key] || (by[t.stage.key] = [])).push(t); });
    Object.keys(by).forEach(function (k) {
      by[k].sort(function (a, b) {
        // Paused clients sink to the bottom: the top of a column is what needs
        // attention, and they explicitly do not.
        if (isWaiting(a) !== isWaiting(b)) return isWaiting(a) ? 1 : -1;
        var av = isFinite(a.hoursInStage) ? a.hoursInStage : -1;
        var bv = isFinite(b.hoursInStage) ? b.hoursInStage : -1;
        return bv - av;                        // oldest in stage first — most at risk
      });
    });

    var cols = CFG.PIPELINE.map(function (s) { return column(s, by[s.key] || []); }).join("");

    var extras = "";
    var closed = by[CFG.TERMINAL.key] || [];
    var indet  = by[CFG.INDETERMINATE.key] || [];
    if (closed.length || indet.length) {
      extras = '<div class="board board--extra">' +
        (closed.length ? column(CFG.TERMINAL, closed) : "") +
        (indet.length  ? column(CFG.INDETERMINATE, indet) : "") +
        "</div>";
    }

    var coaches = {};
    state.testimonials.forEach(function (t) { if (t.identity.coach) coaches[t.identity.coach] = 1; });
    var coachOpts = ['<option value="">All coaches</option>'].concat(
      Object.keys(coaches).sort().map(function (c) {
        return '<option value="' + esc(c) + '"' + (opts.coach === c ? " selected" : "") + ">" + esc(c) + "</option>";
      })
    ).join("");

    return '<div class="boardbar">' +
        '<button id="addClient" class="btn btn--sm">+ Add client to Nominated</button>' +
        '<label for="coachFilter">Filter</label> <select id="coachFilter">' + coachOpts + "</select>" +
        '<span class="boardbar__note">' + list.length + " active · sorted by longest in stage</span>" +
      "</div>" +
      '<div class="board">' + cols + "</div>" + extras +
      '<div id="boardResult" class="result"></div>';
  }

  /**
   * Which cycle a new nomination opens for this client.
   *
   * A testimonial is (email, cycle). A client can have more than one over
   * time — a re-nomination opens the next cycle — but never two at once, so
   * an active cycle blocks a new one rather than silently forking.
   */
  function nextCycleFor(state, email) {
    var mine = state.testimonials.filter(function (t) { return t.email === email; });
    if (!mine.length) return { ok: true, cycle: 1 };

    var active = mine.filter(function (t) {
      return !t.stage.terminal && t.stage.key !== "published";
    });
    if (active.length) {
      return { ok: false, reason: "already has an active testimonial (cycle " +
               active[0].cycle + ", " + active[0].stage.label + ")" };
    }
    var max = mine.reduce(function (m, t) { return Math.max(m, t.cycle); }, 0);
    return { ok: true, cycle: max + 1 };
  }

  var wired = false;
  var ctx = { state: null };

  function wire(state) {
    ctx.state = state;
    var cf = document.getElementById("coachFilter");
    if (cf) cf.addEventListener("change", function () {
      root.PipelineBoard._opts.coach = cf.value;
      if (root.TDApp) root.TDApp.rerender();
    });

    if (wired) return;
    var host = document.getElementById("app");
    if (!host) return;
    wired = true;

    host.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("#addClient") : null;
      if (!btn) return;
      var st = ctx.state;
      var out = document.getElementById("boardResult");
      function say(m, c) { root.Dialog.feedback(btn, m, c); }

      if (!root.EventWriter.getActor()) {
        say("Pick who you are in the top bar first — every action is attributed.", "bad");
        return;
      }

      // Roster only. Identity is the master key and is never guessed, so a
      // new card can only be opened for someone the roster resolves.
      var taken = {};
      st.testimonials.forEach(function (t) {
        if (!t.stage.terminal && t.stage.key !== "published") taken[t.email] = t;
      });
      var options = (st.roster || [])
        .filter(function (r) { return !taken[r.email]; })
        .sort(function (a, b) { return a.clientName.localeCompare(b.clientName); })
        .map(function (r) {
          return { value: r.email, label: r.clientName + "  ·  " + (r.coach || "no coach") };
        });

      if (!options.length) { say("Every active roster client already has a live testimonial.", "warn"); return; }

      root.Dialog.confirm({
        title: "Add a client to Nominated",
        body: "The coach nominated them and you are logging it. This only opens the card — nothing is sent to anyone.",
        select: { label: "Client (from the Active Client Roster)", options: options,
                  placeholder: "— choose a client —" },
        input: { label: "Note (optional)", placeholder: "e.g. nominated by Brent in Slack" },
        confirmLabel: "Add to Nominated"
      }).then(function (res) {
        if (!res) return;
        var email = res.selected;
        var who = (st.roster || []).filter(function (r) { return r.email === email; })[0];
        var next = nextCycleFor(st, email);
        if (!next.ok) { say(who.clientName + " " + next.reason + ".", "bad"); return; }

        say("Adding " + who.clientName + "…", "");
        root.EventWriter.appendEvent({
          email: email,
          stage: root.TDConfig.STAGES.NOMINATION_LOGGED,
          event: res.value || ("Nomination logged for " + who.clientName),
          cycle: next.cycle
        }).then(function (r) {
          say(r.message + (next.cycle > 1 ? "  Opened cycle " + next.cycle + "." : ""), r.verified ? "ok" : "warn");
          if (r.verified && root.TDApp) root.TDApp.reload();
        }).catch(function (err) { say(err.message, "bad"); });
      });
    });
  }

  root.PipelineBoard = {
    render: render, wire: wire, nextCycleFor: nextCycleFor,
    ageClass: ageClass, fmtAge: fmtAge, dots: dots,
    _opts: { coach: "" }
  };
})(typeof window !== "undefined" ? window : this);
