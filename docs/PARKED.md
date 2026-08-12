# SolarOps — Parked Items

**Last updated: 6 August 2026**
Everything here is a known, deliberately deferred item. Nothing in
this list should be assumed fixed unless TRACKER.md says otherwise.

## Confirmed bugs — found 12 Aug 2026, not yet fixed

- **Tasks-page State and Lead Source filters are client-side-only —
  confirmed via direct code read AND an independent 8-part audit,
  both agreeing exactly.** `useTasks.ts`'s `buildAdminQuery`/
  `subscribeToFilter` take six parameters (`filter`, `searchTerm`,
  `engineerUid`, `districtFilter`, `dateFilter`, `dueDateFilter`) —
  no `stateFilter`, no `leadSourceFilter`. Both exist only as
  post-fetch predicates inside `TasksPage.tsx`'s
  `taskMatchesActiveFilters()`, filtering whatever ~50 tasks
  (200 if a date filter is active) happen to already be loaded.
  Both are also absent from the query-rebuild `useEffect`'s
  dependency array, so selecting either never even re-subscribes.
  Engineer and District are confirmed genuinely server-side by
  contrast — real `where()` queries in both the live listener and
  the Excel-export path, matching the existing `district+archived+
  updatedAt` index. No Firestore index exists for `state` or
  `leadSource` at all — `grep "\"state\""` against
  `firestore.indexes.json` returns nothing, consistent with the
  field never having been given real server-side treatment.
  One consequence already confirmed: the on-screen list and the
  Excel export can silently disagree when a State/Lead-Source
  filter is active, since `fetchAllTasksForExport` drains the full
  matching query then applies the same client-side predicate —
  getting the right answer where the live list doesn't.
- **The State→District cascade already works** (`config.
  districtsByState?.[stateFilter]`, selecting a state clears an
  incompatible district) — nothing to build there.
- **A State→Engineer cascade does not exist, and the data needed
  for it is discarded before it reaches the dropdown.** `useUsers.ts`
  correctly maps `state`/`district` off each user document, but
  `useFieldEngineers.ts` (the hook that actually feeds the Engineer
  dropdown) narrows every user down to `{uid, displayName,
  engineerCode, mobileNumber, email}` — state/district are dropped
  in that projection. Confirmed via direct read of both hooks.
- Real fix needs: `stateFilter`/`leadSourceFilter` threaded into
  `buildAdminQuery`/`subscribeToFilter` and the re-subscribe
  dependency array; a new composite index (likely `state+archived+
  updatedAt`, mirroring the existing `district+archived+updatedAt`)
  deployed to both dev and prod; extending `FieldEngineer`'s shape
  if the Engineer cascade is wanted; and a decision on whether State
  should join the existing Engineer/District/Date mutual-exclusion
  scheme or stay freely combinable — currently State and Lead Source
  are the only two filters not participating in that scheme at all.

## State filter — full scope for later (narrow fix done first, see
TRACKER.md; this is the deferred remainder)

A minimal fix (State combinable with Date/Due-Date filters only) was
implemented AND live-tested 12 Aug 2026 — see TRACKER.md's 12 Aug
entry for full detail, including the two new indexes deployed to
dev. This section captures everything still deliberately NOT done —
read on for the full remaining scope.

**⚠️ Important historical precedent, confirmed from project history:**
a "Date Filter" feature combined with other Tasks-page tabs was
already built once, before this session, and was fully reverted on
28 July 2026 — NOT because the task-list query logic broke, but
because of an unresolved Dashboard **Pending-count mismatch** and a
**"Needs Correction" Load More error**. The danger zone for this
category of change has already been identified empirically: it's
the badges/counts and Load More pagination surrounding a filter, not
the raw list query itself. Any future attempt at the broader scope
below MUST specifically audit `useTabCounts` (useTasks.ts) and every
Dashboard stat card BEFORE considering it done — not just confirm the
visible task list looks right.

