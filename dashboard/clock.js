/**
 * Testimonial Dashboard — the clock
 *
 * Every rule that asks "how long has this been waiting?" reads TDClock.now()
 * rather than Date.now(). One seam, so a simulated clock is exact instead of
 * approximated by shifting event timestamps.
 *
 * ?sim=+60h shifts it forward so a threshold can be watched crossing without
 * waiting the real hours. Formats accepted:
 *
 *   ?sim=+60h   ?sim=60h   ?sim=2d   ?sim=-24h   ?sim=90m   ?sim=60
 *
 * A leading "+" is preserved even though a query string decodes "+" as a
 * space — the parser tolerates the space, so the URL you would naturally type
 * works as typed.
 *
 * WHILE SHIFTED, WRITES ARE REFUSED. A time-shifted view plus a live action
 * button is a genuine footgun: a task can look overdue when it is not, and
 * the follow-up would go out early. Reading is safe, acting is not, so the
 * simulation is strictly read-only.
 */
(function (root) {
  "use strict";

  var shiftMs = 0;
  var raw = "";

  /** "+60h" | "2d" | "90m" | "-24h" | "60" → milliseconds. NaN if unparseable. */
  function parse(text) {
    var t = String(text == null ? "" : text).trim().replace(/^\+/, "");
    if (!t) return NaN;
    var m = t.match(/^(-?\d+(?:\.\d+)?)\s*([hdm]?)$/i);
    if (!m) return NaN;
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return NaN;
    var unit = (m[2] || "h").toLowerCase();
    return n * (unit === "d" ? 864e5 : unit === "m" ? 6e4 : 36e5);
  }

  /** Read ?sim= from the address bar. Runs once, before the first render. */
  function init(search) {
    var q = String(search == null ? (root.location ? root.location.search : "") : search);
    var m = q.match(/[?&]sim=([^&#]*)/);
    if (!m) { shiftMs = 0; raw = ""; return 0; }
    // decodeURIComponent turns "+" into "+", but the browser already turned a
    // literal "+" into a space by the time it reaches us. Both are accepted.
    var value = decodeURIComponent(m[1].replace(/\+/g, " "));
    var ms = parse(value);
    if (!isFinite(ms)) { shiftMs = 0; raw = value; return NaN; }
    shiftMs = ms;
    raw = value;
    return ms;
  }

  function now() { return Date.now() + shiftMs; }
  function isSimulated() { return shiftMs !== 0; }
  function shiftHours() { return shiftMs / 36e5; }

  function label() {
    if (!shiftMs) return "";
    var h = shiftMs / 36e5;
    var sign = h > 0 ? "+" : "";
    return Math.abs(h) >= 48 ? sign + (h / 24).toFixed(1).replace(/\.0$/, "") + " days"
                             : sign + Math.round(h) + " hours";
  }

  root.TDClock = {
    init: init, parse: parse, now: now,
    isSimulated: isSimulated, shiftHours: shiftHours, label: label,
    raw: function () { return raw; },
    _set: function (ms) { shiftMs = ms; }        // tests only
  };
})(typeof window !== "undefined" ? window : this);
