/**
 * Testimonial Dashboard — Identity Resolution
 *
 * Email is the master key everywhere. This module turns an email into
 * { clientName, coach, coachSlack }, and NEVER guesses.
 *
 * Why there are two sources:
 *   The Roster tab is a QUERY view filtered to ACTIVE 1:1 clients. The Event
 *   Log is permanent. So every client eventually falls off the Roster while
 *   their events live on. Resolving only against the Roster would turn every
 *   past client into a false "unmatched" flag and bury the real ones.
 *
 * Resolution order:
 *   1. Roster            → active client. Full identity incl. coach Slack.
 *   2. Mastersheet Data  → former client. One row PER CONTRACT, so pick the
 *                          MOST RECENT contract (their latest relationship).
 *                          Has no name column (built from First + Last) and no
 *                          coach Slack column (resolved via the coach→Slack map
 *                          derived from the Roster).
 *   3. Neither           → unresolved. Raise a manual-review flag.
 */
(function (root) {
  "use strict";

  var CFG = root.TDConfig;
  if (!CFG) throw new Error("identity: TDConfig not loaded");

  var MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  /**
   * Contract dates are NOT consistently formatted in Mastersheet Data — the
   * same column mixes "August 5, 2024" and "5/6/2026". Handle both; return
   * NaN for anything else rather than inventing a date.
   */
  function parseLooseDate(s) {
    if (!s) return NaN;
    var t = String(s).trim();

    // "August 5, 2024" / "Aug 5 2024"
    var m = t.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      var mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mo != null) return new Date(+m[3], mo, +m[2]).getTime();
    }
    // "5/6/2026" — M/D/YYYY (US order, consistent with this sheet)
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]).getTime();

    // "2026-05-06"
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();

    return NaN;
  }

  /**
   * Build the resolver once per data load.
   * @param {Array} roster       parsed Roster rows
   * @param {Array} mastersheet  parsed Mastersheet Data rows
   */
  function build(roster, mastersheet) {
    var byRoster = {};
    var coachSlack = {};        // coach first name → Slack email
    var i, r;

    for (i = 0; i < roster.length; i++) {
      r = roster[i];
      if (!byRoster[r.email]) byRoster[r.email] = r;
      // The Roster is the only place coach Slack addresses exist. Harvest the
      // map here so fallback-resolved clients can still be routed to a coach.
      if (r.coach && r.coachSlack && !coachSlack[r.coach]) {
        coachSlack[r.coach] = r.coachSlack;
      }
    }

    // Group every contract by email, most recent first.
    var byMaster = {};
    for (i = 0; i < mastersheet.length; i++) {
      r = mastersheet[i];
      (byMaster[r.email] || (byMaster[r.email] = [])).push(r);
    }
    for (var email in byMaster) {
      if (!Object.prototype.hasOwnProperty.call(byMaster, email)) continue;
      byMaster[email].sort(function (a, b) {
        var av = parseLooseDate(a.contractStart);
        var bv = parseLooseDate(b.contractStart);
        // Fall back to Date Purchased when Contract Start is unparseable.
        if (!isFinite(av)) av = parseLooseDate(a.datePurchased);
        if (!isFinite(bv)) bv = parseLooseDate(b.datePurchased);
        // Undated rows sort last; sheet order breaks remaining ties.
        if (!isFinite(av) && !isFinite(bv)) return a.rowNumber - b.rowNumber;
        if (!isFinite(av)) return 1;
        if (!isFinite(bv)) return -1;
        if (bv !== av) return bv - av;
        return b.rowNumber - a.rowNumber;
      });
    }

    /**
     * @returns {{
     *   email:string, resolved:boolean, source:"roster"|"mastersheet"|"none",
     *   clientName:string, coach:string, coachSlack:string,
     *   active:boolean, contractCount:number, reason:string
     * }}
     */
    function resolve(rawEmail) {
      var email = String(rawEmail || "").trim().toLowerCase();
      var miss = {
        email: email, resolved: false, source: "none",
        clientName: "", coach: "", coachSlack: "",
        active: false, contractCount: 0, reason: ""
      };
      if (!email) { miss.reason = "empty email"; return miss; }

      var hit = byRoster[email];
      if (hit) {
        return {
          email:         email,
          resolved:      true,
          source:        "roster",
          clientName:    hit.clientName,
          coach:         hit.coach,
          coachSlack:    hit.coachSlack || coachSlack[hit.coach] || "",
          active:        true,
          contractCount: (byMaster[email] || []).length,
          reason:        ""
        };
      }

      var contracts = byMaster[email];
      if (contracts && contracts.length) {
        var latest = contracts[0];        // most recent contract
        var slack = coachSlack[latest.coach] || "";
        return {
          email:         email,
          resolved:      true,
          source:        "mastersheet",
          clientName:    latest.clientName,
          coach:         latest.coach,
          coachSlack:    slack,
          active:        false,
          contractCount: contracts.length,
          // A resolved client whose coach has no Slack address is still
          // resolved — it is only notification routing that degrades.
          reason:        slack ? "" : ("no Slack address on file for coach " + (latest.coach || "(blank)"))
        };
      }

      miss.reason = "email not found in Roster or Mastersheet Data";
      return miss;
    }

    return {
      resolve:       resolve,
      coachSlackMap: coachSlack,
      rosterCount:   Object.keys(byRoster).length,
      masterCount:   Object.keys(byMaster).length
    };
  }

  root.Identity = { build: build, parseLooseDate: parseLooseDate };
})(typeof window !== "undefined" ? window : this);
