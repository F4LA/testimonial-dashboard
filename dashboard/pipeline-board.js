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

    var mid = "";
    if (t.stage.key === "collecting" || t.stage.key === "invited") {
      mid = '<div class="card__dots">' + dots(t) + "</div>" +
            '<div class="card__meta">' + t.inputsArrived + "/" + CFG.INPUTS.length + " inputs</div>";
    } else if (t.stage.key === "producing" || t.stage.key === "review") {
      mid = '<div class="card__bar"><span style="width:' +
            Math.round(100 * t.piecesDone / CFG.PIECES.length) + '%"></span></div>' +
            '<div class="card__meta">' + t.piecesDone + "/" + CFG.PIECES.length + " pieces</div>";
    } else if (t.stage.terminal) {
      mid = '<div class="card__meta">' + esc(t.stage.type) + " — " + esc(t.stage.note || "no note") + "</div>";
    }

    return '<a class="card card--client" href="#/client/' + encodeURIComponent(t.key) + '">' +
      '<div class="card__name">' + esc(name) + "</div>" +
      '<div class="card__coach">' + esc(id.coach || "no coach") + "</div>" +
      (badges ? '<div class="card__badges">' + badges + "</div>" : "") +
      mid +
      '<div class="card__age ' + ageClass(t.hoursInStage) + '">' + fmtAge(t.hoursInStage) + " in stage</div>" +
      "</a>";
  }

  function column(stage, items) {
    return '<section class="col">' +
      '<header class="col__head"><span class="col__title">' + esc(stage.label) + "</span>" +
      '<span class="col__count">' + items.length + "</span></header>" +
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
        '<label for="coachFilter">Filter</label> <select id="coachFilter">' + coachOpts + "</select>" +
        '<span class="boardbar__note">' + list.length + " active · sorted by longest in stage</span>" +
      "</div>" +
      '<div class="board">' + cols + "</div>" + extras;
  }

  root.PipelineBoard = { render: render, ageClass: ageClass, fmtAge: fmtAge, dots: dots };
})(typeof window !== "undefined" ? window : this);
