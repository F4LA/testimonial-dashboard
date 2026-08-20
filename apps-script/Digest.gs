/**
 * Testimonial Dashboard — daily per-owner Slack digest (Phase 3)
 *
 * Belongs to the DASHBOARD's standalone Apps Script project, alongside
 * Code.gs. It is deliberately NOT in the collection engine's project.
 *
 * ⚠️ NOTHING IS WIRED YET. No trigger is installed and no message is sent
 * until `installDigestTrigger()` is run deliberately. Run `previewDigest()`
 * first — it returns exactly what would be posted, and sends nothing.
 *
 * WHAT GOES OUT, each morning:
 *   1. One DM per person (Gaby / Miguel / Joey / Bernardo) with THEIR tasks.
 *   2. A SECOND, separate DM to the people in `DIGEST.SUMMARY_TO` — Gaby and
 *      Bernardo — with the whole team's tasks grouped by person. Two messages,
 *      not one longer one: the first has to stay actionable.
 *   3. Nothing else. NO GROUP CHANNEL IS POSTED TO. The testimonial collection
 *      channel is reserved for the monthly nomination message, and the private
 *      channel this once targeted no longer exists. A person with no tasks gets
 *      no DM, and an empty board sends nothing at all.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DUPLICATES THE FOLD — and how to keep it honest
 * ---------------------------------------------------------------------------
 * The digest must run on a time trigger with no browser, so it cannot reuse
 * dashboard/state-builder.js. It therefore re-implements the same fold in
 * Apps Script. That is a genuine second source of truth and the main
 * maintenance risk in this file.
 *
 * The rules kept in lockstep with the frontend, and where each lives:
 *
 *   fold: last-write-wins per (email, cycle, Stage)   state-builder.js §4.1
 *   fold: order by (timestamp, row number)            state-builder.js §4.2
 *   fold: Invited inferred from the FIVE fan-out only state-builder.js §4.4
 *   fold: Collecting = video received OR uploaded     state-builder.js §4.4
 *   gate: video + Everfit + photos; Meet/Loom never   client-card.js collectionLock
 *   rules: owners and thresholds                      alerts.js
 *   the v2 ladders, rung for rung                     flows.js (dFlow*_ here)
 *   owners are ONLY Gaby/Miguel/Joey/Bernardo         alerts.js (D_PEOPLE here)
 *   raffle: the three conditions + answer classifier  raffle.js conditionsFor/classify
 *   raffle: cohort month + the "month moved" override raffle.js monthOf
 *   raffle: eligibility and the draw-due state        raffle.js eligibleFrom/build
 *   raffle: the two parallel post-draw tasks          flows.js flowRaffleMonth/Messages
 *   raffle: the month-level draw task                 alerts.js raffleTasks
 *   identity: Roster first, then Mastersheet Data     identity.js resolve
 *
 * If you change any of those, change them here too.
 *
 * HOW DRIFT IS CAUGHT. `selfCheck()` prints a TASK FINGERPRINT — one
 * `owner|flow|rung|severity|clientKey` line per task, sorted. The dashboard
 * produces the identical string from `Alerts.fingerprint(TDApp.state)` in the
 * browser console. If the two differ, this file is telling the team something
 * the queue does not say. It also prints the raffle counts and runs
 * `dSelfCheckRaffle_()` for the structural invariants.
 *
 * ⚠️ THIS FILE ONCE DM'd A COACH. The v1 rules assigned "fill the coach form"
 * to the coach and `dResolveDm_` resolved their address from the roster, so the
 * first live digest would have cold-messaged a coach a task the system is
 * designed never to give them (D-094). Both halves are now closed: `dTasks_`
 * reroutes any non-person owner to Gaby and records it, and `dResolveDm_`
 * refuses to resolve anyone who is not in `D_PEOPLE`. Two independent
 * mechanisms, so it is structural rather than conventional.
 */

/* ===================== Configuration — FILL THESE IN ===================== */

var DIGEST = {
  SHEET_ID:   '17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo',
  EVENT_TAB:  'Event Log',
  SETTINGS_TAB: 'Settings',
  ROSTER_ID:  '1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc',
  ROSTER_TAB: 'Roster',
  // The SECOND identity source, in the same file. The Roster is a query view
  // filtered to ACTIVE 1:1 clients, so every client eventually falls off it
  // while their events live on forever. Reading only the Roster turns every
  // past client into a false "unmatched" flag (mirror of identity.js).
  MASTER_TAB: 'Mastersheet Data',

  DASHBOARD_URL: 'https://f4la.github.io/testimonial-dashboard/',

  // Slack DM targets, by the same names as TDConfig.PEOPLE. Email addresses;
  // the bot resolves them with users.lookupByEmail, exactly as the engine's
  // notifyCoach_ does.
  //
  // ⚠️ THIS MAP IS THE ONLY WAY AN ADDRESS IS EVER RESOLVED. There is no roster
  // fallback: a name that is not here cannot be messaged, which is what makes
  // "coaches are never messaged" structural rather than conventional (D-094).
  PEOPLE_SLACK: {
    Gaby:     'support@strongstandard.com',
    Miguel:   'miguelsa45@gmail.com',
    Joey:     'drjoey@fit4lifeacademy.health',
    Bernardo: 'bernardo@strongstandard.com'
  },

  // Who ALSO gets the whole-team summary as a second, separate DM.
  // Everyone still gets their own list first; this is the bird's-eye view on
  // top of it. Must be names from PEOPLE_SLACK — asserted in dSelfCheckSend_.
  SUMMARY_TO: ['Gaby', 'Bernardo'],

  // ⚠️ DELIBERATELY EMPTY, AND NOTHING READS IT. The digest posts to NO group
  // channel: the testimonial collection channel is reserved for the monthly
  // nomination message, and the private channel this once targeted no longer
  // exists. Everything goes out as DMs. Filling this in does nothing — the
  // channel code was removed rather than left behind a flag, so there is no
  // dormant path that could start posting to a channel by accident.
  CONTENT_CHANNEL_ID: '',

  // Script Property holding the bot token. Reuse the engine's bot.
  TOKEN_PROPERTY: 'SLACK_BOT_TOKEN',

  HOUR: 8    // local hour for the daily run
};

var DIGEST_TZ = 'America/Guayaquil';
var TZ_OFFSET_MIN = -300;   // Ecuador is UTC-5 year round, no DST

/* ===================== Stage vocabulary (mirror) ===================== */

var D_ENGINE_FANOUT = [
  'Collection — folder', 'Collection — client video link',
  'Collection — Meet', 'Collection — Loom', 'Collection — coach notice'
];
/**
 * The ONLY people who can own a task (D-094). Coaches are never owners: a coach
 * who has not acted is Gaby's "chase the coach" task. Mirrors TDConfig.PEOPLE.
 */
var D_PEOPLE = ['Gaby', 'Miguel', 'Joey', 'Bernardo'];

var D_S = {
  NOMINATION_LOGGED: 'Nomination — logged',
  NOMINATION_WARMUP: 'Nomination — coach warm-up done',
  OUTREACH_SENT:     'Outreach — sent',
  INVITE_KICKOFF:    'Invite — kickoff sent',
  VIDEO_UPLOADED:    'Collection — video uploaded',
  ENGINE_VIDEO:      'Collection — client video',
  COACH_FORM:        'Collection — coach form',
  EVERFIT:           'Collection — Everfit data',
  PHOTOS:            'Collection — photos received',
  COMPLETE:          'Collection — complete',
  RESOLVED:          'Collection — manual review resolved',
  APPROVED:          'Approval — approved',
  WEEK_ASSIGNED:     'Schedule — week assigned',
  SCHED_POST:        'Schedule — post scheduled',
  SCHED_EMAIL:       'Schedule — email scheduled',
  PUBLISHED:         'Publish — live',
  DECLINED:          'Pipeline — declined',
  DROPPED:           'Pipeline — dropped',

  /* --- the v2 ladder (D-090/D-094). Mirrors dashboard/flows.js rung for rung. --- */
  OUTREACH_ACCEPTED:     'Outreach — client accepted',
  OUTREACH_COACH_NOT_MSG:'Outreach — coach not messaged',
  OUTREACH_BERNARDO_NUDGED:'Outreach — Bernardo nudged coach',
  OUTREACH_NO_REPLY:     'Outreach — no reply',
  OUTREACH_FOLLOWUP:     'Outreach — follow-up sent',
  OUTREACH_COACH_TOLD:   'Outreach — coach told',
  INVITE_INSTRUCTIONS:   'Invite — instructions email sent',
  VIDEO_CHECKED:         'Collection — video checked',
  VIDEO_SNOOZED:         'Collection — video check snoozed',
  VIDEO_FOLLOWUP:        'Collection — video follow-up sent',
  VIDEO_COACH_TOLD:      'Collection — video coach told',
  COACH_FORM_CHASED:     'Collection — coach form chased',
  COACH_FORM_NUDGED:     'Collection — coach form nudged',
  COACH_NOTICE:          'Collection — coach notice',
  CLIENT_VIDEO_LINK:     'Collection — client video link',
  PRODUCTION_CHECKIN_ACK:'Production — check-in acknowledged',
  PRODUCTION_CHASED:     'Production — chased',
  APPROVAL_ESCALATED:    'Approval — escalated to Bernardo',
  APPROVAL_BERNARDO_NUDGED:'Approval — Bernardo nudged',

  /* --- raffle (Phase 5) --- */
  // Engine-owned, written by the preferences-form bridge (D-098). The review
  // condition reads THIS, never the dashboard-writable 'Review — self-reported'
  // (D-066/D-098), or a person could hand-enter a self-report and open the
  // raffle. D_PODCAST_CONSENT is named ONLY so dSelfCheckRaffle_ can prove it is
  // absent from the conditions (D-097).
  PREFS_PHOTO:       'Preferences — photo permission',
  PREFS_REVIEW:      'Preferences — review self-reported',
  PREFS_PODCAST:     'Preferences — podcast consent',
  // Dashboard-owned.
  RAFFLE_WINNER:     'Raffle — winner confirmed',
  RAFFLE_MESSAGES:   'Raffle — messages sent',
  RAFFLE_MONTH_ADDED:'Raffle — month added',
  RAFFLE_MONTH_MOVED:'Raffle — month moved',

  /* --- postponement, "yes but next month" (D-120) --- */
  POSTPONED:           'Pipeline — postponed to month',
  POSTPONE_CANCELLED:  'Pipeline — postponement cancelled'
};
var D_PIECES = [
  { key: 'carousel',    label: 'Carousel',                  owner: 'Agent',  stage: 'Production — carousel' },
  { key: 'story',       label: 'Story',                     owner: 'Agent',  stage: 'Production — story' },
  { key: 'reel',        label: 'Reel',                      owner: 'Miguel', stage: 'Production — reel' },
  { key: 'caseStudy',   label: 'Case study + landing page', owner: 'Miguel', stage: 'Production — case study' },
  { key: 'weeklyEmail', label: 'Weekly email',              owner: 'Miguel', stage: 'Production — weekly email' }
];

