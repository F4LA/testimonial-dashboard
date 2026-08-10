/**
 * Testimonial Dashboard — daily per-owner Slack digest (Phase 3)
 *
 * Belongs to the DASHBOARD's standalone Apps Script project, alongside
 * Code.gs. It is deliberately NOT in the collection engine's project.
 *
 * ⚠️ NOTHING IS WIRED YET. No trigger is installed and no message is sent
 * until the values in CONFIG below are filled in and `installDigestTrigger()`
 * is run deliberately. Run `previewDigest()` first — it returns exactly what
 * would be posted, and sends nothing.
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
 *   raffle: the three conditions + answer classifier  raffle.js conditionsFor/classify
 *   raffle: cohort month + the "month moved" override raffle.js monthOf
 *   raffle: eligibility and the draw-due state        raffle.js eligibleFrom/build
 *   raffle: the two parallel post-draw tasks          flows.js flowRaffleMonth/Messages
 *   raffle: the month-level draw task                 alerts.js raffleTasks
 *
 * If you change any of those, change them here too. `selfCheck()` compares
 * this file's stage counts against what the dashboard shows, so drift is
 * detectable rather than silent.
 *
 * The raffle half is the newest and the easiest to get subtly wrong, so
 * `selfCheck()` prints its eligible / draw-due / raffle-task counts explicitly
 * and re-asserts the two invariants that matter: a non-qualifier can never be
 * eligible, and podcast consent is never a condition (D-097).
 */

/* ===================== Configuration — FILL THESE IN ===================== */

var DIGEST = {
  SHEET_ID:   '17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo',
  EVENT_TAB:  'Event Log',
  SETTINGS_TAB: 'Settings',
  ROSTER_ID:  '1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc',
  ROSTER_TAB: 'Roster',

  DASHBOARD_URL: 'https://f4la.github.io/testimonial-dashboard/',

  // Slack DM targets, by the same names as TDConfig.PEOPLE. Email addresses;
  // the bot resolves them with users.lookupByEmail, exactly as the engine's
  // notifyCoach_ does. Coaches are resolved from the roster's column J.
  PEOPLE_SLACK: {
    Gaby:     '',      // ← required, she owns most of the queue
    Miguel:   '',      // ← required, content
    Joey:     '',      // ← required, approvals (temporary stage, 3-4 months)
    Bernardo: ''       // ← escalations only
  },

  // The existing testimonial-management channel. Production items surface
  // here rather than as DMs, so Gaby can push in the open (spec §5).
  CONTENT_CHANNEL_ID: '',   // ← required, e.g. C0XXXXXXXXX

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
  RAFFLE_MONTH_MOVED:'Raffle — month moved'
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
function dMonthOf_(L, firstTs) {
  var moved = L(D_S.RAFFLE_MONTH_MOVED);
  if (moved) {
    var m = /(\d{4}-\d{2})/.exec(String(moved.event || ''));
    if (m && dIsMonthKey_(m[1])) {
      return { month: m[1], moved: true, from: dMonthKey_(firstTs) };
    }
  }
  return { month: dMonthKey_(firstTs), moved: false };
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

  var drawState = winners.length ? 'done'
                : (eligible.length ? (dMonthIsPast_(month) ? 'overdue' : 'due')
                                   : 'waiting');

  return {
    month: month, entries: inMonth, eligible: eligible,
    qualifying: inMonth.filter(function (e) { return e.qualifies; }),
    winner: winners[0] || null,
    doubleWinner: winners.length > 1 ? winners : null,
    drawState: drawState,
    drawDue: drawState === 'due' || drawState === 'overdue'
  };
}

/* ===================== Read + fold ===================== */

function dReadSettings_() {
  var out = {
    nominationWarmupHours: 24, outreachFollowupHours: 72, inviteUploadFollowupHours: 96,
    collectingStaleHours: 120, producingPieceHours: 168, approvalPendingHours: 72,
    bufferTargetWeeks: 4, activeMonth: ''
  };
  var sh = SpreadsheetApp.openById(DIGEST.SHEET_ID).getSheetByName(DIGEST.SETTINGS_TAB);
  if (!sh) return out;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0]).trim(), v = rows[i][1];
    if (k && out.hasOwnProperty(k) && v !== '') out[k] = (typeof out[k] === 'number') ? Number(v) : String(v);
  }
  return out;
}

