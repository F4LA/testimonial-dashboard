/**
 * Testimonial Dashboard — daily drift check (promotes selfCheck() to a
 * recurring, unattended job)
 *
 * WHY THIS EXISTS: the dashboard (dashboard/*.js, served from
 * f4la.github.io) and the digest (Digest.gs, this same Apps Script project)
 * are two separate implementations of the same task rules. `selfCheck()`
 * already proves they agree — but only when a person runs it by hand. On
 * Aug 20 two real desyncs (D-133/D-134) had been live for days and were
 * only found because someone happened to be touching something else. This
 * file removes the "someone has to remember" step.
 *
 * HOW IT GETS THE DASHBOARD'S FINGERPRINT WITHOUT A BROWSER — the central
 * design problem. It does NOT reimplement the dashboard's rules a third
 * time. It downloads the REAL, DEPLOYED dashboard code from
 * f4la.github.io (never the repo — comparing repo-vs-deployed-digest would
 * silently reopen the exact gap this file exists to close on the other
 * side), evaluates it inside its own sandboxed object (never the Apps
 * Script global namespace — that space is already shared with Code.gs and
 * has been polluted by a stray clasp push before, D-127), feeds it the
 * same sheet data through the SAME parsers the dashboard itself exposes
 * for offline testing (SheetsReader._parseEventLog etc.), and calls
 * Alerts.fingerprint(state) — the dashboard's own function. It is the real
 * code, not a copy of the rules.
 *
 * Deliberately does NOT share a sheet-read with Digest.gs: each side reads
 * the world its own way, exactly as production does. Sharing the read
 * would make the identity desync (D-134) — which was a SOURCE bug, not a
 * rule bug — invisible to this check.
 *
 * CADENCE: daily, own trigger, installed a half hour after the digest's.
 * Runs IN this project (not GitHub Actions, not a separate Node host)
 * because this project is the only place the DEPLOYED digest code lives —
 * anywhere else would compare repo against repo and miss exactly the class
 * of bug D-133 was (a stale deployed file, not a stale repo).
 *
 * SILENCE ON A MATCH, WITH A WEEKLY HEARTBEAT. A dead cron and a healthy
 * system produce the same silence, which is why Mondays always get one
 * line regardless of outcome: "checked N days running, matched all N."
 *
 * A CHECK THAT CANNOT RUN IS NEVER SILENT. Failing to download the HTML,
 * failing to read a sheet, or the dashboard code throwing are all reported
 * — a check that fails green is worse than no check.
 *
 * ACKNOWLEDGED DRIFT, NOT A MUTE BUTTON. `ackDrift(reason)` snapshots
 * TODAY's diff lines and a reason. Future runs subtract exactly those
 * lines — any NEW divergence still alarms even while one is acknowledged.
 * The acknowledgement clears itself the moment those lines stop appearing
 * (and says so), and expires after 7 days regardless, quoting the reason
 * back so it can never go silent forever by accident.
 *
 * NOTHING HERE TOUCHES THE EVENT LOG. The event log is client memory, not
 * system health. State lives in Script Properties only.
 */

/* ===================== Configuration ===================== */

var DRIFT = {
  // The LIVE site, never the repo — see the file header.
  DASHBOARD_URL: 'https://f4la.github.io/testimonial-dashboard/',
  // Who gets the alert. Solo Bernardo: nobody else on the team can act on a
  // fingerprint diff, and sending it wider just trains people to ignore it.
  ALERT_TO: 'Bernardo',
  // Script Properties keys. Namespaced DRIFT_ so they can never collide with
  // anything Code.gs or Digest.gs already stores.
  PROP_LAST_RESULT:   'DRIFT_LAST_RESULT',    // 'ok' | 'diff' | 'error'
  PROP_STREAK:        'DRIFT_OK_STREAK',      // consecutive days matched
  PROP_LAST_RUN_DATE: 'DRIFT_LAST_RUN_DATE',  // YYYY-MM-DD, project tz
  PROP_ACK:           'DRIFT_ACK',            // JSON: {lines, reason, by, ts}
  ACK_MAX_DAYS: 7,
  HOUR: 8,      // same hour as the digest
  MINUTE: 30    // installed 30 minutes after it
};

/* ===================== Sandbox loader ===================== */

/**
 * Downloads index.html from the LIVE dashboard, cache-busted, and returns
 * the ordered list of dashboard/*.js files it loads — in the order they
 * appear, skipping app.js (the UI bootstrap; needs a real DOM and takes no
 * part in the calculation — verified separately that all 17 dashboard/*.js
 * modules load with no DOM at all).
 *
 * DERIVED, NEVER HAND-WRITTEN: when the reviews view or the podcast/client-
 * of-the-month view ship, their new dashboard/*.js files appear in
 * index.html's own script tags and are picked up here with no edit to this
 * file — which is the whole point of doing this before those views exist.
 */