**What "State works correctly under every tab" actually requires,**
if ever attempted:
- Roughly 9-10 new composite indexes (one shared index per
  tab-shape state would combine with — status tabs share one index
  since status is just an equality value; same for pipeline-stage
  tabs — plus follow_up, overdue, needs_correction, sales_closed,
  my_tasks, and the two already covered by the narrow fix), deployed
  to both dev and prod.
- The identical `where('state', '==', stateFilter)` treatment in
  THREE separate places, which must all agree or repeat the
  project's own documented "Load More returns a different shape than
  the initial page" bug pattern (see `KNOWN_ISSUES.md`):
  `buildAdminQuery`'s live-query switch, `fetchAllTasksForExport`'s
  `baseQMap`, and the `loadMore` switch inside `subscribeToFilter`.
- A full audit of every badge/count that currently doesn't factor in
  State at all, to confirm none of them silently disagree with the
  now-filtered list — this is the exact category of bug the 28 July
  revert was caused by.
- Engineer and District explicitly stay OUT of this scope (per Ansh's
  12 Aug 2026 decision) — no new State+Engineer or State+District
  index/query work, keeping this bounded to State-vs-tabs only, not
  a full filter-system redesign.

**Two things confirmed NOT broken, so nobody re-investigates them:**
- The Excel export (`fetchAllTasksForExport`) has no page-size cap —
  it drains the entire matching query via cursor pagination before
  applying the client-side State check. It is already complete and
  correct for State today, unlike the live on-screen list. Confirmed
  12 Aug 2026.
- Lead Source has the exact identical client-side-only bug as State
  (confirmed via both a direct code read and an independent 8-part
  Claude Code audit, 12 Aug 2026) but was deliberately NOT given the
  same narrow Date/Due-Date fix in this session — Ansh's decision,
  12 Aug 2026, to keep this session's change small. Whether Lead
  Source ever gets the same treatment is a separate open decision.
- **New, found via live testing 12 Aug 2026 (not from code reading):**
  the "Showing N tasks" text and the "Load More Tasks" button's
  visibility are both driven by `tasks.length`/`hasMore` — the RAW
  count of whatever the current tab's server query fetched — not by
  how many of those actually pass the client-side State (or Lead
  Source) check. Confirmed directly from `TasksPage.tsx`: the block
  reads literally `Showing {tasks.length} tasks`. Real symptom
  observed live: selecting State=Gujarat with no date filter active
  (i.e. under the "All"/"Pending" tabs, which never received the
  narrow fix) shows only 1 matching card on screen while the text
  underneath says "Showing 50 tasks" with an active Load More
  button — because 50 raw tasks were fetched and only 1 happened to
  be Gujarat. This is a distinct visible symptom of the exact same
  root cause already documented above (State/Lead Source are not
  real server-side filters outside the Date/Due-Date case just
  fixed) — not a new, separate bug category. Correct fix, whenever
  the broader scope above is picked up: show the post-filter
  (`visible.length`) count instead of the raw fetched count, and/or
  make `hasMore` itself filter-aware.

- **Confirmed 12 Aug 2026: the Excel export has no dedicated query
  for the Sales Closed tab.** `fetchAllTasksForExport`'s `baseQMap`
  lookup table has no `sales_closed` key, so exporting from that tab
  silently falls through to the generic default branch — draining
  the ENTIRE non-archived tasks collection via `drainQuery` (no
  limit, batches of 500, capped only at the global 20,000-task
  export ceiling), then filtering down to `saleClosed === true`
  client-side. Not a correctness bug — the export result is still
  accurate — but it's a real cost/efficiency gap that will get
  worse as the task collection grows toward the platform's 1-lakh
  goal. Real fix, whenever picked up: add a `sales_closed` entry to
  `baseQMap` using `where('saleClosed','==',true)` directly, the
  same way every other tab's export branch already does it.
