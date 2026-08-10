/**
 * ⚠️ THIS IS NOT PART OF THE DASHBOARD'S APPS SCRIPT PROJECT.
 *
 * An ADDITIVE addition to the *collection engine's* script project. Paste it
 * at the bottom of the engine's Code.gs, set one script property, and run the
 * installer. Nothing existing is modified.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The raffle view (spec §4.4) and the reviews view (§4.5) are written as if
 * the system "already knows" three signals per client. Two of them —
 * photo permission and the Google-review self-report — exist only inside the
 * preferences-form responses sheet and were never written to the event log.
 * The third, podcast consent (D-097), is the same.
 *
 * Nothing read that sheet. Verified: the engine's nine Stage strings contain
 * no preferences handler at all. Without this bridge the raffle would show
 * every client as "not qualified" forever — the same failure class as D-085,
 * where the coach form routed correctly and silently wrote no event.
 *
 * Raffle condition 2 (questionnaire / testimonial) is deliberately NOT written
 * here: it is the existing client-video event. No new event for it.
 *
 * ---------------------------------------------------------------------------
 * THE logEvent_ TRAP (D-085) — why this works
 * ---------------------------------------------------------------------------
 * This handler runs from an onFormSubmit trigger bound to the RESPONSES sheet,
 * not to the engine's container. `SpreadsheetApp.getActiveSpreadsheet()`
 * therefore returns the responses file, which has no Event Log tab. Before
 * D-085 that made `logEvent_` hit `if (!tab) return;` and drop the write
 * silently, with the execution still reporting Completed.
 *
 * The deployed `logEvent_` now falls back to `openById(prop_('SIGNAL_SHEET_ID'))`,
 * so writes from a foreign-bound trigger land correctly. This file depends on
 * that fix being present — `checkPrefsFormWiring()` asserts it before you
 * install anything.
 */


/* ===================== The three signals ===================== */

/**
 * Event vocabulary — CONFIRMED and validated live 2026-08-09 (all four strings).
 *
 * A dedicated `Preferences — ` group rather than reusing `Review — self-reported`
 * (which already exists in the dashboard's ALLOWED_STAGES), for one structural
 * reason: D-066 says the two review signals are NEVER merged. If the
 * form-sourced self-report were written as `Review — self-reported`, the
 * dashboard could also write that string, and a person could hand-enter a
 * "self-report" that opens the raffle. Keeping the client's own answers in
 * their own group, listed as engine-owned, makes that structurally impossible
 * rather than merely discouraged.
 *
 * The group also makes provenance obvious in the timeline: everything here is
 * the client speaking for themselves, AUTO, from one form.
 */
var PREFS_STAGE = {
  PHOTO:   'Preferences — photo permission',
  REVIEW:  'Preferences — review self-reported',
  PODCAST: 'Preferences — podcast consent',
  // Identity failure. Mirrors the engine's existing Flag: convention and is
  // written with an EMPTY email so the dashboard routes it to its system
  // bucket rather than inventing a testimonial for a stranger's address.
  UNRESOLVED: 'Preferences — unresolved'
};

/** Exact response-sheet headers. Read BY HEADER — the columns already shifted
 *  once when the podcast question was added, so indexes are not safe. */
var PREFS_HDR = {
  EMAIL:   'The email you use with Strong Standard',
  NAME:    'Your full name',
  PHOTO:   'Can we use your before/after photos?',
  REVIEW:  'Have you left your Google review yet?',
  PODCAST: 'Would you be open to being a guest on our podcast?'
};

/** Radio answers are Yes/No, but keep the raw text when it is anything else
 *  rather than silently coercing it to a No. */
function prefsYesNo_(raw) {
  var v = String(raw == null ? '' : raw).trim();
  if (/^y(es)?\b/i.test(v)) return 'Yes';
  if (/^n(o)?\b/i.test(v))  return 'No';
  return '';
}

function prefsDetail_(norm, raw) {
  var v = String(raw == null ? '' : raw).trim();
  if (!norm) return 'Unclear answer: "' + v + '" — review manually';
  return (v === norm) ? norm : (norm + ' ("' + v + '")');
}


/* ===================== The handler ===================== */

/**
 * Writes the client's own answers into the event log, one event per signal.
 *
 * IDEMPOTENCY: none, by design. A resubmission appends three more events. The
 * log is append-only and the dashboard's fold is latest-wins per
 * (email, cycle, Stage), so the newest answer is the one that counts and the
 * older ones stay visible in the timeline as history. Nothing is deduped and
 * nothing is overwritten.
 */
