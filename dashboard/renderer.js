/**
 * Testimonial Dashboard — Renderer / shell
 *
 * Owns the chrome (nav, actor picker, status) and routes between views:
 *   #/board            the pipeline board          (pipeline-board.js)
 *   #/client/<key>     one client card             (client-card.js)
 *   #/foundation       setup health + diagnostics  (here)
 *
 * Everything reads the object returned by StateBuilder.build().
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

  function pill(text, kind) { return '<span class="badge badge--' + kind + '">' + esc(text) + "</span>"; }

  /* ---------- Routing ---------- */

  function currentRoute() {
    var h = (root.location.hash || "").replace(/^#/, "");
    if (h.indexOf("/client/") === 0) return { view: "client", key: decodeURIComponent(h.slice(8)) };
    if (h === "/foundation")         return { view: "foundation" };
    return { view: "board" };
  }

  /* ---------- Foundation view (Phase 1 diagnostics) ---------- */

  function renderHealth(state) {
    var checks = [
      { label: "Sheets API key", ok: CFG.API_KEY.indexOf("PASTE_") !== 0, detail: "configured" },
      { label: "Apps Script Web App", ok: CFG.WEB_APP_URL.indexOf("PASTE_") !== 0, detail: "configured" },
      { label: "Event Log read", ok: state.counts.events > 0, detail: state.counts.events + " rows" },
      { label: "Cycle column", ok: state.cycleColumnPresent,
        detail: state.cycleColumnPresent ? "present" : "not added — all rows fold to cycle 1" },
      { label: "Settings tab", ok: state.settingsTabExists,
        detail: state.settingsTabExists ? "reading live values" : "missing — using code defaults" },
      { label: "Roster", ok: state.counts.roster > 0, detail: state.counts.roster + " active clients" },
      { label: "Mastersheet fallback", ok: state.counts.mastersheet > 0, detail: state.counts.mastersheet + " contract rows" },
      { label: "Signal tab", ok: state.counts.signal > 0, detail: state.counts.signal + " rows (folder-03 links)" },
      { label: "Timestamps parsed", ok: state.counts.unparseableDates === 0,
        detail: state.counts.unparseableDates === 0 ? "all rows, as date serials" : state.counts.unparseableDates + " unparseable" }
    ];
    return '<div class="grid grid--health">' + checks.map(function (c) {
      return '<div class="card card--check ' + (c.ok ? "is-ok" : "is-warn") + '">' +
        '<div class="check__dot"></div><div><div class="check__label">' + esc(c.label) + "</div>" +
        '<div class="check__detail">' + esc(c.detail) + "</div></div></div>";
    }).join("") + "</div>";
  }

  function renderSettings(state) {
    var rows = Object.keys(CFG.SETTINGS_DEFAULTS).map(function (k) {
      var live = state.settings[k], def = CFG.SETTINGS_DEFAULTS[k];
      return "<tr><td><code>" + esc(k) + "</code></td><td>" + esc(live === "" ? "—" : live) + "</td><td>" +
             (String(live) === String(def) ? pill("default", "muted") : pill("from tab", "ok")) + "</td></tr>";
    }).join("");
    return '<table class="table"><thead><tr><th>Key</th><th>Value</th><th>Source</th></tr></thead><tbody>' +
           rows + "</tbody></table>";
  }

  function renderSystemEvents(state) {
    if (!state.systemEvents.length) return '<p class="empty">No system-level events.</p>';
    var rows = state.systemEvents.slice().reverse().map(function (e) {
      return "<tr><td>" + esc(e.stage) + "</td>" +
        '<td class="evtext">' + esc(e.event) + "</td>" +
        '<td class="sub">' + esc(root.ClientCard.fmtWhen(e.ts)) + "</td>" +
        "<td>" + (root.StateBuilder.isFlag(e) ? pill("needs review", "bad") : pill("info", "muted")) + "</td></tr>";
    }).join("");
    return '<p class="section__sub">The engine writes <code>Confirmation</code> and an unresolved coach-form selector with an <strong>empty client email</strong>. They belong to no testimonial, so they live here instead of inventing a phantom one.</p>' +
      '<table class="table"><thead><tr><th>Stage</th><th>Event</th><th>When</th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table>";
  }

  function renderReview(state) {
    var out = "";
    if (state.unresolved.length) {
      out += "<h3>Unresolved identities</h3><ul class='list'>" + state.unresolved.map(function (t) {
        return "<li><code>" + esc(t.email) + "</code> — " + esc(t.identity.reason) + "</li>";
      }).join("") + "</ul>";
    }
    if (state.openFlags.length) {
      out += "<h3>Open collection flags</h3><ul class='list'>" + state.openFlags.map(function (f) {
        return '<li><a href="#/client/' + encodeURIComponent(f.email + "::" + f.cycle) + '"><strong>' +
               esc(f.label) + "</strong></a> · <code>" + esc(f.email) + "</code>" +
               '<br><span class="flagtext">' + esc(f.text) + "</span></li>";
      }).join("") + "</ul>";
    }
    if (state.systemFlags.length) {
      out += "<h3>System flags</h3><ul class='list'>" + state.systemFlags.map(function (e) {
        return '<li>' + esc(e.stage) + '<br><span class="flagtext">' + esc(e.event) + "</span></li>";
      }).join("") + "</ul>";
    }
    return out || '<p class="empty">Nothing needs manual review.</p>';
  }

  function foundationView(state) {
    return section("Setup health", renderHealth(state), "Every dependency the dashboard needs, checked live.") +
      section("What the log contains",
        '<div class="grid grid--stats">' + [
          { n: state.counts.events,       l: "events" },
          { n: state.counts.clientEvents, l: "client events" },
          { n: state.counts.systemEvents, l: "system events (no email)" },
          { n: state.counts.testimonials, l: "testimonials (email × cycle)" },
          { n: state.openFlags.length,    l: "open flags" },
          { n: state.unresolved.length,   l: "unresolved identities" }
        ].map(function (i) {
          return '<div class="stat"><div class="stat__n">' + i.n + '</div><div class="stat__l">' + esc(i.l) + "</div></div>";
        }).join("") + "</div>") +
      section("Settings", renderSettings(state),
        state.settingsTabExists ? "Live values; missing keys fall back to the code default."
                                : "The Settings tab does not exist yet — these are code defaults.") +
      section("Manual review", renderReview(state)) +
      section("System events", renderSystemEvents(state));
  }

  /* ---------- Shell ---------- */

  function section(title, body, sub) {
    return '<section class="section"><h2>' + esc(title) + "</h2>" +
           (sub ? '<p class="section__sub">' + esc(sub) + "</p>" : "") + body + "</section>";
  }

  function renderNav(route) {
    var items = [
      { href: "#/board",      label: "Pipeline",   on: route.view === "board" || route.view === "client" },
      { href: "#/foundation", label: "Foundation", on: route.view === "foundation" }
    ];
    return items.map(function (i) {
      return '<a class="nav__item' + (i.on ? " is-on" : "") + '" href="' + i.href + '">' + esc(i.label) + "</a>";
    }).join("");
  }

  function renderActor() {
    var current = root.EventWriter.getActor();
    var opts = ['<option value="">— who are you? —</option>'].concat(
      CFG.PEOPLE.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === current ? " selected" : "") + ">" + esc(p) + "</option>";
      })
    ).join("");
    return '<select id="actor" class="' + (current ? "" : "is-unset") + '">' + opts + "</select>";
  }

  var boardOpts = { coach: "" };

  function render(state) {
    var route = currentRoute();
    el("nav").innerHTML = renderNav(route);
    el("actorSlot").innerHTML = renderActor();

    var host = el("app");
    if (route.view === "client") {
      host.innerHTML = root.ClientCard.render(state, route.key);
      root.ClientCard.wire(state, route.key);
    } else if (route.view === "foundation") {
      host.innerHTML = foundationView(state);
    } else {
      host.innerHTML = root.PipelineBoard.render(state, boardOpts);
      var cf = el("coachFilter");
      if (cf) cf.addEventListener("change", function () {
        boardOpts.coach = cf.value;
        render(state);
      });
    }

    var sel = el("actor");
    if (sel) sel.addEventListener("change", function () {
      if (sel.value) root.EventWriter.setActor(sel.value); else root.EventWriter.clearActor();
      sel.className = sel.value ? "" : "is-unset";
    });
  }

  function renderError(err) {
    el("app").innerHTML =
      '<section class="section"><h2>Could not load</h2>' +
      '<div class="card card--check is-warn"><div class="check__dot"></div><div>' +
      '<div class="check__label">' + esc(err.message) + "</div>" +
      '<div class="check__detail">Check dashboard/config.js — API key, sheet ids, and tab names.</div>' +
      "</div></div></section>";
  }

  root.Renderer = { render: render, renderError: renderError, currentRoute: currentRoute };
})(typeof window !== "undefined" ? window : this);
