/**
 * Testimonial Dashboard — Config
 *
 * Single home for sheet IDs, column maps, the Stage vocabulary, and the
 * adjustable defaults. Nothing else in the codebase hard-codes a sheet id,
 * a column index, or a Stage string.
 *
 * Verified against the live spreadsheets on 7 Aug 2026.
 */
(function (root) {
  "use strict";

  var CONFIG = {

    /* ---------- Data sources (read via Google Sheets API v4) ---------- */
    SHEETS: {
      // "Testimonial Collection — Signal & Event Log"
      // Live tabs: Signal · Roster (mirror) · Event Log · Sheet1
      EVENT_LOG: {
        id:  "17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo",
        tab: "Event Log"
      },
      SETTINGS: {
        id:  "17lWPi7o0Z1mR8yEkAh6vMEPOqZfQqSAaxeFM6eGIKmo",
        tab: "Settings"          // does not exist until the one-time setup runs
      },
      // "Active Client Roster"
      // NOTE: the id below is the VERIFIED one (capital I at position 28).
      // The data reference file had a lowercase l there; that id 404s.
      ROSTER: {
        id:  "1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc",
        tab: "Roster"
      },
      MASTERSHEET: {
        id:  "1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc",
        tab: "Mastersheet Data"  // identity fallback for clients who have left
      }
    },

    /* ---------- Sheets API key (read-only, referrer-restricted) ----------
     * Safe to commit: restricted to https://f4la.github.io/testimonial-dashboard/*
     * Same posture as Coach Pulse. Replace the placeholder once created. */
    API_KEY: "AIzaSyC67SNI85Q1Ra8qUmYERgF_cOBuzZDexx0",

    /* ---------- Apps Script Web App (the only write path) ----------
     * Standalone project on the Membership account (owner of the Event Log).
     * Deliberately NOT container-bound to the spreadsheet, so it can never
     * touch the live collection engine's script project.
     * Spreadsheet timezone: America/Guayaquil. */
    WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzx91ZuUb4zqHmVWpu4tmhvERURJo5CpQAujYySp7oLjMIh8G0C-E-Aqll5X-MnC3gZ/exec",

    /* ---------- Event Log columns (0-indexed) ----------
     * A–E are LIVE and written by the deployed collection engine.
     * Never rename or reorder them. F (Cycle) is the one additive column. */
    EVENT_COLS: {
      EMAIL:  0,   // A · Client email  (master key, lowercased)
      STAGE:  1,   // B · Stage         (sub-event label, see STAGES below)
      DATE:   2,   // C · Date and time (ONE cell, e.g. "7 Aug 2026, 6:56")
      EVENT:  3,   // D · Event         (free text — this IS the "detail" field)
      SOURCE: 4,   // E · Source        ("AUTO" | "MANUAL - <Name>")
      CYCLE:  5    // F · Cycle         (NEW, additive; blank folds to 1)
    },
    EVENT_HEADERS: ["Client email", "Stage", "Date and time", "Event", "Source", "Cycle"],

    /* ---------- Roster tab columns (0-indexed) ---------- */
    ROSTER_COLS: {
      FIRST_NAME:  0,  // A
      LAST_NAME:   1,  // B
      EMAIL:       2,  // C  ← master key
      PROGRAM:     3,  // D
      START:       4,  // E
      COACH:       5,  // F
      END:         6,  // G
      CLIENT_NAME: 7,  // H
      COACH_EMAIL: 8,  // I
      COACH_SLACK: 9   // J  ← use this for coach notifications
    },

    /* ---------- Mastersheet Data columns (0-indexed) ----------
     * Identity FALLBACK only. Note what is NOT here: there is no
     * "Client Name" column (build it from First + Last) and no
     * "Coach Slack Email" column (resolved via COACH→Slack map from Roster). */
    MASTER_COLS: {
      FIRST_NAME:     0,   // A
      LAST_NAME:      1,   // B
      EMAIL:          2,   // C  header is "Email Address", not "Email"
      PRODUCT:        3,   // D
      DATE_PURCHASED: 5,   // F  "7/29/2024"      (secondary recency key)
      CONTRACT_START: 6,   // G  "August 5, 2024" OR "5/6/2026" — mixed formats
      CONTRACT_END:   7,   // H
      COACH:          9    // J
    },

    /* ---------- People who can act (person picker) ----------
     * Every write requires one of these. No anonymous writes. */
    PEOPLE: ["Joey", "Miguel", "Gaby", "Bernardo", "Sofi"],
    ACTOR_STORAGE_KEY: "td.actor",

    /* ---------- Stage vocabulary ----------
     * ENGINE: written today by the deployed collection engine. Read-only to us.
     * DASHBOARD: written by this dashboard. Approved 7 Aug 2026.
     * Pattern: "<Group> — <specific>", em dash (U+2014), one space each side. */
    STAGES: {
      ENGINE: {
        FOLDER:           "Collection — folder",
        CLIENT_VIDEO_LINK:"Collection — client video link",
        MEET:             "Collection — Meet",
        LOOM:             "Collection — Loom",
        COACH_NOTICE:     "Collection — coach notice"
      },
      NOMINATION_LOGGED:        "Nomination — logged",
      NOMINATION_WARMUP:        "Nomination — coach warm-up done",
      OUTREACH_SENT:            "Outreach — sent",
      OUTREACH_ACCEPTED:        "Outreach — client accepted",
      INVITE_KICKOFF:           "Invite — kickoff sent",

      COLLECTION_VIDEO:         "Collection — video uploaded",
      COLLECTION_COACH_FORM:    "Collection — coach form received",
      COLLECTION_EVERFIT:       "Collection — Everfit data",
      COLLECTION_PHOTOS:        "Collection — photos received",
      COLLECTION_COMPLETE:      "Collection — complete",
      COLLECTION_FLAG_RESOLVED: "Collection — manual review resolved",

      PRODUCTION_CAROUSEL:      "Production — carousel",
      PRODUCTION_STORY:         "Production — story",
      PRODUCTION_REEL:          "Production — reel",
      PRODUCTION_CASE_STUDY:    "Production — case study",
      PRODUCTION_WEEKLY_EMAIL:  "Production — weekly email",

      APPROVAL_APPROVED:        "Approval — approved",
      APPROVAL_SENT_BACK:       "Approval — sent back",

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
    },

    /* ---------- Pipeline stages (display order) ---------- */
    PIPELINE: [
      { key: "nominated",  label: "Nominated"  },
      { key: "outreach",   label: "Outreach"   },
      { key: "invited",    label: "Invited"    },
      { key: "collecting", label: "Collecting" },
      { key: "producing",  label: "Producing"  },
      { key: "review",     label: "Review"     },  // internally "Approval — …"
      { key: "scheduled",  label: "Scheduled"  },
      { key: "published",  label: "Published"  }
    ],
    TERMINAL: { key: "closed", label: "Declined / Dropped" },

    /* ---------- The six Collecting inputs ---------- */
    INPUTS: [
      { key: "video",     label: "Client video", short: "V", owner: "Gaby",  manual: true  },
      { key: "coachForm", label: "Coach form",   short: "F", owner: "Coach", manual: true  },
      { key: "everfit",   label: "Everfit data", short: "E", owner: "Gaby",  manual: true  },
      { key: "photos",    label: "Photos",       short: "P", owner: "Gaby",  manual: true  },
      { key: "meet",      label: "Meet notes",   short: "M", owner: "Auto",  manual: false },
      { key: "loom",      label: "Looms",        short: "L", owner: "Auto",  manual: false }
    ],

    /* ---------- The five production pieces ---------- */
    PIECES: [
      { key: "carousel",   label: "Carousel"                 },
      { key: "story",      label: "Story"                    },
      { key: "reel",       label: "Reel"                     },
      { key: "caseStudy",  label: "Case study + landing page"},
      { key: "weeklyEmail",label: "Weekly email"             }
    ],

    /* ---------- Settings defaults ----------
     * Live values come from the Settings tab; these apply until it exists
     * and backfill any key the tab is missing. Tune later, not in code. */
    SETTINGS_DEFAULTS: {
      nominationWarmupHours:     24,   // §4.1 stage 1 alert
      outreachFollowupHours:     72,   // §4.1 stage 2 alert
      inviteUploadFollowupHours: 96,   // §4.1 stage 3 alert
      collectingStaleHours:      120,  // §4.1 stage 4 per-input alert
      producingPieceHours:       168,  // §4.1 stage 5 piece overdue
      approvalPendingHours:      72,   // §4.1 stage 6 alert
      bufferTargetWeeks:         4,    // §4.3 buffer
      activeMonth:               ""    // e.g. "2026-08"; blank = current month
    },

    /* ---------- Conventions ---------- */
    FLAG_PREFIX:   "Flag:",   // engine convention: Event starting with this = NOT complete
    SOURCE_AUTO:   "AUTO",
    SOURCE_MANUAL: "MANUAL - ",
    DEFAULT_CYCLE: 1,

    PAGES_URL: "https://f4la.github.io/testimonial-dashboard/"
  };

  root.TDConfig = CONFIG;
})(typeof window !== "undefined" ? window : this);
