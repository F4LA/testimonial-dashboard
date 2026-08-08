/**
 * Testimonial Dashboard — Alerts / task rules (Phase 3)
 *
 * Turns the folded state into a list of tasks. This is the engine behind
 * "the system tells each person what to do today" — nobody hunts.
 *
 * Two rules govern everything here (spec §5):
 *
 *   EVERY TASK HAS EXACTLY ONE OWNER. An alert with no owner is spam.
 *   THRESHOLDS COME FROM THE SETTINGS TAB, never from code.
 *
 * A task is `due` while it is inside its threshold and `overdue` past it.
 * Both are shown — the queue is a worklist, not just an alarm. Manual-review
 * items have no clock and are always `due`.
 *
 * Routing (spec §5): coach warm-up overdue → Gaby (she nudges the coach);
 * no client response → Gaby; no upload → Gaby; coach form missing → the
 * coach; piece overdue → its owner, in the content channel; approval pending
 * → Joey; manual-review flags → Gaby.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("alerts: TDConfig not loaded");
  var S = CFG.STAGES;

  var DM = "dm";
  var CHANNEL = "content-channel";

  function hoursSince(ts) {
    return isFinite(ts) ? (Date.now() - ts) / 36e5 : NaN;
  }

  function task(o) {
    var over = isFinite(o.hours) && isFinite(o.threshold) && o.hours > o.threshold;
    return {
      id:          o.id,
      kind:        o.kind,
      owner:       o.owner,
      ownerKind:   o.ownerKind || "person",
      channel:     o.channel || DM,
      title:       o.title,
      detail:      o.detail || "",
      clientKey:   o.clientKey || "",
      clientName:  o.clientName || "",
      email:       o.email || "",
      cycle:       o.cycle || 1,
      stageLabel:  o.stageLabel || "",
      hours:       isFinite(o.hours) ? o.hours : NaN,
      threshold:   isFinite(o.threshold) ? o.threshold : NaN,
      severity:    o.severity || (over ? "overdue" : "due"),
      overdueBy:   over ? o.hours - o.threshold : 0,
      action:      o.action || null,          // { stage, label, event }
      blocking:    !!o.blocking
    };
  }

  /* ---------- Rules ---------- */

  function rulesFor(t, settings) {
    var out = [];
    var id = t.email + "::" + t.cycle;
    var name = t.identity.clientName || t.email;
    var coach = t.identity.coach || "";
    var base = {
      clientKey: t.key, clientName: name, email: t.email, cycle: t.cycle,
      stageLabel: t.stage.label
    };
    var h = t.hoursInStage;
    var A = root.StateBuilder.arrived;

    /* --- 1 · Nominated: coach warm-up --- */
    if (t.stage.key === "nominated") {
      out.push(task(Object.assign({}, base, {
        id: id + "|warmup", kind: "warmup", owner: "Gaby",
        title: "Nudge " + (coach || "the coach") + " — warm-up not done",
        detail: name + " was nominated " + Math.round(h) + "h ago and the coach has not sent the Everfit warm-up.",
        hours: h, threshold: settings.nominationWarmupHours,
        action: { stage: S.NOMINATION_WARMUP, label: "Warm-up done", event: "Coach warm-up confirmed" }
      })));
    }

    /* --- 2 · Outreach: no client response --- */
    if (t.stage.key === "outreach") {
      out.push(task(Object.assign({}, base, {
        id: id + "|outreach", kind: "outreach", owner: "Gaby",
        title: "Follow up with " + name + " — no answer to the outreach",
        detail: "Outreach sent " + Math.round(h) + "h ago. Follow-up cadence from the SOP.",
        hours: h, threshold: settings.outreachFollowupHours,
        action: { stage: S.OUTREACH_ACCEPTED, label: "They said yes", event: "Client accepted" }
      })));
    }

    /* --- 3 · Invited: check folder 03 for the video --- *
     * The decision from 2026-08-07: nothing watches Drive folder 03, so this
     * standing task IS the detection mechanism (Option A). It escalates from
     * "go look" to "nudge the client" once the threshold passes, but it stays
     * ONE task per client rather than two competing rows. */
    if (t.stage.key === "invited") {
      var late = h > settings.inviteUploadFollowupHours;
      out.push(task(Object.assign({}, base, {
        id: id + "|video", kind: "check-folder-03", owner: "Gaby",
        title: late
          ? "No video after " + Math.round(h) + "h — nudge " + name
          : "Check folder 03 for " + name + "'s video",
        detail: late
          ? "Kickoff went out " + Math.round(h) + "h ago and no video has been marked received. Check the folder first, then nudge on Everfit."
          : "The client uploads straight into their Drive folder and nothing fires when they do. Open folder 03, and mark it received if the video is there.",
        hours: h, threshold: settings.inviteUploadFollowupHours,
        action: { stage: S.COLLECTION_VIDEO, label: "Mark video received",
                  event: "Client video marked received from the queue" }
      })));
    }

    /* --- 4 · Collecting: per input, routed to its owner --- */
    if (t.stage.key === "collecting") {
      // Coach form → the COACH, not Gaby (spec §5).
      var cf = t.inputs.coachForm;
      if (!A(cf.state)) {
        out.push(task(Object.assign({}, base, {
          id: id + "|coachform", kind: "coach-form",
          owner: coach || "Gaby", ownerKind: coach ? "coach" : "person",
          title: "Fill the coach form for " + name,
          detail: cf.state === "flagged"
            ? "A response arrived but could not be matched: " + cf.text
            : "No coach form has arrived for this client yet.",
          hours: h, threshold: settings.collectingStaleHours
        })));
      }
      // Gaby's manual pulls — these two plus the video are what gate Producing.
      [["everfit", "Everfit data"], ["photos", "photos"]].forEach(function (p) {
        if (!A(t.inputs[p[0]].state)) {
          var inp = CFG.INPUTS.filter(function (x) { return x.key === p[0]; })[0];
          out.push(task(Object.assign({}, base, {
            id: id + "|" + p[0], kind: "manual-pull", owner: "Gaby",
            title: "Pull " + p[1] + " for " + name,
            detail: "Required before this testimonial can move to Producing.",
            hours: h, threshold: settings.collectingStaleHours, blocking: true,
            action: { stage: inp.markStage, label: "Mark received",
                      event: inp.label + " marked received from the queue" }
          })));
        }
      });
      // The gate is satisfied — the only thing left is Gaby's confirmation.
      var lock = root.ClientCard.collectionLock(t);
      if (!lock.done && !lock.blockers.length) {
        out.push(task(Object.assign({}, base, {
          id: id + "|complete", kind: "collection-complete", owner: "Gaby",
          title: "Mark collection complete for " + name,
          detail: "Client video is in and both manual pulls are marked. This is the lock that unlocks Producing.",
          hours: h, threshold: settings.collectingStaleHours,
          action: { stage: S.COLLECTION_COMPLETE, label: "Mark complete",
                    event: "Everfit collection done — client video, Everfit data and photos in" }
        })));
      }
    }

    /* --- 5 · Producing: a piece is overdue → its owner, in the channel --- */
    if (t.stage.key === "producing") {
      CFG.PIECES.forEach(function (p) {
        if (t.pieces[p.key].done) return;
        out.push(task(Object.assign({}, base, {
          id: id + "|piece-" + p.key, kind: "piece",
          owner: p.owner, ownerKind: "producer", channel: CHANNEL,
          title: p.label + " for " + name,
          detail: "Paste the link on the client card to mark it done. " +
                  t.piecesDone + "/" + CFG.PIECES.length + " pieces complete.",
          hours: h, threshold: settings.producingPieceHours
        })));
      });
    }

    /* --- 6 · Review: Joey's approval --- */
    if (t.stage.key === "review") {
      out.push(task(Object.assign({}, base, {
        id: id + "|approval", kind: "approval", owner: "Joey",
        title: "Approve " + name + " — all five pieces are in",
        detail: "Every link is gathered on the client card.",
        hours: h, threshold: settings.approvalPendingHours,
        action: { stage: S.APPROVAL_APPROVED, label: "Approve", event: "Approved from the queue" }
      })));
    }

    /* --- 7 · Scheduled: the two scheduling checks --- *
     * Phase 4 gives these a calendar; until then they are plain tasks so the
     * pipeline is not a dead end. The buffer alert belongs to Phase 4. */
    if (t.stage.key === "scheduled") {
      if (!t.lastByStage[root.StateBuilder.normStage(S.SCHEDULE_POST)]) {
        out.push(task(Object.assign({}, base, {
          id: id + "|sched-post", kind: "schedule", owner: "Gaby",
          title: "Schedule the collaboration post for " + name,
          hours: h, threshold: settings.approvalPendingHours,
          action: { stage: S.SCHEDULE_POST, label: "Post scheduled", event: "Collaboration post scheduled" }
        })));
      }
      if (!t.lastByStage[root.StateBuilder.normStage(S.SCHEDULE_EMAIL)]) {
        out.push(task(Object.assign({}, base, {
          id: id + "|sched-email", kind: "schedule", owner: "Gaby",
          title: "Schedule the weekly email for " + name,
          hours: h, threshold: settings.approvalPendingHours,
          action: { stage: S.SCHEDULE_EMAIL, label: "Email scheduled", event: "Weekly email scheduled" }
        })));
      }
    }

    /* --- 8 · Manual-review flags become tasks (spec §5) --- *
     * These NEVER block the pipeline. A Meet or Loom flag frequently means the
     * client simply has none, which nobody can resolve — but it must not sit
     * unnoticed either, so it surfaces as a task Gaby can resolve or leave. */
    t.flags.forEach(function (f) {
      var auto = (f.input === "meet" || f.input === "loom" || f.input === "coachForm");
      out.push(task(Object.assign({}, base, {
        id: id + "|flag-" + f.input, kind: "manual-review", owner: "Gaby",
        severity: "review",
        title: "Review the " + f.label.toLowerCase() + " flag for " + name,
        detail: (auto ? "Does not block the pipeline — often just means this client has none. " : "") + f.text,
        action: { stage: S.COLLECTION_FLAG_RESOLVED, label: "Resolve",
                  event: f.label + " — checked manually and confirmed present" }
      })));
    });

    /* --- 9 · Identity could not be resolved --- */
    if (!t.identity.resolved) {
      out.push(task(Object.assign({}, base, {
        id: id + "|identity", kind: "manual-review", owner: "Gaby", severity: "review",
        title: "Resolve the identity for " + t.email,
        detail: t.identity.reason + " — the system never guesses."
      })));
    }

    return out;
  }

  /* ---------- Public ---------- */

  /**
   * @param {Object} state  StateBuilder.build() output
   * @returns {{tasks:Array, byOwner:Object, owners:Array, counts:Object}}
   */
  function build(state) {
    var settings = state.settings;
    var tasks = [];

    state.testimonials.forEach(function (t) {
      if (t.stage.terminal) return;                 // closed testimonials raise nothing
      tasks = tasks.concat(rulesFor(t, settings));
    });

    // System-level engine rows with no client email (spec §5: a silent
    // mismatch must never sit unnoticed).
    state.systemFlags.forEach(function (e, i) {
      tasks.push(task({
        id: "system|" + e.rowNumber, kind: "manual-review", owner: "Gaby", severity: "review",
        title: "Unattributed engine flag — " + e.stage,
        detail: e.event
      }));
    });

    var rank = { overdue: 0, due: 1, review: 2 };
    tasks.sort(function (a, b) {
      if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
      if (b.overdueBy !== a.overdueBy) return b.overdueBy - a.overdueBy;
      var ah = isFinite(a.hours) ? a.hours : -1, bh = isFinite(b.hours) ? b.hours : -1;
      return bh - ah;
    });

    var byOwner = {};
    tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

    return {
      tasks: tasks,
      byOwner: byOwner,
      owners: Object.keys(byOwner).sort(),
      counts: {
        total:   tasks.length,
        overdue: tasks.filter(function (t) { return t.severity === "overdue"; }).length,
        due:     tasks.filter(function (t) { return t.severity === "due"; }).length,
        review:  tasks.filter(function (t) { return t.severity === "review"; }).length,
        channel: tasks.filter(function (t) { return t.channel === CHANNEL; }).length
      }
    };
  }

  root.Alerts = { build: build, DM: DM, CHANNEL: CHANNEL, hoursSince: hoursSince };
})(typeof window !== "undefined" ? window : this);
