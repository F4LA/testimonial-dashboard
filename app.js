/**
 * Testimonial Dashboard — Orchestrator
 *
 * Load order (index.html):
 *   config → sheets-reader → identity → state-builder → event-writer
 *          → pipeline-board → client-card → renderer → app
 *
 * The whole app is: read the sheets, fold the event log into state, render.
 * No local store and no cache — the event log is the memory.
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
        setStatus(state.counts.testimonials + " testimonials · " +
                  state.counts.events + " events · " +
                  state.openFlags.length + " flags", "ok");
        return state;
      })
      .catch(function (err) {
        if (root.console) root.console.error(err);
        root.Renderer.renderError(err);
        setStatus("Load failed", "bad");
        throw err;
      });
  }

  function rerender() {
    if (root.TDApp.state) root.Renderer.render(root.TDApp.state);
  }

  function init() {
    var v = document.getElementById("pagesUrl");
    if (v) v.textContent = CFG.PAGES_URL;

    var btn = document.getElementById("reload");
    if (btn) btn.addEventListener("click", function () { load().catch(function () {}); });

    // Hash routing: re-render from the state already in memory, no refetch.
    root.addEventListener("hashchange", rerender);

    load().catch(function () { /* already surfaced */ });
  }

  root.TDApp = { init: init, reload: load, rerender: rerender, state: null };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