function dReadRoster_() {
  var sh = SpreadsheetApp.openById(DIGEST.ROSTER_ID).getSheetByName(DIGEST.ROSTER_TAB);
  var rows = sh.getDataRange().getValues();
  var by = {}, coachSlack = {};
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var email = String(r[2] || '').trim().toLowerCase();
    if (!email) continue;
    var rec = {
      email: email,
      name: String(r[7] || (r[0] + ' ' + r[1])).trim(),
      coach: String(r[5] || '').trim(),
      coachSlack: String(r[9] || '').trim()
    };
    if (!by[email]) by[email] = rec;
    if (rec.coach && rec.coachSlack && !coachSlack[rec.coach]) coachSlack[rec.coach] = rec.coachSlack;
  }
  return { byEmail: by, coachSlack: coachSlack };
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
    var last = {};
    evs.forEach(function (e) { last[dNorm_(e.stage)] = e; });   // last write wins
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

    var pieces = {}, done = 0, lastPiece = NaN;
    D_PIECES.forEach(function (p) {
      var e = L(p.stage);
      pieces[p.key] = !!e;
      if (e) { done++; if (!isFinite(lastPiece) || e.ts > lastPiece) lastPiece = e.ts; }
    });

    // Invited: kickoff, or ANY of the five fan-out strings — never the two
    // form events, which fire later in the process.
    var fanout = null;
    D_ENGINE_FANOUT.forEach(function (s) {
      var e = L(s); if (e && (!fanout || e.ts > fanout.ts)) fanout = e;
    });

    var ladder = [
      ['nominated',  L(D_S.NOMINATION_LOGGED)],
      ['outreach',   L(D_S.OUTREACH_SENT)],
      ['invited',    L(D_S.INVITE_KICKOFF) || fanout],
      ['collecting', arrived(inputs.video.state) ? inputs.video.ev : null],
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
    var rMonth = dMonthOf_(L, firstTs);
    var rComp = dCompliance_(dRaffleConditions_(L, inputs.video, arrived));

    out.push({
      email: evs[0].email, cycle: evs[0].cycle, key: k,
      stage: stage || 'indeterminate', at: at,
      hours: isFinite(at) ? (Date.now() - at) / 36e5 : NaN,
      inputs: inputs, arrived: arrived, pieces: pieces, piecesDone: done,
      complete: !!L(D_S.COMPLETE),
      raffle: rComp,
      raffleMonth: rMonth.month,
      raffleMoved: rMonth.moved,
      raffleWon: L(D_S.RAFFLE_WINNER),
      raffleMonthAdded: !!L(D_S.RAFFLE_MONTH_ADDED),
      raffleMessagesSent: !!L(D_S.RAFFLE_MESSAGES),
      raffleEntryTs: firstTs,
      schedPost: !!L(D_S.SCHED_POST), schedEmail: !!L(D_S.SCHED_EMAIL),
      flags: ['meet', 'loom', 'coachForm', 'video', 'everfit', 'photos'].filter(function (kk) {
        return inputs[kk].state === 'flagged';
      })
    });
  });
  return out;
}

/* ===================== Rules (mirror of alerts.js) ===================== */

