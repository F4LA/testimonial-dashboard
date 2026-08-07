/**
 * ⚠️ THIS IS NOT PART OF THE DASHBOARD'S APPS SCRIPT PROJECT.
 *
 * A one-function repair for the *collection engine's* script project
 * (the container-bound script on "Testimonial Collection — Signal & Event Log").
 * This file is the record; the change itself is pasted into that project.
 *
 * ---------------------------------------------------------------------------
 * THE BUG
 * ---------------------------------------------------------------------------
 * The original:
 *
 *   function logEvent_(email, stage, event, source) {
 *     var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(prop_('EVENTS_TAB'));
 *     if (!tab) return;
 *     tab.appendRow([email, stage, now_(), event, source]);
 *   }
 *
 * `getActiveSpreadsheet()` returns whichever spreadsheet the running trigger is
 * attached to — NOT necessarily the script's container.
 *
 *   onSignalEdit          → attached to Signal & Event Log → correct tab → writes fine
 *                           (this is why all 69 fan-out rows exist)
 *   onCoachFormSubmit     → attached to the COACH FORM RESPONSES file, which has
 *                           no "Event Log" tab → tab === null → `return` →
 *                           the write vanishes with NO error and status Completed
 *
 * Observed live: the TEST 3 coach-form submit on 7 Aug 2026, 3:37:22 PM routed
 * to folder 04 correctly (that path uses DriveApp, not the sheet) and logged
 * nothing. The Executions panel showed Completed with no error.
 *
 * A time-driven trigger is the other exposure: there `getActiveSpreadsheet()`
 * can be null, so line 2 throws instead of returning. The same fix covers it —
 * which means `sendMonthlyNominationMessage`'s two `Nomination` events become
 * reliable as well.
 *
 * ---------------------------------------------------------------------------
 * THE FIX — resolve the log by id, not by ambient context
 * ---------------------------------------------------------------------------
 * Requires ONE new Script Property:
 *
 *   SIGNAL_SHEET_ID = 17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo
 *
 * ⚠️ Position 41 of that id is a CAPITAL I, not a lowercase l. The lowercase
 * variant 404s — verified against the Sheets API. This is the same character
 * confusion that produced a dead Roster id in the data reference.
 *
 * Note it is read with prop_() NOT marked optional, and openById() throws on a
 * bad id. So a missing or wrong property fails loudly in the Executions panel
 * instead of silently skipping the write — which was the whole defect.
 * Nothing else in the engine is touched.
 */

function logEvent_(email, stage, event, source) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss ? ss.getSheetByName(prop_('EVENTS_TAB')) : null;
  // Triggers bound to another spreadsheet (the coach form responses) make
  // getActiveSpreadsheet() return THAT file, which has no Event Log tab.
  // Resolve the log by id so the write never depends on ambient context.
  if (!tab) tab = SpreadsheetApp.openById(prop_('SIGNAL_SHEET_ID')).getSheetByName(prop_('EVENTS_TAB'));
  if (!tab) return;
  tab.appendRow([email, stage, now_(), event, source]);
}
