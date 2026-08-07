/**
 * ⚠️ THIS IS NOT PART OF THE DASHBOARD'S APPS SCRIPT PROJECT.
 *
 * These two functions are a ONE-TIME repair for the *collection engine's*
 * script project (the container-bound script on "Testimonial Collection —
 * Signal & Event Log"). Paste them there, run them, then delete them.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-07 the engine's Triggers list contained only two triggers:
 *   onSignalEdit · sendMonthlyNominationMessage
 * `onCoachFormSubmit` was missing. That is a genuine launch gap — the coach
 * form is one of the five collected inputs and was never abandoned by any
 * decision. Without the trigger, coach responses at launch would vanish:
 * nothing routes them to folder 04 and nothing writes the event.
 *
 * (The sibling `onClientVideoSubmit` is ALSO missing, and that one is
 * CORRECT — decisions D-059 / D-063 / D-065 replaced the form upload with a
 * direct upload to the client's Drive folder 03. Do NOT install it.)
 *
 * WHY NOT JUST RE-RUN installTriggers()
 * -------------------------------------
 *   1. It deletes ALL triggers first. A failure mid-run leaves zero triggers
 *      and a dead fan-out.
 *   2. It reinstalls onClientVideoSubmit whenever CLIENT_FORM_SHEET_ID is
 *      still set — resurrecting the path D-059 deliberately killed.
 *   3. It needlessly rebinds the working onSignalEdit trigger.
 *
 * These helpers are strictly additive: they create one trigger and delete
 * nothing. Run checkCoachFormWiring() first — it only reads.
 *
 * NOTE ON ACCOUNTS: the Apps Script Triggers page shows only the CURRENT
 * user's triggers, and a trigger runs as whoever created it. Run these from
 * the same Google account that already owns onSignalEdit — i.e. the account
 * that sees those two triggers in the list.
 */


/**
 * READ-ONLY preflight. Verifies the property points at the right responses
 * sheet and that the question title the engine reads actually exists.
 *
 * The header check matters: onCoachFormSubmit reads
 * row[prop_('COACH_FORM_HDR_CLIENT')]. If that title does not match the
 * form's real question, clientName is empty, rosterByName_('') fails, and
 * EVERY submission logs `Flag: selector "" does not resolve...` with an
 * empty Client email — unattributed and invisible on any client card.
 */
function checkCoachFormWiring() {
  var out = [];
  var id = prop_('COACH_FORM_SHEET_ID', true);

  out.push('COACH_FORM_SHEET_ID : ' + (id || 'NOT SET  ← must be set before installing'));
  out.push('COACH_FORM_URL      : ' + (prop_('COACH_FORM_URL', true) || '(not set)'));

  var triggers = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + ' [' + t.getEventType() + ']';
  });
  out.push('Existing triggers   : ' + (triggers.length ? triggers.join(' · ') : '(none)'));

  if (id) {
    try {
      var ss = SpreadsheetApp.openById(id);
      var sh = ss.getSheets()[0];
      var lastCol = Math.max(1, sh.getLastColumn());
      var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      var wanted = prop_('COACH_FORM_HDR_CLIENT');

      out.push('Responses file      : ' + ss.getName());
      out.push('URL                 : ' + ss.getUrl());
      out.push('Tab                 : ' + sh.getName());
      out.push('Responses so far    : ' + Math.max(0, sh.getLastRow() - 1));
      out.push('Headers             : ' + JSON.stringify(head));
      out.push('COACH_FORM_HDR_CLIENT = ' + JSON.stringify(wanted));
      out.push('Header present?     : ' + (head.indexOf(wanted) >= 0
        ? 'YES'
        : 'NO  ← every submission would be flagged with an empty email. Fix before installing.'));
    } catch (err) {
      out.push('Could not open the responses file: ' + err.message);
    }
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}


/**
 * Creates ONLY the onCoachFormSubmit trigger. Deletes nothing.
 * Safe to run twice — it refuses if the trigger already exists.
 */
function installCoachFormTriggerOnly() {
  var id = prop_('COACH_FORM_SHEET_ID', true);
  if (!id) throw new Error('COACH_FORM_SHEET_ID is not set. Set it in Project Settings first.');

  var already = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'onCoachFormSubmit';
  });
  if (already.length) {
    var m = 'Already installed (' + already.length + '). Nothing done.';
    Logger.log(m);
    return m;
  }

  // Opening it first proves the id is readable and is the file we expect,
  // so we fail here rather than creating a trigger bound to the wrong sheet.
  var ss = SpreadsheetApp.openById(id);

  ScriptApp.newTrigger('onCoachFormSubmit').forSpreadsheet(id).onFormSubmit().create();

  var msg = 'Installed onCoachFormSubmit on: ' + ss.getName() + '\n' +
            'Triggers now: ' + ScriptApp.getProjectTriggers().map(function (t) {
              return t.getHandlerFunction();
            }).join(' · ');
  Logger.log(msg);
  return msg;
}
