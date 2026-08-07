/**
 * Testimonial Dashboard — Renderer (Phase 1)
 *
 * Phase 1 has no pipeline board and no client card — those are Phase 2. What
 * it renders is the foundation made visible: setup health, identity
 * resolution, the folded state per (email, cycle), open manual-review flags,
 * and a guarded write test.
 *
 * Everything here reads the object returned by StateBuilder.build().
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("renderer: TDConfig not loaded");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(id) { return document.getElementById(id); }

  function fmtHours(h) {
    if (!isFinite(h)) return "—";
    if (h < 1) return Math.round(h * 60) + "m";
    if (h < 48) return Math.round(h) + "h";
    return Math.round(h / 24) + "d";
  }

  function fmtWhen(ts) {
    if (!isFinite(ts)) return "—";
    var d = new Date(ts);
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", " +
           d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function pill(text, kind) {
    return '<span class="pill pill--' + kind + '">' + esc(text) + "</span>";
  }

  /* ---------- Setup health ---------- */

  function renderHealth(state) {
    var checks = [
      { label: "Sheets API key",   ok: CFG.API_KEY.indexOf("PASTE_") !== 0,
        detail: CFG.API_KEY.indexOf("PASTE_") !== 0 ? "configured" : "not set — reads will fail" },
      { label: "Apps Script Web App", ok: CFG.WEB_APP_URL.indexOf("PASTE_") !== 0,
        detail: CFG.WEB_APP_URL.indexOf("PASTE_") !== 0 ? "configured" : "not set — writes disabled" },
      { label: "Event Log read",   ok: state.counts.events > 0,
        detail: state.counts.events + " rows" },
      { label: "Cycle column",     ok: state.cycleColumnPresent,
        detail: state.cycleColumnPresent ? "present" : "not added yet — all rows fold to cycle 1" },
      { label: "Settings tab",     ok: state.settingsTabExists,
        detail: state.settingsTabExists ? "reading live values" : "missing — using code defaults" },
      { label: "Roster",           ok: state.counts.roster > 0,
        detail: state.counts.roster + " active clients" },
      { label: "Mastersheet fallback", ok: state.counts.mastersheet > 0,
        detail: state.counts.mastersheet + " contract rows" },
      { label: "Timestamps parsed", ok: state.counts.unparseableDates === 0,
        detail: state.counts.unparseableDates === 0 ? "all rows" : state.counts.unparseableDates + " unparseable" }
    ];

    return '<div class="grid grid--health">' + checks.map(function (c) {
      return '<div class="card card--check ' + (c.ok ? "is-ok" : "is-warn") + '">' +
        '<div class="check__dot"></div>' +
        '<div><div class="check__label">' + esc(c.label) + "</div>" +
        '<div class="check__detail">' + esc(c.detail) + "</div></div></div>";
    }).join("") + "</div>";
  }

  /* ---------- Counts ---------- */

  function renderCounts(state) {
    var items = [
      { n: state.counts.events,       l: "events" },
      { n: state.counts.testimonials, l: "testimonials (email × cycle)" },
      { n: state.counts.clients,      l: "distinct clients" },
      { n: state.openFlags.length,    l: "open manual-review flags" },
      { n: state.unresolved.length,   l: "unresolved identities" }
    ];
    return '<div class="grid grid--stats">' + items.map(function (i) {
      return '<div class="stat"><div class="stat__n">' + i.n + "</div>" +
             '<div class="stat__l">' + esc(i.l) + "</div></div>";
    }).join("") + "</div>";
  }

  /* ---------- Settings ---------- */

  function renderSettings(state) {
    var rows = Object.keys(CFG.SETTINGS_DEFAULTS).map(function (k) {
      var live = state.settings[k];
      var def  = CFG.SETTINGS_DEFAULTS[k];
      var isDefault = String(live) === String(def);
      return "<tr><td><code>" + esc(k) + "</code></td><td>" + esc(live === "" ? "—" : live) + "</td>" +
             "<td>" + (isDefault ? pill("default", "muted") : pill("from tab", "ok")) + "</td></tr>";
    }).join("");
    return '<table class="table"><thead><tr><th>Key</th><th>Value</th><th>Source</th></tr></thead>' +
           "<tbody>" + rows + "</tbody></table>";
  }

  /* ---------- Testimonials (the fold) ---------- */

  function inputDots(t) {
    return CFG.INPUTS.map(function (inp) {
      var s = t.inputs[inp.key];
      var cls = s.state === "received" ? "ok" : (s.state === "flagged" ? "flag" : "miss");
      var title = inp.label + ": " + s.state + (s.flagText ? " — " + s.flagText : "");
      return '<span class="dot dot--' + cls + '" title="' + esc(title) + '">' +
             esc(inp.short || inp.label.charAt(0)) + "</span>";
    }).join("");
  }

  function renderTestimonials(state) {
    if (!state.testimonials.length) {
      return '<p class="empty">No events in the log yet.</p>';
    }
    var rows = state.testimonials.map(function (t) {
      var id = t.identity;
      var who = id.resolved
        ? esc(id.clientName) + '<div class="sub">' + esc(id.coach || "no coach") +
          (id.source === "mastersheet" ? " · " + pill("former client", "warn") : "") + "</div>"
        : pill("UNRESOLVED", "bad") + '<div class="sub">' + esc(id.reason) + "</div>";

      var stageCell = esc(t.stage.label) +
        (t.stage.inferred ? " " + pill("inferred", "warn") : "") +
        '<div class="sub">' + fmtHours(t.hoursInStage) + " in stage</div>";

      return "<tr>" +
        "<td>" + who + '<div class="sub mono">' + esc(t.email) + "</div></td>" +
        "<td>" + t.cycle + "</td>" +
        "<td>" + stageCell + "</td>" +
        '<td class="dots">' + inputDots(t) + "</td>" +
        "<td>" + t.piecesDone + "/" + CFG.PIECES.length +
          (t.readyForReview ? " " + pill("ready", "ok") : "") + "</td>" +
        "<td>" + (t.flags.length ? pill(t.flags.length + " open", "bad") : pill("none", "muted")) + "</td>" +
        "<td>" + esc(t.events.length) + '<div class="sub">' + esc(fmtWhen(t.lastActivityAt)) + "</div></td>" +
        "</tr>";
    }).join("");

    return '<table class="table"><thead><tr>' +
      "<th>Client</th><th>Cycle</th><th>Stage</th><th>Inputs</th><th>Pieces</th><th>Flags</th><th>Events</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table>" +
      '<p class="legend">Input dots: ' +
      CFG.INPUTS.map(function (i) { return esc((i.short || "?") + " = " + i.label); }).join(" · ") +
      " — green received, red flagged, grey missing. Hover for the flag text.</p>";
  }

  /* ---------- Manual-review flags ---------- */

  function renderFlags(state) {
    if (!state.openFlags.length && !state.unresolved.length) {
      return '<p class="empty">Nothing needs manual review.</p>';
    }
    var out = "";
    if (state.unresolved.length) {
      out += "<h3>Unresolved identities</h3><ul class='list'>" + state.unresolved.map(function (t) {
        return "<li><code>" + esc(t.email) + "</code> — " + esc(t.identity.reason) + "</li>";
      }).join("") + "</ul>";
    }
    if (state.openFlags.length) {
      out += "<h3>Open collection flags</h3><ul class='list'>" + state.openFlags.map(function (f) {
        return "<li><strong>" + esc(f.input) + "</strong> · <code>" + esc(f.email) + "</code> " +
               '<span class="sub">' + esc(fmtWhen(f.at)) + "</span><br>" +
               '<span class="flagtext">' + esc(f.text) + "</span></li>";
      }).join("") + "</ul>";
    }
    return out;
  }

  /* ---------- Person picker ---------- */

  function renderActor() {
    var current = root.EventWriter.getActor();
    var opts = ['<option value="">— select who you are —</option>'].concat(
      CFG.PEOPLE.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === current ? " selected" : "") + ">" + esc(p) + "</option>";
      })
    ).join("");
    return '<label for="actor">Acting as</label> <select id="actor">' + opts + "</select>" +
      '<span id="actorState" class="' + (current ? "ok" : "warn") + '">' +
      (current ? "Writes will be attributed to " + esc(current) + "." : "No writes allowed until you pick a name.") +
      "</span>";
  }

  /* ---------- Write test (guarded) ---------- */

  function renderWriteTest(state) {
    var emails = {};
    state.testimonials.forEach(function (t) { emails[t.email] = t.identity.clientName || t.email; });
    var opts = Object.keys(emails).map(function (e) {
      return '<option value="' + esc(e) + '">' + esc(emails[e]) + " — " + esc(e) + "</option>";
    }).join("");

    var stages = root.EventWriter.allowedStages().map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + "</option>";
    }).join("");

    return '<div class="writebox">' +
      '<div class="field"><label for="wEmail">Client</label><select id="wEmail">' + opts + "</select></div>" +
      '<div class="field"><label for="wStage">Stage</label><select id="wStage">' + stages + "</select></div>" +
      '<div class="field"><label for="wCycle">Cycle</label><input id="wCycle" type="number" min="1" value="1"></div>' +
      '<div class="field field--wide"><label for="wEvent">Event (the detail)</label>' +
      '<input id="wEvent" type="text" placeholder="e.g. Phase 1 write-path test"></div>' +
      "</div>" +
      '<div class="preview"><div class="preview__title">Row that will be appended</div>' +
      '<pre id="wPreview">—</pre></div>' +
      '<div class="actions"><button id="wSend" class="btn btn--danger">Append this row to the live Event Log</button>' +
      '<span id="wResult" class="result"></span></div>' +
      '<p class="note">This writes to the real sheet. The row is appended — nothing is overwritten. ' +
      "After sending, the log is re-read to confirm the row actually landed.</p>";
  }

  /* ---------- Shell ---------- */

  function section(title, body, sub) {
    return '<section class="section"><h2>' + esc(title) + "</h2>" +
           (sub ? '<p class="section__sub">' + esc(sub) + "</p>" : "") + body + "</section>";
  }

  function render(state) {
    var host = el("app");
    host.innerHTML =
      section("Setup health", renderHealth(state),
        "Every dependency Phase 1 needs, checked live.") +
      section("What the log contains", renderCounts(state)) +
      section("Who is acting", '<div class="actorbar">' + renderActor() + "</div>",
        "No write is anonymous. Source is written as \"MANUAL - <name>\".") +
      section("Settings", renderSettings(state),
        state.settingsTabExists
          ? "Live values from the Settings tab; anything missing falls back to the code default."
          : "The Settings tab does not exist yet — these are the code defaults.") +
      section("Computed state — keyed on (email, cycle)", renderTestimonials(state),
        "Stage is derived from which events exist. Nothing here is stored.") +
      section("Manual review", renderFlags(state),
        "A flag is open only while it is still the newest word on that input.") +
      section("Write path test", renderWriteTest(state),
        "Phase 1 proves the write path end to end. Later phases write these events from real actions.");

    wire(state);
  }

  /* ---------- Events ---------- */

  function wire(state) {
    var actorSel = el("actor");
    if (actorSel) {
      actorSel.addEventListener("change", function () {
        var v = actorSel.value;
        if (v) root.EventWriter.setActor(v); else root.EventWriter.clearActor();
        var s = el("actorState");
        s.textContent = v ? "Writes will be attributed to " + v + "." : "No writes allowed until you pick a name.";
        s.className = v ? "ok" : "warn";
        updatePreview();
      });
    }

    ["wEmail", "wStage", "wCycle", "wEvent"].forEach(function (id) {
      var node = el(id);
      if (node) node.addEventListener("input", updatePreview);
      if (node) node.addEventListener("change", updatePreview);
    });

    function updatePreview() {
      var pv = el("wPreview");
      if (!pv) return;
      var actor = root.EventWriter.getActor();
      var email = el("wEmail") ? el("wEmail").value : "";
      var stage = el("wStage") ? el("wStage").value : "";
      var cycle = el("wCycle") ? el("wCycle").value : "1";
      var text  = el("wEvent") ? el("wEvent").value : "";
      pv.textContent =
        "Client email │ " + (email || "—") + "\n" +
        "Stage        │ " + (stage || "—") + "\n" +
        "Date and time│ (generated by Apps Script, spreadsheet timezone)\n" +
        "Event        │ " + (text || "—") + "\n" +
        "Source       │ " + (actor ? CFG.SOURCE_MANUAL + actor : "— no person selected —") + "\n" +
        "Cycle        │ " + (cycle || "1");
    }
    updatePreview();

    var send = el("wSend");
    if (send) {
      send.addEventListener("click", function () {
        var out = el("wResult");
        out.textContent = "";
        out.className = "result";
        send.disabled = true;
        out.textContent = "Sending…";
        root.EventWriter.appendEvent({
          email: el("wEmail").value,
          stage: el("wStage").value,
          event: el("wEvent").value,
          cycle: parseInt(el("wCycle").value, 10)
        }).then(function (res) {
          out.textContent = res.message;
          out.className = "result " + (res.verified ? "ok" : "warn");
          send.disabled = false;
          if (res.verified && root.TDApp) root.TDApp.reload();
        }).catch(function (err) {
          out.textContent = err.message;
          out.className = "result bad";
          send.disabled = false;
        });
      });
    }
  }

  function renderError(err) {
    el("app").innerHTML =
      '<section class="section"><h2>Could not load</h2>' +
      '<div class="card card--check is-warn"><div class="check__dot"></div><div>' +
      '<div class="check__label">' + esc(err.message) + "</div>" +
      '<div class="check__detail">Check dashboard/config.js — API key, sheet ids, and tab names.</div>' +
      "</div></div></section>";
  }

  root.Renderer = { render: render, renderError: renderError };
})(typeof window !== "undefined" ? window : this);
