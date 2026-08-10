/**
 * Testimonial Dashboard — the seven flows (Task Model v2, D-090)
 *
 * Each flow is a ladder. The clock re-anchors on every action, and which rung
 * a client is on depends on which button was pressed and how many times — not
 * on how long they have been in a pipeline stage.
 *
 * Four rules hold across all seven:
 *
 *   ONE TASK PER FLOW PER CLIENT. Rungs are sequential; the walker emits the
 *   single current rung, never every unmet condition.
 *
 *   EVERY OWNER IS A REAL DASHBOARD USER — Gaby, Miguel, Joey, Bernardo.
 *   Coaches never own tasks. When a coach must act, the task is Gaby's
 *   "chase the coach".
 *
 *   EVERY THRESHOLD COMES FROM THE SETTINGS TAB. Nothing is timed in code.
 *
 *   TASK TEXT STATES THE ACTION, NOT THE STAGE. Gaby never reads "Collecting".
 *
 * A rung produces no task until its threshold passes. Before that the client
 * is simply inside their window.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("flows: TDConfig not loaded");
  var S = CFG.STAGES;
  var E = CFG.ENGINE;

  var HOUR = 36e5;
  var DAY = 24 * HOUR;

  /* ======================================================================
   * Copy templates
   *
   * Provenance matters here, so it is recorded per template:
   *   SOP  — Gaby's existing wording, reused verbatim (paragraph breaks
   *          restored; the .docx export flattens them)
   *   V2   — new copy approved in the Task Model v2 spec
   *   NONE — no approved text exists yet; the copy button says so rather
   *          than inventing something in Gaby's voice
   *
   * v2 requires no em dashes. `checkTemplates()` asserts it.
   * ====================================================================== */

  var TEMPLATES = {
    // Flow 1+2 — SOP §2.5. v2 timing (+24h / +48h), SOP wording. FU#3 dropped:
    // it was written for the Monday after the Sunday deadline and says the
    // deadline has passed, which is false on a relative clock.
    outreachFollowup1: {
      source: "SOP §2.5 FOLLOW-UP #1",
      text:
        "Hey [Name], just following up on my last message.\n\n" +
        "No rush, I just wanted to check in and see if you had a moment to look at it.\n\n" +
        "If you want to be part of this month's Case Studies, I can send you everything you need right away. " +
        "And if now isn't a good moment, no worries at all.\n\n" +
        "We're collecting everything until Sunday. And if you end up submitting it, you'll automatically be added to this month's raffle.\n\n" +
        "Just let me know when you can 🙌"
    },
    outreachFollowup2: {
      source: "SOP §2.5 FOLLOW-UP #2",
      text:
        "Hey [Name], just checking in again real quick.\n\n" +
        "We're wrapping up this month's Case Studies soon, and it would be awesome to include your story if you're open to it.\n\n" +
        "If you're interested, I'll send the instructions right away 😊"
    },
    outreachCoachTold: {
      source: "v2",
      text:
        "Hey [Coach], I reached out to [Client] a couple times about doing a testimonial this month but haven't heard back. " +
        "Wanted to flag it in case you want to give them a nudge, otherwise we'll try again next month."
    },
    coachFormFollowup: {
      source: "v2",
      text:
        "Hey [Coach], quick reminder to fill out the coach form for [Client]. " +
        "It takes just a few minutes and we need it to build their testimonial. " +
        "Here's the link: [form]. In the client selector, choose [Client]."
    },
    // SOP §3 "Send Confirmation via Everfit" — sent right after the
    // instructions email so the client knows to expect it. Used on the
    // kickoff checklist, not by any timed rung.
    instructionsConfirmation: {
      source: "SOP §3 Send Confirmation via Everfit",
      text:
        "Hey [Name], I just sent you the instructions for your testimonial via email " +
        "(from support@fit4lifeacademy.health). Let me know once you upload the video, " +
        "or if you have any questions!"
    },
    videoCoachTold: {
      source: "v2",
      text:
        "Hey [Coach], [Client] hasn't uploaded their testimonial video yet. " +
        "If it's not in by [date] they won't make this month's round. " +
        "Could you give them a quick nudge? Thanks!"
    },
    // SOP §3 "Follow-Up System for Uploads". Its cadence is 48h / 48h / 48h,
    // which matches v2's Flow 3 exactly. The SOP has a THIRD client message;
    // v2 replaces it with the tell-the-coach step, so FU#3 is dropped for the
    // same reason as outreach FU#3.
    //
    // One edit to the SOP wording: both messages used an em dash ("busy—just"),
    // and v2 forbids em dashes. Replaced with a comma, which keeps the voice.
    // NOTE: these sections exist in SOP revisions 1-4, not in revision 5.
    videoFollowup1: {
      source: "SOP §3 Follow-Up System for Uploads, 1st",
      text:
        "Hey [Name], just checking in to see if you had a chance to upload your video! " +
        "No worries if you're busy, just wanted to send a friendly reminder. " +
        "Let me know if you have any questions!"
    },
    videoFollowup2: {
      source: "SOP §3 Follow-Up System for Uploads, 2nd",
      text:
        "Hey [Name], just wanted to follow up again! " +
        "Totally understand if you're busy, just checking if you're still planning to send in your testimonial. " +
        "Let me know either way, and thank you again!"
    },

    /* ---- Raffle · post-draw (D-080) ----------------------------------------
     * Miguel's is an INTERNAL note on a contract record, so it is written here
     * as plain fact. Gaby's two are CLIENT-FACING and the SOP templates were
     * not available to this build, so they are declared with no text: the queue
     * then says "no approved message exists yet" instead of putting invented
     * words in Gaby's voice. Paste the SOP wording in and the buttons light up
     * with no other change. */
    raffleMonthAdd: {
      source: "v2",
      text:
        "Raffle winner [month]: add one extra month to [Client]'s contract. " +
        "Confirmed in the dashboard on the raffle draw for [month]."
    },
    raffleWinnerMessage: { source: "NONE", text: null },
    raffleNonWinnerMessage: { source: "NONE", text: null }
  };

  /** Fill the placeholders. Missing values render as the placeholder itself,
   *  so a gap is visible in the pasted text rather than silently blank. */
  function render(key, vars) {
    var tpl = TEMPLATES[key];
    if (!tpl || !tpl.text) return null;
    return tpl.text.replace(/\[(\w+)\]/g, function (m, name) {
      return (vars && vars[name]) ? vars[name] : m;
    });
  }

  /** The deadline used in the video-to-coach message: end of the active
   *  month from Settings, falling back to the end of the current month. */
  function roundDeadline(settings) {
    var m = String(settings.activeMonth || "").match(/^(\d{4})-(\d{2})$/);
    var d = m ? new Date(+m[1], +m[2], 0) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    var MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
    return MONTHS[d.getMonth()] + " " + d.getDate();
  }

  /* ---------- Per-testimonial helpers ---------- */

  function helpersFor(t) {
    var norm = root.StateBuilder.normStage;
    return {
      last:  function (stage) { return t.lastByStage[norm(stage)] || null; },
      count: function (stage) { return t.repeats[norm(stage)] || 0; },
      has:   function (stage) { return !!t.lastByStage[norm(stage)]; }
    };
  }

  /**
   * Build one rung's task, or null if its threshold has not passed.
   * `overdue` means a full interval has gone by on top of the wait.
   */
  function rung(o) {
    if (!o.anchor || !isFinite(o.anchor.ts)) return null;
    var wait = o.hours * HOUR;
    var due = o.anchor.ts + wait;
    var now = root.TDClock.now();
    if (now < due) return null;

    return {
      flow: o.flow, rung: o.rung, owner: o.owner,
      title: o.title, detail: o.detail || "",
      template: o.template || null,
      actions: o.actions || [],
      anchorTs: o.anchor.ts, dueTs: due,
      waitedHours: (now - o.anchor.ts) / HOUR,
      severity: (wait > 0 && now >= due + wait) ? "overdue" : "due",
      blocking: !!o.blocking
    };
  }

  /* ======================================================================
   * FLOW 1+2 · Outreach — Gaby, escalating to Bernardo
   * ====================================================================== */

  function flowOutreach(t, s, h, v) {
    if (h.has(S.OUTREACH_ACCEPTED) || h.has(S.OUTREACH_COACH_TOLD)) return null;

    var sent = h.last(S.OUTREACH_SENT);

    if (!sent) {
      var notMsg = h.count(S.OUTREACH_COACH_NOT_MSG);
      var lastNot = h.last(S.OUTREACH_COACH_NOT_MSG);
      var nudged = h.last(S.OUTREACH_BERNARDO_NUDGED);

      // Two "coach hasn't messaged" presses and it stops being Gaby's problem.
      if (notMsg >= 2 && (!nudged || nudged.ts < lastNot.ts)) {
        return rung({
          flow: "outreach", rung: "bernardo", owner: "Bernardo", hours: 0, anchor: lastNot,
          title: v.coach + " hasn't messaged " + v.Client + " after two reminders. Nudge them.",
          detail: "Gaby cannot start the outreach until the coach has told the client to expect it.",
          actions: [{ label: "Nudged the coach", stage: S.OUTREACH_BERNARDO_NUDGED,
                      event: "Bernardo nudged " + v.coach + " about " + v.Client }]
        });
      }

      var anchor = nudged || lastNot || h.last(S.NOMINATION_LOGGED);
      var wait = lastNot ? s.outreachCoachNotMessagedHours : 0;
      return rung({
        flow: "outreach", rung: notMsg ? "retry" : "start", owner: "Gaby",
        hours: wait, anchor: anchor,
        title: notMsg
          ? "Check if " + v.coach + " messaged " + v.Client + ", then do the outreach."
          : "Do outreach to " + v.Client + " (if the coach already messaged them).",
        detail: notMsg ? "Waiting on the coach since " + Math.round((root.TDClock.now() - lastNot.ts) / HOUR) + "h ago." : "",
        actions: [
          { label: "Mark sent", stage: S.OUTREACH_SENT, event: "Outreach sent on Everfit from Bernardo's account" },
          { label: "Coach hasn't messaged", stage: S.OUTREACH_COACH_NOT_MSG,
            event: v.coach + " has not messaged " + v.Client + " yet" }
        ]
      });
    }

    var noReply = h.last(S.OUTREACH_NO_REPLY);
    if (!noReply) {
      return rung({
        flow: "outreach", rung: "reply-check", owner: "Gaby",
        hours: s.outreachReplyCheckHours, anchor: sent,
        title: "Did " + v.Client + " reply in Everfit that they're in?",
        actions: [
          { label: "Yes, they're in", stage: S.OUTREACH_ACCEPTED, tone: "ok",
            event: v.Client + " accepted" },
          { label: "No reply", stage: S.OUTREACH_NO_REPLY, event: "No reply from " + v.Client }
        ]
      });
    }

    var fu = h.count(S.OUTREACH_FOLLOWUP);
    var lastFu = h.last(S.OUTREACH_FOLLOWUP);

    if (fu === 0) {
      return rung({
        flow: "outreach", rung: "fu1", owner: "Gaby",
        hours: s.outreachFollowup1Hours, anchor: noReply,
        title: "Send follow-up #1 to " + v.Client + ".",
        template: "outreachFollowup1",
        actions: [{ label: "Mark sent", stage: S.OUTREACH_FOLLOWUP, event: "Outreach follow-up #1 sent" }]
      });
    }
    if (fu === 1) {
      return rung({
        flow: "outreach", rung: "fu2", owner: "Gaby",
        hours: s.outreachFollowup2Hours, anchor: lastFu,
        title: "Send the last follow-up to " + v.Client + ".",
        template: "outreachFollowup2",
        actions: [{ label: "Mark sent", stage: S.OUTREACH_FOLLOWUP, event: "Outreach follow-up #2 sent" }]
      });
    }
    return rung({
      flow: "outreach", rung: "coach-told", owner: "Gaby",
      hours: s.outreachCoachToldHours, anchor: lastFu,
      title: "Tell " + v.coach + " that " + v.Client + " didn't respond this month.",
      template: "outreachCoachTold",
      actions: [{ label: "Mark sent", stage: S.OUTREACH_COACH_TOLD,
                  event: "Told " + v.coach + " that " + v.Client + " did not respond" }]
    });
  }

  /* ======================================================================
   * FLOW 3 · Client video — Gaby
   * Anchored on the INSTRUCTIONS EMAIL, not the fan-out: the clock starts
   * when the client has actually been told what to do.
   * ====================================================================== */

  function flowVideo(t, s, h, v) {
    if (root.StateBuilder.arrived(t.inputs.video.state)) return null;
    if (h.has(S.COLLECTION_VIDEO_COACH)) return null;

    var start = h.last(S.INVITE_INSTRUCTIONS);
    if (!start) return null;                      // clock has not started

    var fu = h.count(S.COLLECTION_VIDEO_FOLLOWUP);
    var lastFu = h.last(S.COLLECTION_VIDEO_FOLLOWUP);
    var checked = h.last(S.COLLECTION_VIDEO_CHECKED);

    var markReceived = { label: "Mark received", stage: S.COLLECTION_VIDEO, tone: "ok",
                         event: "Client video marked received from the queue" };
    var justChecked  = { label: "Checked, not there", stage: S.COLLECTION_VIDEO_CHECKED,
                         event: "Checked folder 03, no video yet" };

    if (fu >= 2) {
      return rung({
        flow: "video", rung: "coach-told", owner: "Gaby",
        hours: s.videoCheckHours, anchor: lastFu,
        title: "Tell " + v.coach + " that " + v.Client + " hasn't uploaded their video.",
        template: "videoCoachTold",
        actions: [markReceived,
                  { label: "Mark sent", stage: S.COLLECTION_VIDEO_COACH,
                    event: "Told " + v.coach + " that " + v.Client + " has not uploaded" }]
      });
    }

    // The check clock re-arms on a plain check, so "checked, not there" does
    // not burn one of the two client follow-ups.
    var anchor = lastFu || checked || start;
    if (checked && lastFu && checked.ts > lastFu.ts) anchor = checked;

    return rung({
      flow: "video", rung: fu === 0 ? "check" : "fu2", owner: "Gaby",
      hours: s.videoCheckHours, anchor: anchor,
      title: fu === 0
        ? "Check if " + v.Client + " uploaded their video."
        : "Check " + v.Client + "'s video, and send the last follow-up if it isn't there.",
      detail: "Nothing fires when a client uploads. Open folder 03 and look.",
      template: fu === 0 ? "videoFollowup1" : "videoFollowup2",
      actions: [markReceived, justChecked,
                { label: "Follow-up sent", stage: S.COLLECTION_VIDEO_FOLLOWUP,
                  event: "Video follow-up #" + (fu + 1) + " sent to " + v.Client }]
    });
  }

  /* ======================================================================
   * FLOW 4 · Coach form — Gaby, then Bernardo
   * Clears itself: the engine writes `Collection — coach form` on submit.
   * ====================================================================== */

  function flowCoachForm(t, s, h, v) {
    if (root.StateBuilder.arrived(t.inputs.coachForm.state)) return null;

    var dm = h.last(E.COACH_NOTICE);
    if (!dm) return null;                          // the coach has not been asked yet

    var chased = h.last(S.COACH_FORM_CHASED);
    var nudged = h.last(S.COACH_FORM_NUDGED);

    if (chased && (!nudged || nudged.ts < chased.ts)) {
      return rung({
        flow: "coachForm", rung: "bernardo", owner: "Bernardo",
        hours: s.coachFormEscalateHours, anchor: chased,
        title: v.coach + " isn't filling " + v.Client + "'s form despite the follow-up.",
        actions: [{ label: "Nudged the coach", stage: S.COACH_FORM_NUDGED,
                    event: "Bernardo nudged " + v.coach + " about " + v.Client + "'s form" }]
      });
    }

    return rung({
      flow: "coachForm", rung: "chase", owner: "Gaby",
      hours: s.coachFormFollowupHours, anchor: nudged || dm,
      title: v.coach + " hasn't filled the form for " + v.Client + "; send a follow-up.",
      template: "coachFormFollowup",
      actions: [{ label: "Mark sent", stage: S.COACH_FORM_CHASED,
                  event: "Chased " + v.coach + " for " + v.Client + "'s coach form" }]
    });
  }

  /* ======================================================================
   * FLOW 5 · Everfit + photos — Gaby only, passive
   * One soft escalation at collectingStaleHours so a client cannot strand
   * silently. Never leaves Gaby.
   * ====================================================================== */

  function flowManualPulls(t, s, h, v) {
    if (t.collectionComplete) return null;
    var A = root.StateBuilder.arrived;
    var everfit = A(t.inputs.everfit.state);
    var photos = A(t.inputs.photos.state);
    var video = A(t.inputs.video.state);

    // Everything in — the only thing left is her confirmation.
    if (video && everfit && photos) {
      return {
        flow: "manualPulls", rung: "complete", owner: "Gaby",
        title: "Mark " + v.Client + "'s collection complete.",
        detail: "The video is in and both of your pulls are marked. This is what unlocks production.",
        template: null,
        actions: [{ label: "Mark complete", stage: S.COLLECTION_COMPLETE, tone: "ok",
                    event: "Everfit collection done — client video, Everfit data and photos in" }],
        anchorTs: NaN, dueTs: NaN, waitedHours: NaN, severity: "due", blocking: false
      };
    }

    if (everfit && photos) return null;            // waiting on the video, Flow 3 owns that

    var missing = [];
    if (!everfit) missing.push("Everfit data");
    if (!photos) missing.push("photos");

    var anchor = h.last(S.COLLECTION_VIDEO) || h.last(E.CLIENT_VIDEO_LINK);
    var stale = anchor && isFinite(anchor.ts) &&
                (root.TDClock.now() - anchor.ts) / HOUR > s.collectingStaleHours;

    var actions = [];
    if (!everfit) actions.push({ label: "Everfit received", stage: S.COLLECTION_EVERFIT,
                                 event: "Everfit data marked received from the queue" });
    if (!photos) actions.push({ label: "Photos received", stage: S.COLLECTION_PHOTOS,
                                event: "Photos marked received from the queue" });

    return {
      flow: "manualPulls", rung: stale ? "stale" : "pending", owner: "Gaby",
      title: stale
        ? v.Client + " has been waiting " + Math.round(s.collectingStaleHours / 24) + " days on your " + missing.join(" and ") + "."
        : "Pull " + missing.join(" and ") + " for " + v.Client + ".",
      detail: "Needed before production can start.",
      template: null,
      actions: actions,
      anchorTs: anchor ? anchor.ts : NaN, dueTs: NaN,
      waitedHours: anchor ? (root.TDClock.now() - anchor.ts) / HOUR : NaN,
      severity: stale ? "overdue" : "reminder",
      blocking: true
    };
  }

  /* ======================================================================
   * FLOW 6 · Content — Miguel, then Gaby. PER CLIENT, never per piece.
   * Both rungs measure from day 0, so acknowledging the check-in clears
   * Miguel's rung but does not postpone Gaby's escalation: the escalation is
   * about the work, not the reply.
   * ====================================================================== */

  function flowContent(t, s, h, v) {
    if (!t.collectionComplete || t.allPiecesDone) return null;

    var day0 = h.last(S.COLLECTION_COMPLETE);
    if (!day0) return null;

    var pending = CFG.PIECES.filter(function (p) { return !t.pieces[p.key].done; });
    var pendingText = pending.length + " of " + CFG.PIECES.length + " pieces still open";

    var chased = h.last(S.PRODUCTION_CHASED);
    var elapsedDays = (root.TDClock.now() - day0.ts) / DAY;

    // Gaby's escalation, re-arming so it never goes quiet.
    if (elapsedDays >= s.contentEscalateDays) {
      var anchor = chased || day0;
      var hours = chased ? s.contentEscalateDays * 24 : (s.contentEscalateDays * 24 - (root.TDClock.now() - day0.ts) / HOUR + 0.001);
      var r = rung({
        flow: "content", rung: "escalate", owner: "Gaby",
        hours: chased ? s.contentEscalateDays * 24 : 0,
        anchor: chased || day0,
        title: "Miguel is running late on " + v.Client + "'s content. Follow up with him.",
        detail: pendingText + ". " + Math.round(elapsedDays) + " days since production started.",
        actions: [{ label: "Followed up", stage: S.PRODUCTION_CHASED,
                    event: "Chased Miguel on " + v.Client + "'s content" }]
      });
      if (r) return r;
    }

    var ack = h.last(S.PRODUCTION_CHECKIN_ACK);
    if (ack && ack.ts > day0.ts) return null;      // he replied; Gaby's rung still fires at 7d

    return rung({
      flow: "content", rung: "checkin", owner: "Miguel",
      hours: s.contentCheckinDays * 24, anchor: day0,
      title: "How's the content for " + v.Client + " coming along?",
      detail: pendingText + ".",
      actions: [{ label: "Working on it", stage: S.PRODUCTION_CHECKIN_ACK,
                  event: "Miguel acknowledged the check-in for " + v.Client }]
    });
  }

  /* ======================================================================
   * FLOW 7 · Approval — Joey, then Gaby, then Bernardo. Temporary stage.
   * ====================================================================== */

  function flowApproval(t, s, h, v) {
    if (!t.allPiecesDone || t.approved) return null;

    var ready = { ts: CFG.PIECES.reduce(function (m, p) {
      var at = t.pieces[p.key].at; return isFinite(at) && at > m ? at : m;
    }, 0) };
    if (!ready.ts) return null;

    var escalated = h.last(S.APPROVAL_ESCALATED);
    var nudged = h.last(S.APPROVAL_BERNARDO_NUDGED);

    if (escalated && (!nudged || nudged.ts < escalated.ts)) {
      return rung({
        flow: "approval", rung: "bernardo", owner: "Bernardo", hours: 0, anchor: escalated,
        title: "Nudge Joey on " + v.Client + "'s approval.",
        actions: [{ label: "Nudged Joey", stage: S.APPROVAL_BERNARDO_NUDGED,
                    event: "Bernardo nudged Joey on " + v.Client }]
      });
    }

    var waited = (root.TDClock.now() - (nudged ? nudged.ts : ready.ts)) / HOUR;
    if (waited >= s.approvalEscalateHours) {
      return rung({
        flow: "approval", rung: "escalate", owner: "Gaby",
        hours: s.approvalEscalateHours, anchor: nudged || ready,
        title: "Joey hasn't approved " + v.Client + ". Tell Bernardo.",
        actions: [{ label: "Told Bernardo", stage: S.APPROVAL_ESCALATED,
                    event: "Told Bernardo that Joey has not approved " + v.Client }]
      });
    }

    return rung({
      flow: "approval", rung: "approve", owner: "Joey", hours: 0, anchor: ready,
      title: "Approve " + v.Client + "'s testimonial. All five pieces are ready.",
      detail: "Every link is gathered on the client card.",
      actions: [
        { label: "Approve", stage: S.APPROVAL_APPROVED, tone: "ok", event: "Approved" },
        { label: "Send back", stage: S.APPROVAL_SENT_BACK, needsNote: "Feedback (required)",
          event: "" }
      ]
    });
  }

  /* ======================================================================
   * FLOW 8+9 · Raffle post-draw — Miguel and Gaby, in PARALLEL
   *
   * Two flows, not one ladder with two rungs, and that is the whole point:
   * D-080 corrects the old SOP, which sent the winner message only after the
   * contract was updated. They fire together and neither waits for the other,
   * so a ladder would re-introduce exactly the chaining the decision removed.
   * The walker's one-task-per-flow rule then lets both stand at once.
   *
   * hours: 0 — these are immediate on confirmation, with no approved waiting
   * period to escalate against. No threshold is invented in code (hard rule 8);
   * if chasing is wanted later it belongs in the Settings tab first.
   * ====================================================================== */

  function flowRaffleMonth(t, s, h, v) {
    var won = h.last(S.RAFFLE_WINNER);
    if (!won || h.has(S.RAFFLE_MONTH_ADDED)) return null;

    return rung({
      flow: "raffleMonth", rung: "addMonth", owner: "Miguel", hours: 0, anchor: won,
      title: "Add " + v.Client + "'s extra raffle month in the Master Sheet.",
      detail: "They won the " + v.month + " raffle. The month goes in the client Master Sheet, " +
              "which the dashboard never writes to, so this one is done by hand. Leave the note too.",
      template: "raffleMonthAdd",
      actions: [{ label: "Month added", stage: S.RAFFLE_MONTH_ADDED,
                  event: "Extra month added in the Master Sheet for the " + v.month + " raffle win" }]
    });
  }

  function flowRaffleMessages(t, s, h, v) {
    var won = h.last(S.RAFFLE_WINNER);
    if (!won || h.has(S.RAFFLE_MESSAGES)) return null;

    return rung({
      flow: "raffleMessages", rung: "sendMessages", owner: "Gaby", hours: 0, anchor: won,
      title: "Send the " + v.month + " raffle messages: " + v.Client + " won, and thank the rest.",
      detail: "The winner message plus the thank-you to everyone else who entered. " +
              "Both go out through Everfit.",
      template: "raffleWinnerMessage",
      actions: [{ label: "Messages sent", stage: S.RAFFLE_MESSAGES,
                  event: "Winner and non-winner messages sent for the " + v.month + " raffle" }]
    });
  }

  var FLOWS = [flowOutreach, flowVideo, flowCoachForm, flowManualPulls, flowContent, flowApproval,
               flowRaffleMonth, flowRaffleMessages];

  /**
   * Evaluate every flow for one testimonial. At most one task per flow.
   * @returns {Array} tasks
   */
  function evaluate(t, settings) {
    if (t.stage.terminal) return [];
    var h = helpersFor(t);
    var vars = {
      Client: t.identity.clientName || t.email,
      Name: (t.identity.clientName || "").split(" ")[0] || t.email,
      coach: t.identity.coach || "the coach",
      Coach: t.identity.coach || "the coach",
      form: settings.coachFormUrl || "[form link — set coachFormUrl in Settings]",
      date: roundDeadline(settings),
      // The raffle cohort month, from the raffle fold's own definition rather
      // than re-derived here — there is one answer to "which month is this".
      month: root.RaffleFold ? root.RaffleFold.monthOf(t).month : ""
    };

    var out = [];
    FLOWS.forEach(function (fn) {
      var task = fn(t, settings, h, vars);
      if (!task) return;
      task.vars = vars;
      task.copy = task.template ? render(task.template, vars) : null;
      task.copySource = task.template && TEMPLATES[task.template] ? TEMPLATES[task.template].source : null;
      out.push(task);
    });
    return out;
  }

  /** Guard: v2 forbids em dashes in any client- or coach-facing copy. */
  function checkTemplates() {
    var bad = [];
    Object.keys(TEMPLATES).forEach(function (k) {
      if (TEMPLATES[k].text && TEMPLATES[k].text.indexOf("—") >= 0) bad.push(k);
    });
    return { ok: bad.length === 0, withEmDash: bad,
             missing: Object.keys(TEMPLATES).filter(function (k) { return !TEMPLATES[k].text; }) };
  }

  root.Flows = {
    evaluate: evaluate,
    TEMPLATES: TEMPLATES,
    render: render,
    checkTemplates: checkTemplates,
    roundDeadline: roundDeadline
  };
})(typeof window !== "undefined" ? window : this);
