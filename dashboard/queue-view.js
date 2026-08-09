/**
 * Testimonial Dashboard — Action queue (Phase 3)
 *
 * The dashboard is the home of the queue (spec §5). Slack carries it out to
 * people once a day; this is where they come to work.
 *
 * Defaults to the signed-in person's own list — "their today" — because a
 * queue that shows everyone's work is a report, not a worklist. The other
 * owners are one click away.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("queue-view: TDConfig not loaded");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(id) { return document.getElementById(id); }

  function fmtAge(h) {
    if (!isFinite(h)) return "";
    if (h < 1)  return Math.max(1, Math.round(h * 60)) + "m";
    if (h < 48) return Math.round(h) + "h";
    return Math.round(h / 24) + "d";
  }

  var SEV_LABEL = { overdue: "overdue", due: "due", review: "review" };

  function taskRow(t) {
    var age = "";
    if (t.severity === "overdue") {
      age = '<span class="tsev tsev--overdue">' + fmtAge(t.overdueBy) + " over</span>";
    } else if (isFinite(t.hours) && isFinite(t.threshold)) {
      age = '<span class="tsev tsev--due">' + fmtAge(t.hours) + " / " + fmtAge(t.threshold) + "</span>";
    } else {
      age = '<span class="tsev tsev--review">review</span>';
    }

    var act = t.action
      ? '<button class="btn btn--sm" data-qact="1" data-id="' + esc(t.id) + '">' + esc(t.action.label) + "</button>"
      : "";

    var link = t.clientKey
      ? '<a class="tlink" href="#/client/' + encodeURIComponent(t.clientKey) + '">' + esc(t.clientName) + " →</a>"
      : "";

    return '<li class="task task--' + esc(t.severity) + '">' +
      '<div class="task__main">' +
        '<div class="task__title">' + esc(t.title) +
          (t.blocking ? ' <span class="badge badge--warn">blocks Producing</span>' : "") + "</div>" +
        (t.detail ? '<div class="task__detail">' + esc(t.detail) + "</div>" : "") +
        '<div class="task__meta">' + link +
          (t.stageLabel ? '<span class="sub"> · ' + esc(t.stageLabel) + "</span>" : "") +
          (t.channel === root.Alerts.CHANNEL ? ' <span class="badge badge--muted">content channel</span>' : "") +
        "</div>" +
      "</div>" +
      '<div class="task__side">' + age + act + "</div>" +
      "</li>";
  }

  function ownerSection(owner, tasks, isMine) {
    var over = tasks.filter(function (t) { return t.severity === "overdue"; }).length;
    return '<section class="section">' +
      "<h2>" + esc(owner) + (isMine ? " — your queue" : "") +
        ' <span class="sub">· ' + tasks.length + " item" + (tasks.length === 1 ? "" : "s") +
        (over ? " · " + over + " overdue" : "") + "</span></h2>" +
      '<ul class="tasks">' + tasks.map(taskRow).join("") + "</ul>" +
      "</section>";
  }

  var view = { owner: null };   // null = "my queue" from the actor picker

  function render(state, alerts) {
    var actor = root.EventWriter.getActor();
    var selected = view.owner || actor || "";

    var tabs = alerts.owners.map(function (o) {
      var n = alerts.byOwner[o].length;
      var over = alerts.byOwner[o].filter(function (t) { return t.severity === "overdue"; }).length;
      return '<button class="qtab' + (o === selected ? " is-on" : "") + '" data-owner="' + esc(o) + '">' +
        esc(o) + '<span class="qtab__n' + (over ? " is-over" : "") + '">' + n + "</span></button>";
    }).join("");

    var head =
      '<div class="qbar">' +
        '<div class="qtabs">' + tabs +
          '<button class="qtab' + (selected === "__all" ? " is-on" : "") + '" data-owner="__all">Everyone<span class="qtab__n">' +
          alerts.counts.total + "</span></button>" +
        "</div>" +
        '<div class="qstats">' +
          '<span class="tsev tsev--overdue">' + alerts.counts.overdue + " overdue</span>" +
          '<span class="tsev tsev--due">' + alerts.counts.due + " due</span>" +
          '<span class="tsev tsev--review">' + alerts.counts.review + " review</span>" +
        "</div>" +
      "</div>";

    var body;
    if (!alerts.counts.total) {
      body = '<section class="section"><p class="empty">Nothing to do. Every testimonial is inside its thresholds.</p></section>';
    } else if (selected === "__all") {
      body = alerts.owners.map(function (o) { return ownerSection(o, alerts.byOwner[o], o === actor); }).join("");
    } else if (!selected) {
      body = '<section class="section"><p class="empty">Pick who you are in the top bar to see your queue, ' +
             "or choose an owner above.</p></section>";
    } else if (!alerts.byOwner[selected]) {
      body = '<section class="section"><h2>' + esc(selected) + "</h2>" +
             '<p class="empty">Nothing assigned right now.</p></section>';
    } else {
      body = ownerSection(selected, alerts.byOwner[selected], selected === actor);
    }

    var channelNote = alerts.counts.channel
      ? '<section class="section"><h3>Content channel</h3>' +
        '<p class="section__sub">' + alerts.counts.channel + " production item" +
        (alerts.counts.channel === 1 ? "" : "s") +
        " surface in the testimonial-management channel rather than a DM, so Gaby can push Miguel or the agency in the open. Owners are labelled on each task.</p></section>"
      : "";

    return head + body + channelNote + '<div id="queueResult" class="result"></div>';
  }

  var wired = false;
  var ctx = { state: null, alerts: null };

  function wire(state, alerts) {
    ctx.state = state; ctx.alerts = alerts;
    if (wired) return;
    var host = el("app");
    if (!host) return;
    wired = true;

    host.addEventListener("click", function (e) {
      var tab = e.target.closest ? e.target.closest("[data-owner]") : null;
      if (tab) {
        view.owner = tab.getAttribute("data-owner");
        if (root.TDApp) root.TDApp.rerender();
        return;
      }

      var btn = e.target.closest ? e.target.closest("[data-qact]") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var t = ctx.alerts.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t || !t.action) return;

      var out = el("queueResult");
      function say(m, c) { root.Dialog.feedback(btn, m, c); }

      btn.disabled = true;
      say("Writing…", "");
      root.EventWriter.appendEvent({
        email: t.email, stage: t.action.stage, event: t.action.event, cycle: t.cycle
      }).then(function (res) {
        say(res.message, res.verified ? "ok" : "warn");
        btn.disabled = false;
        if (res.verified && root.TDApp) root.TDApp.reload();
      }).catch(function (err) {
        say(err.message, "bad");
        btn.disabled = false;
      });
    });
  }

  root.QueueView = { render: render, wire: wire, _view: view };
})(typeof window !== "undefined" ? window : this);