- **Related, minor, to watch after the Sales Closed ordering fix
  ships:** the existing `archived+saleClosed+createdAt` composite
  index (already deployed to both dev and production as part of the
  original Sales Closed feature) may become a newly-orphaned index
  once the live query switches to ordering by `updatedAt` instead —
  nothing else in the codebase queries `saleClosed` ordered by
  `createdAt` after this fix. Not urgent — same safe-to-delete-later
  category as the 10 already-documented prod orphans above. Worth
  re-checking with a real index audit once the fix is confirmed
  live in production, not before.

## Correction / Admin Override family (related bugs, not yet done)
- Confirmed 7 Aug 2026 via direct code read: `completeJourneyStep` and
  `saveJourneyStepDraft` never touch `pipelineStage`, `status`, or any
  correction-tracking field — they only ever update journey-step data
  within the Backend stage. Not the same bug family as
  `markLeadConverted`/`reEngageLead`; no fix needed.
- Theoretical edge case (zero real occurrences confirmed): an admin
  force-overriding a still-blocked/pending/in-progress Survey task
  directly to a later stage would leave `status` stuck at its
  pre-override value.

## Structural / scaling risks (ahead of the 1-lakh-task goal)

## Multi-AI audit findings (10 Aug 2026) — cross-checked across 7
different AI tools + direct code verification, see TRACKER.md for
the full methodology

- **setSaleClosedManual, resetSaleClosedToAuto, clearStuckCorrectionFlag
  only check that a user is logged in, not that they're admin.** The
  UI hides these buttons from non-admins, but the underlying functions
  (useTaskActions.ts) and the Firestore rules behind them don't
  actually stop a non-admin from calling them directly. Real gap in
  code built this same session. Not yet fixed.
- **Confirmed real bug, escalation path confirmed 12 Aug 2026: offline
  photo upload failures silently write raw base64 image data into
  Firestore instead of retrying, AND this can cascade into losing an
  entire field submission.** `TaskQueueProcessor.tsx`'s catch blocks
  (two sites — field photos and completion photos) fall back to
  `return url` (the original base64 string) on a Cloudinary upload
  failure, and the item is dequeued as if successful — no retry ever
  happens. Base64 inflates payload size ~33%; if two or three photos
  fail this way on one submission, the resulting task document can
  approach Firestore's 1MB hard limit. When that happens, the *next*
  write attempt throws instead, the item retries up to `MAX_ATTEMPTS
  = 5`, and is then dequeued with only a `console.error` — no user-
  facing notification. Net effect: a field engineer's entire survey
  submission for that visit can be silently and permanently lost.
  Confirmed by direct code read, 10 Aug 2026 and 12 Aug 2026. Not yet
  fixed.
- **Confirmed: Firestore rules never check any active/disabled status
  on a user account — only role.** Every role-check function is
  `isAuth() && userRole() == '<role>'`. If a "disable user" feature
  exists in the UI, it is not enforced at the data layer at all —
  needs checking whether this feature is actually used before treating
  as urgent. Confirmed by direct grep of firestore.rules, 10 Aug 2026.
- **Deliberately parked, not planned to fix:** field-level write
  restrictions on `tasks`/`appConfig/global` by role. Ansh's decision
  (10 Aug 2026): field engineers and other roles need freedom to fill
  in forms without artificial restriction; this is not a bug to fix,
  it's the correct tradeoff for how the app is actually used. Keep as
  a documented decision, not an open item.
- `xlsx` dependency has 2 known high-severity vulnerabilities
  (prototype pollution + ReDoS, no fix available upstream) — but
  confirmed NOT currently exploitable, since the app only writes Excel
  files, never parses untrusted ones. Low urgency despite the "high"
  severity label. Confirmed via npm audit, 10 Aug 2026: 18 total
  vulnerabilities (7 high, 11 moderate).

- `appConfig/global` is a single Firestore document written by every
  stage transition — a write-contention risk as concurrent usage grows.