function onPrefsFormSubmit(e) {
  var row = formRow_(e);

  var email = String(row[PREFS_HDR.EMAIL] || '').trim().toLowerCase();
  var name  = String(row[PREFS_HDR.NAME] || '').trim();

  // Identity discipline (D-039): email is the master key, resolved through the
  // Active Client Roster. Never guessed, never approximated by name.
  if (!email) {
    logEvent_('', PREFS_STAGE.UNRESOLVED,
      'Flag: preferences form submitted with no email' +
      (name ? ' (name given: "' + name + '")' : '') + ' — review manually', 'AUTO');
    return;
  }

  var client = rosterByEmail_(email);
  if (!client) {
    logEvent_('', PREFS_STAGE.UNRESOLVED,
      'Flag: "' + email + '"' + (name ? ' ("' + name + '")' : '') +
      ' is not in the roster — review manually', 'AUTO');
    return;
  }

  /* --- Raffle signals. Condition 2 (questionnaire/testimonial) is the
     existing client-video event and is deliberately not written here. --- */
  var photo = prefsYesNo_(row[PREFS_HDR.PHOTO]);
  logEvent_(client.email, PREFS_STAGE.PHOTO,
            prefsDetail_(photo, row[PREFS_HDR.PHOTO]), 'AUTO');

  var review = prefsYesNo_(row[PREFS_HDR.REVIEW]);
  logEvent_(client.email, PREFS_STAGE.REVIEW,
            prefsDetail_(review, row[PREFS_HDR.REVIEW]), 'AUTO');

  /* --- Podcast consent. SEPARATE ON PURPOSE (D-097): this feeds the podcast
     chain ONLY. It is NOT a raffle entry condition — the three conditions are
     photo permission + questionnaire/testimonial + Google review (D-008, hard
     gate per D-059). Nothing below may read this value for raffle
     eligibility. --- */
  var podcast = prefsYesNo_(row[PREFS_HDR.PODCAST]);
  logEvent_(client.email, PREFS_STAGE.PODCAST,
            prefsDetail_(podcast, row[PREFS_HDR.PODCAST]), 'AUTO');
}


/* ===================== Install ===================== */

/**
 * READ-ONLY preflight. Run this FIRST. It touches no triggers and writes
 * nothing, and it asserts the two things that would otherwise fail silently:
 * the D-085 logEvent_ fallback, and the exact header wording.
 */
function checkPrefsFormWiring() {
  var out = [];
  var id = prop_('PREFS_FORM_SHEET_ID', true);

  out.push('PREFS_FORM_SHEET_ID : ' + (id || 'NOT SET  <- set it before installing'));
  out.push('SIGNAL_SHEET_ID     : ' + (prop_('SIGNAL_SHEET_ID', true) || 'NOT SET  <- D-085 fallback would fail'));

  // The D-085 fix must be present, or every write from this trigger vanishes.
  var src = '';
  try { src = String(logEvent_); } catch (err) {}
  out.push('logEvent_ has the SIGNAL_SHEET_ID fallback: ' +
    (src.indexOf('SIGNAL_SHEET_ID') >= 0 ? 'YES' : 'NO  <- STOP. Apply the D-085 fix first.'));

  out.push('Existing triggers   : ' + ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction();
  }).join(' · '));

  if (id) {
    try {
      var ss = SpreadsheetApp.openById(id);
      var sh = ss.getSheets()[0];
      var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
      out.push('Responses file      : ' + ss.getName());
      out.push('Tab                 : ' + sh.getName());
      out.push('Responses so far    : ' + Math.max(0, sh.getLastRow() - 1));
      out.push('Headers             : ' + JSON.stringify(head));
      Object.keys(PREFS_HDR).forEach(function (k) {
        out.push('  ' + (k + '        ').slice(0, 8) + ' header present: ' +
          (head.indexOf(PREFS_HDR[k]) >= 0 ? 'YES' : 'NO  <- fix the wording before installing'));
      });
      // D-063 verified the form needs no login for external clients. An
      // "Email Address" column is consistent with "Responder input" (no login)
      // AND with "Verified" (login required) — the sheet cannot tell them
      // apart, so this is a prompt to check the form setting, not a verdict.
      if (head.indexOf('Email Address') >= 0) {
        out.push('NOTE: an "Email Address" column exists. Check Form > Settings >');
        out.push('      "Collect email addresses". "Responder input" is fine (no login).');
        out.push('      "Verified" REQUIRES sign-in and would break D-063 for external clients.');
      }
    } catch (err) {
      out.push('Could not open the responses file: ' + err.message);
    }
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** Creates ONLY the preferences trigger. Deletes nothing. Safe to run twice. */
function installPrefsFormTrigger() {
  var id = prop_('PREFS_FORM_SHEET_ID', true);
  if (!id) throw new Error('PREFS_FORM_SHEET_ID is not set. Set it in Project Settings first.');

  var already = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'onPrefsFormSubmit';
  });
  if (already.length) { var m = 'Already installed. Nothing done.'; Logger.log(m); return m; }

  var ss = SpreadsheetApp.openById(id);   // proves the id is readable and right
  ScriptApp.newTrigger('onPrefsFormSubmit').forSpreadsheet(id).onFormSubmit().create();

  var msg = 'Installed onPrefsFormSubmit on: ' + ss.getName() + '\nTriggers now: ' +
    ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(' · ');
  Logger.log(msg);
  return msg;
}

/** Rollback: removes the trigger. Nothing else is affected. */
function removePrefsFormTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onPrefsFormSubmit') { ScriptApp.deleteTrigger(t); n++; }
  });
  return 'Removed ' + n + ' preferences trigger(s).';
}