function dTasks_() {
  var st = dReadSettings_(), roster = dReadRoster_(), list = dFold_();
  var tasks = [];
  function add(owner, channel, title, detail, sev) {
    tasks.push({ owner: owner, channel: channel || 'dm', title: title, detail: detail || '', sev: sev });
  }
  function sev(h, thr) { return (isFinite(h) && h > thr) ? 'overdue' : 'due'; }

  list.forEach(function (t) {
    if (t.stage === 'closed') return;
    var r = roster.byEmail[t.email] || {};
    var name = r.name || t.email;
    var coach = r.coach || '';
    var h = t.hours;

    if (t.stage === 'nominated') {
      add('Gaby', 'dm', 'Nudge ' + (coach || 'the coach') + ' — warm-up not done for ' + name,
          Math.round(h) + 'h since nomination', sev(h, st.nominationWarmupHours));
    }
    if (t.stage === 'outreach') {
      add('Gaby', 'dm', 'Follow up with ' + name + ' — no answer to the outreach',
          Math.round(h) + 'h since outreach', sev(h, st.outreachFollowupHours));
    }
    if (t.stage === 'invited') {
      var late = h > st.inviteUploadFollowupHours;
      add('Gaby', 'dm',
          late ? 'No video after ' + Math.round(h) + 'h — nudge ' + name
               : 'Check folder 03 for ' + name + "'s video",
          'Nothing detects the upload — the folder has to be checked.',
          sev(h, st.inviteUploadFollowupHours));
    }
    if (t.stage === 'collecting') {
      if (!t.arrived(t.inputs.coachForm.state)) {
        add(coach || 'Gaby', 'dm', 'Fill the coach form for ' + name, '', sev(h, st.collectingStaleHours));
      }
      if (!t.arrived(t.inputs.everfit.state)) {
        add('Gaby', 'dm', 'Pull Everfit data for ' + name, 'Blocks Producing.', sev(h, st.collectingStaleHours));
      }
      if (!t.arrived(t.inputs.photos.state)) {
        add('Gaby', 'dm', 'Pull photos for ' + name, 'Blocks Producing.', sev(h, st.collectingStaleHours));
      }
      // The gate: video + both manual pulls. Meet/Loom never block.
      if (!t.complete && t.arrived(t.inputs.video.state) &&
          t.arrived(t.inputs.everfit.state) && t.arrived(t.inputs.photos.state)) {
        add('Gaby', 'dm', 'Mark collection complete for ' + name,
            'Everything required is in — this unlocks Producing.', sev(h, st.collectingStaleHours));
      }
    }
    if (t.stage === 'producing') {
      D_PIECES.forEach(function (p) {
        if (!t.pieces[p.key]) {
          add(p.owner, 'channel', p.label + ' for ' + name,
              t.piecesDone + '/' + D_PIECES.length + ' pieces done', sev(h, st.producingPieceHours));
        }
      });
    }
    if (t.stage === 'review') {
      add('Joey', 'dm', 'Approve ' + name + ' — all five pieces are in', '', sev(h, st.approvalPendingHours));
    }
    if (t.stage === 'scheduled') {
      if (!t.schedPost)  add('Gaby', 'dm', 'Schedule the collaboration post for ' + name, '', sev(h, st.approvalPendingHours));
      if (!t.schedEmail) add('Gaby', 'dm', 'Schedule the weekly email for ' + name, '', sev(h, st.approvalPendingHours));
    }
    t.flags.forEach(function (f) {
      add('Gaby', 'dm', 'Review the ' + f + ' flag for ' + name,
          'Does not block the pipeline.', 'review');
    });
    if (!roster.byEmail[t.email]) {
      add('Gaby', 'dm', 'Resolve the identity for ' + t.email, 'Not in the roster.', 'review');
    }

    /* --- raffle post-draw, PARALLEL (D-080) ---------------------------------
     * Mirrors flows.js flowRaffleMonth / flowRaffleMessages. Two independent
     * items, never chained: the old SOP sent the winner message only after the
     * contract was updated, and D-080 corrects that. No threshold — they are
     * immediate on confirmation and no waiting period is defined in Settings. */
    if (t.raffleWon && !t.raffleMonthAdded) {
      add('Miguel', 'dm', "Add " + name + "'s extra raffle month in the Master Sheet",
          'Won the ' + t.raffleMonth + ' raffle. The dashboard never writes to the Master Sheet, ' +
          'so this is done by hand. Leave the note too.', 'due');
    }
    if (t.raffleWon && !t.raffleMessagesSent) {
      add('Gaby', 'dm', 'Send the ' + t.raffleMonth + ' raffle messages: ' + name + ' won, and thank the rest',
          'Winner message plus the thank-you to everyone else who entered, through Everfit.', 'due');
    }
  });

  /* --- the draw itself: a MONTH-level task, not a per-client one -----------
   * Mirrors alerts.js raffleTasks. No threshold: "eligible entries exist and
   * no winner yet" is a fact, and a month that ended undrawn is late by the
   * calendar. Neither is a timing policy, so neither needs a Settings key. */
  var raf = dRaffle_(list, st);
  if (raf.drawDue) {
    add('Gaby', 'dm',
        'Run the ' + raf.month + ' raffle draw — ' + raf.eligible.length +
          ' eligible ' + (raf.eligible.length === 1 ? 'entry' : 'entries'),
        (raf.drawState === 'overdue' ? raf.month + ' is over and no winner was drawn. ' : '') +
        'The draw is manual: open the raffle view, draw, and confirm. Confirming freezes who ' +
        'qualified today and fires Miguel\'s and Gaby\'s tasks at once.',
        raf.drawState === 'overdue' ? 'overdue' : 'due');
  }
  if (raf.doubleWinner) {
    add('Bernardo', 'dm', 'Two raffle winners are recorded for ' + raf.month,
        'The draw cannot produce this, so it means a double write or a hand-edited log. ' +
        'Nothing can be deleted (append-only).', 'review');
  }

  return tasks;
}

