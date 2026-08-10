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

  /**
   * What gates Collecting → Producing.
   *
   * Spec §4.1 stage 4 conjoins "all required inputs present" with Gaby's
   * check. "Required" is NOT "all six":
   *
   *   client video  — REQUIRED. No video, no testimonial.
   *   Everfit data  — REQUIRED. Gaby's manual pull.
   *   photos        — REQUIRED. Gaby's manual pull.
   *   Meet · Looms  — NEVER gate. The engine fetched whatever existed and
   *                   flagged the rest; a flag there frequently means the
   *                   client simply has none (no Loom was ever recorded, no
   *                   Gemini note carries their email). Nobody can resolve
   *                   that, so gating on it would strand the testimonial in
   *                   Collecting permanently.
   *
   * The asymmetry that makes this safe: a MANUAL input can always be
   * satisfied by the person, an AUTOMATIC one cannot. Gating only on manual
   * inputs plus the video can never produce a state no human can exit.
   *
   * The two manual dots are the precondition; `Collection — complete` stays
   * its own explicit event — the lock is Gaby's judgment that her part is
   * done, not a side effect of marking a file received.
   */
  function collectionLock(t) {
    if (t.collectionComplete) return { done: true, blockers: [] };
    var arrived = root.StateBuilder.arrived;
    var blockers = [];
    if (!arrived(t.inputs.video.state))   blockers.push("client video");
    if (!arrived(t.inputs.everfit.state)) blockers.push("Everfit data");
    if (!arrived(t.inputs.photos.state))  blockers.push("photos");
    return { done: false, blockers: blockers };
  }

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

    var lock = collectionLock(t);
    var lockHtml;
    if (lock.done) {
      lockHtml = '<span class="badge badge--ok">collection complete</span>' +
        '<span class="sub">Producing unlocked.</span>';
    } else if (lock.blockers.length) {
      lockHtml = '<button class="btn" data-act="collection-complete" disabled>Mark collection complete → Producing</button>' +
        '<span class="sub">Waiting on: <strong>' + esc(lock.blockers.join(", ")) + "</strong></span>";
    } else {
      lockHtml = '<button class="btn" data-act="collection-complete">Mark collection complete → Producing</button>' +
        '<span class="sub">The client video is in and your manual pulls are marked.</span>';
    }

    return '<section class="section">' +
      "<h3>Input checklist <span class='sub'>· " + t.inputsArrived + "/" + CFG.INPUTS.length + " arrived</span></h3>" +
      '<p class="section__sub">Four of six are written by the engine. The client video is not — nothing watches Drive folder 03, so Gaby marks it after checking.</p>' +
      '<table class="table"><thead><tr><th>Input</th><th>State</th><th>Detail</th><th>When</th><th></th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>" +
      '<div class="actions">' + lockHtml + "</div>" +
      '<p class="note">Meet notes and Looms never hold up the pipeline. The engine fetched what existed and flagged what did not — a flag there often just means <em>this client has none</em>, which nobody can resolve. Only the client video and the human pulls gate Producing.</p>' +
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

    /* --- Raffle compliance (Phase 5, computed live, read-only) --- */
    var comp = root.RaffleFold.compliance(t);
    var m = root.RaffleFold.monthOf(t);
    var MARK = { "met": "✓", "not-met": "✕", "unclear": "?", "missing": "·" };
    var KIND = { "met": "ok", "not-met": "bad", "unclear": "warn", "missing": "muted" };

    var condRows = comp.conditions.map(function (c) {
      return "<tr><td>" + c.n + " · " + esc(c.label) + "</td><td>" +
        '<span class="cond cond--' + KIND[c.state] + '"><span class="cond__m">' + MARK[c.state] + "</span>" +
        esc(c.state === "missing" ? c.empty : (c.answer || c.state)) + "</span>" +
        (isFinite(c.at) ? '<div class="sub">' + esc(fmtWhen(c.at)) + "</div>" : "") +
        "</td></tr>";
    }).join("");

    /* A past win outranks live compliance in the heading.
       Without this the card can say "2/3 — does not qualify yet" directly above
       a recorded raffle win, which is the same kind of contradiction as the two
       review signals (fixed in 089dd9e): both statements are true, but read
       together they look like a bug. The win is a frozen record of a past
       month; the conditions below are live and about today. */
    var wonEv = r.raffleWinner;
    var verdict = wonEv
      ? '<span class="badge badge--ok">won the raffle</span>'
      : comp.qualifies
        ? '<span class="badge badge--ok">qualifies for the raffle</span>'
        : '<span class="badge badge--muted">' + comp.met + "/" + comp.total + " — does not qualify yet</span>";

    var wonNote = wonEv
      ? '<p class="section__sub"><strong>Won the raffle on ' + esc(fmtWhen(wonEv.ts)) + ".</strong> " +
        "That is settled and frozen in the snapshot below. The three conditions underneath are " +
        "<strong>live</strong> and describe today, so they can read differently from the day of the draw — " +
        "and a past win is never re-opened by a later form answer. " +
        "The person does not enter another raffle." +
        '</p><details class="snap"><summary>The snapshot taken at the draw</summary><pre>' +
        esc(wonEv.event || "") + "</pre></details>"
      : "";

    var raffleNote = comp.needsReview
      ? '<p class="section__sub"><strong>' + esc(comp.unclear[0].label) + ' came back as "' +
        esc(comp.unclear[0].answer) + '"</strong> — that is neither a yes nor a no, so it blocks entry ' +
        "until someone reads it. It is not being treated as a refusal.</p>"
      : "";

    /* The self-report shown below is the SAME engine-owned event the raffle
       reads — one event, two readers, which is not merging. It deliberately
       does NOT read the dashboard-writable `Review — self-reported`: nothing
       writes that, and showing it here read "not reported" directly beneath a
       raffle block saying the client had self-reported (D-098). */
    var rc = comp.conditions.filter(function (c) { return c.key === "review"; })[0];
    var reviewSelfRow =
      "<tr><td>Review — self-reported<div class=\"sub\">the client's own form answer</div></td><td>" +
      (rc.state === "missing"
        ? '<span class="sub">' + esc(rc.empty) + "</span>"
        : '<span class="cond cond--' + KIND[rc.state] + '"><span class="cond__m">' + MARK[rc.state] +
          "</span>" + esc(rc.answer) + "</span>" +
          (isFinite(rc.at) ? '<div class="sub">' + esc(fmtWhen(rc.at)) + "</div>" : "")) +
      "</td></tr>";

    var raffleBlock =
      '<h4 class="rec__h">Raffle — ' + esc(root.RaffleFold.monthLabel(m.month)) +
        (m.moved ? " <span class='badge badge--warn'>moved from " +
          esc(root.RaffleFold.monthLabel(m.from)) + "</span>" : "") + " " + verdict + "</h4>" +
      '<p class="section__sub">Three conditions, computed live. The review condition reads the client\'s ' +
      "<strong>self-report</strong>, never a confirmation (a real reviewer who cannot be matched by name is " +
      "never excluded). Podcast consent is not a condition.</p>" +
      wonNote +
      raffleNote +
      '<table class="table"><tbody>' + condRows + "</tbody></table>" +
      '<p class="section__sub"><a href="#/raffle">See everyone in ' +
        esc(root.RaffleFold.monthLabel(m.month)) + "'s raffle →</a></p>";

    return '<section class="section">' +
      "<h3>Recognitions</h3>" +
      '<p class="section__sub">Review, raffle, and podcast are kept strictly separate and never merged.</p>' +
      raffleBlock +
      '<h4 class="rec__h">Review · podcast · client of the month</h4>' +
      '<p class="section__sub">The two review signals are <strong>never merged</strong> (D-066). The self-report is the ' +
      "client's own form answer and is what opens the raffle; confirmation is a human matching a real review by its " +
      "public display name — an audit layer that never gates entry, so a genuine reviewer who cannot be matched is " +
      "never excluded.</p>" +
      '<table class="table"><tbody>' +
        reviewSelfRow +
        line("Review — confirmed (audit, manual)", r.reviewConfirmed, "not confirmed") +
        // Deliberately not `line()`: the winner event holds the whole draw
        // snapshot, which is a paragraph, and it is already shown above.
        "<tr><td>Raffle — winner</td><td>" +
          (wonEv ? '<span class="state state--received">yes</span><div class="sub">' +
                   esc(fmtWhen(wonEv.ts)) + "</div>"
                 : '<span class="sub">—</span>') + "</td></tr>" +
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

  /* ---------- Kickoff: the fan-out fire step ---------- */

  /**
   * Has the fan-out already run for this (email, cycle)?
   * Any of the five fan-out strings proves it did.
   */
  function fanoutAlreadyRan(t) {
    var norm = root.StateBuilder.normStage;
    return CFG.ENGINE_FANOUT.some(function (s) { return !!t.lastByStage[norm(s)]; });
  }

  /**
   * The kickoff checklist (v2 Flow 1+2 tail).
   *
   * Two steps, in order, because they are two different acts:
   *   1. Fire the fan-out  — reaches outside the team, so it is confirmed
   *   2. Send the instructions email, then confirm on Everfit, then mark it
   *
   * Step 2 is what STARTS THE VIDEO CLOCK (Flow 3). The fan-out only shares
   * the folder; marking the email sent is the client actually being told what
   * to do, so anchoring the 48h check on it avoids chasing someone who has
   * not been asked yet.
   */
  function kickoffBlock(t) {
    if (t.stage.terminal) return "";
    var norm = root.StateBuilder.normStage;
    var ran = fanoutAlreadyRan(t);
    var kickoffSent = !!t.lastByStage[norm(S.INVITE_KICKOFF)];
    var instructions = t.lastByStage[norm(S.INVITE_INSTRUCTIONS)];
    var coach = t.identity.coach || "the coach";

    // Step 1 not done yet.
    if (!ran && !kickoffSent) {
      return '<section class="section section--danger">' +
        "<h3>Kickoff — step 1 of 2</h3>" +
        '<p class="section__sub">The client said yes. This fires the automation and moves them to Invited. ' +
        "It is deliberately a button and not a side effect of moving the card, because it reaches outside the team.</p>" +
        '<div class="actions">' +
          '<button class="btn btn--danger" data-act="fire-fanout">Fire the kickoff fan-out</button>' +
          '<span class="sub">Coach: ' + esc(coach) + "</span>" +
        "</div></section>";
    }

    // Both steps done.
    if (instructions) {
      return '<section class="section">' +
        "<h3>Kickoff</h3>" +
        '<p class="section__sub">Fan-out done and the instructions email is marked sent. ' +
        "The video clock started " + esc(fmtWhen(instructions.ts)) + ".</p>" +
        '<span class="badge badge--ok">kickoff complete</span>' +
        "</section>";
    }

    // Step 1 done, step 2 outstanding.
    var copy = root.Flows.render("instructionsConfirmation", {
      Name: (t.identity.clientName || "").split(" ")[0] || t.email,
      Client: t.identity.clientName || t.email
    });

    return '<section class="section">' +
      "<h3>Kickoff — step 2 of 2</h3>" +
      '<p class="section__sub">The fan-out has run: the folder exists, folder 03 is shared, and ' +
      esc(coach) + " was notified. Now send the instructions email, confirm it on Everfit, and mark it here. " +
      "<strong>Marking it is what starts the video clock.</strong></p>" +
      '<div class="copybox">' +
        '<button class="btn btn--sm" data-act="copy-tpl" data-tpl="instructionsConfirmation">Copy the Everfit confirmation</button>' +
        '<pre class="copybox__text">' + esc(copy) + "</pre>" +
      "</div>" +
      '<div class="actions">' +
        '<button class="btn btn--ok" data-act="instructions-sent">Mark the instructions email sent</button>' +
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
    // Scheduling and publishing moved to the Calendar view in Phase 4.
    // They were stopgaps here so the pipeline was traversable end to end.

    if (!btns.length) return "";

    return '<section class="section">' +
      "<h3>Advance</h3>" +
      '<p class="section__sub">Front-of-pipeline steps have no engine events, so the dashboard is what creates them. ' +
      'Scheduling and publishing live in the <a href="#/calendar">Calendar</a>.</p>' +
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
    return header(t) + kickoffBlock(t) + inputsBlock(t) + piecesBlock(t) + advanceBlock(t) +
           timeline(t) + recognitions(t) + terminalBlock(t) +
           '<div id="cardResult" class="result"></div>';
  }

  // The click handler is delegated on #app, which is NEVER replaced — only its
  // innerHTML is. Attaching on every render therefore ACCUMULATED listeners,
  // and since a successful write re-renders, one later click fired N times and
  // appended N identical rows. The log is append-only, so those duplicates are
  // permanent. Attach exactly once; carry the current context in `ctx`.
  var ctx = { state: null, key: null };
  var wired = false;

  function wire(state, key) {
    ctx.state = state;
    ctx.key = key;
    if (wired) return;
    var host = el("app");
    if (!host) return;
    wired = true;

    host.addEventListener("click", function (e) {
      var t = ctx.state && ctx.state.byKey[ctx.key];
      if (!t) return;
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var out = el("cardResult");

      // Feedback goes to a toast, beside this button, and to the result strip.
      function say(msg, cls) { root.Dialog.feedback(btn, msg, cls); }
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
        // The button is disabled when blocked; re-check anyway, because this
        // event is what unlocks Producing and the log is append-only.
        var lock = collectionLock(t);
        if (lock.blockers.length) {
          say("Still waiting on: " + lock.blockers.join(", ") + ".", "bad");
          return;
        }
        stage = S.COLLECTION_COMPLETE;
        text  = "Everfit collection done — client video, Everfit data and photos in";

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

      } else if (act === "copy-tpl") {
        var tplKey = btn.getAttribute("data-tpl");
        var tplText = root.Flows.render(tplKey, {
          Name: (t.identity.clientName || "").split(" ")[0] || t.email,
          Client: t.identity.clientName || t.email,
          coach: t.identity.coach || "the coach",
          Coach: t.identity.coach || "the coach"
        });
        if (tplText && root.navigator && root.navigator.clipboard) {
          root.navigator.clipboard.writeText(tplText).then(function () {
            say("Message copied. Paste it into Everfit.", "ok");
          }).catch(function () {
            say("Could not copy automatically — select the text and copy it.", "warn");
          });
        }
        return;

      } else if (act === "instructions-sent") {
        write(btn, say, S.INVITE_INSTRUCTIONS,
              "Instructions email sent and confirmed on Everfit. Video clock started.");
        return;

      } else if (act === "fire-fanout") {
        fireFanout(t, btn, say);
        return;

      } else if (act === "declined" || act === "dropped") {
        // CONFIRMATION: leaves the active board and there is no reopen event
        // in the vocabulary — a re-nomination opens a new cycle instead.
        confirmThen(btn, say, {
          title: (act === "declined" ? "Mark declined" : "Mark dropped"),
          body: (t.identity.clientName || t.email) + " leaves the active pipeline. This cannot be undone.",
          consequences: [
            "They disappear from the active board",
            "Their history is kept, so the outcome stays as data",
            "Bringing them back later means a re-nomination, which opens cycle " + (t.cycle + 1)
          ],
          tone: "danger",
          confirmLabel: (act === "declined" ? "Mark declined" : "Mark dropped"),
          input: { label: "What happened? (required)", placeholder: "e.g. said no, wants to wait until next month", required: true }
        }, function (res) {
          write(btn, say, (act === "declined") ? S.PIPELINE_DECLINED : S.PIPELINE_DROPPED, res.value);
        });
        return;

      // The Publish confirmation moved to the Calendar view with the button
      // it guarded (Phase 4). Scheduled → Published is still a confirmed move
      // there — retiring the stopgap did not make it free.
      } else if (act === "advance") {
        stage = btn.getAttribute("data-stage");
        text  = val("advanceNote") || "";

      } else {
        return;
      }

      write(btn, say, stage, text);
    });

    /* --- shared helpers --- */

    function write(btn, say, stage, text) {
      var t = ctx.state && ctx.state.byKey[ctx.key];
      if (!t) return;
      btn.disabled = true;
      say("Writing…", "");
      root.EventWriter.appendEvent({ email: t.email, stage: stage, event: text || "", cycle: t.cycle })
        .then(function (res) {
          say(res.message, res.verified ? "ok" : "warn");
          btn.disabled = false;
          if (res.verified && root.TDApp) root.TDApp.reload();
        })
        .catch(function (err) {
          say(err.message, "bad");
          btn.disabled = false;
        });
    }

    function confirmThen(btn, say, opts, done) {
      root.Dialog.confirm(opts).then(function (res) {
        if (!res) { say("Cancelled — nothing was written.", ""); return; }
        done(res);
      });
    }

    /**
     * The one action that reaches outside the team.
     *
     * Order matters: queue the fan-out FIRST, and only write
     * `Invite — kickoff sent` once it is queued. If the kickoff event were
     * written first and the queue failed, the card would claim Invited with
     * nothing behind it. This way, if the kickoff write fails afterwards, the
     * engine's own fan-out rows still arrive and the Invited inference picks
     * the stage up anyway.
     */
    function fireFanout(t, btn, say) {
      var name = t.identity.clientName;
      if (!t.identity.resolved || !name) {
        say("This client does not resolve in the roster, so the engine could not match them. Resolve the identity first.", "bad");
        return;
      }
      var coach = t.identity.coach || "the coach";

      root.Dialog.confirm({
        title: "Fire the kickoff fan-out for " + name + "?",
        body: "This runs the collection engine. It reaches outside the team and cannot be undone.",
        consequences: [
          "Creates their Drive folder from the template",
          "Shares folder 03 as anyone-with-the-link, Editor — so they can upload without signing in",
          "Sends a Slack DM to " + coach + " asking for the coach form",
          "Copies any matching Meet notes and Looms into the folder"
        ],
        tone: "danger",
        confirmLabel: "Yes, fire it"
      }).then(function (ok) {
        if (!ok) { say("Cancelled — nothing was queued.", ""); return; }

        btn.disabled = true;
        say("Queueing the fan-out…", "");
        root.EventWriter.requestFanout(name)
          .then(function (res) {
            if (!res.ok) { say(res.message, "bad"); btn.disabled = false; return; }
            say(res.message + " Recording the kickoff…", "ok");
            return root.EventWriter.appendEvent({
              email: t.email, stage: S.INVITE_KICKOFF,
              event: "Kickoff sent and fan-out queued from the dashboard", cycle: t.cycle
            }).then(function (r2) {
              say(res.message + "  " + r2.message, r2.verified ? "ok" : "warn");
              btn.disabled = false;
              if (root.TDApp) root.TDApp.reload();
            });
          })
          .catch(function (err) {
            say(err.message + "  Fallback: Gaby can still tick the checkbox in the Signal sheet.", "bad");
            btn.disabled = false;
          });
      });
    }
  }

  root.ClientCard = { render: render, wire: wire, fmtWhen: fmtWhen, collectionLock: collectionLock };
})(typeof window !== "undefined" ? window : this);