function dNorm_(s) {
  return String(s || '').replace(/[-‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ===================== Raffle mirror (D-088) =====================
 * Mirrors dashboard/raffle.js. Every function here has a named counterpart
 * there; keep the pairs together when either side changes.
 * ================================================================= */

/** Mirror of raffle.js `classify`. met: true | false | null (null = unclear).
 *  The second branch recovers pre-D-099 rows where the bridge misread
 *  "Not yet" and wrote it as an unclear answer. */
function dClassify_(detail) {
  var d = String(detail == null ? '' : detail).trim();
  if (!d) return { met: null, raw: '' };
  var quoted = /"([^"]*)"/.exec(d);
  var raw = quoted ? quoted[1].trim() : d;
  var norm = /^(Yes|No)\b/i.exec(d);
  if (norm) return { met: /^y/i.test(norm[1]), raw: raw };
  if (/^y/i.test(raw)) return { met: true, raw: raw };
  if (/^n/i.test(raw)) return { met: false, raw: raw };
  return { met: null, raw: raw };
}

/** Mirror of raffle.js `monthKey` — the sheet's timezone, not the server's. */
function dMonthKey_(ms) {
  if (!isFinite(ms)) return '';
  var d = new Date(ms + TZ_OFFSET_MIN * 60000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
}

function dIsMonthKey_(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || '')); }

/**
 * Mirror of raffle.js `firstBusinessDay` (D-120). The instant the first
 * Monday-to-Friday day of `key` STARTS in the sheet's timezone. Holidays are
 * deliberately not modelled. A calendar rule, not a threshold — there is no
 * Settings value that could make "the first business day" mean something else.
 */
function dFirstBusinessDay_(key) {
  var m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!m) return NaN;
  var y = +m[1], mo = +m[2] - 1, day = 1;
  while ([0, 6].indexOf(new Date(Date.UTC(y, mo, day)).getUTCDay()) >= 0) day++;
  return Date.UTC(y, mo, day) - TZ_OFFSET_MIN * 60000;
}

/**
 * Mirror of state-builder.js `postponementOf` (D-120).
 *
 * PENDING IS NOT SWITCHED OFF BY THE DATE — it ends when the new outreach
 * exists, or when the postponement is cancelled. Ending it on the date would
 * re-arm the OLD ladder and hand out a follow-up anchored on an outreach from
 * the month the client asked to skip. The date only lets the resume task exist.
 *
 * `month` is what dMonthOf_ resolves, never the event's own payload, so a later
 * move from the raffle view carries the return month with it.
 */
function dPostponement_(L, repeats, month, now) {
  var NONE = { pending: false, month: '', resumeDate: NaN, waiting: false, count: 0 };
  var post = L(D_S.POSTPONED);
  if (!post) return NONE;

  function newer(a, b) {
    if (!a) return false;
    if (!b) return true;
    if (a.ts !== b.ts) return a.ts > b.ts;
    return a.row > b.row;
  }
  if (newer(L(D_S.POSTPONE_CANCELLED), post)) return NONE;
  if (newer(L(D_S.OUTREACH_SENT), post)) return NONE;

  var resume = dFirstBusinessDay_(month);
  return {
    pending: true,
    month: month,
    resumeDate: resume,
    waiting: !(isFinite(resume) && now >= resume),
    count: repeats[dNorm_(D_S.POSTPONED)] || 1,
    at: post.ts
  };
}

/**
 * Mirror of sheets-reader.js `monthSetting`. Sheets coerces the "2026-08" the
 * operator types into a DATE, so the value read back is a serial and every
 * YYYY-MM test failed silently. Anything unrecognised is returned unchanged, so
 * genuine nonsense still fails the test rather than being swallowed as blank.
 *
 * Apps Script reads the cell with getValues(), so here it can arrive as a real
 * Date object as well as a serial — the frontend only ever sees the serial.
 */
function dMonthSetting_(raw) {
  if (raw instanceof Date) {
    return raw.getFullYear() + '-' + ('0' + (raw.getMonth() + 1)).slice(-2);
  }
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  var m = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
  if (m) return m[1] + '-' + m[2];
  var n = Number(s);
  if (isFinite(n) && n > 20000 && n < 90000) {
    var d = new Date(Math.round((n - 25569) * 86400000));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }
  return s;
}

function dCurrentMonth_() { return dMonthKey_(Date.now()); }

function dMonthIsPast_(key) { return dIsMonthKey_(key) && key < dCurrentMonth_(); }

/**
 * Mirror of raffle.js `conditionsFor` — the THREE conditions (D-008).
 * Condition 2 has no event of its own: it is the client-video signal the fold
 * already computed, so the raffle can never disagree with the board about
 * whether the video is in.
 */
function dRaffleConditions_(L, videoInput, arrived) {
  function st(ev) {
    if (!ev) return 'missing';
    var c = dClassify_(ev.event);
    if (c.met === true) return 'met';
    if (c.met === false) return 'not-met';
    return 'unclear';
  }
  var photoEv = L(D_S.PREFS_PHOTO);
  var reviewEv = L(D_S.PREFS_REVIEW);
  var videoIn = arrived(videoInput.state);

  return [
    { key: 'photo', label: 'Photo permission', state: st(photoEv),
      stages: [D_S.PREFS_PHOTO] },
    { key: 'questionnaire', label: 'Questionnaire / testimonial',
      state: videoIn ? 'met' : (videoInput.state === 'flagged' ? 'unclear' : 'missing'),
      stages: [D_S.ENGINE_VIDEO, D_S.VIDEO_UPLOADED] },
    { key: 'review', label: 'Google review (self-reported)', state: st(reviewEv),
      stages: [D_S.PREFS_REVIEW] }
  ];
}

/** Mirror of raffle.js `compliance`. */
function dCompliance_(conds) {
  var met = 0, unclear = 0;
  conds.forEach(function (c) {
    if (c.state === 'met') met++;
    if (c.state === 'unclear') unclear++;
  });
  return { conditions: conds, met: met, total: conds.length,
           qualifies: met === conds.length, needsReview: unclear > 0 };
}

/**
 * Mirror of raffle.js `monthOf` — COHORT BY ENTRY (D-100), with the manual
 * override honoured. Cohort-by-entry rather than "the month they qualified",
 * because qualification is unstable under latest-wins: a resubmitted form in
 * September would silently move a client out of August, possibly after the
 * draw already ran.
 */
function dMonthOf_(evs, firstTs) {
  // Walks EVERY move, matching raffle.js `monthOf` / `moveTargets`. The newest
  // valid one decides the month; a move with no readable month is skipped rather
  // than guessed at. `from` is the PREVIOUS move's target, not the entry month,
  // so a round trip does not claim someone moved from the month they are in.
  //
  // THREE SOURCES, ONE ANSWER (D-120): the raffle's own move button, plus the
  // two postponement events, which carry a month as part of the same gesture.
  // The postponement deliberately does not ALSO write `Raffle — month moved`.
  var SOURCES = [D_S.RAFFLE_MONTH_MOVED, D_S.POSTPONED, D_S.POSTPONE_CANCELLED]
    .map(function (s) { return dNorm_(s); });
  var moves = [];
  (evs || []).forEach(function (ev) {
    if (SOURCES.indexOf(dNorm_(ev.stage)) < 0) return;
    var m = /(\d{4}-\d{2})/.exec(String(ev.event || ''));
    if (m && dIsMonthKey_(m[1])) moves.push({ month: m[1], ev: ev });
  });
  if (!moves.length) return { month: dMonthKey_(firstTs), moved: false };

  var last = moves[moves.length - 1];
  var prev = moves.length > 1 ? moves[moves.length - 2].month : dMonthKey_(firstTs);
  return { month: last.month, moved: true, from: prev };
}

/** Mirror of raffle.js `eligibleFrom`. Person-level prior-win exclusion. */
function dEligibleFrom_(entries) {
  return entries.filter(function (e) { return e.qualifies && !e.personWon; });
}

/**
 * Mirror of raffle.js `build`'s draw half: the month, its cohort, the eligible
 * set, the winner and the draw-due state.
 */
function dRaffle_(list, settings) {
  var active = String((settings && settings.activeMonth) || '').trim();
  var month = dIsMonthKey_(active) ? active : dCurrentMonth_();

  // Prior wins by PERSON, across every cycle — a cycle-1 win excludes cycle 2.
  var wonBy = {};
  list.forEach(function (t) {
    if (t.raffleWon) wonBy[t.email] = true;
  });

  var entries = list.map(function (t) {
    return {
      email: t.email, cycle: t.cycle, key: t.key,
      month: t.raffleMonth, moved: t.raffleMoved,
      qualifies: t.raffle.qualifies, needsReview: t.raffle.needsReview,
      alreadyWon: !!t.raffleWon, personWon: !!wonBy[t.email],
      wonTs: t.raffleWon ? t.raffleWon.ts : NaN,
      // Carried so the draw can say who it is waiting on (mirror of raffle.js).
      terminal: t.stage === 'closed',
      stageKey: t.stage,
      hoursInStage: t.hours,
      monthAdded: !!t.raffleMonthAdded, messagesSent: !!t.raffleMessagesSent
    };
  });

  var inMonth = entries.filter(function (e) { return e.month === month; });
  var eligible = dEligibleFrom_(inMonth);

  // Ordered by WHEN the win was confirmed, matching raffle.js — so the two
  // implementations name the same winner even in the impossible case where two
  // are recorded. Unordered, each would pick by its own list order.
  var winners = inMonth.filter(function (e) { return e.alreadyWon; })
    .sort(function (a, b) {
      var at = isFinite(a.wonTs) ? a.wonTs : Infinity;
      var bt = isFinite(b.wonTs) ? b.wonTs : Infinity;
      return at - bt;
    });

  /* Mirror of raffle.js. A cohort member is RESOLVED when they qualify or are
   * closed; anyone else still holds the month up. "Moved to another month" is
   * NOT tested — moving removes them from the cohort, so it resolves by
   * construction, and inside this list `moved` means moved INTO this month. */
  var unresolved = inMonth.filter(function (e) {
    return !e.qualifies && !e.terminal;
  });

  var drawState;
  if (winners.length) {
    drawState = 'done';
  } else if (!eligible.length) {
    drawState = 'waiting';
  } else if (unresolved.length && !dMonthIsPast_(month)) {
    drawState = 'waiting';
  } else {
    drawState = dMonthIsPast_(month) ? 'overdue' : 'due';
  }

  return {
    month: month, entries: inMonth, eligible: eligible,
    qualifying: inMonth.filter(function (e) { return e.qualifies; }),
    winner: winners[0] || null,
    doubleWinner: winners.length > 1 ? winners : null,
    holdingUp: unresolved,
    drawState: drawState,
    drawDue: drawState === 'due' || drawState === 'overdue'
  };
}

/* ===================== Read + fold ===================== */

function dReadSettings_() {
  // The v2 keys (D-094), same names and same defaults as TDConfig.SETTINGS_DEFAULTS.
  // The tab wins; these only backfill a missing key, exactly as the frontend does.
  var out = {
    outreachCoachNotMessagedHours: 24,
    outreachReplyCheckHours:       24,
    outreachFollowup1Hours:        24,
    outreachFollowup2Hours:        48,
    outreachCoachToldHours:        48,
    videoCheckHours:               48,
    videoSnoozeDays:               2,
    coachFormFollowupHours:        24,
    coachFormEscalateHours:        24,
    collectingStaleHours:          120,
    contentCheckinDays:            5,
    contentEscalateDays:           7,
    approvalEscalateHours:         48,
    bufferTargetWeeks:             4,
    activeMonth:                   '',
    coachFormUrl:                  ''
  };
  var sh = SpreadsheetApp.openById(DIGEST.SHEET_ID).getSheetByName(DIGEST.SETTINGS_TAB);
  if (!sh) return out;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0]).trim(), v = rows[i][1];
    if (k && out.hasOwnProperty(k) && v !== '') out[k] = (typeof out[k] === 'number') ? Number(v) : String(v);
    // Normalised at the one place a raw cell becomes a value, so no reader can
    // miss it (mirror of sheets-reader.js parseSettings).
    if (k === 'activeMonth' && v !== '') out[k] = dMonthSetting_(v);
  }
  return out;
}