function driftScriptList_() {
  var url = DRIFT.DASHBOARD_URL + 'index.html?nocache=' + Date.now();
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Could not download index.html (HTTP ' + res.getResponseCode() + ')');
  }
  var html = res.getContentText();
  var re = /<script\s+src="([^"]+)"/g;
  var m, out = [];
  while ((m = re.exec(html))) {
    var src = m[1];
    if (/^dashboard\//.test(src)) out.push(src);
  }
  if (!out.length) throw new Error('index.html loaded but no dashboard/*.js <script> tags were found in it');
  return out;
}

/**
 * Downloads and evaluates every module from the list into ONE sandbox
 * object — never the Apps Script global namespace, which the digest and
 * the proxy already share and which a stray clasp push has polluted once
 * before (D-127). Each module checks `typeof window !== "undefined"` and
 * hangs itself off whatever object is passed as `window`; passing the
 * sandbox itself as both the wrapper's `this` and its `window` argument is
 * what makes `root.TDConfig = ...` land inside the sandbox instead of the
 * project's real global scope.
 */
function driftLoadDashboard_() {
  var files = driftScriptList_();
  var box = {};
  var ts = Date.now();
  files.forEach(function (path) {
    var url = DRIFT.DASHBOARD_URL + path + '?nocache=' + ts;
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Could not download ' + path + ' (HTTP ' + res.getResponseCode() + ')');
    }
    var src = res.getContentText();
    try {
      // eslint-disable-next-line no-new-func
      var fn = new Function('window', src + '\n//# sourceURL=' + path);
      fn.call(box, box);
    } catch (e) {
      throw new Error('Dashboard module ' + path + ' failed to load: ' + e.message);
    }
  });
  ['TDConfig', 'TDClock', 'SheetsReader', 'Identity', 'StateBuilder', 'RaffleFold', 'Flows', 'Alerts']
    .forEach(function (name) {
      if (!box[name]) throw new Error('Dashboard module loaded but ' + name + ' is missing — check load order');
    });
  return box;
}

/**
 * Reads the same sheets via the OAuth token of THIS Apps Script project —
 * never the API key in dashboard/config.js, which is origin-restricted to
 * f4la.github.io and 403s from anywhere else (see config.js §2.4). Same
 * ids, same tabs, same valueRenderOption per source that TDConfig.SHEETS
 * already declares, so it is the same bytes the browser would see.
 */
function driftFetchSheet_(spreadsheetId, tab, renderMode) {
  var token = ScriptApp.getOAuthToken();
  var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
            '/values/' + encodeURIComponent(tab) +
            '?valueRenderOption=' + (renderMode || 'FORMATTED_VALUE');
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token }
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Sheets read failed [' + tab + ']: HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
  }
  var data = JSON.parse(res.getContentText());
  return data.values || [];
}

/**
 * Builds the exact data shape SheetsReader.loadAll() would hand to
 * StateBuilder.build(), using the dashboard's OWN parsers on rows read via
 * OAuth instead of the API key. box.TDConfig.SHEETS carries the real ids
 * and tabs, so a future config change (a renamed tab, a new sheet) is
 * picked up automatically — nothing here hard-codes them a second time.
 */
function driftReadDashboardData_(box) {
  var S = box.TDConfig.SHEETS;
  var eventRows = driftFetchSheet_(S.EVENT_LOG.id, S.EVENT_LOG.tab, 'UNFORMATTED_VALUE');
  var rosterRows = driftFetchSheet_(S.ROSTER.id, S.ROSTER.tab);
  var masterRows = driftFetchSheet_(S.MASTERSHEET.id, S.MASTERSHEET.tab);
  var settingsRows, signalRows;
  try { settingsRows = driftFetchSheet_(S.SETTINGS.id, S.SETTINGS.tab); }
  catch (e) { settingsRows = null; }
  try { signalRows = driftFetchSheet_(S.SIGNAL.id, S.SIGNAL.tab); }
  catch (e) { signalRows = null; }

  var settings = box.SheetsReader._parseSettings(settingsRows);
  return {
    events:      box.SheetsReader._parseEventLog(eventRows),
    roster:      box.SheetsReader._parseRoster(rosterRows),
    mastersheet: box.SheetsReader._parseMastersheet(masterRows),
    signal:      box.SheetsReader._parseSignal(signalRows),
    settings:    settings.values,
    settingsTabExists: settings.exists,
    settingsFromTab:   settings.fromTab,
    eventHeaders: (eventRows && eventRows[0]) ? eventRows[0].slice() : [],
    loadedAt: new Date()
  };
}

