/**
 * Testimonial Dashboard — Raffle view (Phase 5)
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
 *
 * ---------------------------------------------------------------------------
 * TWO WRITES LIVE HERE, both confirmed first
 * ---------------------------------------------------------------------------
 *   MOVE TO ANOTHER MONTH  → `Raffle — month moved`   (D-100)
 *   CONFIRM THE WINNER     → `Raffle — winner confirmed` + the snapshot
 *
 * Both get a confirmation dialog, and both belong to the narrow category the
 * dialog exists for (D-093): the move changes which month someone competes in,
 * and the winner cannot be un-confirmed at all.
 *
 * The two POST-DRAW TASKS are deliberately NOT actioned here. They are real
 * tasks with real owners (Miguel and Gaby) and they live in the queue like
 * every other task — this view shows their state and says where to act. One
 * write path per action, not two.
 *
 * RE-DRAWING: the pick happens on click and is shown in the dialog, so
 * cancelling and clicking again produces a different name. That is inherent to
 * "system proposes, human confirms" and is left visible rather than hidden —
 * the log records only the confirmed draw, and the dialog says so.
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
      // The "from" clause is dropped when it would name the month we are already
      // looking at — that happens on a round trip, and "moved from Aug" while
      // reading Aug says nothing true.
      var whence = (e.movedFrom && e.movedFrom !== e.month)
        ? "moved from " + esc(root.RaffleFold.monthLabel(e.movedFrom))
        : "moved here";
      tags += '<span class="badge badge--warn" title="' + esc(e.movedNote) + '">' + whence +
        (e.movedBy ? " by " + esc(e.movedBy) : "") + "</span>";
    }
    // Postponed (D-120). Without this the row reads as a client who is stuck at
    // 0/3, when in fact they asked for this month and nothing is being chased.
    if (e.postponed) {
      tags += '<span class="badge badge--wait" title="' + esc(e.movedNote) + '">postponed, ' +
        "outreach resumes " + esc(dayLabel(e.resumeDate)) + "</span>";
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
        moveBtn(e) +
      "</div></li>";
  }

  /**
   * "Move to another month" (D-100).
   *
   * Exists for one real case the automatic cohort rule cannot cover: a client
   * says yes, sends nothing that week, and sends it two weeks later. The team
   * already makes that call by hand — today it lives only in Gaby's head, and
   * this is what turns it into an attributed row.
   *
   * Hidden once someone has won: their cohort is part of a settled record.
   */
  function moveBtn(e) {
    if (e.personWon) return "";
    return '<button class="btn btn--sm rf__move" data-move="' + esc(e.key) + '">Move to another month</button>';
  }

  /** A day in the sheet's timezone, never the viewer's. */
  function dayLabel(ts) {
    if (!isFinite(ts)) return "";
    var d = new Date(ts + CFG.TZ_OFFSET_MINUTES * 60000);
    var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return MON[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  /* ==========================================================================
   * The draw
   * ========================================================================== */

  function who(e) {
    return esc(e.name) + (e.cycle > 1 ? " (part " + e.cycle + ")" : "");
  }

  /** The two post-draw tasks (D-080) — parallel, neither blocks the other. */
  function postDraw(r) {
    var w = r.winner;
    function line(done, owner, label, where) {
      return '<li class="pd' + (done ? " pd--done" : "") + '">' +
        '<span class="pd__m">' + (done ? "✓" : "○") + "</span>" +
        "<strong>" + esc(owner) + "</strong> — " + esc(label) +
        '<div class="sub">' + (done ? "Done." : esc(where)) + "</div></li>";
    }
    return '<ul class="pdlist">' +
      line(w.monthAdded, "Miguel", "add one extra month in the Master Sheet and leave the note",
           "Open in Miguel's queue. The dashboard never writes to the Master Sheet.") +
      line(w.messagesSent, "Gaby", "send the winner message and the non-winner thank-yous",
           "Open in Gaby's queue.") +
      "</ul>" +
      '<p class="sub">Both fired at the same time and neither waits for the other (D-080). ' +
      'Mark them done from <a href="#/queue">the queue</a>, where every other task is actioned.</p>';
  }

  function drawPanel(r) {
    var head = "<h3>The draw — " + esc(r.monthLabel) + "</h3>";

    if (r.doubleWinner) {
      return '<section class="section">' + head +
        '<div class="banner banner--bad"><strong>Two winners are recorded for ' + esc(r.monthLabel) +
        ".</strong> The draw cannot produce this, so it means a double write or a hand-edited log. " +
        "The log is append-only, so nothing here can be deleted: " +
        r.doubleWinner.map(who).join(" and ") + ". Ask Bernardo before acting on either.</div></section>";
    }

    /* ---- already drawn ---- */
    if (r.drawState === "done") {
      var w = r.winner;
      var by = w.winnerEvent ? root.StateBuilder.actorOf(w.winnerEvent) : "";
      return '<section class="section">' + head +
        '<div class="winner">' +
          '<div class="winner__l">Winner</div>' +
          '<a class="winner__n" href="#/client/' + encodeURIComponent(w.key) + '">' + who(w) + "</a>" +
          '<div class="sub">' + esc(w.email) + (by ? " · confirmed by " + esc(by) : "") + "</div>" +
        "</div>" +
        '<details class="snap"><summary>The snapshot taken at the draw</summary>' +
          "<p>Who qualified on the day is frozen in the event text, so a later change to " +
          "anyone's preferences form cannot alter the record.</p>" +
          "<pre>" + esc(w.winnerEvent ? w.winnerEvent.event : "") + "</pre>" +
        "</details>" +
        postDraw(r) +
        '<p class="sub">A confirmed winner cannot be un-confirmed today — the log is append-only ' +
        "and no correction event exists yet (D-093, open).</p>" +
        "</section>";
    }

    /* ---- waiting ---- */
    if (r.drawState === "waiting") {
      /* THE INTERESTING CASE: there ARE eligible entries, but people are still
       * in flight, so drawing now would freeze a snapshot that writes them out.
       * The wait has to be actionable — name them, say where they are stuck,
       * and put the button that resolves them right there. */
      if (r.eligible.length && r.holdingUp.length) {
        var rows = r.holdingUp.map(function (e) {
          var days = isFinite(e.hoursInStage) ? Math.round(e.hoursInStage / 24) : null;
          return '<li class="hold">' +
            '<div class="hold__who">' +
              '<a class="hold__name" href="#/client/' + encodeURIComponent(e.key) + '">' +
                esc(e.name) + "</a>" +
              '<div class="sub">' + esc(e.stageLabel || "no stage yet") +
                (days === null ? "" : " · " + days + (days === 1 ? " day" : " days")) +
                " · " + e.compliance.met + "/" + e.compliance.total + " conditions" +
                // They hold the draw up correctly — nothing has been produced —
                // but they are paused on purpose, not stalled. Say so, or this
                // row invites someone to chase a client who asked to wait.
                (e.postponed
                  ? ' · <span class="hold__paused">postponed, outreach resumes ' +
                    esc(dayLabel(e.resumeDate)) + "</span>"
                  : "") +
                "</div>" +
            "</div>" +
            '<div class="hold__act">' + moveBtn(e) + "</div>" +
          "</li>";
        }).join("");

        return '<section class="section">' + head +
          '<div class="banner banner--warn"><strong>Waiting on ' + r.holdingUp.length +
          (r.holdingUp.length === 1 ? " person" : " people") + " before the draw opens.</strong> " +
          r.eligible.length + (r.eligible.length === 1 ? " entry already qualifies" : " entries already qualify") +
          ", but confirming a winner freezes a permanent snapshot of who was eligible — " +
          "drawing now would write these people out of a month they are still working on. " +
          "The draw opens on its own once everyone is resolved, and in any case on " +
          esc(r.monthLabel) + "'s last day.</div>" +
          '<ul class="holds">' + rows + "</ul>" +
          '<p class="sub">Each of these resolves by qualifying, by being declined or dropped, ' +
          "or by being moved to another month.</p>" +
          '<div id="rfResult" class="result"></div>' +
          "</section>";
      }

      var whyNot;
      if (!r.entries.length) {
        whyNot = "No testimonial entered the pipeline in " + esc(r.monthLabel) + ".";
      } else if (!r.qualifying.length) {
        whyNot = "Nobody in this month's cohort meets all three conditions yet.";
      } else {
        whyNot = "Everyone who qualifies this month has already won a raffle before, " +
                 "so there is nobody left to draw from.";
      }
      return '<section class="section">' + head +
        '<p class="empty">' + whyNot + " Nothing to draw.</p>" + "</section>";
    }

    /* ---- ready to draw ---- */
    var late = r.drawState === "overdue"
      ? '<div class="banner banner--warn"><strong>' + esc(r.monthLabel) +
        " is over and no winner was drawn.</strong></div>"
      : "";

    var excluded = r.excludedPriorWin.length
      ? '<p class="sub">Not in the draw despite qualifying: ' +
        r.excludedPriorWin.map(function (e) {
          return "<strong>" + who(e) + "</strong>";
        }).join(", ") + " — already won a raffle before." +
        (r.excludedPriorWin.some(function (e) { return e.personWonCycle !== e.cycle; })
          ? " (On another part of their testimonial, so the win is theirs as a person.)" : "") +
        "</p>"
      : "";

    return '<section class="section">' + head + late +
      '<p class="section__sub">' + r.eligible.length + " eligible — qualifies on all three conditions, " +
      "entered in " + esc(r.monthLabel) + ", and has never won before. " +
      "The system draws; you confirm.</p>" +
      '<ol class="elig">' + r.eligible.map(function (e) {
        return "<li>" + who(e) + ' <span class="sub">' + esc(e.email) + "</span></li>";
      }).join("") + "</ol>" +
      excluded +
      '<div class="rowbtns"><button id="rfDraw" class="btn btn--ok">Run the draw</button></div>' +
      '<div id="rfResult" class="result"></div>' +
      "</section>";
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
      drawPanel(r) +
      '<section class="section">' + body +
      '<p class="section__sub raffle__foot">Compliance in this list is <strong>live</strong> — ' +
      "it reflects the log right now, which is what a working list needs. The record is the " +
      "opposite: the snapshot taken at the draw freezes who qualified on the day, and that is " +
      "what counts afterwards.</p>" +
      "</section>";
  }

  /* ==========================================================================
   * Wiring — the two writes
   * ========================================================================== */

  var wired = false;
  var ctx = { r: null };

  function wire(state) {
    ctx.r = root.RaffleFold.build(state);
    if (wired) return;
    var host = document.getElementById("app");
    if (!host) return;
    wired = true;

    host.addEventListener("click", function (ev) {
      var mv = ev.target.closest ? ev.target.closest("[data-move]") : null;
      if (mv) { onMove(mv, mv.getAttribute("data-move")); return; }

      var draw = ev.target.closest ? ev.target.closest("#rfDraw") : null;
      if (draw) { onDraw(draw); return; }
    });
  }

  function find(key) {
    var all = (ctx.r && ctx.r.entries) || [];
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return null;
  }

  function write(btn, o) {
    btn.disabled = true;
    root.Dialog.feedback(btn, "Writing…", "");
    return root.EventWriter.appendEvent(o)
      .then(function (res) {
        root.Dialog.feedback(btn, res.message, res.verified ? "ok" : "warn");
        btn.disabled = false;
        if (res.verified && root.TDApp) root.TDApp.reload();
      })
      .catch(function (err) {
        root.Dialog.feedback(btn, err.message, "bad");
        btn.disabled = false;
      });
  }

  /* ---------- Move to another month ---------- */

  function monthOptions(r) {
    var F = root.RaffleFold;
    var out = [], seen = {};
    function push(k) {
      if (!k || k === r.month || seen[k]) return;
      seen[k] = true;
      out.push({ value: k, label: F.monthLabel(k) });
    }
    push(F.nextMonth(r.month));
    push(F.nextMonth(F.nextMonth(r.month)));
    push(F.currentMonth());           // pull someone forward out of a past cohort
    out.sort(function (a, b) { return a.value < b.value ? -1 : 1; });
    return out;
  }

  function onMove(btn, key) {
    var e = find(key);
    if (!e) return;
    var r = ctx.r;
    var opts = monthOptions(r);
    if (!opts.length) {
      root.Dialog.feedback(btn, "No other month to move this client to.", "warn");
      return;
    }

    root.Dialog.confirm({
      title: "Move " + e.name + " to another month's raffle",
      body: "This changes which month " + e.name + " competes in. It is written to the event log " +
            "as an attributed row, so the decision is recorded rather than remembered.",
      // ⚠️ The third line USED to read "does not change anything about their
      // testimonial or their pipeline stage" unconditionally. Since D-120 that
      // is false for a postponed client: the month and the resume date come from
      // the SAME function, so moving the month moves the day their outreach task
      // comes back. That is the intended behaviour — it is what stops the two
      // from drifting apart — but the dialog has to say it rather than let
      // somebody move a client and discover it later.
      consequences: [
        "Leaves the " + root.RaffleFold.monthLabel(r.month) + " raffle immediately.",
        "Appears in the chosen month's raffle, marked as moved and by whom.",
        e.postponed
          ? "They are POSTPONED, so this also moves when they come back: Gaby's " +
            "\"send the outreach\" task moves to the first business day of the chosen month."
          : "Does not change anything about their testimonial or their pipeline stage.",
        "The log is append-only: this cannot be deleted, only superseded by another move."
      ],
      select: { label: "Move to", placeholder: "— choose a month —", options: opts },
      confirmLabel: "Move",
      tone: "normal"
    }).then(function (res) {
      if (!res) return;
      var target = res.selected;
      if (!root.RaffleFold.isMonthKey(target)) {
        root.Dialog.feedback(btn, "That is not a valid month.", "bad");
        return;
      }
      write(btn, {
        email: e.email, cycle: e.cycle,
        stage: CFG.STAGES.RAFFLE_MONTH_MOVED,
        event: root.RaffleFold.moveText(r.month, target)
      });
    });
  }

  /* ---------- Run the draw, then confirm the winner ---------- */

  function onDraw(btn) {
    var r = ctx.r;
    var eligible = r.eligible || [];
    if (!eligible.length) {
      root.Dialog.feedback(btn, "Nobody is eligible, so there is nothing to draw.", "warn");
      return;
    }

    // The pick happens here, before the dialog, so what she confirms is what
    // gets written. Cancelling writes nothing and draws again next click.
    var winner = root.RaffleFold.drawFrom(eligible);
    if (!winner) {
      root.Dialog.feedback(btn, "The draw returned nobody. Nothing was written.", "bad");
      return;
    }

    var snapshot = root.RaffleFold.snapshotText(r.month, winner, eligible);

    root.Dialog.confirm({
      title: "Winner drawn: " + winner.name,
      body: "Drawn at random from the " + eligible.length + " eligible " +
            (eligible.length === 1 ? "entry" : "entries") + " in " +
            root.RaffleFold.monthLabel(r.month) + ". Nothing has been written yet — " +
            "confirming is what records it.",
      consequences: [
        "Freezes who qualified today into the event, as the permanent record.",
        "Fires two tasks at once: Miguel adds the extra month in the Master Sheet, Gaby sends the messages.",
        "Cannot be un-confirmed — the log is append-only and no correction event exists yet.",
        "Cancel and draw again if you want a different pick. Only a confirmed draw is ever recorded."
      ],
      confirmLabel: "Confirm " + winner.name + " as the winner",
      tone: "danger"
    }).then(function (res) {
      if (!res) {
        root.Dialog.feedback(btn, "Cancelled. Nothing was written — click again to draw afresh.", "");
        return;
      }
      write(btn, {
        email: winner.email, cycle: winner.cycle,
        stage: CFG.STAGES.RAFFLE_WINNER,
        event: snapshot
      });
    });
  }

  root.RaffleView = { render: render, wire: wire };
})(typeof window !== "undefined" ? window : this);
