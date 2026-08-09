/**
 * Testimonial Dashboard — Config
 *
 * Single home for sheet IDs, column maps, the Stage vocabulary, and the
 * adjustable defaults. Nothing else in the codebase hard-codes a sheet id,
 * a column index, or a Stage string.
 *
 * Verified against the live spreadsheets and the deployed collection engine
 * source on 7 Aug 2026.
 */
(function (root) {
  "use strict";

  /* ==========================================================================
   * Stage vocabulary
   *
   * ENGINE — written by the deployed collection engine. READ-ONLY to us.
   *   All nine strings are listed. FANOUT marks the five written by the
   *   confirmation-checkbox fan-out; ONLY those imply the Invited stage.
   *   The two form handlers fire later in the process, and CLIENT_VIDEO is
   *   dead code besides (see DASHBOARD-SYSTEM.md §11).
   *
   * DASHBOARD — written by this dashboard. Approved 7 Aug 2026.
   *   Pattern: "<Group> — <specific>", em dash (U+2014), one space each side.
   * ========================================================================== */

  var ENGINE = {
    /* --- the confirmation-checkbox fan-out (these five imply Invited) --- */
    FOLDER:            "Collection — folder",
    CLIENT_VIDEO_LINK: "Collection — client video link",   // folder 03 SHARED, not uploaded
    MEET:              "Collection — Meet",
    LOOM:              "Collection — Loom",
    COACH_NOTICE:      "Collection — coach notice",
    /* --- later, form-driven; NOT part of the Invited inference --- */
    COACH_FORM:        "Collection — coach form",          // live
    CLIENT_VIDEO:      "Collection — client video",        // dead by D-059/D-063/D-065
    /* --- system-level; these are written with an EMPTY client email --- */
    CONFIRMATION:      "Confirmation",
    NOMINATION:        "Nomination"
  };

  var ENGINE_FANOUT = [
    ENGINE.FOLDER, ENGINE.CLIENT_VIDEO_LINK,
    ENGINE.MEET, ENGINE.LOOM, ENGINE.COACH_NOTICE
  ];

  var STAGES = {
    NOMINATION_LOGGED:        "Nomination — logged",
    NOMINATION_WARMUP:        "Nomination — coach warm-up done",
    OUTREACH_SENT:            "Outreach — sent",
    OUTREACH_ACCEPTED:        "Outreach — client accepted",
    // --- v2 ladder (D-090) ---
    OUTREACH_COACH_NOT_MSG:   "Outreach — coach not messaged",
    OUTREACH_BERNARDO_NUDGED: "Outreach — Bernardo nudged coach",
    OUTREACH_NO_REPLY:        "Outreach — no reply",
    OUTREACH_FOLLOWUP:        "Outreach — follow-up sent",
    OUTREACH_COACH_TOLD:      "Outreach — coach told",

    INVITE_KICKOFF:           "Invite — kickoff sent",
    // Starts the video clock. Distinct from the fan-out: the fan-out shares
    // the folder, this is the client actually being told what to do.
    INVITE_INSTRUCTIONS:      "Invite — instructions email sent",

    // Manual fallback for the video. The client uploads straight into Drive
    // folder 03 and NOTHING fires (no folder watch exists), so today this is
    // the primary signal. A folder poll may write it automatically later —
    // the fold accepts either, so that swap needs no downstream change.
    COLLECTION_VIDEO:         "Collection — video uploaded",
    COLLECTION_EVERFIT:       "Collection — Everfit data",
    COLLECTION_PHOTOS:        "Collection — photos received",
    COLLECTION_COMPLETE:      "Collection — complete",
    COLLECTION_FLAG_RESOLVED: "Collection — manual review resolved",
    // --- v2 ladder (D-090) ---
    COLLECTION_VIDEO_CHECKED: "Collection — video checked",
    COLLECTION_VIDEO_FOLLOWUP:"Collection — video follow-up sent",
    COLLECTION_VIDEO_COACH:   "Collection — video coach told",
    COACH_FORM_CHASED:        "Collection — coach form chased",
    COACH_FORM_NUDGED:        "Collection — coach form nudged",

    PRODUCTION_CAROUSEL:      "Production — carousel",
    PRODUCTION_STORY:         "Production — story",
    PRODUCTION_REEL:          "Production — reel",
    PRODUCTION_CASE_STUDY:    "Production — case study",
    PRODUCTION_WEEKLY_EMAIL:  "Production — weekly email",

    PRODUCTION_CHECKIN_ACK:   "Production — check-in acknowledged",
    PRODUCTION_CHASED:        "Production — chased",

    APPROVAL_APPROVED:        "Approval — approved",
    APPROVAL_SENT_BACK:       "Approval — sent back",
    APPROVAL_ESCALATED:       "Approval — escalated to Bernardo",
    APPROVAL_BERNARDO_NUDGED: "Approval — Bernardo nudged",

    SCHEDULE_WEEK_ASSIGNED:   "Schedule — week assigned",
    SCHEDULE_POST:            "Schedule — post scheduled",
    SCHEDULE_EMAIL:           "Schedule — email scheduled",
    SCHEDULE_REPOST:          "Schedule — repost used",

    PUBLISH_LIVE:             "Publish — live",

    PIPELINE_DECLINED:        "Pipeline — declined",
    PIPELINE_DROPPED:         "Pipeline — dropped",

    NOTE:                     "Note",

    RAFFLE_WINNER:            "Raffle — winner confirmed",
    RAFFLE_MESSAGES:          "Raffle — messages sent",
    RAFFLE_MONTH_ADDED:       "Raffle — month added",

    REVIEW_SELF_REPORTED:     "Review — self-reported",
    REVIEW_CONFIRMED:         "Review — confirmed",
    REVIEW_UNMATCHED:         "Review — unmatched",
    REVIEW_VERIFICATION:      "Review — verification done",

    PODCAST_INVITED:          "Podcast — invited",
    PODCAST_ACCEPTED:         "Podcast — accepted",
    PODCAST_DECLINED:         "Podcast — declined",
    PODCAST_SCHEDULED:        "Podcast — scheduled",
    PODCAST_NOTE_SENT:        "Podcast — personal note sent",
    PODCAST_RECORDED:         "Podcast — recorded",
    PODCAST_PUBLISHED:        "Podcast — published",

    COTM_WINNER:              "Client of the month — winner",
    COTM_SHOUTOUT:            "Client of the month — shout-out"
  };

  var CONFIG = {

    /* ---------- Data sources (read via Google Sheets API v4) ---------- */
    SHEETS: {
      EVENT_LOG:   { id: "17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo", tab: "Event Log" },
      SETTINGS:    { id: "17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo", tab: "Settings" },
      SIGNAL:      { id: "17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo", tab: "Signal" },
      // NOTE: capital I at position 28. The lowercase-l id in the data
      // reference 404s — verified against the live API.
      ROSTER:      { id: "1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc", tab: "Roster" },
      MASTERSHEET: { id: "1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc", tab: "Mastersheet Data" }
    },

    /* ---------- Sheets API key (read-only) ----------
     * Restricted to the https://f4la.github.io/* ORIGIN. It cannot be
     * path-scoped: browsers strip the path from the Referer on cross-origin
     * requests. See DASHBOARD-SYSTEM.md §2.4. */
    API_KEY: "AIzaSyC67SNI85Q1Ra8qUmYERgF_cOBuzZDexx0",

    /* ---------- Apps Script Web App (the only write path) ----------
     * Standalone project on the Membership account, deliberately NOT
     * container-bound, so it can never touch the live collection engine. */
    WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzx91ZuUb4zqHmVWpu4tmhvERURJo5CpQAujYySp7oLjMIh8G0C-E-Aqll5X-MnC3gZ/exec",

    /* ---------- Proxy version handshake ----------
     * A Web App serves its DEPLOYED version, not the editor's current code.
     * Editing Code.gs without redeploying leaves the old code running and
     * every new action returns "Unknown action" — silently, because the
     * response used to be opaque. Bump this whenever Code.gs gains or changes
     * an action, and the dashboard warns instead of failing quietly. */
    EXPECTED_PROXY_VERSION: 3,

    /* ---------- Timezone ----------
     * The spreadsheet's timezone, and the one the engine stamps with.
     * Ecuador mainland is UTC-5 year-round — no DST, so a fixed offset is
     * correct. Timestamps are stored as date serials (a wall-clock value),
     * so this is what converts them to a real instant regardless of where
     * the viewer's browser is. */
    TZ_OFFSET_MINUTES: -300,
    TZ_LABEL: "America/Guayaquil",

    /* ---------- Event Log columns (0-indexed) ----------
     * A–E are LIVE and written by the engine. Never rename or reorder.
     * F (Cycle) is the one additive column this build added. */
    EVENT_COLS: { EMAIL: 0, STAGE: 1, DATE: 2, EVENT: 3, SOURCE: 4, CYCLE: 5 },
    EVENT_HEADERS: ["Client email", "Stage", "Date and time", "Event", "Source", "Cycle"],

    /* ---------- Roster tab columns (0-indexed) ---------- */
    ROSTER_COLS: {
      FIRST_NAME: 0, LAST_NAME: 1, EMAIL: 2, PROGRAM: 3, START: 4,
      COACH: 5, END: 6, CLIENT_NAME: 7, COACH_EMAIL: 8, COACH_SLACK: 9
    },

    /* ---------- Mastersheet Data columns (identity FALLBACK only) ----------
     * No full-name column (build from First + Last) and no coach Slack
     * column (resolved via the coach→Slack map harvested from the Roster). */
    MASTER_COLS: {
      FIRST_NAME: 0, LAST_NAME: 1, EMAIL: 2, PRODUCT: 3,
      DATE_PURCHASED: 5, CONTRACT_START: 6, CONTRACT_END: 7, COACH: 9
    },

    /* ---------- Signal tab (read for the client video / folder 03 link) ----
     * Keys on the roster NAME, not email — joined back through the roster. */
    SIGNAL_COLS: { CLIENT_NAME: 0, CONFIRMED: 1, PROCESSED: 2, RESULT: 3, VIDEO_LINK: 4 },

    /* ---------- People who can act ---------- */
    PEOPLE: ["Gaby", "Miguel", "Joey", "Bernardo"],
    ACTOR_STORAGE_KEY: "td.actor",

    ENGINE: ENGINE,
    ENGINE_FANOUT: ENGINE_FANOUT,
    STAGES: STAGES,

    /* ---------- Pipeline stages (display order) ---------- */
    PIPELINE: [
      { key: "nominated",  label: "Nominated",  ball: "Coach"  },
      { key: "outreach",   label: "Outreach",   ball: "Client" },
      { key: "invited",    label: "Invited",    ball: "Client" },
      { key: "collecting", label: "Collecting", ball: "Shared" },
      { key: "producing",  label: "Producing",  ball: "Owners" },
      { key: "review",     label: "Review",     ball: "Joey"   },
      { key: "scheduled",  label: "Scheduled",  ball: "Gaby"   },
      { key: "published",  label: "Published",  ball: "—"      }
    ],
    TERMINAL: { key: "closed", label: "Declined / Dropped" },
    INDETERMINATE: { key: "indeterminate", label: "Indeterminate" },

    /* ---------- The six Collecting inputs ----------
     * `stages` lists every Stage string that can satisfy the input, newest
     * wins. `auto` means the engine writes it; four of six are automatic. */
    INPUTS: [
      { key: "video",     label: "Client video", short: "V", owner: "Gaby",
        auto: false, classifier: "video",
        stages: [ENGINE.CLIENT_VIDEO, STAGES.COLLECTION_VIDEO],
        markStage: STAGES.COLLECTION_VIDEO,
        note: "Nothing watches Drive folder 03 — Gaby marks this after checking the folder." },

      { key: "coachForm", label: "Coach form",   short: "F", owner: "Coach",
        auto: true, classifier: "coachForm",
        stages: [ENGINE.COACH_FORM], markStage: null,
        note: "Automatic: the coach form routes to folder 04 on submit." },

      { key: "everfit",   label: "Everfit data", short: "E", owner: "Gaby",
        auto: false, classifier: "plain",
        stages: [STAGES.COLLECTION_EVERFIT], markStage: STAGES.COLLECTION_EVERFIT,
        note: "Gaby's manual pull." },

      { key: "photos",    label: "Photos",       short: "P", owner: "Gaby",
        auto: false, classifier: "plain",
        stages: [STAGES.COLLECTION_PHOTOS], markStage: STAGES.COLLECTION_PHOTOS,
        note: "Gaby's manual pull." },

      { key: "meet",      label: "Meet notes",   short: "M", owner: "Auto",
        auto: true, classifier: "meet",
        stages: [ENGINE.MEET], markStage: null,
        note: "Automatic: Gemini notes matched by client email." },

      { key: "loom",      label: "Looms",        short: "L", owner: "Auto",
        auto: true, classifier: "loom",
        stages: [ENGINE.LOOM], markStage: null,
        note: "Automatic: Looms matched by client name." }
    ],

    /* ---------- The five production pieces ---------- */
    PIECES: [
      { key: "carousel",    label: "Carousel",                  owner: "Agent",  stage: STAGES.PRODUCTION_CAROUSEL },
      { key: "story",       label: "Story",                     owner: "Agent",  stage: STAGES.PRODUCTION_STORY },
      { key: "reel",        label: "Reel",                      owner: "Miguel", stage: STAGES.PRODUCTION_REEL },
      { key: "caseStudy",   label: "Case study + landing page", owner: "Miguel", stage: STAGES.PRODUCTION_CASE_STUDY },
      { key: "weeklyEmail", label: "Weekly email",              owner: "Miguel", stage: STAGES.PRODUCTION_WEEKLY_EMAIL }
    ],

    /* ---------- Settings defaults ----------
     * Live values come from the Settings tab; these backfill missing keys. */
    SETTINGS_DEFAULTS: {
      // Flow 1+2 · outreach
      outreachCoachNotMessagedHours: 24,
      outreachReplyCheckHours:       24,
      outreachFollowup1Hours:        24,
      outreachFollowup2Hours:        48,
      outreachCoachToldHours:        48,
      // Flow 3 · client video
      videoCheckHours:               48,
      // Flow 4 · coach form
      coachFormFollowupHours:        24,
      coachFormEscalateHours:        24,
      // Flow 5 · Everfit + photos — passive, one soft escalation to Gaby
      collectingStaleHours:          120,
      // Flow 6 · content, per client (never per piece)
      contentCheckinDays:            5,
      contentEscalateDays:           7,
      // Flow 7 · approval
      approvalEscalateHours:         48,
      // Phase 4
      bufferTargetWeeks:             4,
      activeMonth:                   "",
      // The coach form link used in the coach-form follow-up template.
      coachFormUrl:                  "https://docs.google.com/forms/d/e/1FAIpQLSdSrP7-crZYsQ8DjDBgJUc06ojFRzz1pipduj3MUJue5jinwQ/viewform"
    },

    /* ---------- Time-in-stage colouring (hours) ---------- */
    AGE_AMBER: 72,
    AGE_RED:   168,

    /* ---------- Conventions ---------- */
    FLAG_PREFIX:   "Flag:",
    SOURCE_AUTO:   "AUTO",
    SOURCE_MANUAL: "MANUAL - ",
    DEFAULT_CYCLE: 1,

    PAGES_URL: "https://f4la.github.io/testimonial-dashboard/"
  };

  root.TDConfig = CONFIG;
})(typeof window !== "undefined" ? window : this);