/* ===================== Rendering + sending ===================== */

function dRender_(owner, tasks) {
  var over = tasks.filter(function (t) { return t.sev === 'overdue'; });
  var due  = tasks.filter(function (t) { return t.sev === 'due'; });
  var rev  = tasks.filter(function (t) { return t.sev === 'review'; });
  var L = ['*Your testimonial queue — ' + Utilities.formatDate(new Date(), DIGEST_TZ, 'EEE d MMM') + '*'];
  function block(title, arr) {
    if (!arr.length) return;
    L.push('', title);
    arr.forEach(function (t) { L.push('• ' + t.title + (t.detail ? '  _' + t.detail + '_' : '')); });
  }
  block(':rotating_light: *Overdue*', over);
  block(':hourglass: *Due*', due);
  block(':mag: *Needs review*', rev);
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

function dResolveDm_(owner, roster) {
  var email = DIGEST.PEOPLE_SLACK[owner] || roster.coachSlack[owner] || '';
  if (!email) return null;
  var u = dSlack_('users.lookupByEmail?email=' + encodeURIComponent(email), {});
  return u.user && u.user.id;
}

/**
 * READ-ONLY. Returns exactly what would be posted, and sends nothing.
 * Run this first, every time, before touching sendDailyDigest().
 */
function previewDigest() {
  var tasks = dTasks_();
  var byOwner = {};
  tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

  var out = ['=== DIGEST PREVIEW — nothing sent ===', 'tasks: ' + tasks.length, ''];
  Object.keys(byOwner).sort().forEach(function (o) {
    var dm = byOwner[o].filter(function (t) { return t.channel === 'dm'; });
    var ch = byOwner[o].filter(function (t) { return t.channel === 'channel'; });
    if (dm.length) {
      out.push('--- DM to ' + o + ' (' + (DIGEST.PEOPLE_SLACK[o] || 'NO ADDRESS SET') + ') ---');
      out.push(dRender_(o, dm), '');
    }
    if (ch.length) {
      out.push('--- content channel, owner ' + o + ' ---');
      ch.forEach(function (t) { out.push('• ' + t.title); });
      out.push('');
    }
  });
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** Sends. Only ever called by the installed trigger, or deliberately by hand. */
function sendDailyDigest() {
  var roster = dReadRoster_();
  var tasks = dTasks_();
  var byOwner = {};
  tasks.forEach(function (t) { (byOwner[t.owner] || (byOwner[t.owner] = [])).push(t); });

  Object.keys(byOwner).forEach(function (owner) {
    var dm = byOwner[owner].filter(function (t) { return t.channel === 'dm'; });
    if (!dm.length) return;
    var id = dResolveDm_(owner, roster);
    if (!id) { Logger.log('No Slack address for ' + owner + ' — skipped.'); return; }
    dSlack_('chat.postMessage', { channel: id, text: dRender_(owner, dm) });
  });

  var channelTasks = tasks.filter(function (t) { return t.channel === 'channel'; });
  if (channelTasks.length && DIGEST.CONTENT_CHANNEL_ID) {
    var lines = ['*Production — open pieces*'];
    channelTasks.forEach(function (t) {
      lines.push('• ' + t.title + ' — *' + t.owner + '*' + (t.sev === 'overdue' ? ' :rotating_light:' : ''));
    });
    lines.push('', '<' + DIGEST.DASHBOARD_URL + '|Open the dashboard>');
    dSlack_('chat.postMessage', { channel: DIGEST.CONTENT_CHANNEL_ID, text: lines.join('\n') });
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
                      'video arrived — reading it would qualify every invited client ("' + c.key + '")');
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
  var mv = dMonthOf_(function (s) {
    return s === D_S.RAFFLE_MONTH_MOVED
      ? { event: 'Moved to the 2026-09 raffle (from 2026-08)', ts: 0 } : null;
  }, 0);
  if (mv.month !== '2026-09' || !mv.moved) {
    problems.push('the "Raffle — month moved" override did not read back as 2026-09 (D-100)');
  }

  return problems;
}

function selfCheck() {
  var st = dReadSettings_();
  var list = dFold_(), byStage = {};
  list.forEach(function (t) { byStage[t.stage] = (byStage[t.stage] || 0) + 1; });

  var raf = dRaffle_(list, st);
  var tasks = dTasks_();
  function n(pred) { return tasks.filter(pred).length; }

  var problems = dSelfCheckRaffle_();

  var msg = ['=== DIGEST SELF-CHECK (read-only) ===',
             'testimonials: ' + list.length,
             'by stage: ' + JSON.stringify(byStage),
             'tasks: ' + tasks.length,
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
             'invariants: ' + (problems.length ? 'FAILED' : 'ok'),
             problems.length ? '  - ' + problems.join('\n  - ') : '',
             '',
             'These must match the dashboard. If they do not, this file has',
             'drifted from dashboard/state-builder.js, raffle.js, flows.js or',
             'alerts.js. Compare against RaffleFold.build(state) in the browser',
             'console: month, cohort, qualifying, eligible, drawState.'].join('\n');
  Logger.log(msg);
  return msg;
}

/** Installs ONLY the digest trigger. Deletes nothing. Run deliberately. */
function installDigestTrigger() {
  var already = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'sendDailyDigest';
  });
  if (already.length) return 'Already installed. Nothing done.';
  if (!DIGEST.CONTENT_CHANNEL_ID) throw new Error('CONTENT_CHANNEL_ID is empty — fill DIGEST first.');
  if (!DIGEST.PEOPLE_SLACK.Gaby)  throw new Error('PEOPLE_SLACK.Gaby is empty — fill DIGEST first.');
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(DIGEST.HOUR).everyDays(1).create();
  return 'Installed sendDailyDigest daily at ' + DIGEST.HOUR + ':00 ' + DIGEST_TZ;
}
