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
        var a = state.alerts;
        setStatus((a ? a.counts.overdue + " overdue · " + a.counts.total + " tasks · " : "") +
                  state.counts.testimonials + " testimonials", a && a.counts.overdue ? "bad" : "ok");
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

  /**
   * A Web App serves its DEPLOYED version, not the editor's current code.
   * Editing apps-script/Code.gs without redeploying leaves the old code
   * running, and every new action returns "Unknown action" — which is exactly
   * how the fan-out bridge failed silently. Check it, loudly, on every load.
   */
  function checkProxy() {
    root.EventWriter.checkVersion().then(function (res) {
      var bar = document.getElementById("proxyWarn");
      if (!bar) return;
      if (res.ok) { bar.hidden = true; bar.textContent = ""; return; }
      bar.hidden = false;
      bar.textContent = "⚠ " + res.message;
      root.Dialog.toast(res.message, "bad");
    });
  }

  function showSimBanner() {
    var bar = document.getElementById("simWarn");
    if (!bar) return;
    if (!root.TDClock.isSimulated()) {
      if (root.TDClock.raw()) {
        bar.hidden = false;
        bar.textContent = '⚠ Could not read ?sim=' + root.TDClock.raw() +
          '  ·  try +60h, 2d, 90m or -24h';
      } else { bar.hidden = true; }
      return;
    }
    bar.hidden = false;
    bar.textContent = "🕑 Simulated clock: " + root.TDClock.label() +
      " ahead of now. This is a preview — writing is disabled. Remove ?sim= from the URL to act for real.";
  }

  function init() {
    root.TDClock.init();
    showSimBanner();
    var v = document.getElementById("pagesUrl");
    if (v) v.textContent = CFG.PAGES_URL;

    var btn = document.getElementById("reload");
    if (btn) btn.addEventListener("click", function () { load().catch(function () {}); });

    // Hash routing: re-render from the state already in memory, no refetch.
    root.addEventListener("hashchange", rerender);

    load().catch(function () { /* already surfaced */ });
    checkProxy();
  }

  root.TDApp = { init: init, reload: load, rerender: rerender, state: null };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
