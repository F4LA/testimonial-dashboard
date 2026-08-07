/**
 * Testimonial Dashboard — Client Card (Phase 2)
 *
 * Click a client and see everything about them in one place. Five blocks,
 * all read from the same event log (spec §4.2):
 *
 *   1 Header               — name, coach, stage, cycle, links
 *   2 Input checklist      — the six Collecting inputs, four states each
 *   3 Production checklist — the five pieces; pasting the link marks it done
 *   4 Timeline             — automatic events and human notes, in order
 *   5 Recognitions         — review / raffle / podcast, kept strictly separate
 *
 * Every action here appends one event. Nothing is ever updated in place.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("client-card: TDConfig not loaded");
  var S = CFG.STAGES;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(id) { return document.getElementById(id); }

  function fmtWhen(ts) {
    if (!isFinite(ts)) return "—";
    // Render in the sheet's timezone so the card always agrees with the log.
    var d = new Date(ts + CFG.TZ_OFFSET_MINUTES * 60000);
    var M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return d.getUTCDate() + " " + M[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " +
           d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  }

  var STATE_LABEL = {
    received: "received", partial: "partial", flagged: "needs review", missing: "missing"
  };

  /* ---------- 1 · Header ---------- */

  function header(t) {
    var id = t.identity;
    var links = [];
    if (t.videoLink) {
      links.push('<a class="link" href="' + esc(t.videoLink) + '" target="_blank" rel="noopener">Drive folder 03 (client video) ↗</a>');
    } else {
      links.push('<span class="link link--none" title="The engine logs the folder name, not its URL. The link is surfaced to the Signal tab at fan-out.">Drive folder — link not surfaced yet</span>');
    }
    var pieceLinks = CFG.PIECES.filter(function (p) { return t.pieces[p.key].link; });
    pieceLinks.forEach(function (p) {
      links.push('<a class="link" href="' + esc(t.pieces[p.key].link) + '" target="_blank" rel="noopener">' + esc(p.label) + " ↗</a>");
    });

    var idLine = id.resolved
      ? esc(id.coach || "no coach") +
        (id.source === "mastersheet" ? ' <span class="badge badge--warn">former client</span>' : "") +
        (id.coachSlack ? ' <span class="sub">· ' + esc(id.coachSlack) + "</span>" : "")
      : '<span class="badge badge--bad">identity unresolved</span> <span class="sub">' + esc(id.reason) + "</span>";

    return '<section class="section card-header">' +
      '<a class="backlink" href="#/board">← Board</a>' +
      "<h2>" + esc(id.resolved ? id.clientName : t.email) +
        (t.cycle > 1 ? ' <span class="badge badge--cycle">part ' + t.cycle + "</span>"
                     : ' <span class="badge badge--muted">cycle 1</span>') + "</h2>" +
      '<div class="card-header__id">' + idLine + "</div>" +
      '<div class="card-header__meta"><code>' + esc(t.email) + "</code></div>" +
      '<div class="card-header__stage">' +
        '<span class="stagepill stagepill--' + esc(t.stage.key) + '">' + esc(t.stage.label) + "</span>" +
        (t.stage.inferred ? ' <span class="badge badge--warn">inferred from fan-out</span>' : "") +
        '<span class="sub"> since ' + esc(fmtWhen(t.stage.at)) + " · " +
        root.PipelineBoard.fmtAge(t.hoursInStage) + " in stage</span>" +
      "</div>" +
      '<div class="card-header__links">' + links.join("") + "</div>" +
      "</section>";
  }

  /* ---------- 2 · Input checklist ---------- */

  function inputsBlock(t) {
    var rows = CFG.INPUTS.map(function (inp) {
      var s = t.inputs[inp.key];
      var action = "";
      if (s.state === "missing" && inp.markStage) {
        action = '<button class="btn btn--sm" data-act="mark-input" data-input="' + esc(inp.key) + '">Mark received</button>';
      } else if (s.state === "flagged") {
        action = '<button class="btn btn--sm" data-act="resolve-flag" data-input="' + esc(inp.key) + '">Resolve</button>';
      } else if (s.state === "missing" && inp.auto) {
        action = '<span class="sub">waiting on the engine</span>';
      }
      return "<tr>" +
        '<td><span class="dot dot--' + s.state + '">' + esc(inp.short) + "</span> " + esc(inp.label) +
          '<div class="sub">' + esc(inp.owner) + (inp.auto ? " · automatic" : " · manual") + "</div></td>" +
        '<td><span class="state state--' + s.state + '">' + esc(STATE_LABEL[s.state]) + "</span>" +
          (s.resolved ? ' <span class="badge badge--ok">resolved</span>' : "") + "</td>" +
        '<td class="evtext">' + (s.text ? esc(s.text) : '<span class="sub">—</span>') +
          (s.by ? '<div class="sub">by ' + esc(s.by) + "</div>" : "") + "</td>" +
        '<td class="sub">' + esc(fmtWhen(s.at)) + "</td>" +
        "<td>" + action + "</td>" +
        "</tr>";
    }).join("");

    var lock = t.collectionComplete
      ? '<span class="badge badge--ok">collection complete</span>'
      : '<button class="btn" data-act="collection-complete">Mark collection complete →  Producing</button>';

    return '<section class="section">' +
      "<h3>Input checklist <span class='sub'>· " + t.inputsArrived + "/" + CFG.INPUTS.length + " arrived</span></h3>" +
      '<p class="section__sub">Four of six are written by the engine. The client video is not — nothing watches Drive folder 03, so Gaby marks it after checking.</p>' +
      '<table class="table"><thead><tr><th>Input</th><th>State</th><th>Detail</th><th>When</th><th></th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>" +
      '<div class="actions">' + lock +
      '<span class="sub">This check is the lock that unlocks Producing.</span></div>' +
      "</section>";
  }

  /* ---------- 3 · Production checklist ---------- */

  function piecesBlock(t) {
    var rows = CFG.PIECES.map(function (p) {
      var s = t.pieces[p.key];
      if (s.done) {
        return "<tr>" +
          "<td>" + esc(p.label) + '<div class="sub">' + esc(p.owner) + "</div></td>" +
          '<td><span class="state state--received">done</span></td>' +
          '<td class="evtext">' + (s.link
              ? '<a href="' + esc(s.link) + '" target="_blank" rel="noopener">' + esc(s.link) + "</a>"
              : esc(s.text)) +
            (s.text && s.link && s.text !== s.link ? '<div class="sub">' + esc(s.text) + "</div>" : "") +
            '<div class="sub">by ' + esc(s.by || "—") + " · " + esc(fmtWhen(s.at)) + "</div></td>" +
          "<td></td></tr>";
      }
      return "<tr>" +
        "<td>" + esc(p.label) + '<div class="sub">' + esc(p.owner) + "</div></td>" +
        '<td><span class="state state--missing">pending</span></td>' +
        '<td><input type="text" class="piece-input" data-piece="' + esc(p.key) +
          '" placeholder="Paste the link to the finished piece + any comment"></td>' +
        '<td><button class="btn btn--sm" data-act="mark-piece" data-piece="' + esc(p.key) + '">Mark done</button></td>' +
        "</tr>";
    }).join("");

    var approval = "";
    if (t.approved) {
      approval = '<span class="badge badge--ok">approved</span>';
    } else if (t.allPiecesDone) {
      approval =
        '<input type="text" id="approvalNote" placeholder="Feedback (required to send back)">' +
        '<button class="btn btn--ok" data-act="approve">Approve</button>' +
        '<button class="btn" data-act="send-back">Send back</button>';
    } else {
      approval = '<span class="sub">Approval opens when all five pieces have their link.</span>';
    }

    return '<section class="section">' +
      "<h3>Production checklist <span class='sub'>· " + t.piecesDone + "/" + CFG.PIECES.length + "</span></h3>" +
      '<p class="section__sub">Pasting the link is what marks the piece done — one gesture, not two. ' +
      "When all five have their link the testimonial is ready for Joey, with every link already gathered.</p>" +
      '<table class="table"><thead><tr><th>Piece</th><th>State</th><th>Link + comment</th><th></th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>" +
      '<div class="actions">' + approval + "</div>" +
      (t.sentBack ? '<p class="sub">Last sent back — see the timeline for the feedback.</p>' : "") +
      "</section>";
  }

  /* ---------- 4 · Timeline ---------- */

  function timeline(t) {
    var rows = t.events.slice().reverse().map(function (e) {
      var who = root.StateBuilder.actorOf(e);
      var isFlagRow = root.StateBuilder.isFlag(e);
      return '<li class="tl__item ' + (who ? "tl__item--manual" : "tl__item--auto") + (isFlagRow ? " tl__item--flag" : "") + '">' +
        '<div class="tl__when">' + esc(fmtWhen(e.ts)) + "</div>" +
        '<div class="tl__body"><span class="tl__stage">' + esc(e.stage) + "</span>" +
          '<span class="tl__src">' + (who ? esc(who) : "engine") + "</span>" +
          (e.event ? '<div class="tl__text">' + esc(e.event) + "</div>" : "") +
        "</div></li>";
    }).join("");

    return '<section class="section">' +
      "<h3>Timeline <span class='sub'>· " + t.events.length + " events</span></h3>" +
      '<div class="actions actions--note">' +
        '<input type="text" id="noteText" placeholder="Write a note — it joins the timeline">' +
        '<button class="btn" data-act="note">Add note</button>' +
      "</div>" +
      '<ul class="tl">' + rows + "</ul>" +
      "</section>";
  }

  /* ---------- 5 · Recognitions ---------- */

  function recognitions(t) {
    var r = t.recognitions;
    function line(label, ev, empty) {
      return "<tr><td>" + esc(label) + "</td><td>" +
        (ev ? '<span class="state state--received">' + esc(ev.event || "yes") + "</span>" +
              '<div class="sub">' + esc(fmtWhen(ev.ts)) + "</div>"
            : '<span class="sub">' + esc(empty) + "</span>") + "</td></tr>";
    }
    var podcastKeys = Object.keys(r.podcast);
    var podcastState = podcastKeys.length ? podcastKeys[podcastKeys.length - 1].replace("PODCAST_", "").toLowerCase() : "";

    return '<section class="section">' +
      "<h3>Recognitions</h3>" +
      '<p class="section__sub">Review, raffle, and podcast are kept strictly separate and never merged. These views are built in Phase 5; the card shows their status.</p>' +
      '<table class="table"><tbody>' +
        line("Review — self-reported", r.reviewSelfReported, "not reported") +
        line("Review — confirmed",     r.reviewConfirmed,    "not confirmed") +
        line("Raffle — winner",        r.raffleWinner,       "—") +
        line("Client of the month",    r.cotmWinner,         "—") +
        "<tr><td>Podcast</td><td>" +
          (podcastState ? '<span class="state state--received">' + esc(podcastState) + "</span>"
                        : '<span class="sub">not invited</span>') + "</td></tr>" +
      "</tbody></table></section>";
  }

  /* ---------- Terminal ---------- */

  function terminalBlock(t) {
    if (t.stage.terminal) {
      return '<section class="section section--terminal">' +
        "<h3>Closed — " + esc(t.stage.type) + "</h3>" +
        '<p class="evtext">' + esc(t.stage.note || "no note recorded") + "</p>" +
        '<p class="sub">They stay in history, so a coach can re-nominate them later and the outcome is data. ' +
        "A re-nomination opens cycle " + (t.cycle + 1) + ".</p></section>";
    }
    return '<section class="section section--danger">' +
      "<h3>Close this testimonial</h3>" +
      '<p class="section__sub">A client who says no or goes silent leaves the active board but stays in history. A note is required.</p>' +
      '<div class="actions">' +
        '<input type="text" id="closeNote" placeholder="What happened? (required)">' +
        '<button class="btn" data-act="declined">Declined</button>' +
        '<button class="btn" data-act="dropped">Dropped</button>' +
      "</div></section>";
  }

  /* ---------- Stage advance (no calendar UI — Phase 4 adds that) ---------- */

  function advanceBlock(t) {
    if (t.stage.terminal) return "";
    var btns = [];
    if (t.stage.key === "indeterminate" || t.stage.key === "nominated") {
      btns.push(['warmup', 'Coach warm-up done', S.NOMINATION_WARMUP]);
    }
    if (!t.lastByStage[root.StateBuilder.normStage(S.NOMINATION_LOGGED)]) {
      btns.push(['nominate', 'Log nomination', S.NOMINATION_LOGGED]);
    }
    if (t.stage.key === "nominated") btns.push(['outreach', 'Outreach sent', S.OUTREACH_SENT]);
    if (t.stage.key === "outreach")  btns.push(['accepted', 'Client accepted', S.OUTREACH_ACCEPTED]);
    if (t.stage.key === "outreach" || t.stage.key === "nominated") {
      btns.push(['kickoff', 'Kickoff email sent', S.INVITE_KICKOFF]);
    }
    if (t.approved && t.stage.key !== "scheduled" && t.stage.key !== "published") {
      btns.push(['week', 'Assign a week', S.SCHEDULE_WEEK_ASSIGNED]);
    }
    if (t.stage.key === "scheduled") {
      btns.push(['post', 'Post scheduled', S.SCHEDULE_POST]);
      btns.push(['email', 'Email scheduled', S.SCHEDULE_EMAIL]);
      btns.push(['publish', 'Published', S.PUBLISH_LIVE]);
    }
    if (!btns.length) return "";

    return '<section class="section">' +
      "<h3>Advance</h3>" +
      '<p class="section__sub">Front-of-pipeline steps have no engine events — the dashboard is what creates them. Calendar placement gets its own view in Phase 4.</p>' +
      '<div class="actions">' +
        '<input type="text" id="advanceNote" placeholder="Optional detail">' +
        btns.map(function (b) {
          return '<button class="btn btn--sm" data-act="advance" data-stage="' + esc(b[2]) + '">' + esc(b[1]) + "</button>";
        }).join("") +
      "</div></section>";
  }

  /* ---------- Render + wire ---------- */

  function render(state, key) {
    var t = state.byKey[key];
    if (!t) {
      return '<section class="section"><a class="backlink" href="#/board">← Board</a>' +
             "<h2>Not found</h2><p class='sub'>No testimonial for <code>" + esc(key) + "</code>.</p></section>";
    }
    return header(t) + inputsBlock(t) + piecesBlock(t) + advanceBlock(t) +
           timeline(t) + recognitions(t) + terminalBlock(t) +
           '<div id="cardResult" class="result"></div>';
  }

  function wire(state, key) {
    var t = state.byKey[key];
    if (!t) return;
    var host = el("app");
    if (!host) return;

    host.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var out = el("cardResult");

      function say(msg, cls) { if (out) { out.textContent = msg; out.className = "result " + (cls || ""); } }
      function val(id) { var n = el(id); return n ? n.value.trim() : ""; }

      var stage, text;

      if (act === "mark-input") {
        var ik = btn.getAttribute("data-input");
        var inp = CFG.INPUTS.filter(function (x) { return x.key === ik; })[0];
        if (!inp || !inp.markStage) return;
        stage = inp.markStage;
        text  = inp.label + " marked received from the dashboard";

      } else if (act === "resolve-flag") {
        var rk = btn.getAttribute("data-input");
        var rinp = CFG.INPUTS.filter(function (x) { return x.key === rk; })[0];
        stage = S.COLLECTION_FLAG_RESOLVED;
        // Convention: the Event text starts with the input label so the fold
        // can tell which flag this resolves.
        text  = (rinp ? rinp.label : rk) + " — checked manually and confirmed present";

      } else if (act === "collection-complete") {
        stage = S.COLLECTION_COMPLETE;
        text  = "Everfit collection done — all required inputs present";

      } else if (act === "mark-piece") {
        var pk = btn.getAttribute("data-piece");
        var field = host.querySelector('.piece-input[data-piece="' + pk + '"]');
        var v = field ? field.value.trim() : "";
        if (!v) { say("Paste the link to the finished piece first — the link is what marks it done.", "bad"); return; }
        var piece = CFG.PIECES.filter(function (x) { return x.key === pk; })[0];
        stage = piece.stage;
        text  = v;

      } else if (act === "approve") {
        stage = S.APPROVAL_APPROVED;
        text  = val("approvalNote") || "Approved";

      } else if (act === "send-back") {
        text = val("approvalNote");
        if (!text) { say("Feedback is required when sending a testimonial back.", "bad"); return; }
        stage = S.APPROVAL_SENT_BACK;

      } else if (act === "note") {
        text = val("noteText");
        if (!text) { say("Write the note first.", "bad"); return; }
        stage = S.NOTE;

      } else if (act === "declined" || act === "dropped") {
        text = val("closeNote");
        if (!text) { say("A note explaining what happened is required.", "bad"); return; }
        stage = (act === "declined") ? S.PIPELINE_DECLINED : S.PIPELINE_DROPPED;

      } else if (act === "advance") {
        stage = btn.getAttribute("data-stage");
        text  = val("advanceNote") || "";

      } else {
        return;
      }

      btn.disabled = true;
      say("Writing…", "");
      root.EventWriter.appendEvent({ email: t.email, stage: stage, event: text, cycle: t.cycle })
        .then(function (res) {
          say(res.message, res.verified ? "ok" : "warn");
          btn.disabled = false;
          if (res.verified && root.TDApp) root.TDApp.reload();
        })
        .catch(function (err) {
          say(err.message, "bad");
          btn.disabled = false;
        });
    });
  }

  root.ClientCard = { render: render, wire: wire, fmtWhen: fmtWhen };
})(typeof window !== "undefined" ? window : this);
