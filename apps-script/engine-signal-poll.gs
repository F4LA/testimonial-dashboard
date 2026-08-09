/**
 * ⚠️ THIS IS NOT PART OF THE DASHBOARD'S APPS SCRIPT PROJECT.
 *
 * An ADDITIVE addition to the *collection engine's* script project. Paste it
 * at the bottom of the engine's Code.gs and install its one trigger. Nothing
 * existing is modified: `onSignalEdit` and `fanOut_` are untouched, and the
 * checkbox keeps working exactly as it does today.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The dashboard needs "move the card to Invited" to fire the fan-out so Gaby
 * never touches the sheet. The obvious route — have the dashboard tick the
 * Confirmed checkbox — CANNOT work: Apps Script onEdit triggers fire only for
 * edits made by a human in the UI, never for edits made by a script or by the
 * Sheets API. The box would go green and nothing would run.
 *
 * So the dashboard writes the row exactly as a human tick would (name in A,
 * boolean true in B, Processed left empty) and this poll picks it up.
 *
 * Chosen over exposing a Web App endpoint on the engine (Option B) because it
 * is purely additive, needs no new public endpoint on a live script, and its
 * fallback is free: if the poll misbehaves, Gaby ticks the box and the
 * original trigger handles it with no code change.
 *
 * ---------------------------------------------------------------------------
 * DOUBLE-FIRE PROTECTION
 * ---------------------------------------------------------------------------
 * Three independent layers; this file is the third:
 *   1. Dashboard — the fire button only exists when no `Invite — kickoff sent`
 *      event exists for that (email, cycle). Firing writes it, so it vanishes.
 *   2. Proxy — refuses to write a Signal row if one for that client is already
 *      pending, or was already processed this month.
 *   3. HERE — the same `Processed` guard `onSignalEdit` uses, claimed BEFORE
 *      the work runs, under the same script lock so poll and checkbox cannot
 *      race each other.
 */

/** Max fan-outs per run. Each one hits Drive, Gmail search and Slack, and the
 *  script has a 6-minute ceiling — better to leave rows for the next minute
 *  than to time out halfway through one. */
var POLL_BATCH = 3;

function processPendingSignals() {
  var lock = LockService.getScriptLock();
  // Not waitLock: if the checkbox path is mid-fan-out, just try again next run.
  if (!lock.tryLock(5000)) return 'Busy — another run holds the lock.';

  try {
    // openById, not getActiveSpreadsheet(): this runs on a TIME trigger, where
    // the active spreadsheet can be null. Same reason as the logEvent_ fix.
    var ss = SpreadsheetApp.openById(prop_('SIGNAL_SHEET_ID'));
    var sheet = ss.getSheetByName(prop_('SIGNAL_TAB'));
    if (!sheet) return 'Signal tab not found.';

    var last = sheet.getLastRow();
    if (last < 2) return 'Nothing to do.';

    var rows = sheet.getRange(2, 1, last - 1, 3).getValues();
    var done = 0;
    var log = [];

    for (var i = 0; i < rows.length && done < POLL_BATCH; i++) {
      var row = i + 2;
      var name = String(rows[i][0] || '').trim();
      var confirmed = rows[i][1];
      var processed = rows[i][2];

      if (!name) continue;
      if (confirmed !== true) continue;         // strict: a text "TRUE" is not a tick
      if (processed) continue;                  // already handled

      // Claim it BEFORE doing any work — identical to onSignalEdit.
      sheet.getRange(row, 3).setValue(now_());
      done++;

      var client = rosterByName_(name);
      if (!client || !client.email) {
        sheet.getRange(row, 4).setValue('🚩 Name does not resolve to a unique email in the roster — review manually.');
        logEvent_('', 'Confirmation', 'Flag: "' + name + '" does not resolve to a unique email in the roster', 'AUTO');
        log.push('row ' + row + ': ' + name + ' → unresolved');
        continue;
      }

      var out = fanOut_(client);
      sheet.getRange(row, 4).setValue(out.result);
      if (out.videoLink) sheet.getRange(row, 5).setValue(out.videoLink);
      log.push('row ' + row + ': ' + name + ' → ' + out.result);
    }

    var msg = done ? ('Processed ' + done + ':\n' + log.join('\n')) : 'Nothing pending.';
    if (done) Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/**
 * READ-ONLY. Shows what the next run would pick up. Sends nothing, fires
 * nothing, claims nothing. Run this before installing the trigger.
 */
function previewPendingSignals() {
  var ss = SpreadsheetApp.openById(prop_('SIGNAL_SHEET_ID'));
  var sheet = ss.getSheetByName(prop_('SIGNAL_TAB'));
  var last = sheet.getLastRow();
  var out = ['=== PENDING SIGNAL ROWS (read-only) ==='];
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, 3).getValues();
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var name = String(rows[i][0] || '').trim();
      if (!name || rows[i][1] !== true || rows[i][2]) continue;
      n++;
      var c = rosterByName_(name);
      out.push('  row ' + (i + 2) + ': "' + name + '" → ' +
               (c && c.email ? c.email + ' (coach ' + c.coach + ')' : 'DOES NOT RESOLVE'));
    }
    out.push('  pending: ' + n + (n > POLL_BATCH ? '  (only ' + POLL_BATCH + ' per run)' : ''));
  } else {
    out.push('  (sheet is empty)');
  }
  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  out.push('', 'Triggers installed: ' + triggers.join(' · '));
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** Installs ONLY the poll trigger. Deletes nothing. Safe to run twice. */
function installSignalPollTrigger() {
  var already = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'processPendingSignals';
  });
  if (already.length) return 'Already installed. Nothing done.';
  ScriptApp.newTrigger('processPendingSignals').timeBased().everyMinutes(1).create();
  return 'Installed processPendingSignals, every minute.\nTriggers now: ' +
    ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(' · ');
}

/** Removes the poll trigger. The checkbox path keeps working — this IS the
 *  rollback: stop using the dashboard button, Gaby ticks the box as before. */
function removeSignalPollTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processPendingSignals') { ScriptApp.deleteTrigger(t); n++; }
  });
  return 'Removed ' + n + ' poll trigger(s). The checkbox path is unaffected.';
}
