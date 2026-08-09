/**
 * Testimonial Dashboard — task walker (Task Model v2, D-090)
 *
 * Thin by design. The seven ladders live in `flows.js` as readable rules that
 * can be checked line by line against the spec; this file walks them, adds the
 * non-ladder manual-review items, sorts, and groups by owner.
 *
 * It enforces the two invariants that must not drift:
 *
 *   EVERY OWNER IS A REAL DASHBOARD USER. Coaches never own tasks. A coach
 *   owner is a bug, not a variant, so it is asserted rather than assumed.
 *
 *   ONE TASK PER FLOW PER CLIENT. Ladder rungs are sequential.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("alerts: TDConfig not loaded");

  var RANK = { overdue: 0, due: 1, reminder: 2, review: 3 };

  /** Manual-review items — no clock, never block. From the original spec §5:
   *  a silent mismatch must never sit unnoticed. */
  function reviewTasks(state) {
    var out = [];

    state.testimonials.forEach(function (t) {
      if (t.stage.terminal) return;
      var name = t.identity.clientName || t.email;

      t.flags.forEach(function (f) {
        var auto = (f.input === "meet" || f.input === "loom" || f.input === "coachForm");
        out.push({
          id: t.key + "|flag-" + f.input, flow: "review", rung: "flag", owner: "Gaby", severity: "review",
          title: "Review the " + f.label.toLowerCase() + " flag for " + name,
          detail: (auto ? "Does not hold up the pipeline. It often just means this client has none. " : "") + f.text,
          clientKey: t.key, clientName: name, email: t.email, cycle: t.cycle,
          actions: [{ label: "Resolve", stage: CFG.STAGES.COLLECTION_FLAG_RESOLVED,
                      event: f.label + " — checked manually and confirmed present" }]
        });
      });

      if (!t.identity.resolved) {
        out.push({
          id: t.key + "|identity", flow: "review", rung: "identity", owner: "Gaby", severity: "review",
          title: "Resolve the identity for " + t.email,
          detail: t.identity.reason + ". The system never guesses.",
          clientKey: t.key, clientName: name, email: t.email, cycle: t.cycle,
          actions: []
        });
      }
    });

    state.systemFlags.forEach(function (e) {
      out.push({
        id: "system|" + e.rowNumber, flow: "review", rung: "system", owner: "Gaby", severity: "review",
        title: "Unattributed engine flag — " + e.stage,
        detail: e.event, clientKey: "", clientName: "", email: "", cycle: 1, actions: []
      });
    });

    return out;
  }

  /**
   * @param {Object} state  StateBuilder.build() output
   * @returns {{tasks:Array, byOwner:Object, owners:Array, counts:Object, problems:Array}}
   */
  function build(state) {
    var settings = state.settings;
    var tasks = [];
    var problems = [];

    state.testimonials.forEach(function (t) {
      var seenFlows = {};
      root.Flows.evaluate(t, settings).forEach(function (task) {
        // Invariant: one task per flow per client.
        if (seenFlows[task.flow]) {
          problems.push("Two tasks from flow '" + task.flow + "' for " + t.key);
          return;
        }
        seenFlows[task.flow] = true;

        task.id = t.key + "|" + task.flow + "|" + task.rung;
        task.clientKey = t.key;
        task.clientName = t.identity.clientName || t.email;
        task.email = t.email;
        task.cycle = t.cycle;
        tasks.push(task);
      });
    });

    tasks = tasks.concat(reviewTasks(state));

    // Invariant: every owner is a real dashboard user. Coaches are never owners.
    tasks.forEach(function (t) {
      if (CFG.PEOPLE.indexOf(t.owner) < 0) {
        problems.push("Task '" + t.title + "' has owner '" + t.owner + "', who is not a dashboard user.");
      }
    });

    tasks.sort(function (a, b) {
      if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
      var aw = isFinite(a.waitedHours) ? a.waitedHours : -1;
      var bw = isFinite(b.waitedHours) ? b.waitedHours : -1;
      return bw - aw;
    });

    var byOwner = {};
    tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

    // Stable owner order: the people who work the queue most, first.
    var owners = CFG.PEOPLE.filter(function (p) { return byOwner[p]; })
      .concat(Object.keys(byOwner).filter(function (o) { return CFG.PEOPLE.indexOf(o) < 0; }));

    function n(sev) { return tasks.filter(function (t) { return t.severity === sev; }).length; }

    return {
      tasks: tasks, byOwner: byOwner, owners: owners, problems: problems,
      counts: {
        total: tasks.length,
        overdue: n("overdue"), due: n("due"),
        reminder: n("reminder"), review: n("review")
      }
    };
  }

  root.Alerts = { build: build, RANK: RANK };
})(typeof window !== "undefined" ? window : this);
