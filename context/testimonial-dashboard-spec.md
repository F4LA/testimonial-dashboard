# Strong Standard — Testimonial Dashboard

**Build specification**

*Owner: Bernardo · Status: design approved, ready to build · For: the build (Claude Code) and the whole team*

---

## 1 · What this is

This document is the complete design for the Testimonial Dashboard: the single tool that replaces everything the testimonial system used before — the Asana board and the multi-tab spreadsheet — and improves on it by putting everything in one integrated place. It is the reference the build works from, section by section, and the reference the team reads to understand how the dashboard works.

It is a build spec, not the living system document. Once the dashboard exists, a living document (kept in the dashboard's own repo) becomes the day-to-day source of truth for how it actually behaves.

**The problem it solves.** Today, to know what is happening with a client, someone has to gather pieces from five places: the client's Asana card, their Drive folder, the tracker tab, the raffle tab, and whatever lives only in Gaby's head. And to know what to do next, each person has to open the system and hunt through every client to figure out their own to-dos. The dashboard ends both problems: everything about a client lives in one place, and the system tells each person what to do today instead of making them look for it.

---

## 2 · Design principles (these govern every build decision)

- **It is an action engine, not a screen to look at.** The system tells each person what to do today, they do it and mark it, and that marking advances the next step. The system chases the work; the person does not chase the system. This is the same pattern already proven in the 21-Day-Challenge dashboard's "Today" view.  
- **Everything has a purpose.** Nothing sits on screen "just in case." If a section or a data point does not feed an action or answer a real question, it does not exist.  
- **One home per question.** A person always knows where to go. No hunting for one fact here and another there when they belong together.  
- **Keep together what belongs together; keep apart what belongs apart.** Everything about one client lives in one place. The raffle does not live inside the pipeline. The three forms of recognition (raffle, client of the month, case study) are never merged.  
- **Improve, don't port.** Every piece is redesigned against "how do we make this better than the old system," not "how do we copy it."  
- **Intuitive navigation.** The person always knows where they are and where to go. From any alert, one click takes them to the exact client or week where the action is — never "go find it."  
- **Everything leaves a trace.** Every action writes an event to the append-only event log. The dashboard has no memory of its own; the event log is the memory.  
- **One identity: email.** The client's email is the master key everywhere, resolved through the Active Plan Roster (email → name → coach). If a translation ever fails, the system raises a manual-review flag; it never guesses.

---

## 3 · The core model

### The action engine

The heart of the dashboard is the same pattern as the clarity-call dashboard: a per-person work queue. For each person, the system computes what needs doing, shows it as a task with the exact action (and any copy ready to paste), the person acts and marks it done, and that marking writes an event and advances the state. Overdue tasks escalate into alerts. Nobody hunts; everybody sees their "today."

### The event log is the memory

Every meaningful thing — a folder created, a video received, a piece of content finished, a note written, a review confirmed, a raffle winner chosen — is one row in the append-only event log. The dashboard reads the log to compute all state, and writes to the log when someone acts. Nothing is stored twice; there is no separate database to keep in sync.

### Pipeline stage is computed, never stored

A testimonial's position in the pipeline is derived from which events exist for it, not saved as a field. This is the same approach the 21-Day-Challenge dashboard uses (stage computed from which timestamps are filled). It means the pipeline can never drift out of sync with what actually happened.

### One client, possibly several testimonials

The client key is email. A single client can have more than one testimonial over time (a first testimonial, then a "part 2" when they keep progressing). So a testimonial is identified by email **plus** a cycle number. The pipeline shows one card per active testimonial (cycle); the client card shows the person, labelled with which cycle it is. The common case is cycle 1; a re-nomination opens cycle 2\.

---

## 4 · Section by section

The dashboard has six sections plus the action queue that runs across all of them. Each section below states what it is, what it replaces, and how it works.

### 4.1 · Pipeline

The backbone. One card per active testimonial, showing its single current position on the journey. Replaces the Asana board **and** the tracker tab (production tracking is not a separate place — it is the same testimonial in stages 4–6).

Eight active stages plus one terminal:

1. **Nominated** — the coach nominated the client; Gaby logged it. *Ball: the coach* (send the warm-up message to the client on Everfit). *Advances when:* the coach's warm-up is done and Gaby sends the outreach. *Alert:* 24 hours after nomination with no coach warm-up → Gaby (who nudges the coach).  
2. **Outreach** — the coach warmed up the client, so Gaby sent the outreach (from Bernardo's account, on Everfit). *Ball: the client* (say yes). *Advances when:* the client says yes. *Alert:* no response after the set interval → Gaby (follow-up; the follow-up cadence from the SOP becomes these alerts).  
3. **Invited** — the client said yes, so the kickoff email went out and the confirmation checkbox fired the fan-out. *Ball: the client* (upload the video). *Advances when:* the client uploads the video. *Alert:* no upload after the set interval → Gaby (nudge the client). *This stage is distinct from Outreach on purpose: "we sent the email" is a different state from "we're waiting for the yes."*  
4. **Collecting** — the video is in; the rest of the inputs are being gathered. *Ball: shared* — coach form → coach; Everfit data and photos → Gaby (her manual pull); Meet notes and Looms → automatic. *Advances when:* all required inputs are present **and** Gaby marks her Everfit collection done — that check is the lock that unlocks the next stage. *Alert:* per input, routed to its owner (coach form missing → coach; Everfit pending → Gaby).  
5. **Producing** — inputs complete; the agent, Miguel, and the agency produce the pieces. *Ball: the piece owners.* *Advances when:* all five pieces are marked done. *Alert:* a piece is overdue → its owner, surfaced in the content channel so Gaby can push. (Details in 4.3's production checklist.)  
6. **Review** — Joey's approval queue, including the back-and-forth of revisions (feedback stored on the client card). *Ball: Joey.* *Advances when:* Joey approves. *Alert:* pending more than 72 hours → Joey.  
7. **Scheduled** — approved and given a week on the calendar, not yet live. The buffer lives here. *Advances when:* it publishes. *Alert:* buffer below four weeks; a scheduled week whose testimonial is still missing any piece shows as at-risk.  
8. **Published** — live; the production journey is closed. The client stays alive in Reviews, Raffle, and Podcast, which are separate sections, not pipeline stages.

**Declined / Dropped (terminal)** — a client who says no or goes silent is moved here, with a required note explaining what happened. They leave the active board (so they do not clutter it) but stay in history, so a coach can re-nominate them later and so the outcome is data.

**The publish lock is "everything ready," with no special piece.** A testimonial publishes only when all its pieces are done. The reel is one of the five pieces, treated exactly like the others — it is not more important, and being from an external agency does not change that (the agency works inside the dashboard like everyone else). "Missing any piece" is what holds publication, not "missing the reel."

**Views:** the pipeline is a board of cards by stage, with clear stage badges and a "time in stage" indicator that turns amber and then red as it ages (the same visual language as the 21-Day-Challenge tracker), so a stuck testimonial is visible at a glance.

### 4.2 · Client card

Click a client and see everything about them in one place — no going anywhere else. Five blocks, all read from the same event log:

1. **Header** — name (as they are to be credited), coach, current stage and how long they have been in it, the **cycle label** (new / part 2 / …), and direct links: the client's Drive folder (where the raw inputs live — the client video, Meet notes, Looms, coach form, Everfit photos and data; this is where Miguel or the agency go to pull the raw material), the raw video, and the published landing page once it is live. The dashboard links to where files live; it never stores copies.  
2. **Input checklist (Collecting)** — the inputs (client video, coach form, Everfit data, photos, Meet notes, Looms), each with its state (received / missing / auto-collected / needs manual review). This is the per-client view of fan-out health.  
3. **Production checklist (Producing)** — the five pieces (carousel, story, reel, case study \+ landing page, weekly email), each with its owner and a state. **Each piece row has an open text space where its owner pastes the link to the finished piece plus any comment.** Pasting the link is what marks the piece done — one gesture, not two. When all five have their link, the testimonial moves itself to Review, with every link already gathered for Joey. Each mark is an event (who, link, comment, when).  
4. **Timeline** — one chronological history: automatic events (fan-out, review, pieces finished) and human notes woven together in order. This replaces Asana's buried comments with the structured, queryable history the system was always meant to have. A note can be written straight from the alert a person is acting on, so leaving a trace never means leaving the worklist.  
5. **Recognitions** — review status, raffle status, and podcast status, kept strictly separate and never merged.

### 4.3 · Calendar \+ buffer

The calendar stops being a tab someone fills by hand and becomes a view of the pipeline over time, with the buffer calculated automatically. Replaces the calendar tab and kills Gaby's manual Monday count.

- **The calendar is the timeline of Scheduled → Published.** A testimonial in the Scheduled stage **is** a week on the calendar. It is not filled separately: when a testimonial is approved and assigned a week, it appears here. One world, not two.  
- **One row per testimonial per week** (the collaboration post and the weekly email go out together the same week). Within that row are **two "scheduled" checks** — one for the post, one for the email — because scheduling them are two real actions in two tools. This preserves the old system's distinction between *a week is assigned* and *the work of scheduling is actually done*.  
- **How a date is set:** when Joey approves, the testimonial enters Scheduled and the system **proposes a default date** — the first open week at the end of the queue (respecting the buffer: it is placed after the last already-filled week). Gaby accepts it with one click or changes it. The system proposes, Gaby disposes.  
- **The buffer is calculated and always shown:** the system counts consecutive filled weeks ahead. Four or more is healthy; dropping to three fires the alert (to Gaby by DM and to the content channel) at the moment it drops — not something Gaby discovers on Monday.  
- **When the buffer drops, the system proposes the fill:** the empty week shows a suggestion — first a ready new testimonial waiting for a week, otherwise the oldest repost by "last used" date. Gaby accepts with one click or opens a dropdown of the other candidates in order and picks another. Her choice fills the week and writes an event; if that restores the buffer, the alert clears itself.  
- **A week whose testimonial is still missing any piece shows as at-risk**, so a week that might fall through is visible in advance, not discovered on publish day.

**Views:** the **primary view is a queue** ("what's next, in order") — the right shape for a weekly rhythm. A **secondary view is a normal month calendar** for the at-a-glance picture. Same data, a toggle, not two things to maintain.

### 4.4 · Raffle

The raffle stops being a tab someone fills and becomes a view derived from the same log, because the three entry conditions are already events the system records during collection. Replaces the nominations \+ raffle tab.

- **Compliance is automatic.** The system already knows, per client, whether they have photo permission, submitted the questionnaire, and self-reported the review. It computes who qualifies — no manual checking. Each client shows the three conditions (met / not met) and whether they qualify.  
- **Lives on the client card (Recognitions) and in a monthly raffle view** that lists everyone who qualifies that month.  
- **The draw stays manual on purpose** — a deliberate ritual (same as leaving the client-of-the-month vote in Slack). The system builds the eligible list and runs the random draw; Gaby confirms the winner. What changes is that the list builds itself.  
- **Snapshot at the draw:** who qualified on the day of the draw is what counts, even if something changes afterward.  
- **After the draw, all follow-up tasks fire at once, in parallel — none blocks another:**  
  - **To Miguel:** add one extra month in the Master Sheet and leave the note. (The month is added in the client Master Sheet, which only Joey, Bernardo, and Miguel can access — so this is Miguel's task, not Gaby's and not Bernardo's. The dashboard never touches the Master Sheet; it hands Miguel the task with the note text ready to paste.)  
  - **To Gaby:** send the winner message and the thank-you messages to the non-winners (the templates from the SOP, ready to paste into Everfit).

### 4.5 · Reviews

Barely redesigned, because the review tracking design is already settled. The improvement is where it lives and who chases it.

- **Two signals, never merged:** the client's self-report ("said yes," from the preferences form, automatic) and a human confirmation ("confirmed" — a real review matched by the reviewer's public display name to the roster, manual because Google gives no automatic match).  
- **Per-client review status** (requested / self-reported yes-no / confirmed / "said yes but couldn't be matched") lives on the client card (Recognitions) and in a reviews view.  
- **The weekly verification becomes a pushed task** in Gaby's queue ("check this week's new reviews, match them to the roster"), instead of something she has to remember and go look for.  
- **Hard rule:** the raffle opens on the self-report, never on the confirmation. Confirmation is an audit layer, not a gate — a genuine reviewer who cannot be matched by name is never excluded. Status is snapshotted at the raffle draw, consistent with the raffle.

### 4.6 · Podcast \+ client of the month

These are separate things kept separate. The vote runs in Slack; the dashboard picks up the result and drives everything after it.

**Client of the month** (a part of this section):

- **Shows the month's candidates** — the testimonials completed that month (which the pipeline already knows). This is the list the coaches vote on in Slack. The dashboard does not run the vote; it only shows who is in the running. No voting module — that would duplicate Slack.  
- **Someone marks the winner** — when the Slack vote closes, whoever ran it marks the winner from the list with one click. That click is the trigger for everything downstream (same pattern as confirming the raffle winner).  
- **The click fires the tasks:** the podcast invitation chain (below) and a **shout-out task** to Gaby.

Two things every winner gets that are separate from the podcast: the **case study** (which every client gets anyway — it is not a monthly prize) and the **shout-out**. The shout-out's copy and which account it posts from are not yet defined, so the dashboard fires it as a task with the copy to be filled in (see open items).

**Podcast** (a chain of tasks, not a pipeline stage — because it only applies to one client a month; making it a stage would strand everyone else):

- Winner confirmed → task **to Gaby**: invite the client (copy \+ the GoHighLevel podcast-calendar link, ready). Marked done when sent.  
- No response after the set interval → alert to Gaby: follow up on the invitation.  
- Client accepts and books through the link → state moves to "scheduled" (detected from the booking, or Gaby marks it).  
- Scheduled → task **to Joey**: send a short personal note to the client before the call. (Gaby does the repeatable coordination; Joey adds the high-impact personal touch at the right moment, without carrying the scheduling back-and-forth.)  
- After the date → mark "recorded," then "published."

**Podcast states** (invited → accepted → scheduled → recorded → published) live on the client card (Recognitions) and in a podcast view — not on the pipeline board.

**Rule kept:** if the client of the month declines the podcast, they stay client of the month (shout-out \+ case study); Joey invites the runner-up or skips the month — the vote is not re-run.

---

## 5 · The action queue and alerts

This is the engine from section 3, seen as a feature. Every person has a queue of what to do; the dashboard is the home of it, and Slack carries it to them.

- **The dashboard is the home** — the action queue and the "at-risk / needs attention" items are always there when someone opens it.  
- **A daily per-owner DM digest on Slack** — each person gets only their own items, once a day (their "today"): Gaby her list, Joey his pending approvals, each coach their own, the agency their pending pieces. Not a ping per event — that saturates and gets muted. This uses the same mechanism as the monthly nomination auto-scheduler already in production (an Apps Script time trigger posting through the bot).  
- **The content-creation channel** (the existing testimonial-management channel) is where content-production coordination lives: Gaby is the owner there, and it is where overdue-piece alerts surface so she can push Miguel or the agency. It is the team-visible layer for production, not a firehose of every event.  
- **Every alert has an owner.** An alert with no owner is spam. Each is routed to the one person who can act: coach warm-up overdue → Gaby (nudge coach); no client response → Gaby; no upload → Gaby; coach form missing → coach; piece overdue → its owner via the channel; approval pending \>72h → Joey; buffer low → Gaby.  
- **Manual-review flags become tasks.** When the collection engine cannot match a client (a Meet note with no matching email, a client whose origin email differs), it raises a manual-review flag. That flag surfaces as a task in Gaby's queue to resolve, so a silent mismatch never sits unnoticed.  
- **Thresholds are settings, not hard-coded** (24h, the follow-up intervals, 72h, buffer target of 4 weeks). They live in a settings tab and are adjustable.

---

## 6 · Data model (on the event log)

- **Primary store: the existing append-only event log** in the "Testimonial Collection — Signal & Event Log" sheet. Its columns today are: client email, stage, date and time, event, source. The build adds a **sixth column, "detail"** (free text: a link, a note's text, a confirmed reviewer's name, the fill choice, etc.), and a **"cycle"** value so a client's second testimonial never overwrites the first (a testimonial \= email \+ cycle; default cycle 1, a re-nomination opens cycle 2).  
- **All state is computed from the log**, keyed on (email, cycle): the pipeline stage, both checklists, the calendar and buffer, raffle eligibility, review status, podcast status. Nothing is stored twice.  
- **Stage-entry events** (what marks entry into each stage): nominated → Nominated; outreach sent → Outreach; kickoff email sent (fan-out fired) → Invited; client video received → Collecting; collection complete (Gaby's Everfit check) → Producing; all pieces done → Review; approved \+ week assigned → Scheduled; published → Published; declined / dropped → terminal.  
- **New event types the build introduces** (beyond what the collection engine already writes): coach warm-up confirmed, outreach sent, kickoff email sent, each piece done (with link \+ comment), approved / sent-back (with feedback), week assigned, scheduled-post done, scheduled-email done, published, repost used, note, raffle winner, raffle messages sent, month-added-to-contract done, review verification results, podcast invited / accepted / scheduled / recorded / published, client-of-the-month winner, shout-out done, declined / dropped (with note).  
- **Identity resolution** reads the Active Plan Roster (email → name → coach, plus the coach's Slack address in column J for notifications). A failed translation raises a manual-review flag; the system never guesses.  
- **A small settings tab** holds the adjustable thresholds, the buffer target, and the active month (mirrors the 21-Day-Challenge dashboard's settings). Any other backend tab is added only if a genuinely separate input needs a home; the default is that everything is an event.  
- **Registered risk (from the team's own dashboards):** do not read a legacy sheet column as if it were a live process. The build validates behavior against this spec and the real event log, not against assumptions about existing columns.

**Alignment notes for the build (from a review against the current system):**

- **The front of the pipeline (Nominated, Outreach, Invited) has no events today.** Those three stages correspond to Gaby's manual steps on Everfit, which the current system does not record anywhere. So for those stages the dashboard is not reading existing events — it is the thing that *creates* them, when Gaby marks each action. The collection engine only starts writing events from the confirmation checkbox onward (the Collecting stage).  
- **Confirm the current event vocabulary first.** Before building the reader, confirm the exact event and stage words the deployed engine writes today for the Collecting-stage pipes (folder created, Meet copied, Loom pulled, coach Slack sent), so the dashboard reads what is actually written, not an assumed vocabulary. This is a quick check at the Foundation phase.  
- **Identity is read from the real Active Client Roster** (email → name → coach, plus the coach's Slack address in column J), not from the names-only "Roster (mirror)" tab inside the event-log sheet.  
- **Only additive changes to the event log.** New columns go at the end; new event types are added as needed. Never rename or reorder existing columns — the collection engine is live and launches on the tenth, and a non-additive change would break it.

---

## 7 · Stack

Mirrors the team's proven dashboards (21-Day-Challenge and Coach Pulse), improved for this one's size.

- **Own repo:** `F4LA/testimonial-dashboard`, separate from the system's memory repo. It carries its own governance documents (a project instruction file, a living system document, and a change log), following the same rule the other dashboards use: no change is finished until the living document is updated and pushed.  
- **Frontend:** plain HTML/CSS/JavaScript, no framework and no build step, hosted on GitHub Pages (live within about a minute of each push). Organized into modules like Coach Pulse (a shell page, a top-level orchestrator, a stylesheet, and a folder of focused modules), rather than one large single file, because this dashboard is bigger than the other two. No framework is used deliberately: the build is done by Claude Code (which does not benefit from a framework's shortcuts), and a framework would add a build step the team cannot diagnose, for no gain.  
- **Reads:** the Google Sheets API with a read-only key restricted to the dashboard's GitHub Pages address (safe to keep in the public repo, exactly as Coach Pulse does). Reads the event log, the roster, the signal sheet, and any settings tab.  
- **Writes:** an Apps Script Web App acting as a proxy (a POST from the frontend), the same write path Coach Pulse uses. Every write appends an event to the log.  
- **Slack alerts:** an Apps Script time-driven trigger posts the daily per-owner digest through the existing bot, the same mechanism as the monthly nomination scheduler.  
- **Secrets** (only if needed, e.g. a Slack token) live in Apps Script properties, never in the public repo.  
- **Test data:** seed example rows in the real event log to test each section as it is built.

---

## 8 · Build order (by phases, tested part by part)

Five phases. Each is built, tested against seeded example data, and only then is the next started. Phases 1–3 are the usable core (see clients, work them, be told what to do today); phases 4–5 add views that mostly have no data until the first cycle runs — so this order is also the fastest path to something usable.

1. **Foundation** — repo, GitHub Pages, governance docs, the read path (Sheets API) and the write path (Apps Script proxy), the settings tab, identity resolution from the roster, the event-log read/fold that computes state, and the one-time confirmation of the engine's current event vocabulary.  
2. **Pipeline \+ client card** — the board with the eight stages \+ terminal (stage computed from events), the client card with its five blocks including the five-piece production checklist (paste-the-link-to-mark-done, the agency as a user, auto-advance to Review when complete), and notes into the timeline. This is the backbone; everything else reads from it.  
3. **Action queue \+ alerts** — the per-person queue, the alert conditions per stage, manual-review flags as tasks, the daily per-owner Slack digest, and the content channel for production. This turns the dashboard from a screen into the action engine. *With phases 1–3 done, the dashboard is usable.*  
4. **Calendar \+ buffer** — the queue view and the month view, system-proposed dates, the auto buffer, the suggestion \+ dropdown fill.  
5. **Recognitions (raffle \+ reviews \+ podcast/client of the month)** — the three derived views that read the same collection events: raffle (auto compliance, manual draw, snapshot, parallel post-draw tasks), reviews (the two separate signals, the pushed weekly verification task), and podcast \+ client of the month (the candidates view, the mark-the-winner click that fires the chain, the podcast task chain, the shout-out task).

---

## 9 · Out of scope (deliberate, not omissions)

- **Aggregate metrics** (conversion by coach, quarterly winners) — not of interest; and the quarterly coach recognition was never implemented in the old system. Not built. If ever wanted, it is a query over the same log, not a rebuild.  
- **Published-content performance** (post engagement, email open rates) — needs Instagram/email APIs, feeds no decision in this rock, already ruled out in the data-requirements design.

---

## 10 · Open items (separate from the build; owned by Bernardo with Joey/Miguel)

These came up during design and are not part of the dashboard build. They are done after the dashboard, or in parallel where they don't block it.

1. **Podcast sub-process with Joey** — create the podcast calendar in GoHighLevel, review and approve the invitation copy, and approve the calendar. (The dashboard is already designed on the decision: Gaby invites with the GHL link, the client self-books, Joey sends a personal note before the call.)  
2. **Shout-out copy \+ which account it posts from** — not defined; to settle with Joey. The dashboard fires the shout-out as a task; the copy fills in once decided.  
3. **Teach Miguel how to add the contract month in the Master Sheet and where to leave the note** — one-time training, belongs in Miguel's role SOP, not the build.  
4. **Confirm the preferences form captures podcast consent** (a checkbox) — the podcast chain assumes it. If missing, it is a small form fix, done right after this dashboard.

---

*End of specification.*  