/* ===================== Identity (mirror of dashboard/identity.js) =====================
 * Email is the master key everywhere (D-039), and identity is resolved against
 * TWO sources, in order, never guessed.
 *
 *   1. Roster            → active client. Full identity incl. coach Slack.
 *   2. Mastersheet Data  → former client. One row PER CONTRACT, so the MOST
 *                          RECENT contract wins. No name column (built from
 *                          First + Last) and no coach Slack column (resolved
 *                          through the coach → Slack map harvested from the
 *                          Roster).
 *   3. Neither           → unresolved, and it stays unresolved.
 *
 * ⚠️ THE SECOND SOURCE IS NOT A CONVENIENCE. The Roster is a query view of
 * ACTIVE 1:1 clients, so a client who finishes their contract disappears from
 * it while their events live on in the append-only log. Resolving only against
 * the Roster made every past client an "unmatched" identity flag for Gaby that
 * had nothing to resolve, and made every OTHER task about them read out a raw
 * email address instead of a name. The dashboard has always read both; this
 * file read only the first, which is exactly the drift D-088 exists to catch.
 * ===================================================================================== */

var D_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                 jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Mirror of identity.js `parseLooseDate`. Contract dates are NOT consistently
 * formatted in Mastersheet Data — the same column mixes "August 5, 2024" and
 * "5/6/2026". Returns NaN for anything else rather than inventing a date.
 *
 * The Date branch is this file's own: the frontend reads the sheet as display
 * strings, while getValues() here hands back real Date objects for any cell
 * Sheets recognised as a date. Same class of difference as dMonthSetting_.
 */
function dLooseDate_(v) {
  if (v instanceof Date) return v.getTime();
  if (!v) return NaN;
  var t = String(v).trim();
  if (!t) return NaN;

  var m = t.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    var mo = D_MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo != null) return new Date(+m[3], mo, +m[2]).getTime();
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // M/D/YYYY, US order
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]).getTime();
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();

  return NaN;
}

/** Mirror of identity.js `build` + `resolve`. Built once per run. */
function dBuildIdentity_(rosterRows, masterRows) {
  var byRoster = {}, coachSlack = {}, i, r;

  for (i = 1; i < rosterRows.length; i++) {
    r = rosterRows[i];
    var email = String(r[2] || '').trim().toLowerCase();
    if (!email) continue;
    var rec = {
      email: email,
      name: String(r[7] || (r[0] + ' ' + r[1])).trim(),
      coach: String(r[5] || '').trim(),
      coachSlack: String(r[9] || '').trim()
    };
    if (!byRoster[email]) byRoster[email] = rec;
    // The Roster is the ONLY place coach Slack addresses exist. Harvest the map
    // here so a client resolved through the fallback can still name a coach.
    if (rec.coach && rec.coachSlack && !coachSlack[rec.coach]) coachSlack[rec.coach] = rec.coachSlack;
  }

  var byMaster = {};
  for (i = 1; i < masterRows.length; i++) {
    r = masterRows[i];
    var em = String(r[2] || '').trim().toLowerCase();
    if (!em) continue;
    var first = String(r[0] || '').trim(), last = String(r[1] || '').trim();
    (byMaster[em] || (byMaster[em] = [])).push({
      email: em,
      name: (first + ' ' + last).trim(),
      coach: String(r[9] || '').trim(),
      contractStart: r[6],
      datePurchased: r[5],
      rowNumber: i + 1
    });
  }

  // Most recent contract first, matching identity.js exactly: Contract Start,
  // falling back to Date Purchased when it is unreadable; undated rows sort
  // last; sheet order breaks the remaining ties.
  Object.keys(byMaster).forEach(function (em) {
    byMaster[em].sort(function (a, b) {
      var av = dLooseDate_(a.contractStart), bv = dLooseDate_(b.contractStart);
      if (!isFinite(av)) av = dLooseDate_(a.datePurchased);
      if (!isFinite(bv)) bv = dLooseDate_(b.datePurchased);
      if (!isFinite(av) && !isFinite(bv)) return a.rowNumber - b.rowNumber;
      if (!isFinite(av)) return 1;
      if (!isFinite(bv)) return -1;
      if (bv !== av) return bv - av;
      return b.rowNumber - a.rowNumber;
    });
  });

  function resolve(rawEmail) {
    var em = String(rawEmail || '').trim().toLowerCase();
    var miss = { email: em, resolved: false, source: 'none', name: '',
                 coach: '', coachSlack: '', active: false, contracts: 0, reason: '' };
    if (!em) { miss.reason = 'empty email'; return miss; }

    var hit = byRoster[em];
    if (hit) {
      return { email: em, resolved: true, source: 'roster', name: hit.name,
               coach: hit.coach, coachSlack: hit.coachSlack || coachSlack[hit.coach] || '',
               active: true, contracts: (byMaster[em] || []).length, reason: '' };
    }

    var cs = byMaster[em];
    if (cs && cs.length) {
      var latest = cs[0];
      var slack = coachSlack[latest.coach] || '';
      return { email: em, resolved: true, source: 'mastersheet', name: latest.name,
               coach: latest.coach, coachSlack: slack, active: false, contracts: cs.length,
               // A resolved client whose coach has no Slack address is still
               // resolved — only notification routing degrades.
               reason: slack ? '' : ('no Slack address on file for coach ' + (latest.coach || '(blank)')) };
    }

    miss.reason = 'email not found in Roster or Mastersheet Data';
    return miss;
  }

  return { resolve: resolve, byEmail: byRoster, coachSlack: coachSlack,
           rosterCount: Object.keys(byRoster).length,
           masterCount: Object.keys(byMaster).length };
}

function dReadRoster_() {
  var ss = SpreadsheetApp.openById(DIGEST.ROSTER_ID);
  var rSh = ss.getSheetByName(DIGEST.ROSTER_TAB);
  var mSh = ss.getSheetByName(DIGEST.MASTER_TAB);
  var rosterRows = rSh ? rSh.getDataRange().getValues() : [];
  // A missing tab degrades to Roster-only rather than throwing: the digest
  // still going out with worse names beats it not going out at all. It is
  // reported by dSelfCheckIdentity_ instead of failing silently.
  var masterRows = mSh ? mSh.getDataRange().getValues() : [];
  return dBuildIdentity_(rosterRows, masterRows);
}

/** Same conversion as the frontend: serials hold wall time in the sheet tz. */
function dTs_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && isFinite(v)) return Math.round((v - 25569) * 86400000) - TZ_OFFSET_MIN * 60000;
  var p = Date.parse(String(v));
  return isFinite(p) ? p : NaN;
}

function dFold_() {
  var sh = SpreadsheetApp.openById(DIGEST.SHEET_ID).getSheetByName(DIGEST.EVENT_TAB);
  var rows = sh.getDataRange().getValues();
  var events = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var email = String(r[0] || '').trim().toLowerCase();
    var stage = String(r[1] || '').trim();
    if (!email && !stage) continue;
    if (!email) continue;                       // system rows carry no client
    var cyc = parseInt(r[5], 10);
    events.push({
      email: email, stage: stage, ts: dTs_(r[2]),
      event: String(r[3] || ''), source: String(r[4] || ''),
      cycle: (cyc > 0 ? cyc : 1), row: i + 1
    });
  }
  events.sort(function (a, b) {
    var av = isFinite(a.ts) ? a.ts : Infinity, bv = isFinite(b.ts) ? b.ts : Infinity;
    return av !== bv ? av - bv : a.row - b.row;
  });

  var groups = {};
  events.forEach(function (e) {
    var k = e.email + '::' + e.cycle;
    (groups[k] || (groups[k] = [])).push(e);
  });

  var out = [];
  Object.keys(groups).forEach(function (k) {
    var evs = groups[k];
    var last = {}, repeats = {};
    evs.forEach(function (e) {
      var kk = dNorm_(e.stage);
      last[kk] = e;                                   // last write wins
      repeats[kk] = (repeats[kk] || 0) + 1;           // the v2 ladder counts presses
    });
    function L(s) { return last[dNorm_(s)] || null; }

    function inputState(stageList, classify) {
      var best = null;
      stageList.forEach(function (s) {
        var e = L(s);
        if (e && (!best || e.ts > best.ts)) best = e;
      });
      if (!best) return { state: 'missing', ev: null };
      return { state: classify(String(best.event || '').trim()), ev: best };
    }
    function plain(t)  { return /^Flag:/.test(t) ? 'flagged' : 'received'; }
    function video(t)  { return /^Flag:/.test(t) ? 'flagged'
                         : (/^Could not move|transcript not downloaded/.test(t) ? 'partial' : 'received'); }
    function meet(t)   { return /^Flag:/.test(t) || /copies failed, review manually/.test(t) || /^FAILED/.test(t)
                         ? 'flagged' : (/^Could not /.test(t) ? 'partial' : 'received'); }
    function loom(t)   { return /^Flag:/.test(t) || /^FAILED/.test(t) ? 'flagged'
                         : (/^Could not download the transcript/.test(t) || /,\s*\d+\s+failed/.test(t) ? 'partial' : 'received'); }

    var inputs = {
      video:     inputState([D_S.ENGINE_VIDEO, D_S.VIDEO_UPLOADED], video),
      coachForm: inputState([D_S.COACH_FORM], plain),
      everfit:   inputState([D_S.EVERFIT], plain),
      photos:    inputState([D_S.PHOTOS], plain),
      meet:      inputState(['Collection — Meet'], meet),
      loom:      inputState(['Collection — Loom'], loom)
    };
    function arrived(s) { return s === 'received' || s === 'partial'; }

    // `.at` matters: flowApproval anchors on the NEWEST piece timestamp.
    var pieces = {}, done = 0, lastPiece = NaN;
    D_PIECES.forEach(function (p) {
      var e = L(p.stage);
      pieces[p.key] = { done: !!e, at: e ? e.ts : NaN };
      if (e) { done++; if (!isFinite(lastPiece) || e.ts > lastPiece) lastPiece = e.ts; }
    });

    // Collecting: kickoff, or ANY of the five fan-out strings — never the two
    // form events, which fire later in the process.
    var fanout = null;
    D_ENGINE_FANOUT.forEach(function (s) {
      var e = L(s); if (e && (!fanout || e.ts > fanout.ts)) fanout = e;
    });

    // THE LADDER MOVED UP ONE RUNG (mirror of state-builder.js). Invited is now
    // the client saying yes; Collecting starts at the kickoff, which is when
    // inputs can actually begin arriving. The client video is no longer a stage
    // gate — it is one of the six inputs and nothing more.
    var collectingEntry = L(D_S.INVITE_KICKOFF) || fanout;

    var ladder = [
      ['nominated',  L(D_S.NOMINATION_LOGGED)],
      ['outreach',   L(D_S.OUTREACH_SENT)],
      ['invited',    L(D_S.OUTREACH_ACCEPTED)],
      ['collecting', collectingEntry],
      ['producing',  L(D_S.COMPLETE)],
      ['review',     (done === D_PIECES.length) ? { ts: lastPiece } : null],
      ['scheduled',  L(D_S.WEEK_ASSIGNED)],
      ['published',  L(D_S.PUBLISHED)]
    ];
    var stage = null, at = NaN;
    ladder.forEach(function (r) { if (r[1]) { stage = r[0]; at = r[1].ts; } });
    if (L(D_S.DECLINED) || L(D_S.DROPPED)) stage = 'closed';

    /* --- raffle (mirror of raffle.js; D-088) --- */
    // Events are ordered by (timestamp, row), so the first is the earliest —
    // the same "cohort by entry" anchor the frontend uses.
    var firstTs = evs.length ? evs[0].ts : NaN;
    var rMonth = dMonthOf_(evs, firstTs);
    var rComp = dCompliance_(dRaffleConditions_(L, inputs.video, arrived));

    /* --- postponement (mirror of state-builder.js step 5b, D-120) --- */
    var postp = dPostponement_(L, repeats, rMonth.month, Date.now());
    // The age counter stops while they wait, and restarts from the resume date
    // rather than from the event they were paused on — same rule as the board.
    var ageAt = postp.pending ? postp.resumeDate : at;

    out.push({
      email: evs[0].email, cycle: evs[0].cycle, key: k,
      stage: stage || 'indeterminate', at: at,
      hours: (postp.pending && postp.waiting) ? NaN
             : (isFinite(ageAt) ? (Date.now() - ageAt) / 36e5 : NaN),
      inputs: inputs, arrived: arrived, pieces: pieces, piecesDone: done,
      complete: !!L(D_S.COMPLETE),
      /* --- what the v2 flows read (mirror of state-builder.js) --- */
      lastByStage: last, repeats: repeats,
      collectingEntry: collectingEntry,
      allPiecesDone: done === D_PIECES.length,
      collectionComplete: !!L(D_S.COMPLETE),
      approved: !!L(D_S.APPROVED),
      terminal: stage === 'closed',
      raffle: rComp,
      raffleMonth: rMonth.month,
      raffleMoved: rMonth.moved,
      raffleWon: L(D_S.RAFFLE_WINNER),
      raffleMonthAdded: !!L(D_S.RAFFLE_MONTH_ADDED),
      raffleMessagesSent: !!L(D_S.RAFFLE_MESSAGES),
      raffleEntryTs: firstTs,
      postponement: postp,
      schedPost: !!L(D_S.SCHED_POST), schedEmail: !!L(D_S.SCHED_EMAIL),
      flags: ['meet', 'loom', 'coachForm', 'video', 'everfit', 'photos'].filter(function (kk) {
        return inputs[kk].state === 'flagged';
      })
    });
  });
  return out;
}