/**
 * Computes the dashboard's fingerprint, with the sandbox's clock frozen to
 * `frozenMs` — the SAME instant this file freezes D_NOW_OVERRIDE to before
 * calling dFingerprint_(). Without this, a task sitting right on a
 * threshold could read a different severity on each side purely from the
 * few seconds between the two calculations — a false alarm that would
 * teach the team to ignore the check.
 */
function driftDashboardFingerprint_(frozenMs) {
  var box = driftLoadDashboard_();
  box.TDClock._set(frozenMs - Date.now());   // shiftMs so now() returns frozenMs
  var data = driftReadDashboardData_(box);
  var state = box.StateBuilder.build(data);
  return box.Alerts.fingerprint(state);
}

/* ===================== Diff ===================== */

/** Line-level diff between two sorted, newline-joined fingerprint strings. */
function driftDiffLines_(dashboardFp, digestFp) {
  var dashSet = {}, digSet = {};
  dashboardFp.split('\n').filter(Boolean).forEach(function (l) { dashSet[l] = true; });
  digestFp.split('\n').filter(Boolean).forEach(function (l) { digSet[l] = true; });

  var onlyDashboard = Object.keys(dashSet).filter(function (l) { return !digSet[l]; }).sort();
  var onlyDigest = Object.keys(digSet).filter(function (l) { return !dashSet[l]; }).sort();
  return { onlyDashboard: onlyDashboard, onlyDigest: onlyDigest };
}

function driftLineKey_(prefix, line) { return prefix + '|' + line; }

/** All diff lines from both sides, prefixed so the two sides can never collide. */
function driftAllDiffKeys_(diff) {
  return diff.onlyDashboard.map(function (l) { return driftLineKey_('dashboard', l); })
    .concat(diff.onlyDigest.map(function (l) { return driftLineKey_('digest', l); }));
}

/* ===================== Acknowledgement ===================== */

