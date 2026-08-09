/**
 * Testimonial Dashboard — Apps Script Web App (write proxy)
 *
 * The only thing that writes to the Event Log on the dashboard's behalf.
 * The frontend POSTs JSON here; this appends one row. Nothing is ever
 * updated, renamed, or reordered — the log is append-only.
 *
 * DEPLOY: Deploy ▸ New deployment ▸ Web app
 *   Execute as:      Me
 *   Who has access:  Anyone
 * Copy the /exec URL into TDConfig.WEB_APP_URL in dashboard/config.js.
 *
 * This file is the source of truth for the deployed script. Edit here,
 * paste into the Apps Script editor, redeploy, and note it in DECISION-LOG.md.
 */

/* ===================== Constants ===================== */

var SHEET_ID  = '17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo';
var EVENT_TAB = 'Event Log';
var SETTINGS_TAB = 'Settings';
var SIGNAL_TAB = 'Signal';   // the fan-out trigger layer; see requestFanout_

/** Columns A–E are LIVE. The collection engine writes them. Never touch
 *  their order or names. F (Cycle) is the single additive column. */
var EXPECTED_HEAD = ['Client email', 'Stage', 'Date and time', 'Event', 'Source'];
var CYCLE_HEADER  = 'Cycle';

/** People allowed to act. Mirrors TDConfig.PEOPLE — validated server-side
 *  too, so a bad client can never write an unattributed row. */
var PEOPLE = ['Joey', 'Miguel', 'Gaby', 'Bernardo', 'Sofi'];

/** The approved dashboard Stage vocabulary. All NINE engine strings are
 *  deliberately absent — including the two form-driven ones (Collection —
 *  coach form / client video) and the two system-level ones (Confirmation,
 *  Nomination). This script must never forge an event the engine owns.
 *  Kept in lockstep with TDConfig.STAGES in dashboard/config.js. */
var ALLOWED_STAGES = [
  'Nomination — logged', 'Nomination — coach warm-up done',
  'Outreach — sent', 'Outreach — client accepted',
  'Invite — kickoff sent',
  'Collection — video uploaded',
  'Collection — Everfit data', 'Collection — photos received',
  'Collection — complete', 'Collection — manual review resolved',
  'Production — carousel', 'Production — story', 'Production — reel',
  'Production — case study', 'Production — weekly email',
  'Approval — approved', 'Approval — sent back',
  'Schedule — week assigned', 'Schedule — post scheduled',
  'Schedule — email scheduled', 'Schedule — repost used',
  'Publish — live',
  'Pipeline — declined', 'Pipeline — dropped',
  'Note',
  'Raffle — winner confirmed', 'Raffle — messages sent', 'Raffle — month added',
  'Review — self-reported', 'Review — confirmed', 'Review — unmatched',
  'Review — verification done',
  'Podcast — invited', 'Podcast — accepted', 'Podcast — declined',
  'Podcast — scheduled', 'Podcast — personal note sent',
  'Podcast — recorded', 'Podcast — published',
  'Client of the month — winner', 'Client of the month — shout-out'
];

var SETTINGS_SEED = [
  ['Key', 'Value', 'Notes'],
  ['nominationWarmupHours',     24,  'Alert if the coach warm-up is not done within N hours of nomination'],
  ['outreachFollowupHours',     72,  'Alert if the client has not responded to outreach within N hours'],
  ['inviteUploadFollowupHours', 96,  'Alert if the video is not uploaded within N hours of the kickoff email'],
  ['collectingStaleHours',      120, 'Alert if a Collecting input is still missing after N hours'],
  ['producingPieceHours',       168, 'Alert if a production piece is not done within N hours'],
  ['approvalPendingHours',      72,  'Alert if Joey has not approved within N hours'],
  ['bufferTargetWeeks',         4,   'Healthy buffer; the alert fires when it drops below this'],
  ['activeMonth',               '',  'e.g. 2026-08 — blank means the current month']
];

/* ===================== Entry points ===================== */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'appendEvent':   return json(appendEvent_(body));
      case 'requestFanout': return json(requestFanout_(body));
      case 'ping':          return json({ ok: true, message: 'alive' });
      default:            return json({ ok: false, message: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return json({ ok: false, message: String(err) });
  }
}