/* ===================== Rules — Task Model v2 (D-090/D-094) =====================
 *
 * A rung-for-rung port of dashboard/flows.js, plus alerts.js's non-ladder
 * items. Before this, the digest still ran the v1 stage-based rules and said
 * different things than the queue Gaby actually works from — same data, two
 * answers. `dFingerprint_()` now makes them comparable in one string, and
 * `selfCheck()` prints it.
 *
 * THE INVARIANTS, enforced here rather than assumed:
 *   EVERY OWNER IS A REAL DASHBOARD USER. Coaches are NEVER owners (D-094) —
 *   a coach who has not acted is Gaby's "chase the coach" task. `dAdd_` will
 *   not let a non-person own a task, and `dResolveDm_` cannot resolve one.
 *   ONE TASK PER FLOW PER CLIENT. Rungs are sequential.
 *   EVERY THRESHOLD COMES FROM THE SETTINGS TAB. Nothing is timed in code.
 * ============================================================================= */

var D_HOUR = 36e5;
var D_DAY = 24 * D_HOUR;

/** Per-testimonial helpers, mirroring flows.js `helpersFor`. */
function dHelpers_(t) {
  return {
    last:  function (s) { return t.lastByStage[dNorm_(s)] || null; },
    count: function (s) { return t.repeats[dNorm_(s)] || 0; },
    has:   function (s) { return !!t.lastByStage[dNorm_(s)]; }
  };
}

/**
 * One rung, or null if its threshold has not passed. Mirrors flows.js `rung`.
 * `overdue` means a full interval has gone by on top of the wait.
 */
function dRung_(o) {
  if (!o.anchor || !isFinite(o.anchor.ts)) return null;
  var wait = o.hours * D_HOUR;
  var due = o.anchor.ts + wait;
  var now = Date.now();
  if (now < due) return null;
  return {
    flow: o.flow, rung: o.rung, owner: o.owner,
    title: o.title, detail: o.detail || '',
    waitedHours: (now - o.anchor.ts) / D_HOUR,
    sev: (wait > 0 && now >= due + wait) ? 'overdue' : 'due'
  };
}

/* ---------- FLOW 1+2 · Outreach — Gaby, escalating to Bernardo ---------- */

function dFlowOutreach_(t, s, h, v) {
  if (h.has(D_S.OUTREACH_ACCEPTED) || h.has(D_S.OUTREACH_COACH_TOLD)) return null;

  var sent = h.last(D_S.OUTREACH_SENT);

  if (!sent) {
    var notMsg = h.count(D_S.OUTREACH_COACH_NOT_MSG);
    var lastNot = h.last(D_S.OUTREACH_COACH_NOT_MSG);
    var nudged = h.last(D_S.OUTREACH_BERNARDO_NUDGED);

    if (notMsg >= 2 && (!nudged || nudged.ts < lastNot.ts)) {
      return dRung_({
        flow: 'outreach', rung: 'bernardo', owner: 'Bernardo', hours: 0, anchor: lastNot,
        title: v.coach + " hasn't messaged " + v.Client + ' after two reminders. Nudge them.',
        detail: 'Gaby cannot start the outreach until the coach has told the client to expect it.'
      });
    }

    var anchor = nudged || lastNot || h.last(D_S.NOMINATION_LOGGED);
    return dRung_({
      flow: 'outreach', rung: notMsg ? 'retry' : 'start', owner: 'Gaby',
      hours: lastNot ? s.outreachCoachNotMessagedHours : 0, anchor: anchor,
      title: notMsg
        ? 'Check if ' + v.coach + ' messaged ' + v.Client + ', then do the outreach.'
        : 'Do outreach to ' + v.Client + ' (if the coach already messaged them).',
      detail: notMsg ? 'Waiting on the coach since ' + Math.round((Date.now() - lastNot.ts) / D_HOUR) + 'h ago.' : ''
    });
  }

  var noReply = h.last(D_S.OUTREACH_NO_REPLY);
  if (!noReply) {
    return dRung_({
      flow: 'outreach', rung: 'reply-check', owner: 'Gaby',
      hours: s.outreachReplyCheckHours, anchor: sent,
      title: 'Did ' + v.Client + " reply in Everfit that they're in?"
    });
  }

  var fu = h.count(D_S.OUTREACH_FOLLOWUP);
  var lastFu = h.last(D_S.OUTREACH_FOLLOWUP);

  if (fu === 0) {
    return dRung_({
      flow: 'outreach', rung: 'fu1', owner: 'Gaby',
      hours: s.outreachFollowup1Hours, anchor: noReply,
      title: 'Send follow-up #1 to ' + v.Client + '.'
    });
  }
  if (fu === 1) {
    return dRung_({
      flow: 'outreach', rung: 'fu2', owner: 'Gaby',
      hours: s.outreachFollowup2Hours, anchor: lastFu,
      title: 'Send the last follow-up to ' + v.Client + '.'
    });
  }
  return dRung_({
    flow: 'outreach', rung: 'coach-told', owner: 'Gaby',
    hours: s.outreachCoachToldHours, anchor: lastFu,
    title: 'Tell ' + v.coach + ' that ' + v.Client + " didn't respond this month."
  });
}

/* ---------- FLOW 3 · Client video — Gaby ----------
 * Anchored on the INSTRUCTIONS EMAIL, not the fan-out: the clock starts when
 * the client has actually been told what to do. */

function dFlowVideo_(t, s, h, v) {
  if (t.arrived(t.inputs.video.state)) return null;
  if (h.has(D_S.VIDEO_COACH_TOLD)) return null;

  var start = h.last(D_S.INVITE_INSTRUCTIONS);
  if (!start) return null;                       // the clock has not started

  var fu = h.count(D_S.VIDEO_FOLLOWUP);
  var lastFu = h.last(D_S.VIDEO_FOLLOWUP);
  var checked = h.last(D_S.VIDEO_CHECKED);
  var snoozed = h.last(D_S.VIDEO_SNOOZED);

  // An explicit snooze is the ONLY thing that postpones this task now. A plain
  // check used to re-anchor the clock and take the whole card away for a full
  // interval, follow-up step included (mirror of flows.js).
  if (snoozed && (Date.now() - snoozed.ts) < s.videoSnoozeDays * D_DAY) return null;

  if (fu >= 2) {
    return dRung_({
      flow: 'video', rung: 'coach-told', owner: 'Gaby',
      hours: s.videoCheckHours, anchor: lastFu,
      title: 'Tell ' + v.coach + ' that ' + v.Client + " hasn't uploaded their video."
    });
  }

  // State B whenever the newest check is newer than the newest follow-up (or a
  // check exists and no follow-up does). Anything else is state A.
  var stateB = !!checked && (!lastFu || checked.ts > lastFu.ts);
  var anchor = lastFu || start;

  if (stateB) {
    return dRung_({
      flow: 'video', rung: 'followup', owner: 'Gaby',
      hours: s.videoCheckHours, anchor: anchor,
      title: 'Nothing in folder 03 for ' + v.Client + '. Send the follow-up.',
      detail: 'You already checked. This is the message that goes out.'
    });
  }

  return dRung_({
    flow: 'video', rung: 'check', owner: 'Gaby',
    hours: s.videoCheckHours, anchor: anchor,
    title: 'Check if ' + v.Client + ' uploaded their video.',
    detail: 'Nothing fires when a client uploads. Open folder 03 and look.'
  });
}

/* ---------- FLOW 4 · Coach form — Gaby, then Bernardo ----------
 * ⚠️ THE COACH IS NEVER THE OWNER. The coach must fill the form, so the task is
 * Gaby's "chase the coach" (D-094). The v1 rule DM'd the coach directly. */

function dFlowCoachForm_(t, s, h, v) {
  if (t.arrived(t.inputs.coachForm.state)) return null;

  var dm = h.last(D_S.COACH_NOTICE);
  if (!dm) return null;                          // the coach has not been asked yet

  var chased = h.last(D_S.COACH_FORM_CHASED);
  var nudged = h.last(D_S.COACH_FORM_NUDGED);

  if (chased && (!nudged || nudged.ts < chased.ts)) {
    return dRung_({
      flow: 'coachForm', rung: 'bernardo', owner: 'Bernardo',
      hours: s.coachFormEscalateHours, anchor: chased,
      title: v.coach + " isn't filling " + v.Client + "'s form despite the follow-up."
    });
  }

  return dRung_({
    flow: 'coachForm', rung: 'chase', owner: 'Gaby',
    hours: s.coachFormFollowupHours, anchor: nudged || dm,
    title: v.coach + " hasn't filled the form for " + v.Client + '; send a follow-up.'
  });
}

/* ---------- FLOW 5 · Everfit + photos — Gaby only, passive ---------- */

function dFlowManualPulls_(t, s, h, v) {
  if (t.collectionComplete) return null;
  // Nothing to pull before collection starts (mirror of flows.js). Without this
  // the task fired for freshly nominated clients, one not even accepted yet.
  if (!t.collectingEntry) return null;
  var A = t.arrived;
  var everfit = A(t.inputs.everfit.state);
  var photos = A(t.inputs.photos.state);
  var video = A(t.inputs.video.state);

  if (video && everfit && photos) {
    return {
      flow: 'manualPulls', rung: 'complete', owner: 'Gaby',
      title: 'Mark ' + v.Client + "'s collection complete.",
      detail: 'The video is in and both of your pulls are marked. This is what unlocks production.',
      waitedHours: NaN, sev: 'due'
    };
  }

  if (everfit && photos) return null;            // waiting on the video; Flow 3 owns that

  var missing = [];
  if (!everfit) missing.push('Everfit data');
  if (!photos) missing.push('photos');

  // Age counts from entry into Collecting — when the task could first exist.
  var anchor = t.collectingEntry;
  var stale = anchor && isFinite(anchor.ts) &&
              (Date.now() - anchor.ts) / D_HOUR > s.collectingStaleHours;

  return {
    flow: 'manualPulls', rung: stale ? 'stale' : 'pending', owner: 'Gaby',
    title: stale
      ? v.Client + ' has been waiting ' + Math.round(s.collectingStaleHours / 24) + ' days on your ' + missing.join(' and ') + '.'
      : 'Pull ' + missing.join(' and ') + ' for ' + v.Client + '.',
    detail: 'Needed before production can start.',
    waitedHours: anchor ? (Date.now() - anchor.ts) / D_HOUR : NaN,
    sev: stale ? 'overdue' : 'reminder'
  };
}

