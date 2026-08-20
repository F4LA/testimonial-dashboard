/**
 * Testimonial Dashboard — Action queue (Task Model v2)
 *
 * The dashboard is the home of the queue; Slack carries it out once a day.
 * Defaults to the signed-in person's own list — a queue showing everyone's
 * work is a report, not a worklist.
 *
 * Each task shows the action in plain words, the copy to paste where there is
 * any, and the buttons that advance its ladder. No pipeline stage names.
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

  var SEV_TEXT = { overdue: "overdue", due: "now", reminder: "pending", review: "review" };

  function taskRow(t, idx) {
    var age = '<span class="tsev tsev--' + esc(t.severity) + '">' +
      (isFinite(t.waitedHours) && t.severity !== "reminder"
        ? fmtAge(t.waitedHours) + " waiting"
        : SEV_TEXT[t.severity]) + "</span>";

    var buttons = (t.actions || []).map(function (a, i) {
      return '<button class="btn btn--sm' + (a.tone === "ok" ? " btn--ok" : "") +
        '" data-qact="1" data-id="' + esc(t.id) + '" data-i="' + i + '">' + esc(a.label) + "</button>";
    }).join("");

    // A step can carry more than one approved message (the raffle post-draw
    // task sends the winner text AND one thank-you per non-winner, each
    // addressed by name). Every copy shows its own label, so two messages can
    // never be confused for each other — the label is computed in
    // `Flows.evaluate` and is already "Copy message" for single-template steps.
    var withText = (t.copies || []).filter(function (c) { return !!c.text; });

    var copyBlock = "";
    if (withText.length) {
      copyBlock = withText.map(function (c, i) {
        return '<div class="copybox">' +
          '<button class="btn btn--sm" data-qcopy="1" data-id="' + esc(t.id) +
            '" data-copy="' + i + '">' + esc(c.label || "Copy message") + "</button>" +
          '<pre class="copybox__text">' + esc(c.text) + "</pre>" +
        "</div>";
      }).join("");
    } else if (t.copySource === "NONE") {
      copyBlock =
        '<div class="copybox copybox--missing">No approved message exists for this step yet. ' +
        "Send it in your own words and mark it here.</div>";
    }

    var noteField = (t.actions || []).some(function (a) { return a.needsNote; })
      ? '<input type="text" class="tasknote" data-note="' + esc(t.id) + '" placeholder="' +
        esc((t.actions.filter(function (a) { return a.needsNote; })[0] || {}).needsNote || "") + '">'
      : "";

    var link = t.clientKey
      ? '<a class="tlink" href="#/client/' + encodeURIComponent(t.clientKey) + '">' + esc(t.clientName) + " →</a>"
      : "";

    return '<li class="task task--' + esc(t.severity) + '">' +
      '<div class="task__main">' +
        '<div class="task__title">' + esc(t.title) +
          (t.blocking ? ' <span class="badge badge--warn">needed for production</span>' : "") + "</div>" +
        (t.detail ? '<div class="task__detail">' + esc(t.detail) + "</div>" : "") +
        copyBlock +
        (noteField ? '<div class="task__note">' + noteField + "</div>" : "") +
        '<div class="task__meta">' + link + "</div>" +
      "</div>" +
      '<div class="task__side">' + age + '<div class="task__btns">' + buttons + "</div></div>" +
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

  var view = { owner: null };

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
          '<button class="qtab' + (selected === "__all" ? " is-on" : "") + '" data-owner="__all">Everyone' +
          '<span class="qtab__n">' + alerts.counts.total + "</span></button>" +
        "</div>" +
        '<div class="qstats">' +
          '<span class="tsev tsev--overdue">' + alerts.counts.overdue + " overdue</span>" +
          '<span class="tsev tsev--due">' + alerts.counts.due + " now</span>" +
          '<span class="tsev tsev--reminder">' + alerts.counts.reminder + " pending</span>" +
          '<span class="tsev tsev--review">' + alerts.counts.review + " review</span>" +
        "</div>" +
      "</div>";

    var warn = alerts.problems.length
      ? '<div class="proxywarn">⚠ ' + esc(alerts.problems.join(" · ")) + "</div>"
      : "";

    var body;
    if (!alerts.counts.total) {
      body = '<section class="section"><p class="empty">Nothing to do. Every client is inside their window.</p></section>';
    } else if (selected === "__all") {
      body = alerts.owners.map(function (o) { return ownerSection(o, alerts.byOwner[o], o === actor); }).join("");
    } else if (!selected) {
      body = '<section class="section"><p class="empty">Pick who you are in the top bar to see your queue, ' +
             "or choose someone above.</p></section>";
    } else if (!alerts.byOwner[selected]) {
      body = '<section class="section"><h2>' + esc(selected) + "</h2>" +
             '<p class="empty">Nothing for you right now.</p></section>';
    } else {
      body = ownerSection(selected, alerts.byOwner[selected], selected === actor);
    }

    return warn + head + body + '<div id="queueResult" class="result"></div>';
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

      var copyBtn = e.target.closest ? e.target.closest("[data-qcopy]") : null;
      if (copyBtn) {
        var ct = find(copyBtn.getAttribute("data-id"));
        // Copy the message the button belongs to, not "the task's message" —
        // a step can hand over two, and the wrong one would reach a client.
        var picked = null;
        if (ct) {
          var withText2 = (ct.copies || []).filter(function (c) { return !!c.text; });
          picked = withText2[Number(copyBtn.getAttribute("data-copy")) || 0];
        }
        if (picked && picked.text && root.navigator && root.navigator.clipboard) {
          root.navigator.clipboard.writeText(picked.text).then(function () {
            root.Dialog.feedback(copyBtn, picked.label.replace(/^Copy the /, "The ").replace(/^Copy /, "") +
              " copied. Paste it into Everfit.", "ok");
          }).catch(function () {
            root.Dialog.feedback(copyBtn, "Could not copy automatically — select the text and copy it.", "warn");
          });
        }
        return;
      }

      var btn = e.target.closest ? e.target.closest("[data-qact]") : null;
      if (!btn) return;
      var t = find(btn.getAttribute("data-id"));
      if (!t) return;
      var action = (t.actions || [])[Number(btn.getAttribute("data-i"))];
      if (!action) return;

      function say(m, c) { root.Dialog.feedback(btn, m, c); }

      /* Most task buttons are one click, one write. A few need to ask something
       * first — the postponement has to know which month. `dialog` names the
       * question; the dialog itself lives with the client card, so the card and
       * the queue can never describe the same consequences differently. */
      if (action.dialog === "postpone") {
        var subject = ctx.state && ctx.state.byKey[t.clientKey];
        if (!subject) { say("Could not find this client.", "bad"); return; }
        root.ClientCard.askPostpone(subject).then(function (ev) {
          if (!ev) { say("Cancelled — nothing was written.", ""); return; }
          btn.disabled = true;
          say("Writing…", "");
          root.EventWriter.appendEvent({ email: t.email, stage: ev.stage, event: ev.event, cycle: t.cycle })
            .then(function (res) {
              say(res.message, res.verified ? "ok" : "warn");
              btn.disabled = false;
              if (res.verified && root.TDApp) root.TDApp.reload();
            })
            .catch(function (err) { say(err.message, "bad"); btn.disabled = false; });
        });
        return;
      }

      var text = action.event || "";
      if (action.needsNote) {
        var field = host.querySelector('.tasknote[data-note="' + CSS.escape(t.id) + '"]');
        var v = field ? field.value.trim() : "";
        if (!v) { say(action.needsNote + " is required.", "bad"); return; }
        text = v;
      }

      btn.disabled = true;
      say("Writing…", "");
      root.EventWriter.appendEvent({ email: t.email, stage: action.stage, event: text, cycle: t.cycle })
        .then(function (res) {
          say(res.message, res.verified ? "ok" : "warn");
          btn.disabled = false;
          if (res.verified && root.TDApp) root.TDApp.reload();
        })
        .catch(function (err) { say(err.message, "bad"); btn.disabled = false; });
    });

    function find(id) {
      return ctx.alerts.tasks.filter(function (x) { return x.id === id; })[0];
    }
  }

  root.QueueView = { render: render, wire: wire, _view: view };
})(typeof window !== "undefined" ? window : this);
