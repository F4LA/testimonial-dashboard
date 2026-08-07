/**
 * Testimonial Dashboard — Orchestrator
 *
 * Load order (set in index.html):
 *   config → sheets-reader → identity → state-builder → event-writer → renderer → app
 *
 * The whole app is: read the sheets, fold the event log into state, render.
 * There is no local store and no cache — the event log is the memory.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;

  function setStatus(text, kind) {
    var node = document.getElementById("status");
    if (!node) return;
    node.textContent = text;
    node.className = "status" + (kind ? " status--" + kind : "");
  }

  function load() {
    setStatus("Loading…", "busy");
    return root.SheetsReader.loadAll()
      .then(function (data) {
        var state = root.StateBuilder.build(data);
        root.TDApp.state = state;
        root.Renderer.render(state);
        setStatus("Loaded " + state.counts.events + " events · " +
                  state.counts.testimonials + " testimonials · " +
                  new Date().toLocaleTimeString(), "ok");
        return state;
      })
      .catch(function (err) {
        if (root.console) root.console.error(err);
        root.Renderer.renderError(err);
        setStatus("Load failed", "bad");
        throw err;
      });
  }

  function init() {
    var v = document.getElementById("pagesUrl");
    if (v) v.textContent = CFG.PAGES_URL;

    var btn = document.getElementById("reload");
    if (btn) btn.addEventListener("click", function () { load().catch(function () {}); });

    load().catch(function () { /* already surfaced */ });
  }

  root.TDApp = { init: init, reload: load, state: null };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