/* ---------- FLOW 6 · Content — Miguel, then Gaby. PER CLIENT, never per piece.
 * The v1 rule emitted one task PER PIECE, which is the difference D-090 (b)
 * corrected: one follow-up per client, not five. ---------- */

function dFlowContent_(t, s, h, v) {
  if (!t.collectionComplete || t.allPiecesDone) return null;

  var day0 = h.last(D_S.COMPLETE);
  if (!day0) return null;

  var pending = D_PIECES.filter(function (p) { return !t.pieces[p.key].done; });
  var pendingText = pending.length + ' of ' + D_PIECES.length + ' pieces still open';

  var chased = h.last(D_S.PRODUCTION_CHASED);
  var elapsedDays = (Date.now() - day0.ts) / D_DAY;

  if (elapsedDays >= s.contentEscalateDays) {
    var r = dRung_({
      flow: 'content', rung: 'escalate', owner: 'Gaby',
      hours: chased ? s.contentEscalateDays * 24 : 0,
      anchor: chased || day0,
      title: "Miguel is running late on " + v.Client + "'s content. Follow up with him.",
      detail: pendingText + '. ' + Math.round(elapsedDays) + ' days since production started.'
    });
    if (r) return r;
  }

  var ack = h.last(D_S.PRODUCTION_CHECKIN_ACK);
  if (ack && ack.ts > day0.ts) return null;      // he replied; Gaby's rung still fires at 7d

  return dRung_({
    flow: 'content', rung: 'checkin', owner: 'Miguel',
    hours: s.contentCheckinDays * 24, anchor: day0,
    title: "How's the content for " + v.Client + ' coming along?',
    detail: pendingText + '.'
  });
}

/* ---------- FLOW 7 · Approval — Joey, then Gaby, then Bernardo ---------- */

function dFlowApproval_(t, s, h, v) {
  if (!t.allPiecesDone || t.approved) return null;

  var readyTs = D_PIECES.reduce(function (m, p) {
    var at = t.pieces[p.key].at; return isFinite(at) && at > m ? at : m;
  }, 0);
  if (!readyTs) return null;
  var ready = { ts: readyTs };

  var escalated = h.last(D_S.APPROVAL_ESCALATED);
  var nudged = h.last(D_S.APPROVAL_BERNARDO_NUDGED);

  if (escalated && (!nudged || nudged.ts < escalated.ts)) {
    return dRung_({
      flow: 'approval', rung: 'bernardo', owner: 'Bernardo', hours: 0, anchor: escalated,
      title: 'Nudge Joey on ' + v.Client + "'s approval."
    });
  }

  var waited = (Date.now() - (nudged ? nudged.ts : ready.ts)) / D_HOUR;
  if (waited >= s.approvalEscalateHours) {
    return dRung_({
      flow: 'approval', rung: 'escalate', owner: 'Gaby',
      hours: s.approvalEscalateHours, anchor: nudged || ready,
      title: "Joey hasn't approved " + v.Client + '. Tell Bernardo.'
    });
  }

  return dRung_({
    flow: 'approval', rung: 'approve', owner: 'Joey', hours: 0, anchor: ready,
    title: 'Approve ' + v.Client + "'s testimonial. All five pieces are ready.",
    detail: 'Every link is gathered on the client card.'
  });
}

/* ---------- FLOW 8+9 · Raffle post-draw — PARALLEL, never chained (D-080) ---------- */

function dFlowRaffleMonth_(t, s, h, v) {
  var won = h.last(D_S.RAFFLE_WINNER);
  if (!won || h.has(D_S.RAFFLE_MONTH_ADDED)) return null;
  return dRung_({
    flow: 'raffleMonth', rung: 'addMonth', owner: 'Miguel', hours: 0, anchor: won,
    title: 'Add ' + v.Client + "'s extra raffle month in the Master Sheet.",
    detail: 'They won the ' + v.month + ' raffle. The month goes in the client Master Sheet, ' +
            'which the dashboard never writes to, so this one is done by hand. Leave the note too.'
  });
}

function dFlowRaffleMessages_(t, s, h, v) {
  var won = h.last(D_S.RAFFLE_WINNER);
  if (!won || h.has(D_S.RAFFLE_MESSAGES)) return null;
  return dRung_({
    flow: 'raffleMessages', rung: 'sendMessages', owner: 'Gaby', hours: 0, anchor: won,
    title: 'Send the ' + v.month + ' raffle messages: ' + v.Client + ' won, and thank the rest.',
    detail: 'The winner message plus the thank-you to everyone else who entered. ' +
            'Both go out through Everfit.'
  });
}

/* ---------- POSTPONED · "yes, but next month" (D-120) — Gaby ----------
 *
 * Mirror of flows.js `flowPostponed`. The only rung a postponed client can
 * produce; everything else is switched off by the gate in dEvaluate_.
 *
 * NO NEW SETTINGS KEY: the wait is a DATE already in the data (the first
 * business day of the month the client asked for), so `hours: 0` with the
 * resume date as the anchor. */
function dFlowPostponed_(t, s, h, v) {
  var p = t.postponement;
  if (!p || !p.pending || !isFinite(p.resumeDate)) return null;

  var again = p.count > 1 ? ', they have asked to move month ' + p.count + ' times' : '';

  return dRung_({
    flow: 'postponement', rung: 'resume', owner: 'Gaby',
    hours: 0, anchor: { ts: p.resumeDate },
    title: 'Send the outreach to ' + v.Client + ', they asked to move to this month' + again + '.',
    detail: 'They said yes but asked to start this month. Everything for them has been paused ' +
            'since then. Marking the outreach sent restarts the normal ladder from today, with ' +
            'the reply check and the follow-ups on their usual clocks.'
  });
}

var D_FLOWS = [dFlowOutreach_, dFlowVideo_, dFlowCoachForm_, dFlowManualPulls_,
               dFlowContent_, dFlowApproval_, dFlowRaffleMonth_, dFlowRaffleMessages_];

/** Every flow for one testimonial. At most one task per flow. */
function dEvaluate_(t, s, roster) {
  if (t.terminal) return [];
  var h = dHelpers_(t);
  var id = roster.resolve(t.email);
  var name = id.name || t.email;
  var v = {
    Client: name,
    coach: id.coach || 'the coach',
    month: t.raffleMonth
  };
  /* ONE GATE, ABOVE THE LADDERS (D-120). Mirror of flows.js `evaluate`. A
   * postponed client is out of play until the outreach is sent again: no
   * outreach, no follow-ups, no video check, no coach form, no Everfit and
   * photos. Asked once here so the next flow anyone adds is covered without
   * having to remember it. */
  var flows = (t.postponement && t.postponement.pending) ? [dFlowPostponed_] : D_FLOWS;

  var out = [];
  flows.forEach(function (fn) {
    var task = fn(t, s, h, v);
    if (!task) return;
    task.clientKey = t.key;
    task.clientName = name;
    out.push(task);
  });
  return out;
}

/* ---------- Non-ladder items (mirror of alerts.js reviewTasks) ---------- */

function dReviewTasks_(list, roster) {
  var out = [];
  list.forEach(function (t) {
    if (t.terminal) return;
    // Mirror of alerts.js: these items are not walked through dEvaluate_, so
    // the gate has to be repeated here. A postponed client produces ZERO tasks
    // (D-120), and a stale flag is still a task in Gaby's queue.
    if (t.postponement && t.postponement.pending) return;
    var id = roster.resolve(t.email);
    var name = id.name || t.email;

    t.flags.forEach(function (f) {
      var auto = (f === 'meet' || f === 'loom' || f === 'coachForm');
      out.push({
        flow: 'review', rung: 'flag-' + f, owner: 'Gaby', sev: 'review',
        title: 'Review the ' + f + ' flag for ' + name,
        detail: auto ? 'Does not hold up the pipeline. It often just means this client has none.' : '',
        clientKey: t.key, clientName: name, waitedHours: NaN
      });
    });

    if (!id.resolved) {
      out.push({
        flow: 'review', rung: 'identity', owner: 'Gaby', sev: 'review',
        title: 'Resolve the identity for ' + t.email,
        detail: id.reason + '. The system never guesses.',
        clientKey: t.key, clientName: name, waitedHours: NaN
      });
    }
  });
  return out;
}

/* ---------- The month-level raffle draw (mirror of alerts.js raffleTasks) ---------- */

function dRaffleTasks_(list, st) {
  var raf = dRaffle_(list, st);
  var out = [];
  if (raf.drawDue) {
    out.push({
      flow: 'raffleDraw', rung: 'draw', owner: 'Gaby',
      sev: raf.drawState === 'overdue' ? 'overdue' : 'due',
      title: 'Run the ' + raf.month + ' raffle draw — ' + raf.eligible.length +
             ' eligible ' + (raf.eligible.length === 1 ? 'entry' : 'entries'),
      detail: (raf.drawState === 'overdue' ? raf.month + ' is over and no winner was drawn. ' : '') +
              'The draw is manual: open the raffle view, draw, and confirm.',
      clientKey: '', clientName: '', waitedHours: NaN
    });
  }
  if (raf.doubleWinner) {
    out.push({
      flow: 'raffleDraw', rung: 'double', owner: 'Bernardo', sev: 'review',
      title: 'Two raffle winners are recorded for ' + raf.month,
      detail: 'The draw cannot produce this, so it means a double write or a hand-edited log.',
      clientKey: '', clientName: '', waitedHours: NaN
    });
  }
  return out;
}

/* ---------- The walker ---------- */

var D_RANK = { overdue: 0, due: 1, reminder: 2, review: 3 };

/**
 * @returns {{tasks:Array, problems:Array}}
 *
 * `problems` is not decoration. A non-person owner means a coach is about to be
 * DM'd a task the system is designed never to give them, so it is REROUTED to
 * Gaby and recorded, rather than sent or silently dropped.
 */
function dTasks_(withProblems) {
  var st = dReadSettings_(), roster = dReadRoster_(), list = dFold_();
  var tasks = [], problems = [];

  list.forEach(function (t) {
    var seen = {};
    dEvaluate_(t, st, roster).forEach(function (task) {
      if (seen[task.flow]) {
        problems.push("Two tasks from flow '" + task.flow + "' for " + t.key);
        return;
      }
      seen[task.flow] = true;
      tasks.push(task);
    });
  });

  tasks = tasks.concat(dReviewTasks_(list, roster));
  tasks = tasks.concat(dRaffleTasks_(list, st));

  // THE GUARD. Coaches are never owners (D-094).
  tasks.forEach(function (t) {
    if (D_PEOPLE.indexOf(t.owner) < 0) {
      problems.push("Task '" + t.title + "' had owner '" + t.owner +
                    "', who is not a dashboard user. Rerouted to Gaby.");
      t.reroutedFrom = t.owner;
      t.owner = 'Gaby';
    }
  });

  tasks.sort(function (a, b) {
    if (D_RANK[a.sev] !== D_RANK[b.sev]) return D_RANK[a.sev] - D_RANK[b.sev];
    var aw = isFinite(a.waitedHours) ? a.waitedHours : -1;
    var bw = isFinite(b.waitedHours) ? b.waitedHours : -1;
    return bw - aw;
  });

  return withProblems ? { tasks: tasks, problems: problems } : tasks;
}