function driftReadAck_() {
  var raw = PropertiesService.getScriptProperties().getProperty(DRIFT.PROP_ACK);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function driftWriteAck_(ack) {
  PropertiesService.getScriptProperties().setProperty(DRIFT.PROP_ACK, JSON.stringify(ack));
}

function driftClearAck_() {
  PropertiesService.getScriptProperties().deleteProperty(DRIFT.PROP_ACK);
}

/**
 * Snapshots TODAY's diff and a reason. Refuses without a reason. Future
 * runs subtract exactly these lines — any OTHER divergence, or a NEW one
 * that appears while this is active, still alarms.
 */
function ackDrift(reason) {
  reason = String(reason || '').trim();
  if (!reason) throw new Error('ackDrift needs a reason, e.g. ackDrift("building the reviews view")');

  var now = Date.now();
  var dashboardFp = driftDashboardFingerprint_(now);
  var digestFp = dFingerprint_();
  var diff = driftDiffLines_(dashboardFp, digestFp);
  var keys = driftAllDiffKeys_(diff);

  if (!keys.length) return 'Nothing to acknowledge right now — the two sides already match.';

  driftWriteAck_({ lines: keys, reason: reason, by: Session.getActiveUser().getEmail() || 'unknown', ts: now });
  return 'Acknowledged ' + keys.length + ' line(s) for up to ' + DRIFT.ACK_MAX_DAYS + ' days: "' + reason + '". ' +
         'Any NEW divergence will still alert. This clears itself once these lines disappear, or in ' +
         DRIFT.ACK_MAX_DAYS + ' days, whichever comes first.';
}

function clearDrift() {
  var had = !!driftReadAck_();
  driftClearAck_();
  return had ? 'Acknowledgement cleared.' : 'Nothing was acknowledged.';
}

/* ===================== Alerting ===================== */

function driftTodayKey_() {
  return Utilities.formatDate(new Date(), DIGEST_TZ, 'yyyy-MM-dd');
}

function driftSendAlert_(text) {
  var id = dResolveDm_(DRIFT.ALERT_TO);
  if (!id) { Logger.log('DRIFT: no Slack address resolved for ' + DRIFT.ALERT_TO + ' — alert NOT sent:\n' + text); return; }
  dSlack_('chat.postMessage', { channel: id, text: text });
}

/* ===================== The check itself ===================== */

/**
 * Runs the comparison once. Always updates the streak/result properties.
 * Sends a Slack DM only when there is unacknowledged drift, the check
 * itself failed, or it is Monday (the heartbeat). Returns a summary string
 * for logging either way — never silent in the execution log, even on a
 * quiet day.
 */
function checkDrift() {
  var props = PropertiesService.getScriptProperties();
  var today = driftTodayKey_();
  var isMonday = (new Date()).getDay() === 1;

  var summary;
  try {
    var now = Date.now();
    var dashboardFp = driftDashboardFingerprint_(now);

    D_NOW_OVERRIDE = now;
    var digestFp;
    try { digestFp = dFingerprint_(); }
    finally { D_NOW_OVERRIDE = 0; }

    var diff = driftDiffLines_(dashboardFp, digestFp);
    var allKeys = driftAllDiffKeys_(diff);

    var ack = driftReadAck_();
    var ackExpired = ack && (now - ack.ts) > DRIFT.ACK_MAX_DAYS * 24 * 36e5;
    var ackKeySet = {};
    if (ack && !ackExpired) ack.lines.forEach(function (k) { ackKeySet[k] = true; });

    var unacknowledged = allKeys.filter(function (k) { return !ackKeySet[k]; });

    // The ack cleans itself up the moment the lines it covered stop
    // appearing — nobody has to remember to turn it back on.
    if (ack && !ackExpired) {
      var stillPresent = ack.lines.some(function (k) { return allKeys.indexOf(k) >= 0; });
      if (!stillPresent) {
        driftClearAck_();
        driftSendAlert_('Drift check: the divergence acknowledged on ' +
          Utilities.formatDate(new Date(ack.ts), DIGEST_TZ, 'd MMM') +
          ' ("' + ack.reason + '") is gone now. Acknowledgement cleared automatically.');
        ack = null;
      }
    } else if (ackExpired) {
      driftClearAck_();
      ack = null;
    }

    if (unacknowledged.length) {
      props.setProperty(DRIFT.PROP_LAST_RESULT, 'diff');
      props.setProperty(DRIFT.PROP_STREAK, '0');
      props.setProperty(DRIFT.PROP_LAST_RUN_DATE, today);

      var lines = ['⚠️ *Drift check: the dashboard and the digest disagree.*', ''];
      var byDashboard = unacknowledged.filter(function (k) { return k.indexOf('dashboard|') === 0; })
        .map(function (k) { return k.slice('dashboard|'.length); });
      var byDigest = unacknowledged.filter(function (k) { return k.indexOf('digest|') === 0; })
        .map(function (k) { return k.slice('digest|'.length); });

      if (byDashboard.length) {
        lines.push('*Only the dashboard shows these* (owner|flow|rung|severity|client):');
        byDashboard.forEach(function (l) { lines.push('  • ' + l); });
        lines.push('');
      }
      if (byDigest.length) {
        lines.push('*Only the digest shows these* (owner|flow|rung|severity|client):');
        byDigest.forEach(function (l) { lines.push('  • ' + l); });
        lines.push('');
      }
      if (ack) {
        lines.push('(' + (allKeys.length - unacknowledged.length) + ' other line(s) are acknowledged: "' + ack.reason + '")');
      }
      lines.push('Run `ackDrift("reason")` in the editor if this is expected right now, or check both sides by hand.');
      driftSendAlert_(lines.join('\n'));
      summary = 'DIFF — ' + unacknowledged.length + ' unacknowledged line(s). Alert sent.';

    } else {
      var prevStreak = parseInt(props.getProperty(DRIFT.PROP_STREAK) || '0', 10);
      var newStreak = isFinite(prevStreak) ? prevStreak + 1 : 1;
      props.setProperty(DRIFT.PROP_LAST_RESULT, 'ok');
      props.setProperty(DRIFT.PROP_STREAK, String(newStreak));
      props.setProperty(DRIFT.PROP_LAST_RUN_DATE, today);

      if (isMonday) {
        driftSendAlert_('✅ Drift check: matched ' + newStreak + ' day' + (newStreak === 1 ? '' : 's') + ' running.');
      }
      summary = 'OK — matched. Streak: ' + newStreak + (ack ? ' (with an active acknowledgement)' : '');
    }

  } catch (e) {
    props.setProperty(DRIFT.PROP_LAST_RESULT, 'error');
    props.setProperty(DRIFT.PROP_STREAK, '0');
    props.setProperty(DRIFT.PROP_LAST_RUN_DATE, today);
    driftSendAlert_('🔴 Drift check could not run: ' + e.message +
      '\nThis is not the same as the two sides matching — it means the check itself is broken.');
    summary = 'ERROR — ' + e.message;
  }

  Logger.log('=== DRIFT CHECK === ' + summary);
  return summary;
}

/** Installs ONLY the drift-check trigger. Deletes nothing. Run deliberately. */
function installDriftCheckTrigger() {
  var already = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'checkDrift';
  });
  if (already.length) return 'Already installed. Nothing done.';

  ScriptApp.newTrigger('checkDrift').timeBased().atHour(DRIFT.HOUR).nearMinute(DRIFT.MINUTE).everyDays(1).create();
  return 'Installed checkDrift daily around ' + DRIFT.HOUR + ':' + DRIFT.MINUTE +
         ', project timezone — 30 minutes after the digest.';
}