- **Redundant count-polling across 3 sites — confirmed real cost
  source, not yet a scale-driven risk.** `useTabCounts` (useTasks.ts)
  runs 9 separate `getCountFromServer` queries on a genuine 60-second
  timer, independently in every open admin/view_only tab.
  `useStageTaskList.ts` runs its own separate 60-second polling loop
  for stage-specific counts (a third site, previously unflagged).
  ReportsPage.tsx's 4 count queries are NOT part of this pattern —
  confirmed one-time on page load, no interval, deliberately not being
  touched (Reports is separately deferred).
  **The proposed fix ("just read the already-maintained counter like
  Dashboard does") is only partially true, not a clean swap:** of the
  9 tab counts, only `all` has a genuine maintained equivalent
  (`pipelineCounts.total_active`). `pending`/`in_progress`/`blocked`/
  `completed` are status-based, not stage-based — no maintained
  counter exists for these anywhere, even Dashboard's own versions of
  these four numbers query the server (just once per page load, not on
  a timer). `follow_up`/`overdue`/`needs_correction`/`sales_closed`
  have no maintained counterpart at all — building one would mean new
  denormalized counters, reopening the same counter-drift risk
  category already documented above.
  **Real options, none chosen yet:** (a) simply lengthen the 60s
  interval to reduce query frequency — trivial, safe, no new risk;
  (b) only refresh on known relevant actions instead of a blind timer
  (partially already true — `refreshTabCounts` already fires after
  specific actions); (c) swap only the `all` count to read
  `pipelineCounts.total_active` directly; (d) add new maintained
  counters for the rest, accepting drift-risk tradeoff.
  One external audit source estimated this at roughly $150–300/month
  across 5 always-open admin tabs at current scale — plausible order of
  magnitude given the confirmed query count and interval, but not
  independently verified against real Firebase billing data.
  Confirmed via direct code read, 10 Aug 2026.
- Denormalized counters hand-maintained across ~13 separate code paths
  — real risk of silent drift if any path is missed in a future change.
- Reports page's hard caps (5,000 rows for charts, 500 for recent
  submissions) will truncate well before 1 lakh tasks — truncation IS
  at least flagged in the UI (unlike the old Dashboard stat-card issue,
  now fixed).
- **Full accounting of all 17 `initAppConfig.ts` functions (confirmed
  6 Aug 2026, replaces an earlier imprecise count):** 3 run
  unconditionally on every single admin Dashboard page load
  (`initAppConfig`, `ensureSuperAdmin`, `reconcilePipelineCounts`) — 8
  run once per browser via a `localStorage` flag, not a server-side
  marker (`syncUserTaskCodes`, `migratePipelineStages`,
  `backfillPipelineAssignments`, `initBackendJourneySteps`,
  `backfillJourneyCompleted`, `migrateLogisticsToBackend`,
  `backfillMemberCounts`, `backfillCreatedBy`) — 1 runs automatically at
  user creation (`initMemberInCounts`) — 3 have real Admin Tools
  buttons (`reconcileSaleClosed`, `reconcileStatusStageCorruption`,
  `backfillEngineerDistrictCounts`) — 1 is duplicated by a separately-
  maintained inline copy instead of ever being called directly
  (`backfillPipelineCounts`, see the drift-risk bullet below) — 1 has
  zero caller found anywhere (`backfillTitleLower`, genuinely orphaned).
  **Worth knowing: the 8 `localStorage`-gated boot functions run real
  batch writes completely silently — no toast on success or failure,
  only `console.error` — and a new device/cleared browser re-triggers
  all of them again, since the gate is client-side, not server-side.**