/**
 * A canonical, comparable summary of the task list — the D-088 drift check for
 * the half that is not the raffle. `Alerts.fingerprint(state)` produces exactly
 * this string in the browser; if the two differ, the two implementations have
 * drifted and the digest is telling the team something the queue does not say.
 */
function dFingerprint_() {
  return dTasks_().map(function (t) {
    return [t.owner, t.flow, t.rung, t.sev, t.clientKey || ''].join('|');
  }).sort().join('\n');
}

/* ===================== Rendering + sending ===================== */

function dRender_(owner, tasks) {
  function of(sev) { return tasks.filter(function (t) { return t.sev === sev; }); }
  var L = ['*Your testimonial queue — ' + Utilities.formatDate(new Date(), DIGEST_TZ, 'EEE d MMM') + '*'];
  function block(title, arr) {
    if (!arr.length) return;
    L.push('', title);
    arr.forEach(function (t) { L.push('• ' + t.title + (t.detail ? '  _' + t.detail + '_' : '')); });
  }
  block(':rotating_light: *Overdue*', of('overdue'));
  block(':hourglass: *Due*', of('due'));
  // The v2 model has a fourth tier. Without this block, Flow 5's passive
  // reminders were computed and then silently dropped before sending.
  block(':small_blue_diamond: *Reminders*', of('reminder'));
  block(':mag: *Needs review*', of('review'));
  L.push('', '<' + DIGEST.DASHBOARD_URL + '|Open the dashboard>');
  return L.join('\n');
}

/**
 * The whole-team summary — a SECOND, separate DM for the people in
 * DIGEST.SUMMARY_TO, on top of their own list.
 *
 * Deliberately a distinct message rather than a longer personal one: the first
 * DM is "what you must do today" and has to stay actionable, while this is
 * "what the whole board looks like". Merging them would bury Gaby's own eight
 * items inside everyone else's thirty.
 *
 * Grouped by person, because the question it answers is "who is holding what".
 */
function dRenderSummary_(tasks) {
  var MARK = { overdue: ':rotating_light:', due: ':hourglass:',
               reminder: ':small_blue_diamond:', review: ':mag:' };

  var bySev = {};
  tasks.forEach(function (t) { bySev[t.sev] = (bySev[t.sev] || 0) + 1; });

  var L = ['*Team summary — ' + Utilities.formatDate(new Date(), DIGEST_TZ, 'EEE d MMM') + '*',
           '_Everyone\'s testimonial tasks. Your own list is in the other message._',
           '',
           '*' + tasks.length + '* open in total' +
             (bySev.overdue ? '  ·  :rotating_light: ' + bySev.overdue + ' overdue' : '') +
             (bySev.due ? '  ·  :hourglass: ' + bySev.due + ' due' : '') +
             (bySev.reminder ? '  ·  :small_blue_diamond: ' + bySev.reminder + ' reminders' : '') +
             (bySev.review ? '  ·  :mag: ' + bySev.review + ' to review' : '')];

  var byOwner = {};
  tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

  // D_PEOPLE order, not insertion order, so the summary reads the same shape
  // every day. Nobody outside D_PEOPLE can appear — dTasks_ guarantees it.
  D_PEOPLE.forEach(function (o) {
    var mine = byOwner[o];
    if (!mine || !mine.length) return;
    L.push('', '*' + o + '* — ' + mine.length + (mine.length === 1 ? ' task' : ' tasks'));
    mine.forEach(function (t) {
      L.push((MARK[t.sev] || '•') + ' ' + t.title);
    });
  });

  L.push('', '<' + DIGEST.DASHBOARD_URL + '|Open the dashboard>');
  return L.join('\n');
}