function doGet() {
  return json({ ok: true, message: 'Testimonial Dashboard write proxy. POST only.' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Append ===================== */

function appendEvent_(b) {
  var email = String(b.email || '').trim().toLowerCase();
  var stage = String(b.stage || '').trim();
  var text  = String(b.event || '').trim();
  var actor = String(b.actor || '').trim();
  var cycle = parseInt(b.cycle, 10);
  if (!(cycle > 0)) cycle = 1;

  if (!email) return { ok: false, message: 'Missing email.' };
  if (PEOPLE.indexOf(actor) < 0) return { ok: false, message: 'Unknown or missing actor: "' + actor + '".' };
  if (ALLOWED_STAGES.indexOf(stage) < 0) return { ok: false, message: 'Stage not in the approved vocabulary: "' + stage + '".' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(EVENT_TAB);
    if (!sh) return { ok: false, message: 'Tab not found: ' + EVENT_TAB };

    var guard = assertHeader_(sh);
    if (!guard.ok) return guard;

    // Same clock and format as the engine. Using the SPREADSHEET's timezone
    // means no new timezone is introduced by this script.
    var tz = SpreadsheetApp.openById(SHEET_ID).getSpreadsheetTimeZone();
    var stamp = Utilities.formatDate(new Date(), tz, 'd MMM yyyy, H:mm');

    sh.appendRow([email, stage, stamp, text, 'MANUAL - ' + actor, cycle]);
    SpreadsheetApp.flush();

    return { ok: true, message: 'Appended.', row: sh.getLastRow(), stamp: stamp, timezone: tz };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Refuse to write if columns A–E are not exactly what the engine expects.
 * A non-additive change upstream would otherwise be silently written into.
 */
function assertHeader_(sh) {
  var head = sh.getRange(1, 1, 1, Math.max(6, sh.getLastColumn())).getValues()[0];
  for (var i = 0; i < EXPECTED_HEAD.length; i++) {
    if (String(head[i]).trim() !== EXPECTED_HEAD[i]) {
      return { ok: false, message: 'Event Log header changed at column ' +
        String.fromCharCode(65 + i) + ': expected "' + EXPECTED_HEAD[i] +
        '", found "' + head[i] + '". Refusing to write.' };
    }
  }
  if (String(head[5]).trim() !== CYCLE_HEADER) {
    return { ok: false, message: 'The Cycle column is missing. Run setupPhase1() once, then retry.' };
  }
  return { ok: true };
}

/* ===================== Fan-out bridge ===================== */

/**
 * Queues a client for the collection engine's fan-out, so Gaby never touches
 * the Signal sheet.
 *
 * It writes EXACTLY what a human tick writes — the roster name in column A and
 * a boolean true in column B, leaving Processed empty — and the engine's
 * `processPendingSignals` poll picks it up within a minute.
 *
 * It cannot tick the box and expect the engine's onEdit trigger to fire:
 * Apps Script onEdit triggers never fire for edits made by a script or the
 * Sheets API. Hence the poll on the engine side.
 *
 * Writes into the FIRST EMPTY PRE-MADE ROW rather than appending. The pre-made
 * rows carry real checkbox formatting; an appended row would hold a text
 * "TRUE" that the engine's `confirmed !== true` check rejects, and that Gaby
 * could not use as the manual fallback.
 */
function requestFanout_(b) {
  var name  = String(b.clientName || '').trim();
  var actor = String(b.actor || '').trim();

  if (PEOPLE.indexOf(actor) < 0) return { ok: false, message: 'Unknown or missing actor: "' + actor + '".' };
  if (!name) return { ok: false, message: 'Missing client name.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SIGNAL_TAB);
    if (!sh) return { ok: false, message: 'Tab not found: ' + SIGNAL_TAB };

    var last = Math.max(sh.getLastRow(), 1);
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];

    var now = new Date();
    var firstEmpty = 0;

    for (var i = 0; i < rows.length; i++) {
      var rowName  = String(rows[i][0] || '').trim();
      var confirmed = rows[i][1];
      var processed = rows[i][2];

      if (rowName.toLowerCase() === name.toLowerCase()) {
        // Layer 2 of the double-fire guard.
        if (confirmed === true && !processed) {
          return { ok: false, message: 'Already queued for ' + name + ' (Signal row ' + (i + 2) + '), waiting on the engine.' };
        }
        if (processed instanceof Date &&
            processed.getFullYear() === now.getFullYear() &&
            processed.getMonth() === now.getMonth()) {
          return { ok: false, message: 'The fan-out already ran for ' + name + ' this month (Signal row ' + (i + 2) + ').' };
        }
      }
      if (!firstEmpty && !rowName) firstEmpty = i + 2;
    }

    if (!firstEmpty) {
      return { ok: false, message: 'No empty pre-made row left in the Signal tab. Add more rows with checkboxes in column B.' };
    }

    sh.getRange(firstEmpty, 1).setValue(name);
    sh.getRange(firstEmpty, 2).setValue(true);     // boolean, not the string "TRUE"
    SpreadsheetApp.flush();

    return { ok: true, row: firstEmpty,
             message: 'Queued ' + name + ' in Signal row ' + firstEmpty + '. The engine picks it up within a minute.' };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== One-time setup ===================== */

/**
 * Run ONCE from the Apps Script editor (Run ▸ setupPhase1).
 *
 * Additive only:
 *   1. Adds the "Cycle" header in F1 of the Event Log. Columns A–E untouched.
 *      Existing rows keep a blank Cycle, which the dashboard folds to 1.
 *   2. Creates the Settings tab with the default thresholds, if absent.
 *
 * Safe to run twice — it skips anything already in place.
 */
function setupPhase1() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var out = [];

  var sh = ss.getSheetByName(EVENT_TAB);
  if (!sh) throw new Error('Tab not found: ' + EVENT_TAB);

  var head = sh.getRange(1, 1, 1, Math.max(6, sh.getLastColumn())).getValues()[0];
  for (var i = 0; i < EXPECTED_HEAD.length; i++) {
    if (String(head[i]).trim() !== EXPECTED_HEAD[i]) {
      throw new Error('Refusing to modify: column ' + String.fromCharCode(65 + i) +
        ' is "' + head[i] + '", expected "' + EXPECTED_HEAD[i] + '".');
    }
  }
  if (String(head[5]).trim() === CYCLE_HEADER) {
    out.push('Cycle column already present — left alone.');
  } else if (String(head[5]).trim() !== '') {
    throw new Error('Column F is not empty ("' + head[5] + '"). Resolve by hand before adding Cycle.');
  } else {
    sh.getRange(1, 6).setValue(CYCLE_HEADER);
    out.push('Added the Cycle header in F1. ' + Math.max(0, sh.getLastRow() - 1) +
             ' existing rows keep a blank Cycle and fold to 1.');
  }

  if (ss.getSheetByName(SETTINGS_TAB)) {
    out.push('Settings tab already exists — left alone.');
  } else {
    var st = ss.insertSheet(SETTINGS_TAB);
    st.getRange(1, 1, SETTINGS_SEED.length, 3).setValues(SETTINGS_SEED);
    st.getRange(1, 1, 1, 3).setFontWeight('bold');
    st.setFrozenRows(1);
    st.setColumnWidth(1, 230);
    st.setColumnWidth(2, 110);
    st.setColumnWidth(3, 520);
    out.push('Created the Settings tab with ' + (SETTINGS_SEED.length - 1) + ' defaults.');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** Read-only preflight — run this first to see what setupPhase1 would do. */
function inspect() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(EVENT_TAB);
  var head = sh.getRange(1, 1, 1, Math.max(6, sh.getLastColumn())).getValues()[0];
  var msg = [
    'Spreadsheet:  ' + ss.getName(),
    'Timezone:     ' + ss.getSpreadsheetTimeZone(),
    'Sample stamp: ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'd MMM yyyy, H:mm'),
    'Tabs:         ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' · '),
    'Header A–F:   ' + JSON.stringify(head.slice(0, 6)),
    'Data rows:    ' + Math.max(0, sh.getLastRow() - 1),
    'Cycle column: ' + (String(head[5]).trim() === CYCLE_HEADER ? 'present' : 'NOT present'),
    'Settings tab: ' + (ss.getSheetByName(SETTINGS_TAB) ? 'present' : 'NOT present')
  ].join('\n');
  Logger.log(msg);
  return msg;
}