- Separately, 4 Admin Tools buttons ("Recalculate Pipeline Counts",
  "Check Status/Stage Corruption", "Migrate Existing Districts to
  Maharashtra", "Migrate Historical Reverted Tasks") run their OWN
  inline logic in TemplatePage.tsx rather than calling the matching
  initAppConfig.ts function — meaning "Recalculate Pipeline Counts" and
  `backfillPipelineCounts()` are two separately-maintained
  implementations of the same idea, a real drift risk if only one is
  ever updated.
- **⚠️ "Migrate Historical Reverted Tasks" (TemplatePage.tsx Admin
  Tools) can undo the 6 Aug 2026 status-corruption fix, going forward.**
  Confirmed by direct code read: it resets `status` to `'pending'` on
  any candidate task currently at `status: 'completed'` — which, after
  the fix, is now the CORRECT state for a backward-Full-Restarted task,
  not a bug to repair. It also decides whether to retroactively add
  correction tracking purely by checking if the admin's note matches
  the auto-generated default text — an imperfect heuristic that could
  convert a deliberate Full Restart into a tracked Quick Correction.
  Ansh's decision (6 Aug 2026): do NOT click this button until it's
  reviewed/fixed. Not urgent to fix immediately since nobody is
  clicking it, but the underlying code is unchanged and still risky —
  this is a deferred decision, not a resolved one.

## Hygiene / hardening (low urgency, explicitly deferred)
- Prod Firestore index cleanup — 10 orphaned indexes confirmed via a
  direct reconciliation against a real gcloud export, 12 Aug 2026
  (49 declared, 58 deployed, 0 missing, 10 orphaned — exact resource
  IDs: `CICAgOi39IkK`, `CICAgNi4t5oK`, `CICAgPjChIAK` — all 3
  `titleLower` variants; `CICAgJj7z4EK`, `CICAgJjFqZMK`,
  `CICAgNi47oMK`, `CICAgJjmnIgK` — all 4 `pipelineAssignees.*`
  variants; `CICAgLiIkYMK`, `CICAgNi4-ZIK` — the vestigial
  logistics/installation variants; `CICAgNjpgYIK` — the legacy
  no-`archived` proposal variant). Dev was already cleaned up. Safe
  to delete via Firebase Console — deleting an index never touches
  document data.
- Custom auth claims (to replace a per-request Firestore read for role
  checks).
- Tightening `appConfig` write permissions.
- Deciding `titleLower`'s fate (written but never queried — dead weight).
- Deleting vestigial logistics/installation code (folded into Backend
  long ago, never removed from types/rules/indexes).
- `BackendStageData`'s legacy fields (`subsidyApplied`, `subsidyStatus`,
  `portalRegDate`, `sanctionLetterUrl`, `notes`) appear unused in the
  current write path — only `applicationJourneySteps`/`paymentType`/
  `completedAt`/`completedByUid`/`completedByName` are ever written to
  `stages/backend` now. Candidate for the same cleanup pass.
- `AppConfig.backendChecklistTemplate` is seeded but never read or
  written anywhere in TemplatePage.tsx — fully superseded by the
  Cash/Loan Application Journey editor. Same cleanup candidate.
- The entire invite-link signup system (`invites` collection,
  `SignupPage.tsx` at `/signup/:inviteId`, `useInviteActions.ts`) is
  confirmed genuinely orphaned — `createInvite` is never called from
  anywhere in the UI. The real, actually-used account-creation flow is
  TeamPage's "Create User" (secondary Auth app + password-reset email).
  Candidate for deletion, or for actually wiring up if ever wanted as a
  real feature — currently neither used nor removed.
- A documented rollback plan for a bad production deploy, beyond
  "restore the previous zip."
- Rate-limiting / abuse protection on write paths.
- `npm audit` / dependency vulnerability scanning as a routine habit.
- Real external error monitoring/alerting (Sentry-style) — currently
  only the in-app `/error-logs` viewer exists; nobody gets proactively
  notified of a failure.
- An unspecified issue Ansh found in the Excel export related to Sales
  Closed — beyond the missing-columns gap already fixed. Details not
  yet given.
- users collection is readable by every authenticated user (full name/
  email/mobile/district PII exposed to any field engineer). Real, but
  low practical urgency for an internal-team-only app. Suggestion only.
- Cloudinary's actual console-side upload preset restrictions (folder/
  format/rate limits) have never been checked — the code-side setup is
  standard/expected, but whether the preset itself is properly scoped
  on Cloudinary's own dashboard is unverified. Suggestion only.
- Firebase JS SDK (10.14.1) is 2 major versions behind current (12.x).
  Not urgent; suggestion for a future routine upgrade.