function dSlack_(method, payload) {
  var token = PropertiesService.getScriptProperties().getProperty(DIGEST.TOKEN_PROPERTY);
  if (!token) throw new Error('Missing script property ' + DIGEST.TOKEN_PROPERTY);
  var res = UrlFetchApp.fetch('https://slack.com/api/' + method, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (!body.ok) throw new Error('Slack ' + method + ' failed: ' + body.error);
  return body;
}

/**
 * ⚠️ THE COACH FALLBACK IS GONE, DELIBERATELY.
 *
 * This used to read `roster.coachSlack[owner]` when a name was not in
 * PEOPLE_SLACK — which meant a task that had wrongly landed on a coach
 * RESOLVED and was DM'd to them. Coaches are never owners (D-094), so a name
 * that is not a dashboard user must fail to resolve rather than quietly find an
 * address. Combined with `dTasks_` rerouting non-people to Gaby, a coach can no
 * longer be messaged by two independent mechanisms rather than by convention.
 */
function dResolveDm_(owner) {
  if (D_PEOPLE.indexOf(owner) < 0) return null;     // structurally unreachable
  var email = DIGEST.PEOPLE_SLACK[owner] || '';
  if (!email) return null;
  var u = dSlack_('users.lookupByEmail?email=' + encodeURIComponent(email), {});
  return u.user && u.user.id;
}

/**
 * READ-ONLY. Returns exactly what would be posted, and sends nothing.
 * Run this first, every time, before touching sendDailyDigest().
 */
function previewDigest() {
  var r = dTasks_(true);
  var tasks = r.tasks;
  var byOwner = {};
  tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

  var out = ['=== DIGEST PREVIEW — nothing sent ===', 'tasks: ' + tasks.length, ''];

  if (r.problems.length) {
    out.push('!!! PROBLEMS — fix before sending !!!');
    r.problems.forEach(function (p) { out.push('  - ' + p); });
    out.push('');
  }

  D_PEOPLE.forEach(function (o) {
    if (!byOwner[o]) return;
    out.push('--- DM to ' + o + ' (' + (DIGEST.PEOPLE_SLACK[o] || 'NO ADDRESS SET — this DM will be SKIPPED') + ') ---');
    out.push(dRender_(o, byOwner[o]), '');
  });

  // Anyone left is not a dashboard user, which dTasks_ should have made
  // impossible. Printed loudly rather than hidden.
  Object.keys(byOwner).forEach(function (o) {
    if (D_PEOPLE.indexOf(o) >= 0) return;
    out.push('!!! NON-PERSON OWNER: ' + o + ' — coaches are never owners (D-094) !!!');
    byOwner[o].forEach(function (t) { out.push('  • ' + t.title); });
    out.push('');
  });

  if (tasks.length) {
    out.push('--- SECOND DM (team summary) to ' + DIGEST.SUMMARY_TO.join(' and ') + ' ---');
    out.push(dRenderSummary_(tasks), '');
  } else {
    out.push('(no open tasks, so nothing would be sent at all — not even the summary)', '');
  }

  out.push('--- channels ---');
  out.push('No group channel is posted to. DMs only.');

  var sendProblems = dSelfCheckSend_();
  if (sendProblems.length) {
    out.push('', '!!! SEND CONFIG PROBLEMS !!!');
    sendProblems.forEach(function (p) { out.push('  - ' + p); });
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * Assertions about WHO can be messaged. Separate from dSelfCheckRaffle_ because
 * this is about the send path, not the rules — and the send path is the one
 * that can put a message in front of the wrong person.
 */
function dSelfCheckSend_() {
  var problems = [];

  Object.keys(DIGEST.PEOPLE_SLACK).forEach(function (name) {
    if (D_PEOPLE.indexOf(name) < 0) {
      problems.push('PEOPLE_SLACK has "' + name + '", who is not a dashboard user — ' +
                    'only Gaby/Miguel/Joey/Bernardo may ever be messaged (D-094)');
    }
    if (!DIGEST.PEOPLE_SLACK[name]) {
      problems.push('no Slack address for ' + name + ' — their DM will be skipped');
    }
  });

  DIGEST.SUMMARY_TO.forEach(function (name) {
    if (D_PEOPLE.indexOf(name) < 0) {
      problems.push('SUMMARY_TO has "' + name + '", who is not a dashboard user');
    }
    if (!DIGEST.PEOPLE_SLACK[name]) {
      problems.push('SUMMARY_TO has ' + name + ' but no address for them');
    }
  });

  // The guarantee that matters: a coach name resolves to nothing, without
  // Slack ever being called.
  if (dResolveDm_('SomeCoachName') !== null) {
    problems.push('dResolveDm_ resolved a non-person — coaches must never be reachable (D-094)');
  }

  return problems;
}

/**
 * Sends. Only ever called by the installed trigger, or deliberately by hand.
 *
 * DMs ONLY. Nothing is posted to any group channel: the testimonial collection
 * channel is reserved for the monthly nomination message, and the private
 * channel this used to target no longer exists. There is no channel code left
 * in this function to re-enable by accident.
 */
function sendDailyDigest() {
  var r = dTasks_(true);
  var tasks = r.tasks;

  // A rerouted owner means a coach was about to be messaged. Recorded in the
  // execution log every run, not just when someone happens to look.
  r.problems.forEach(function (p) { Logger.log('DIGEST PROBLEM: ' + p); });

  var byOwner = {};
  tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

  // 1 · each person's own list.
  // ONLY dashboard users are ever iterated. Even if a non-person owner somehow
  // survived dTasks_, there is no loop here that would reach them.
  D_PEOPLE.forEach(function (owner) {
    var mine = byOwner[owner];
    if (!mine || !mine.length) return;
    var id = dResolveDm_(owner);
    if (!id) { Logger.log('No Slack address for ' + owner + ' — skipped.'); return; }
    dSlack_('chat.postMessage', { channel: id, text: dRender_(owner, mine) });
  });

  // 2 · the whole-team summary, as a SEPARATE second DM.
  // Skipped entirely when there is nothing open, so a quiet day sends nothing
  // at all rather than a message saying there is nothing.
  if (tasks.length) {
    var summary = dRenderSummary_(tasks);
    DIGEST.SUMMARY_TO.forEach(function (owner) {
      // Routed through the same resolver, so the summary can no more reach a
      // coach than a personal list can.
      var id = dResolveDm_(owner);
      if (!id) { Logger.log('No Slack address for ' + owner + ' — summary skipped.'); return; }
      dSlack_('chat.postMessage', { channel: id, text: summary });
    });
  }
}

/** Compare this file's fold against what the dashboard shows. Read-only. */
/**
 * Structural assertions on the raffle mirror. These do not compare counts —
 * they prove the RULES here still say what raffle.js says, because a count can
 * match by luck while the rule underneath is wrong.
 */
function dSelfCheckRaffle_() {
  var problems = [];

  function L0() { return null; }
  var probe = dRaffleConditions_(L0, { state: 'missing' }, function (s) {
    return s === 'received' || s === 'partial';
  });

  if (probe.length !== 3) {
    problems.push('the raffle has exactly three conditions (D-008), found ' + probe.length);
  }
  probe.forEach(function (c) {
    (c.stages || []).forEach(function (s) {
      if (s === D_S.PREFS_PODCAST) {
        problems.push('podcast consent is NOT a raffle condition (D-097) — found in "' + c.key + '"');
      }
      if (s === 'Review — self-reported' || s === 'Review — confirmed') {
        problems.push('condition "' + c.key + '" reads a dashboard-writable review string; the ' +
                      'raffle must read the engine-owned preferences event (D-066/D-098)');
      }
      if (s === 'Collection — client video link') {
        problems.push('"Collection — client video link" means folder 03 was SHARED, not that the ' +
                      'video arrived — reading it would qualify every client the fan-out has ' +
                      'run for ("' + c.key + '")');
      }
    });
  });

  // Eligibility must be a subset of qualifying, and a prior winner is out.
  var fake = [
    { email: 'q@x',  qualifies: true,  personWon: false },
    { email: 'nq@x', qualifies: false, personWon: false },
    { email: 'pw@x', qualifies: true,  personWon: true }
  ];
  var got = dEligibleFrom_(fake).map(function (e) { return e.email; });
  if (got.length !== 1 || got[0] !== 'q@x') {
    problems.push('eligibility is not exactly "qualifies and has never won" — got [' + got.join(', ') + ']');
  }

  // The classifier's D-099 case: "Not yet" is a clean No, never unclear.
  if (dClassify_('No ("Not yet")').met !== false) problems.push('"No (\\"Not yet\\")" must classify as No');
  if (dClassify_('Unclear answer: "Not yet" — review manually').met !== false) {
    problems.push('a pre-D-099 unclear row holding "Not yet" must still recover as No');
  }
  if (dClassify_('Yes ("Yes, done")').met !== true) problems.push('"Yes (...)" must classify as Yes');
  if (dClassify_('Maybe later').met !== null) problems.push('an unreadable answer must be unclear, not a no');

  // The month override must round-trip, or the button writes a row this
  // mirror silently ignores while the frontend honours it.
  var MOVED = D_S.RAFFLE_MONTH_MOVED;
  var one = dMonthOf_([{ stage: MOVED, event: 'Moved to the 2026-09 raffle (from 2026-08)', ts: 1 }], 0);
  if (one.month !== '2026-09' || !one.moved) {
    problems.push('the "Raffle — month moved" override did not read back as 2026-09 (D-100)');
  }

  // A round trip: the newest move decides the month, and `from` is the PREVIOUS
  // move, never the entry month — otherwise it claims a move from the month the
  // client is already in.
  var trip = dMonthOf_([
    { stage: MOVED, event: 'Moved to the 2026-09 raffle (from 2026-08)', ts: 1 },
    { stage: MOVED, event: 'Moved to the 2026-08 raffle (from 2026-09)', ts: 2 }
  ], 0);
  if (trip.month !== '2026-08') problems.push('the newest move must decide the month, got ' + trip.month);
  if (trip.from !== '2026-09') problems.push('after a round trip, "from" must be the PREVIOUS move (2026-09), got ' + trip.from);

  // An unreadable move cannot move anybody.
  var junk = dMonthOf_([{ stage: MOVED, event: 'moved to next month', ts: 1 }], 0);
  if (junk.moved) problems.push('a move with no readable YYYY-MM must be ignored, not guessed at');

  // The Sheets date coercion: the operator types "2026-08" and the cell becomes
  // a date. Every reader used to fail its YYYY-MM test and fall back silently.
  if (dMonthSetting_(46266) !== '2026-09') {
    problems.push('a Sheets date serial must normalise to YYYY-MM, got ' + dMonthSetting_(46266));
  }
  if (dMonthSetting_('2026-08') !== '2026-08') problems.push('a real YYYY-MM must pass through unchanged');
  if (dMonthSetting_('2026-08-01') !== '2026-08') problems.push('an ISO date must normalise to its month');
  if (dMonthSetting_('') !== '') problems.push('blank must stay blank (blank = the current month)');
  // Nonsense must stay nonsense, so the readers still flag it instead of
  // silently treating it as "no pin set".
  if (dMonthSetting_('Septembre') !== 'Septembre') {
    problems.push('an unrecognised value must be returned unchanged so it still fails the YYYY-MM test');
  }

  return problems;
}

/**
 * Structural assertions on the postponement (D-120). Synthetic, so they hold
 * whatever the live log happens to contain today — the invariants are about the
 * rules, not about the four clients who exist this month.
 *
 * The dates are built RELATIVE to now: a month far ahead is still waiting, a
 * month already past has resumed. That is how "before" and "after" the resume
 * date are exercised without a simulated clock, which the digest does not have
 * (there is no URL to put `?sim=` on when a trigger fires it).
 */
function dSelfCheckPostponement_() {
  var problems = [];
  var settings = { outreachReplyCheckHours: 24, outreachFollowup1Hours: 24,
                   outreachFollowup2Hours: 48, outreachCoachToldHours: 48,
                   outreachCoachNotMessagedHours: 24, videoCheckHours: 48,
                   videoSnoozeDays: 2, coachFormFollowupHours: 24, coachFormEscalateHours: 24,
                   collectingStaleHours: 120, contentCheckinDays: 5, contentEscalateDays: 7,
                   approvalEscalateHours: 48 };
  // Built through the real builder rather than hand-shaped, so this check can
  // never pass against a roster object the live code no longer accepts.
  var roster = dBuildIdentity_(
    [['First', 'Last', 'Email', 'Program', 'Start', 'Coach', 'End', 'Client Name', 'Coach Email', 'Coach Slack'],
     ['Pat', 'Postponed', 'p@x', '1:1', '', 'Brent', '', 'Pat Postponed', 'b@x', 'brent@slack.com']],
    []);
  var DAY = 24 * 36e5;

  /* A client mid-outreach with every clock long expired — without the
   * postponement this shape produces a follow-up task, which is the point. */
  function fake(monthKey, postAgeDays) {
    var t0 = Date.now() - 40 * DAY;
    var last = {}, repeats = {};
    function put(stage, ts, event) {
      last[dNorm_(stage)] = { stage: stage, ts: ts, event: event || '', row: 1, email: 'p@x', cycle: 1 };
      repeats[dNorm_(stage)] = (repeats[dNorm_(stage)] || 0) + 1;
    }
    put(D_S.NOMINATION_LOGGED, t0);
    put(D_S.OUTREACH_SENT, t0 + DAY);
    if (monthKey) put(D_S.POSTPONED, Date.now() - postAgeDays * DAY, 'Postponed to ' + monthKey);

    var inputs = {};
    ['video', 'everfit', 'photos', 'coachForm', 'meet', 'loom'].forEach(function (k) {
      inputs[k] = { state: 'missing', at: NaN, event: null, text: '' };
    });
    var month = monthKey || '2026-08';
    return {
      email: 'p@x', cycle: 1, key: 'p@x::1', stage: 'outreach', at: t0 + DAY,
      terminal: false, inputs: inputs, arrived: function (s) { return s === 'received' || s === 'partial'; },
      pieces: {}, piecesDone: 0, allPiecesDone: false, complete: false, collectionComplete: false,
      approved: false, lastByStage: last, repeats: repeats, collectingEntry: null,
      raffle: { qualifies: false }, raffleMonth: month, raffleMoved: !!monthKey,
      raffleWon: null, raffleMonthAdded: false, raffleMessagesSent: false, raffleEntryTs: t0,
      schedPost: false, schedEmail: false, flags: [],
      postponement: dPostponement_(function (s) { return last[dNorm_(s)] || null; },
                                   repeats, month, Date.now())
    };
  }

  /* 1 · a pending postponement whose month has NOT arrived → zero tasks. */
  var futureMonth = dMonthKey_(Date.now() + 400 * DAY);
  var waiting = fake(futureMonth, 1);
  if (!waiting.postponement.pending) {
    problems.push('a postponement with no later outreach must be pending (D-120)');
  }
  if (!waiting.postponement.waiting) {
    problems.push('a postponement to ' + futureMonth + ' must still be waiting');
  }
  var nWaiting = dEvaluate_(waiting, settings, roster).length +
                 dReviewTasks_([waiting], roster).length;
  if (nWaiting !== 0) {
    problems.push('a postponed client must generate EXACTLY 0 tasks before the resume date, got ' + nWaiting);
  }

  /* 2 · the same client, once the resume date has passed → exactly one, Gaby's. */
  var pastMonth = dMonthKey_(Date.now() - 40 * DAY);
  var resumed = fake(pastMonth, 35);
  var rTasks = dEvaluate_(resumed, settings, roster).concat(dReviewTasks_([resumed], roster));
  if (rTasks.length !== 1) {
    problems.push('on and after the resume date a postponed client must generate EXACTLY 1 task, got ' +
                  rTasks.length + ' [' + rTasks.map(function (x) { return x.flow + '/' + x.rung; }).join(', ') + ']');
  } else {
    if (rTasks[0].owner !== 'Gaby') problems.push('the resume task belongs to Gaby, got ' + rTasks[0].owner);
    if (rTasks[0].flow !== 'postponement' || rTasks[0].rung !== 'resume') {
      problems.push('the resume task must be postponement/resume, got ' + rTasks[0].flow + '/' + rTasks[0].rung);
    }
  }

  /* 3 · the same shape with NO postponement must produce work — otherwise the
   *     two assertions above would pass on a client who was simply idle. */
  var control = fake(null, 0);
  if (control.postponement.pending) problems.push('a client with no postponement event must not be pending');
  if (!dEvaluate_(control, settings, roster).length) {
    problems.push('the control client must generate tasks, or the "zero tasks" assertions prove nothing');
  }

  /* 4 · the outreach ENDS it — the date never does. A postponement to a month
   *     already past, with a newer outreach, is finished; without one it is not. */
  var reOut = fake(pastMonth, 35);
  reOut.lastByStage[dNorm_(D_S.OUTREACH_SENT)] = { stage: D_S.OUTREACH_SENT, ts: Date.now() - 1 * DAY, row: 9 };
  reOut.postponement = dPostponement_(function (s) { return reOut.lastByStage[dNorm_(s)] || null; },
                                      reOut.repeats, pastMonth, Date.now());
  if (reOut.postponement.pending) {
    problems.push('an outreach written AFTER the postponement must end it (D-120)');
  }

  /* 5 · cancelling ends it too, and returns the month in the same write. */
  var cancelled = fake(futureMonth, 2);
  cancelled.lastByStage[dNorm_(D_S.POSTPONE_CANCELLED)] =
    { stage: D_S.POSTPONE_CANCELLED, ts: Date.now(), row: 9, event: 'back to 2026-08' };
  cancelled.postponement = dPostponement_(function (s) { return cancelled.lastByStage[dNorm_(s)] || null; },
                                          cancelled.repeats, '2026-08', Date.now());
  if (cancelled.postponement.pending) problems.push('a cancellation newer than the postponement must end it');

  /* 6 · THE MONTH IS ONE FUNCTION, reading three strings. A postponement moves
   *     the cohort with no second `Raffle — month moved` row anywhere. */
  var byPostpone = dMonthOf_([{ stage: D_S.POSTPONED, ts: 1,
    event: 'Postponed to 2026-09 at the client\'s request (from 2026-08).' }], 0);
  if (byPostpone.month !== '2026-09') {
    problems.push('"Pipeline — postponed to month" must move the raffle month (D-120), got ' + byPostpone.month);
  }
  var byCancel = dMonthOf_([
    { stage: D_S.POSTPONED, ts: 1, event: 'Postponed to 2026-09 (from 2026-08).' },
    { stage: D_S.POSTPONE_CANCELLED, ts: 2, event: 'Postponement cancelled, back to 2026-08 (was 2026-09).' }
  ], 0);
  if (byCancel.month !== '2026-08') {
    problems.push('the cancellation must return the raffle month, got ' + byCancel.month);
  }

  /* 7 · the resume date is the first Monday-to-Friday of the month. */
  // 2026-08-01 is a Saturday, so August resumes on Monday the 3rd.
  var aug = dFirstBusinessDay_('2026-08');
  var augDay = new Date(aug + TZ_OFFSET_MIN * 60000);
  if (augDay.getUTCDate() !== 3) {
    problems.push('Aug 2026 starts on a Saturday, so the resume date is the 3rd, got ' + augDay.getUTCDate());
  }
  // 2026-09-01 is a Tuesday — a weekday, so it is the 1st itself.
  var sep = new Date(dFirstBusinessDay_('2026-09') + TZ_OFFSET_MIN * 60000);
  if (sep.getUTCDate() !== 1) {
    problems.push('Sep 2026 starts on a Tuesday, so the resume date is the 1st, got ' + sep.getUTCDate());
  }

  return problems;
}

/**
 * Structural assertions on the identity resolver (mirror of identity.js).
 * Synthetic, so they hold whatever the live sheets happen to contain — the
 * point is to prove the RULE, not to count today's rows.
 */
function dSelfCheckIdentity_() {
  var problems = [];

  var ROSTER = [
    ['First', 'Last', 'Email', 'Program', 'Start', 'Coach', 'End', 'Client Name', 'Coach Email', 'Coach Slack'],
    ['Active', 'Person', 'active@x.com', '1:1', '', 'Ceci', '', 'Active Person', 'c@x.com', 'ceci@slack.com']
  ];
  var MASTER = [
    ['First', 'Last', 'Email', 'Product', '', 'Date Purchased', 'Contract Start', 'Contract End', '', 'Coach'],
    ['Past', 'Person', 'past@x.com', '1:1', '', 'August 5, 2024', 'August 5, 2024', '', '', 'Brent'],
    ['Past', 'Person', 'past@x.com', '1:1', '', '5/6/2026', '5/6/2026', '', '', 'Ceci'],
    ['Active', 'Person', 'active@x.com', '1:1', '', 'January 2, 2020', 'January 2, 2020', '', '', 'Brent']
  ];
  var ID = dBuildIdentity_(ROSTER, MASTER);

  var past = ID.resolve('past@x.com');
  if (!past.resolved || past.source !== 'mastersheet') {
    problems.push('a former client must resolve through Mastersheet Data, not become an identity flag');
  }
  if (past.name !== 'Past Person') {
    problems.push('a former client must be named from First + Last, got "' + past.name + '"');
  }
  if (past.coach !== 'Ceci') {
    problems.push('the MOST RECENT contract must decide the coach, got ' + past.coach);
  }
  if (past.coachSlack !== 'ceci@slack.com') {
    problems.push('the coach Slack address must come from the Roster-derived map');
  }
  if (past.active !== false) problems.push('a mastersheet-resolved client is not active');

  var act = ID.resolve('active@x.com');
  if (act.source !== 'roster') problems.push('the Roster must win over Mastersheet Data');
  if (act.coach !== 'Ceci') problems.push('the Roster coach must win over an older contract coach');

  // The fallback must NOT turn "never heard of them" into a guess.
  var miss = ID.resolve('stranger@x.com');
  if (miss.resolved || miss.name) problems.push('an unknown email must not resolve, and must have no name');
  if (ID.resolve('').resolved) problems.push('a blank email must not resolve');
  if (!ID.resolve('  PAST@x.com ').resolved) problems.push('email matching must ignore case and spaces');

  // The mixed date column, both formats plus the real Date objects getValues()
  // returns. A wrong parse here silently picks the wrong contract's coach.
  if (dLooseDate_('August 5, 2024') !== new Date(2024, 7, 5).getTime()) problems.push('"August 5, 2024" must parse');
  if (dLooseDate_('5/6/2026') !== new Date(2026, 4, 6).getTime()) problems.push('"5/6/2026" is M/D/YYYY — May 6, not June 5');
  if (dLooseDate_('2026-01-15') !== new Date(2026, 0, 15).getTime()) problems.push('an ISO date must parse');
  if (dLooseDate_(new Date(2026, 4, 6)) !== new Date(2026, 4, 6).getTime()) problems.push('a real Date object must parse');
  if (isFinite(dLooseDate_('whenever'))) problems.push('an unreadable date must be NaN, never a guess');

  // Contract Start missing → Date Purchased decides, rather than the row order.
  var byPurchase = dBuildIdentity_([ROSTER[0]], [
    MASTER[0],
    ['P', 'Q', 'p@x.com', '1:1', '', '2026-01-15', '', '', '', 'Brent'],
    ['P', 'Q', 'p@x.com', '1:1', '', '2026-07-15', '', '', '', 'Ceci']
  ]).resolve('p@x.com');
  if (byPurchase.coach !== 'Ceci') {
    problems.push('with no Contract Start, the later Date Purchased must decide, got ' + byPurchase.coach);
  }

  // The live tab must actually exist. A silent Roster-only fallback is exactly
  // the failure this whole block is about.
  var ss = SpreadsheetApp.openById(DIGEST.ROSTER_ID);
  if (!ss.getSheetByName(DIGEST.MASTER_TAB)) {
    problems.push('the "' + DIGEST.MASTER_TAB + '" tab is missing — every former client ' +
                  'will read as an unresolved identity');
  }

  return problems;
}

/**
 * READ-ONLY diagnostic: what this file thinks one email is, and why.
 * Run it by hand whenever a task names an address instead of a person.
 */
function checkIdentityFor(email) {
  var id = dReadRoster_();
  var r = id.resolve(email);
  var msg = ['=== IDENTITY FOR ' + email + ' ===',
             'sources loaded: roster ' + id.rosterCount + ' · mastersheet ' + id.masterCount,
             'resolved: ' + r.resolved,
             'source: ' + r.source,
             'name: ' + (r.name || '(none — tasks would read the raw email)'),
             'coach: ' + (r.coach || '(none)'),
             'coach Slack: ' + (r.coachSlack || '(none)'),
             'active client: ' + r.active,
             'contracts on file: ' + r.contracts,
             'note: ' + (r.reason || '(none)')].join('\n');
  Logger.log(msg);
  return msg;
}

function selfCheck() {
  var st = dReadSettings_();
  var list = dFold_(), byStage = {};
  list.forEach(function (t) { byStage[t.stage] = (byStage[t.stage] || 0) + 1; });

  var raf = dRaffle_(list, st);
  var ident = dReadRoster_();
  var r = dTasks_(true);
  var tasks = r.tasks;
  function n(pred) { return tasks.filter(pred).length; }

  var problems = dSelfCheckRaffle_().concat(dSelfCheckPostponement_())
                   .concat(dSelfCheckIdentity_()).concat(dSelfCheckSend_()).concat(r.problems);

  // Every owner must be a dashboard user. After dTasks_ reroutes, this can only
  // fail if the reroute itself broke — which is exactly when it matters.
  tasks.forEach(function (t) {
    if (D_PEOPLE.indexOf(t.owner) < 0) {
      problems.push('owner "' + t.owner + '" is not a dashboard user (D-094)');
    }
  });

  /* Postponement, against the LIVE log (D-120). Two things worth asserting on
   * real data rather than only synthetically: a postponed client's cohort must
   * be the month they were postponed TO — which is what keeps them out of the
   * old month's draw — and a waiting client must own no tasks at all. */
  var postponed = list.filter(function (t) { return t.postponement && t.postponement.pending; });
  postponed.forEach(function (t) {
    if (t.postponement.month !== t.raffleMonth) {
      problems.push('postponed client ' + t.key + ' has cohort ' + t.raffleMonth +
                    ' but a postponement to ' + t.postponement.month +
                    ' — the month must come from ONE function (D-120)');
    }
    if (t.postponement.waiting) {
      var mine = tasks.filter(function (x) { return x.clientKey === t.key; });
      if (mine.length) {
        problems.push('postponed client ' + t.key + ' still owns ' + mine.length +
                      ' task(s) before the resume date: ' +
                      mine.map(function (x) { return x.flow + '/' + x.rung; }).join(', '));
      }
    }
  });

  var bySev = {};
  tasks.forEach(function (t) { bySev[t.sev] = (bySev[t.sev] || 0) + 1; });
  var byOwner = {};
  tasks.forEach(function (t) { byOwner[t.owner] = (byOwner[t.owner] || 0) + 1; });

  var msg = ['=== DIGEST SELF-CHECK (read-only) ===',
             'testimonials: ' + list.length,
             'by stage: ' + JSON.stringify(byStage),
             'tasks: ' + tasks.length,
             'by owner: ' + JSON.stringify(byOwner),
             'by severity: ' + JSON.stringify(bySev),
             '',
             '--- raffle (mirror of dashboard/raffle.js) ---',
             'month: ' + raf.month + (dIsMonthKey_(String(st.activeMonth || '').trim())
               ? ' (pinned by the activeMonth setting)' : ' (current month)'),
             'cohort: ' + raf.entries.length,
             'qualifying: ' + raf.qualifying.length,
             'eligible: ' + raf.eligible.length,
             'draw state: ' + raf.drawState,
             'winner: ' + (raf.winner ? raf.winner.email + ' (cycle ' + raf.winner.cycle + ')' : 'none'),
             'raffle tasks: ' + n(function (t) { return /raffle/i.test(t.title); }),
             '',
             '--- identity (mirror of dashboard/identity.js) ---',
             'roster: ' + ident.rosterCount + ' active · mastersheet: ' + ident.masterCount + ' with contracts',
             'unresolved: ' + n(function (t) { return t.rung === 'identity'; }),
             '',
             '--- postponement (D-120) ---',
             'postponed: ' + postponed.length +
               (postponed.length ? ' (' + postponed.map(function (t) {
                 return t.key + ' → ' + t.postponement.month +
                        (t.postponement.waiting ? ', waiting' : ', resumed');
               }).join('; ') + ')' : ''),
             'resume tasks: ' + n(function (t) { return t.flow === 'postponement'; }),
             '',
             'invariants: ' + (problems.length ? 'FAILED' : 'ok'),
             problems.length ? '  - ' + problems.join('\n  - ') : '',
             '',
             '--- TASK FINGERPRINT (D-088 drift check) ---',
             'Run this in the browser console on the dashboard:',
             '    Alerts.fingerprint(TDApp.state)',
             'and compare with the block below. They must be IDENTICAL — if they',
             'are not, the digest is telling the team something the queue does',
             'not say, and one of the two implementations has drifted.',
             '',
             dFingerprint_(),
             '',
             'The raffle counts above must also match RaffleFold.build(state):',
             'month, cohort, qualifying, eligible, drawState.'].join('\n');
  Logger.log(msg);
  return msg;
}

/** Installs ONLY the digest trigger. Deletes nothing. Run deliberately. */
function installDigestTrigger() {
  var already = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'sendDailyDigest';
  });
  if (already.length) return 'Already installed. Nothing done.';

  // CONTENT_CHANNEL_ID is deliberately NOT required any more — the digest posts
  // to no channel at all. What IS required is a way to reach Gaby, who owns
  // most of the queue: without it the daily run would do nothing and look fine.
  if (!DIGEST.PEOPLE_SLACK.Gaby) throw new Error('PEOPLE_SLACK.Gaby is empty — fill DIGEST first.');

  var problems = dSelfCheckSend_();
  if (problems.length) {
    throw new Error('Refusing to install — fix these first:\n  - ' + problems.join('\n  - '));
  }

  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(DIGEST.HOUR).everyDays(1).create();
  return 'Installed sendDailyDigest daily between ' + DIGEST.HOUR + ':00 and ' +
         (DIGEST.HOUR + 1) + ':00, project timezone. DMs only, no channel. ' +
         'Team summary also goes to: ' + DIGEST.SUMMARY_TO.join(', ') + '.';
}
